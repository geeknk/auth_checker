const fs = require("fs");
const mysql = require("mysql2/promise");
const { sequelize,testConnection, Domain, QueryTypes } = require("./sequelize");
const { Builder, By } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const axios = require("axios");
const { DateTime } = require("luxon");
const moment = require("moment");
const puppeteer = require("puppeteer");
const path = require("path");
const { promisify } = require("util");
const readFileAsync = promisify(fs.readFile);
const appendFileAsync = promisify(fs.appendFile);
const writeFileAsync = promisify(fs.writeFile);
const { parse } = require("json2csv");
const { format } = require("date-fns");
const {DataFrame} = require("dataframe-js");

// Read configuration from config.json
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

// const sequelize = async function setupDatabase() {
//   try {
//     const connection = await mysql.createConnection({
//       host: config['db']['hostname'],
//       port:config['db']['port'],
//       user: config['db']['Database user'],
//       password: config['db']['Database pass'],
//       database: config['db']['Database name']
//     });
//     console.log('Connected to database!');
//     return await connection;
//   } catch (error) {
//     console.error('Error connecting to database:', error);
//     throw error;
//   }
// }

noxtools_enabled = true;

async function setupDriver() {
  let options = new chrome.Options();
  options.addArguments("--disable-gpu", "--no-sandbox");

  let driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(options)
    .build();

  return driver;
}

async function loginCookies() {
  const browser = await puppeteer.launch({ headless: false }); // Launch browser in non-headless mode for debugging

  try {
    const page = await browser.newPage();
    await page.goto("https://www.prepostseo.com/login");
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for page to load

    // Accept cookies
    try {
      await page.click("#accept-choices");
    } catch (error) {
      console.log("Accept cookies button not found or already accepted.");
    }

    // Enter email and password
    const config = require("./config.json"); // Load your configuration file
    await page.type('input[name="email"]', config.dpachecker.email);
    await page.type('input[name="password"]', config.dpachecker.password);

    // Click login button
    await page.click('button[type="submit"]');
    await new Promise((resolve) => setTimeout(resolve, 4000)); // Wait for login process

    // Navigate to domain authority checker
    await page.goto("https://www.prepostseo.com/domain-authority-checker");
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for page to load

    // Get cookies and token
    const cookies = await page.cookies();
    const token = await page.$eval('meta[name="_token"]', (el) => el.content);

    // Save cookies and token to JSON files
    await writeFileAsync("cookies.json", JSON.stringify(cookies, null, 2));
    await writeFileAsync(
      "token.json",
      JSON.stringify({ token, added_time: new Date().toISOString() }, null, 2)
    );

    console.log("Logged in to prepostseo");
    console.log("Got cookies and token");

    return { cookies, token };
  } catch (error) {
    console.error("Error during login:", error);
    throw error;
  }
}

async function loginPrePostSEO(driver) {
  try {
    await driver.get("https://www.prepostseo.com/login");
    await driver.sleep(5000);

    try {
      await driver.findElement(By.id("accept-choices")).click();
    } catch (e) {
      // Ignore if element not found
    }

    await driver
      .findElement(By.css('input[name="email"]'))
      .sendKeys(config.dpachecker.email);
    await driver
      .findElement(By.css('input[name="password"]'))
      .sendKeys(config.dpachecker.password);
    await driver.findElement(By.css('button[type="submit"]')).click();
    await driver.sleep(4000);

    console.log("Logged in to PrePostSEO");

    await driver.get("https://www.prepostseo.com/domain-authority-checker");
    await driver.sleep(5000);

    let cookies = await driver.manage().getCookies();
    let tokenElement = await driver.findElement(By.css('meta[name="_token"]'));
    let token = await tokenElement.getAttribute("content");

    fs.writeFileSync(
      "token.json",
      JSON.stringify({ token, added_time: new Date().toISOString() })
    );
    fs.writeFileSync("cookies.json", JSON.stringify(cookies));

    console.log("Got cookies and token");
    return { cookies, token };
  } catch (error) {
    console.error("Error during login process:");
    console.error(error);
    throw error; // Propagate error to handle at a higher level
  }
}

async function getCSRFToken(driver) {
  await driver.get("https://www.prepostseo.com/domain-authority-checker");
  await driver.sleep(2000);
  let tokenElement = await driver.findElement(By.css('meta[name="_token"]'));
  let token = await tokenElement.getAttribute("content");
  return token;
}

function restartScript() {
  console.log("Reiniciando el script...");
  const command = process.argv.shift();
  const args = process.argv.slice(1);

  spawn(command, args, {
    stdio: "inherit",
    detached: true,
  }).unref();

  process.exit();
}

async function checkDaPa(cookies, token, domainList) {
  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    dnt: "1",
    origin: "https://www.prepostseo.com",
    pragma: "no-cache",
    referer: "https://www.prepostseo.com/domain-authority-checker",
    "sec-ch-ua":
      '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "x-csrf-token": token,
    "x-requested-with": "XMLHttpRequest",
    "X-CSRF-Token": token,
  };

  const csvData = [];
  const failedDomains = [];

  for (const domain of domainList) {
    const data = new URLSearchParams();
    data.append("urls[]", domain);
    data.append("count", "0");
    data.append("tool_key", "domain_authority_checker");

    try {
      const response = await axios.post(
        "https://www.prepostseo.com/ajax/check-authority",
        data,
        {
          headers: { ...headers, ...cookies }, // Merge cookies into headers
        }
      );

      if (response.status === 200) {
        const responseData = response.data;
        if (Array.isArray(responseData)) {
          for (const d of responseData) {
            const domain = d.url;
            const da = d.domain_auth;
            const pa = d.page_auth;
            const ss = d.spam_score;
            const extractTime = DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss");

            const domainData = {
              domain,
              da,
              pa,
              ss,
              time: extractTime,
            };

            console.log(domainData);
            csvData.push(domainData);
          }
        } else {
          console.log(`Unexpected response format for domain: ${domain}`);
          failedDomains.push({
            domain,
            timestamp: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
          });
        }
      } else {
        console.log(`Request failed for domain: ${domain}`);
        console.log(`Status code: ${response.status}`);
        console.log(`Response content: ${response.data}`);
        failedDomains.push({
          domain,
          timestamp: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
        });
      }
    } catch (error) {
      console.error(`Error processing domain: ${domain}`, error);
      failedDomains.push({
        domain,
        timestamp: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
      });
    }
  }

  // Log failed domains with timestamp
  if (failedDomains.length > 0) {
    const logContent = failedDomains
      .map(({ domain, timestamp }) => `${timestamp} - ${domain}`)
      .join("\n");
    fs.appendFileSync("log.txt", `${logContent}\n`);
  }

  return csvData;
}

async function checkDaPa2(cookies, domainList) {
  const browser = await puppeteer.launch({ headless: false }); // Launch browser
  const page = await browser.newPage(); // Open new page
  await page.goto("https://www.prepostseo.com/domain-authority-checker"); // Go to the URL

  try {
    await page.waitForSelector("textarea#urls"); // Wait for textarea element
    await page.focus("textarea#urls"); // Focus on textarea
    await page.keyboard.type(domainList.join("\n")); // Type domain list into textarea

    await page.click("span#checkBtn"); // Click on check button
    await new Promise((resolve) => setTimeout(resolve, 15000));

    const html = await page.content(); // Get the HTML content of the page
    const $ = cheerio.load(html); // Load HTML content using cheerio

    const resultsTable = $("table#resultsTable"); // Select the results table
    const rows = resultsTable.find("tr:has(td)"); // Find rows with data

    const data = rows
      .map((index, element) => {
        const columns = $(element).find("td");
        const domain = $(columns[0]).text().trim();
        const da = parseFloat($(columns[1]).text().trim());
        const pa = parseFloat($(columns[2]).text().trim());
        const ss = parseFloat($(columns[3]).text().trim());

        return {
          domain,
          da,
          pa,
          ss,
          time: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
        };
      })
      .get();

    console.log(`Got data for ${data.length} domains from PrePostSEO`);
    data.forEach((row) => {
      console.log(
        `Domain: ${row.domain}, DA: ${row.da}, PA: ${row.pa}, SS: ${row.ss}`
      );
    });

    await page.evaluate(() => {
      document.querySelector("textarea#urls").value = ""; // Clear textarea content
    });

    return data; // Return data as an array of objects
  } catch (error) {
    console.error("Error during DA/PA check:", error);
    return [];
  }
}

async function processPrepostseoData(file, processedDomains) {
  try {
    // Read lines from the file
    const data = await readFile(file, "utf8");
    const lines = data.trim().split("\n");

    const processedData = [];
    const linesToUpdate = [];

    // Process each line from the file
    for (const line of lines) {
      const [domain, jsonData, status] = line.trim().split("\t");

      if (status === "pendiente de procesar") {
        const data = JSON.parse(jsonData);
        // Process the data as needed...

        processedData.push(data);
        linesToUpdate.push(`${domain}\t${JSON.stringify(data)}\ttramitado`);
      }
    }

    // Save processed data to the database
    if (processedData.length > 0) {
      const columns = Object.keys(processedData[0]).join(", ");
      const values = processedData
        .map((data) => `(${Object.values(data).join(", ")})`)
        .join(", ");

      const sql = `INSERT INTO domains (${columns}) VALUES ${values}`;
      await query(sql);

      console.log("Data saved to the database:");
      console.table(processedData);
    }

    // Update status in the file and add domains to processedDomains
    if (linesToUpdate.length > 0) {
      const updatedLines = lines.map((line) => {
        const [domain, jsonData, status] = line.trim().split("\t");
        if (
          status === "pendiente de procesar" &&
          processedDomains.has(domain)
        ) {
          return `${domain}\t${jsonData}\ttramitado`;
        } else {
          return line;
        }
      });

      await writeFile(file, updatedLines.join("\n"));
      console.log("File updated with processed status.");
    }
  } catch (error) {
    console.error("Error processing PrePostSEO data:", error);
  }
}

function updateStatusInFile(file, domain, newData, newStatus) {
  try {
    let data = fs.readFileSync(file, "utf8");
    let lines = data.split("\n");

    let updated = false;
    let updatedLines = lines.map((line) => {
      if (line.startsWith(domain + "\t")) {
        updated = true;
        return `${domain}\t${newData}\t${newStatus}`;
      } else {
        return line;
      }
    });

    if (!updated) {
      updatedLines.push(`${domain}\t${newData}\t${newStatus}`);
    }

    fs.writeFileSync(file, updatedLines.join("\n"));
    console.log(`Successfully updated status for ${domain} in ${file}`);
  } catch (error) {
    console.error(`Error updating status in ${file}: ${error}`);
  }
}

async function restartDriver(browser) {
  try {
    await browser.close();
  } catch (error) {
    console.error("Error closing browser:", error);
  }

  browser = await configureDriver();
  return browser;
}

function getProxy() {
  const username = "c3iplh8bpfkt9pb";
  const password = "jdjj3psiadzy1xs";
  const proxy = "rp.proxyscrape.com:6060";
  const proxyAuth = `${username}:${password}@${proxy}`;
  const proxies = {
    http: `http://${proxyAuth}`,
    https: `http://${proxyAuth}`,
  };
  return proxies;
}

async function checkGoogle(domain) {
  while (true) {
    try {
      console.log(`Checking Google search results for ${domain}`);

      const waitTime = Math.random() * (3 - 1) + 1; // Random wait time between 1 and 3 seconds
      console.log(
        `Waiting for ${waitTime.toFixed(
          2
        )} seconds before making the request...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime * 1000));

      const url = `https://www.google.com/search?q=site:${domain}`;
      const response = await axios.get(url, {
        headers: {
          authority: "www.google.com",
          accept: "*/*",
          "accept-language": "en,bn;q=0.9,en-GB;q=0.8,en-AU;q=0.7,en-US;q=0.6",
          "cache-control": "no-cache",
          dnt: "1",
          pragma: "no-cache",
          referer: "https://www.google.com/",
          "sec-ch-ua":
            '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "sec-fetch-dest": "empty",
          "sec-fetch-mode": "cors",
          "sec-fetch-site": "same-origin",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        },
        proxy: {
          host: "your_proxy_address_here",
          port: "your_proxy_port_here",
          // Add any additional proxy options here if needed
        },
        timeout: 30000, // 30 seconds timeout
      });

      if (response.status === 200) {
        console.log(
          `Successfully retrieved Google search results for ${domain}`
        );
        const html = response.data;
        const totalRegex = /\d+(?=\sresults)/; // Regex to extract the total number of results
        const match = html.match(totalRegex);
        const total = match ? parseInt(match[0].replace(/\D/g, "")) : 0;

        console.log(`Total indexed pages for ${domain}: ${total}`);
        return total;
      } else if (response.status === 429) {
        console.log(
          `Error checking Google search results for ${domain}: ${response.status} (Too Many Requests)`
        );
        console.log("Switching to a new proxy and retrying...");
        continue; // Retry with a new proxy
      } else {
        console.log(
          `Error checking Google search results for ${domain}: ${response.status}`
        );
        console.log("Switching to a new proxy and retrying...");
        continue; // Retry with a new proxy
      }
    } catch (error) {
      console.log(
        `Error checking Google search results for ${domain}: ${error.message}`
      );
      console.log("Switching to a new proxy and retrying...");
      continue; // Retry with a new proxy
    }
  }
}

async function checkDomainAvailability(domains) {
  const url = "https://www.mrdomain.com/en/masiva/";
  const browser = await puppeteer.launch({ headless: true }); // Change to false for debugging
  const page = await browser.newPage();

  try {
    await page.goto(url);
    console.log(`Navigating to ${url}`);

    // Wait for the textarea to be present
    await page.waitForSelector("#massive_domains", { timeout: 20000 });
    const textarea = await page.$("#massive_domains");

    // Enter domains into the textarea
    const domainsText = domains.join("\n");
    await textarea.type(domainsText);
    console.log(`Domains entered: ${domainsText}`);

    // Click the "Search domains" button
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0", timeout: 40000 }), // Adjust timeout as needed
      page.click('button.btn-violet[type="submit"]'),
    ]);
    console.log('Clicked "Search domains" button');

    // Wait for the search results to load
    await page.waitForSelector(".searchresults-item", { timeout: 40000 }); // Adjust timeout as needed
    console.log("Search results page loaded");

    // Get all search result items
    const results = await page.$$(".searchresults-item");
    console.log(`Found ${results.length} results`);

    const availabilityDict = {};

    for (const result of results) {
      const resultHTML = await result.evaluate((element) => element.outerHTML);
      console.log(`HTML of the result:\n${resultHTML}\n`);

      try {
        const domainElement = await result.$(".searchresults-item-domain-name");
        const domain = await domainElement.evaluate((element) =>
          element.textContent.trim()
        );
        console.log(`Processing domain: ${domain}`);

        // Wait for "Checking ..." state to disappear
        await page.waitForSelector(".loading-spinner-label", {
          hidden: true,
          timeout: 30000,
        }); // Adjust timeout as needed

        // Check availability
        const addToCartButton = await result.$(
          'button span:contains("Add to cart")'
        );

        if (addToCartButton) {
          availabilityDict[domain] = 1; // Available
          console.log(`Domain ${domain}: Available`);
        } else {
          const transferButton = await result.$(
            'button span:contains("Transfer")'
          );
          if (transferButton) {
            availabilityDict[domain] = 0; // Registered
            console.log(`Domain ${domain}: Registered`);
          } else {
            availabilityDict[domain] = null; // Unknown state
            console.log(`Domain ${domain}: Unknown state`);
          }
        }
      } catch (error) {
        console.error(`Error processing domain: ${error}`);
      }
    }

    return availabilityDict;
  } catch (error) {
    console.error(`Error checking domain availability: ${error}`);
    await page.screenshot({ path: "error_screenshot.png" });
    return null;
  }
}

async function checkHighTrafficDomainsAvailability(a, sequelize) {
  try {
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const sqlQuery = `
    SELECT * 
    FROM domains 
    WHERE time >= :twoDaysAgo 
      AND organic_search_traffic >= :organicTrafficThreshold 
      AND available IS NULL
  `;

    const domainsToCheck = await sequelize.query(sqlQuery, {
      type: QueryTypes.SELECT,
      replacements: {
        twoDaysAgo,
        organicTrafficThreshold: config["organic_traffic_threshold"],
      },
    });

    console.log(
      `Found ${domainsToCheck.length} records with high organic traffic and unknown availability in the last two days.`
    );

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36",
    ];

    for (let i = 0; i < domainsToCheck.length; i += 10) {
      const batch = domainsToCheck.slice(i, i + 10);
      console.log(
        `Checking availability for batch ${Math.floor(i / 10) + 1}: ${batch
          .map((domain) => domain.domain)
          .join(", ")}`
      );

      // Puppeteer operations similar to the Python code
      // Assuming you have functions like get_proxy(), check_domain_availability(), etc.

      // Example:
      await page.setUserAgent(
        userAgents[Math.floor(Math.random() * userAgents.length)]
      );
      await page.goto("https://www.mrdomain.com/en/masiva/");

      // Other operations (setting cookies, filling forms, etc.) follow similar logic using Puppeteer

      // Database update (similar to Python)
      const availabilityResults = await check_domain_availability(page, batch);
      if (availabilityResults) {
        for (const domain in availabilityResults) {
          const availability = availabilityResults[domain];
          await Domain.update(
            { available: availability },
            { where: { domain } }
          );
        }
        console.log(
          `Database updated with availability information for batch ${
            Math.floor(i / 10) + 1
          }`
        );
      } else {
        console.log(
          `No availability results obtained for batch ${Math.floor(i / 10) + 1}`
        );
      }

      await page.waitForTimeout(Math.random() * 5000 + 5000); // Random delay between 5 to 10 seconds
    }

    await browser.close();
  } catch (error) {
    console.error(`An error occurred during the process: ${error}`);
  }
}

async function checkAhrefs(domain) {
  console.log(`Checking Ahrefs Domain Rating (DR) for ${domain}`);

  const maxRetries = 3;
  let domainRating = "Failed to get domain rating";

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const browser = await puppeteer.launch({ headless: true }); // Change to false for debugging
      const page = await browser.newPage();

      await page.goto(
        `https://ahrefs.com/es/website-authority-checker/?input=${domain}`
      );
      await page.waitForSelector("iframe");
      const iframeSrc = await page.evaluate(() =>
        document.querySelector("iframe").getAttribute("src")
      );
      const sitekey = config["captcha_api"];

      // Simulate solving CAPTCHA (replace with actual CAPTCHA solving code)
      const token = await solveCaptcha(sitekey);

      if (token) {
        const jsonData = {
          captcha: token,
          url: domain,
        };

        const headers = {
          Accept: "*/*",
          "Accept-Language": "en,bn;q=0.9,en-GB;q=0.8,en-AU;q=0.7,en-US;q=0.6",
          "Content-Type": "application/json; charset=utf-8",
          Origin: "https://ahrefs.com",
          Referer: `https://ahrefs.com/es/website-authority-checker/?input=${domain}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        };

        const response = await axios.post(
          "https://ahrefs.com/v4/stGetFreeWebsiteOverview",
          jsonData,
          { headers }
        );
        domainRating = response.data[1].domainRating;
        console.log(`Ahrefs Domain Rating (DR) for ${domain}: ${domainRating}`);
      } else {
        console.log("Failed to solve CAPTCHA");
      }

      await browser.close();
      break; // Exit retry loop on success
    } catch (error) {
      console.error(
        `Error getting Ahrefs DR for ${domain} (Attempt ${attempt}/${maxRetries}):`,
        error
      );
      if (attempt === maxRetries) {
        console.error(
          `Failed to get Ahrefs DR for ${domain} after ${maxRetries} attempts.`
        );
        break;
      }
      console.log("Retrying in 5 seconds...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  return domainRating;
}

async function getAndSaveProcessedDomains(processedDays) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - processedDays);

  try {
    // Fetch data from the database
    const data = await Domain.findAll({
      attributes: ["domain", "da", "pa", "ss"],
      where: {
        time: {
          [Sequelize.Op.gte]: cutoffDate,
        },
      },
    });

    let processedDomains = new Set();
    let domainsToReprocess = [];

    // Process fetched data
    data.forEach((row) => {
      const domain = row.domain;
      const da = row.da;
      const pa = row.pa;
      const ss = row.ss;

      if (da === null || pa === null || ss === null) {
        domainsToReprocess.push(domain);
        console.log(
          `Domain '${domain}' will be added to the list of domains to reprocess due to null values in da, pa, or ss.`
        );
      } else {
        processedDomains.add(domain);
      }
    });

    console.log(
      `Domains processed in the last ${processedDays} days: ${Array.from(
        processedDomains
      ).join(", ")}`
    );
    console.log(
      `Domains with null da, pa, or ss to be reprocessed: ${domainsToReprocess.join(
        ", "
      )}`
    );

    // Save processed domains to JSON file
    fs.writeFileSync(
      "processed_domains.json",
      JSON.stringify(Array.from(processedDomains))
    );

    // Save domains to reprocess to text file
    fs.writeFileSync("domains_to_reprocess.txt", domainsToReprocess.join("\n"));

    return {
      processedDomains: Array.from(processedDomains),
      domainsToReprocess,
    };
  } catch (error) {
    console.error("Error fetching and saving processed domains:", error);
    return { processedDomains: [], domainsToReprocess: [] };
  }
}

function checkDomainProcessed(domain, processedDomains) {
  console.log(
    `Verifying if '${domain}' is in processedDomains (already processed previously)`
  );
  const result = processedDomains.some(
    (d) => domain.toLowerCase() === d.toLowerCase()
  );
  console.log(`Result for '${domain}': ${result}`);
  return result;
}

function writeDomainToFile(file_path, domain_data) {
  const domainJson = JSON.stringify(domain_data);
  fs.appendFile(file_path, domainJson + "\n", (err) => {
    if (err) {
      console.error(`Error writing domain data to file ${file_path}:`, err);
    } else {
      console.log(`Domain data successfully written to ${file_path}`);
    }
  });
}

function readDomainsFromFile(file) {
  try {
    const fileContent = fs.readFileSync(file);
    console.log("============");
    console.log(fileContent);
    if (fileContent.trim() === "") {
      return [];
    } else {
      return fileContent
        .trim()
        .split("\n")
        .map((line) => line.trim());
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.error(`File ${file} not found.`);
    } else {
      console.error(`Error reading file ${file}:`, err);
    }
    return [];
  }
}

async function processFailedDomains(file_path, sequelize) {
  // Read domains from file
  const failedDomains = readDomainsFromFile(file_path);

  if (failedDomains.length > 0) {
    // Convert to DataFrame if needed
    const dfFailedDomains = new DataFrame(failedDomains, ["domain"]);

    try {
      // Rename columns if necessary
      dfFailedDomains.withColumnRenamed("authority_score", "authority");
      dfFailedDomains.withColumnRenamed(
        "organic_search_traffic",
        "organic_traffic"
      );

      // Connect to the database
      const connection = await mysql.createConnection(sequelize);

      // Insert domains into the database
      await Promise.all(
        dfFailedDomains.toArray().map(async (domain) => {
          try {
            await connection.execute(
              "INSERT INTO domains (domain) VALUES (?)",
              [domain]
            );
          } catch (err) {
            console.error(
              `Error saving domain ${domain} to the database:`,
              err
            );
          }
        })
      );

      // Close the connection
      await connection.end();

      // Print success message
      const processedDomains = dfFailedDomains
        .select("domain")
        .toArray()
        .map((row) => row.domain);
      console.log(
        `Previously failed domains processed and saved to the database: ${processedDomains.join(
          ", "
        )}`
      );
      console.log(dfFailedDomains.toString());

      // Clear the content of the failed domains file
      fs.writeFileSync(file_path, "");
    } catch (err) {
      console.error("Error processing failed domains:", err);
      console.error("Failed domains:", failedDomains);
    }
  } else {
    console.log("No failed domains found to process.");
  }
}

function loadJson(filename) {
  if (fs.existsSync(filename)) {
    try {
      const jsonData = fs.readFileSync(filename, "utf8");
      return JSON.parse(jsonData);
    } catch (err) {
      console.error(`Error reading ${filename}:`, err);
      return null;
    }
  }
  return null;
}

async function getNewPrepostseoToken() {
  console.log("Obteniendo un nuevo token de PrePostSEO");

  // Implement your login logic with puppeteer
  const { cookies, token } = await loginCookies();

  // Save token and timestamp to token.json
  const tokenData = {
    token: token,
    added_time: moment().toISOString(),
  };
  fs.writeFileSync("token.json", JSON.stringify(tokenData));

  return { cookies, token };
}

async function loadTokenAndCookies(driver) {
  const cookiesPath = path.resolve(__dirname, "cookies.json");
  const tokenPath = path.resolve(__dirname, "token.json");
  let cookies, token; // Declare cookies and token variables in the outer scope

  if (fs.existsSync(cookiesPath) && fs.existsSync(tokenPath)) {
    token = loadJson(tokenPath);
    cookies = loadJson(cookiesPath);
    let addedTime = moment(token.added_time, "YYYY-MM-DDTHH:mm:ss.SSS");
    let tokenExpirationTime = moment(addedTime).add(30, "minutes");

    if (moment().isAfter(tokenExpirationTime)) {
      console.log(
        "El token de PrePostSEO ha caducado, obteniendo un nuevo token..."
      );
      // Start an asynchronous process to obtain a new token
      // Assuming getNewPrepostseoToken returns cookies and token asynchronously
      ({ cookies, token } = await getNewPrepostseoToken(driver));
    } else {
      console.log("El token de PrePostSEO sigue siendo válido");
      console.log(
        `Fecha de caducidad del token de PrePostSEO: ${tokenExpirationTime.format(
          "YYYY-MM-DD HH:mm:ss"
        )}`
      );
      await driver.goto("https://www.prepostseo.com/domain-authority-checker");
      cookies = loadJson(cookiesPath);
      // Load cookies to browser
      for (let [key, value] of Object.entries(cookies)) {
        await driver.addCookie({ name: key, value: value });
      }
      await driver.refresh();
      token = token.token;
    }
  } else {
    console.log(
      "No se encontraron el token o las cookies de PrePostSEO, obteniendo nuevos"
    );
    ({ cookies, token } = await getNewPrepostseoToken(driver));
    await driver.goto("https://www.prepostseo.com/domain-authority-checker");
  }
  return { cookies, token };
}

async function getProxies() {
  const proxyApi = config["proxy_api"];

  const url = `https://api.proxyscrape.com/v2/account/datacenter_shared/proxy-list?auth=${proxyApi}&type=getproxies&country[]=all&protocol=http&format=normal&status=all`;

  try {
    const response = await axios.get(url);
    let proxies = response.data.split("\n");
    proxies = proxies.map((proxy) => proxy.trim()); // Trim whitespace from each proxy

    return proxies;
  } catch (error) {
    console.error("Error fetching proxies:", error.message);
    return []; // Return empty array on error
  }
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}min`;
}

async function configureDriver(proxy) {
  let chromeOptions = new chrome.Options();
  // chromeOptions.headless(); // Uncomment to run Chrome in headless mode
  chromeOptions.addArguments("--disable-gpu", "--no-sandbox");

  if (proxy) {
    chromeOptions.addArguments(`--proxy-server=${proxy}`);
  }

  const builder = new Builder()
    .forBrowser("chrome")
    .withCapabilities(Capabilities.chrome())
    .setChromeOptions(chromeOptions);

  const driver = await builder.build();

  return driver;
}

async function readDomainsFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const domains = data
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    console.log(data);
    return domains;
  } catch (error) {
    if (error.code === "ENOENT") {
      try {
        await fs.writeFile(filePath, ""); // Create empty file if not exists
        return [];
      } catch (err) {
        console.error(`Error creating file ${filePath}: ${err.message}`);
        return [];
      }
    } else {
      console.error(`Error reading file ${filePath}: ${error.message}`);
      return [];
    }
  }
}

function writeDomainsToFile(file, domains) {
  // Convert the array to a Set to remove duplicates
  const uniqueDomains = new Set(domains);

  fs.writeFileSync(file, Array.from(uniqueDomains).join("\n"));

  // Inform about removed duplicates
  const duplicatesRemoved = domains.length - uniqueDomains.size;
  if (duplicatesRemoved > 0) {
    console.log(
      `Se eliminaron ${duplicatesRemoved} dominios duplicados de ${file}`
    );
  }
}

function removeProcessedDomains(domainList, processedDomains) {
  // Convert processedDomains to a Set for O(1) lookup time
  const processedSet = new Set(processedDomains);

  // Filter out domains that are not in processedDomains
  const updatedList = domainList.filter((domain) => !processedSet.has(domain));

  return updatedList;
}

async function getProcessedDomainsFromDb(pool, days = 200) {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  try {
    // const connection = await mysql.createConnection(sequelize);
    console.log(pool, "===");
    const [rows] = await pool.execute(
      "SELECT DISTINCT domain FROM domains WHERE time >= ?",
      [format(fiveDaysAgo, "yyyy-MM-dd HH:mm:ss")]
    );
    return rows.map((row) => row.domain);
  } catch (error) {
    console.error("Error querying database:", error.message);
    return [];
  }
}

function logFailedDomain(domain, attempt, file) {
  let lines = [];

  try {
    lines = fs.readFileSync(file, "utf8").split("\n");
  } catch (error) {
    // Handle file read error
    console.error(`Error reading file ${file}: ${error.message}`);
  }

  let updated = false;
  try {
    const data = JSON.stringify(attempt); // Convert attempt to JSON string
    const newLine = `${domain}\t${data}\tfallido`;

    const updatedLines = lines.map((line) => {
      if (line.startsWith(domain + "\t")) {
        updated = true;
        return newLine;
      } else {
        return line;
      }
    });

    if (!updated) {
      updatedLines.push(newLine);
    }

    fs.writeFileSync(file, updatedLines.join("\n"));
  } catch (error) {
    // Handle file write error
    console.error(`Error writing file ${file}: ${error.message}`);
  }
}

async function loginNoxtools() {
  const browser = await puppeteer.launch({ headless: false }); // Change to true for headless mode
  const page = await browser.newPage();

  try {
    await page.goto(
      "https://noxtools.com/secure/login?amember_redirect_url=%2Fsecure%2Fsignup",
      { waitUntil: "domcontentloaded" }
    );
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds

    // Check if Cloudflare captcha appears
    if (
      await page.evaluate(() => document.body.innerHTML.includes("Cloudflare"))
    ) {
      console.log("Cloudflare detected");

      const iframeSrc = await page.evaluate(() => {
        const iframe = document.querySelector("iframe");
        return iframe ? iframe.src : "";
      });

      if (iframeSrc) {
        const sitekey = iframeSrc.split("/light/")[0].split("/").pop();

        // Solve captcha using a service (replace with your own captcha solving logic)
        const token = await solveCaptcha(sitekey);

        if (token) {
          await page.evaluate((token) => {
            document.querySelector('textarea[name="cf_captcha_kind"]').value =
              token;
            document.querySelector('form[id="challenge-form"]').submit();
          }, token);

          await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait for 5 seconds after submitting captcha
        } else {
          console.log("Error solving Cloudflare captcha");
          return false;
        }
      } else {
        console.log(
          "Cloudflare captcha iframe not found. Trying to log in without solving the captcha."
        );
      }
    }

    // Login process
    await page.waitForSelector("#amember-login");
    await page.type("#amember-login", config["noxtools"]["user"]);

    await page.waitForSelector("#amember-pass");
    await page.type("#amember-pass", config["noxtools"]["pass"]);

    await page.waitForSelector('input[value="Login"]');
    await page.click('input[value="Login"]');

    await new Promise((resolve) => setTimeout(resolve, 8000)); // Wait for random time between 8 to 10 seconds

    // Check if login was successful
    const loggedIn = await page.evaluate(() =>
      document.body.innerHTML.includes("Dashboard")
    );

    if (loggedIn) {
      console.log("Logged in to Noxtools!");

      // Get cookies and save to file
      const cookies = await page.cookies();
      fs.writeFileSync(
        "noxtools_cookies.json",
        JSON.stringify(cookies, null, 2)
      );

      return true;
    } else {
      console.log("Failed to log in to Noxtools, disabling Noxtools functions");
      return false;
    }
  } catch (error) {
    console.error("Error during login:", error);
    return false;
  } finally {
    await browser.close();
  }
}

async function solveCaptcha(sitekey) {
  // Replace with your own captcha solving logic using a service or method
  // This is a placeholder function, adjust according to your captcha solving method
  try {
    const response = await axios.post(
      "https://your-captcha-solving-service.com/solve",
      {
        sitekey: sitekey,
        // Add any other parameters required by your captcha solving service
      }
    );

    return response.data.token; // Assuming your service returns a token
  } catch (error) {
    console.error("Error solving captcha:", error);
    return null;
  }
}

function findNoxtoolsData(reportPageHtml, label, nextElement, attrs = null) {
  const $ = cheerio.load(reportPageHtml);

  // Find the span element containing the label text
  const labelElement = $(`span:contains("${label}")`);

  // Find the next element after the label
  const nextElementText = labelElement.next(nextElement).text().trim();

  // Determine the number based on suffix (K, M, B)
  const lastChar = nextElementText.slice(-1);
  const numberMap = { K: 1000, M: 1000000, B: 1000000000 };

  let number;
  if (lastChar in numberMap) {
    number = parseFloat(nextElementText.slice(0, -1)) * numberMap[lastChar];
  } else {
    number = parseFloat(nextElementText);
  }

  return number;
}

async function searchNoxtools(browser, domain) {
  const serverList = ["smr1", "smr2", "smr3", "smr4", "smr5"];
  const result = {
    authority_score: "",
    organic_search_traffic: "",
    backlinks: "",
  };

  for (const server of serverList) {
    try {
      const q = `https://${server}.noxtools.com/analytics/overview/?searchType=domain&q=${domain}`;
      await browser.goto(q);

      // Add a random delay between 5 and 10 seconds before continuing
      const randomDelay = random(5000, 10000);
      console.log(
        `Waiting for ${
          randomDelay / 1000
        } seconds before processing ${server}...`
      );
      await browser.waitForTimeout(randomDelay);

      const pageContent = await browser.content();
      const $ = cheerio.load(pageContent);
      const reportPage = $(
        'div#reportPageContent section[aria-label="Domain summary"]'
      );

      result["authority_score"] = findNoxtoolsData(
        reportPage,
        "Authority Score",
        "span",
        { "data-ui-name": "Link.Text" }
      );

      try {
        result["organic_search_traffic"] = findNoxtoolsData(
          reportPage,
          "Organic search traffic",
          "span",
          { "data-ui-name": "Link.Text" }
        );
      } catch (error) {
        result["organic_search_traffic"] = "";
      }

      result["backlinks"] = findNoxtoolsData(reportPage, "Backlinks", "span", {
        "data-ui-name": "Link.Text",
      });
      console.log(
        `Data from Noxtools-sermrush - ${server} for domain ${domain}:`,
        result
      );

      // Check if all three fields are empty
      if (
        result["authority_score"] === "" &&
        result["organic_search_traffic"] === "" &&
        result["backlinks"] === ""
      ) {
        continue; // Move to the next server in the list
      } else {
        return result;
      }
    } catch (error) {
      console.error(
        `Error getting Noxtools data from ${server} for ${domain}:`,
        error
      );
      continue; // Try with the next server in the list
    }
  }

  console.log(
    `Failed to get Noxtools data for ${domain} after trying all servers.`
  );
  return false;
}

function allFieldsEmpty(row) {
  return (
    (row.authority_score === null || row.authority_score === "") &&
    (row.organic_search_traffic === null ||
      row.organic_search_traffic === "") &&
    (row.backlinks === null || row.backlinks === "")
  );
}

async function fillBlankFields() {
  const connection = await mysql.createConnection(
    `mysql+pymysql://${config["db"]["Database user"]}:${config["db"]["Database pass"]}@${config["db"]["hostname"]}:${config["db"]["port"]}/${config["db"]["Database name"]}`
  ); // Adjust config as per your database setup
  const [rows, fields] = await connection.execute(
    `
      SELECT *
      FROM domains
      WHERE time >= ?
        AND google_results > ?
        AND (
          authority_score IS NULL OR authority_score = ''
          OR organic_search_traffic IS NULL OR organic_search_traffic = ''
          OR backlinks IS NULL OR backlinks = ''
        )
  `,
    [
      moment().subtract(2, "days").format("YYYY-MM-DD HH:mm:ss"),
      config.noxtools.google_results,
    ]
  );

  console.log(`Found ${rows.length} records to update`);

  const browser = await puppeteer.launch({ headless: true }); // Set to true for headless mode

  for (const row of rows) {
    console.log(
      `Processing for updating authority_score, organic_search_traffic, and backlinks for domain: ${row.domain}`
    );

    // Perform web scraping to fill blank fields
    if (!row.authority_score || !row.organic_search_traffic || !row.backlinks) {
      const data = await searchNoxtools(browser, row.domain);

      if (data) {
        await connection.execute(
          `
                  UPDATE domains
                  SET authority_score = ?,
                      organic_search_traffic = ?,
                      backlinks = ?
                  WHERE time = ?
                    AND domain = ?
              `,
          [
            data.authority_score,
            data.organic_search_traffic,
            data.backlinks,
            row.time,
            row.domain,
          ]
        );

        console.log(
          `Record successfully updated in the database for domain: ${row.domain}`
        );
      } else {
        console.log(
          `Noxtools data not found for domain: ${row.domain}. Skipping database update.`
        );
      }
    }
  }

  await browser.close();
  await connection.end();
  console.log("Process complete");
}

async function saveToDatabase(db, data) {
  try {
    const [rows, fields] = await db.query(
      "INSERT INTO domain_data (domain, da, pa, ss, time) VALUES ?",
      [data.map((item) => [item.domain, item.da, item.pa, item.ss, item.time])]
    );
    console.log(`Inserted ${rows.affectedRows} records into database.`);
  } catch (error) {
    console.error("Error saving data to database:");
    console.error(error);
    throw error; // Propagate error to handle at a higher level
  }
}

async function main() {
  let driver, driver2;

  try {
    driver = await puppeteer.launch({ headless: false });
    driver2 = await puppeteer.launch({ headless: false });
    console.log("Drivers created");

    // Login to Noxtools
    let noxtoolsEnabled = true;
    let noxtoolsLoginResult = await loginNoxtools();
    if (noxtoolsLoginResult) {
      console.log("Noxtools logged in");
      await fillBlankFields(driver2, sequelize, noxtoolsEnabled); // Fill blank fields in the database
    } else {
      console.log("Failed to log in to Noxtools, disabling Noxtools functions");
      noxtoolsEnabled = false;
    }

    // Check availability of high traffic domains
    await checkHighTrafficDomainsAvailability(driver, sequelize, config);

    // Now login to PrePostSEO
    const { cookies, token } = await loadTokenAndCookies(driver);

    const proxies = await getProxies();

    let lastPrepostseoDriverRestart = Date.now();
    let lastNoxtoolsDriverRestart = Date.now();

    while (true) {
      // Get processed domains from the database
      const dbProcessedDomains = await getProcessedDomainsFromDb(sequelize);
      console.log(
        `Domains in the database from the last 5 days: ${dbProcessedDomains.length}`
      );

      // Load domains from domainslist.txt
      let domainList = [
        "example.com",
        "subdomain.example.org",
        "example.com", // Duplicate
        "https://www.anotherdomain.com",
        "subdomain.example.org", // Duplicate
      ];
      console.log(
        `Domains in domainslist.txt before filtering: ${domainList.length}`
      );

      // Remove duplicates from domainList
      const uniqueDomainList = [...new Set(domainList)];
      if (uniqueDomainList.length < domainList.length) {
        console.log(
          `Found ${
            domainList.length - uniqueDomainList.length
          } duplicate domains in domainslist.txt`
        );
        domainList = uniqueDomainList;
        writeDomainsToFile("domainslist.txt", domainList);
        console.log(
          `domainslist.txt updated with ${domainList.length} unique domains`
        );
      }

      // Filter domains that are already in the database
      const newDomainList = domainList.filter(
        (d) => !dbProcessedDomains.includes(d)
      );
      writeDomainsToFile("domainslist.txt", newDomainList);
      console.log(
        `Domains in domainslist.txt after filtering: ${newDomainList.length}`
      );
      console.log(
        `Domains removed from domainslist.txt: ${
          domainList.length - newDomainList.length
        }`
      );

      // Process only new domains
      const domainsToProcess = newDomainList;

      // Create batches with domains that need to be processed
      const batches = [];
      for (let i = 0; i < domainsToProcess.length; i += 10) {
        batches.push(domainsToProcess.slice(i, i + 10));
      }
      const totalBatches = batches.length;
      const totalDomains = domainsToProcess.length;
      let processedDomainsCount = 0;
      const startTime = Date.now();

      console.log(`Domains to process in this iteration: ${totalDomains}`);

      for (let domainBatch of batches) {
        console.log(`Domains in the current batch: ${domainBatch.join(", ")}`);

        const data = await checkDaPa(cookies, token, domainBatch);

        // Write data to prepostseo_data.txt
        const csv = parse(data, {
          fields: ["domain", "da", "pa", "ss", "time"],
        });
        await appendFileAsync("prepostseo_data.txt", csv + "\n");

        const domainsToCheckAvailability = [];

        for (let d of data) {
          processedDomainsCount++;
          const elapsedTime = Date.now() - startTime;

          // Calculate estimated remaining time
          const domainsRemaining = totalDomains - processedDomainsCount;
          const estimatedRemainingTime =
            processedDomainsCount === 1
              ? 0
              : (elapsedTime / (processedDomainsCount - 1)) * domainsRemaining;

          // Show progress and estimated remaining time
          const progressPercentage =
            (processedDomainsCount / totalDomains) * 100;
          console.log(
            `Domain ${processedDomainsCount} of ${totalDomains} in total - Progress: ${progressPercentage.toFixed(
              2
            )}% - Estimated Time Remaining: ${formatTime(
              estimatedRemainingTime
            )}`
          );

          const googleResults = await checkGoogle(d.domain);
          d.google_results = googleResults;

          if (
            googleResults > config.noxtools.google_results &&
            noxtoolsEnabled
          ) {
            console.log("Getting Noxtools data");
            const noxtoolsData = await searchNoxtools(driver2, d.domain);
            if (noxtoolsData) {
              Object.assign(d, noxtoolsData);

              // Check if organic traffic exceeds threshold
              if (
                parseFloat(d.organic_search_traffic) >=
                config.organic_traffic_threshold
              ) {
                domainsToCheckAvailability.push(d.domain);
              }
            } else {
              console.log(
                "Noxtools data not found. Skipping Noxtools data for this domain."
              );
              Object.assign(d, {
                authority_score: "",
                organic_search_traffic: "",
                backlinks: "",
              });
            }
          } else {
            Object.assign(d, {
              authority_score: "",
              organic_search_traffic: "",
              backlinks: "",
            });
          }

          if (d.da >= config.da_check || d.pa >= config.pa_check) {
            d.DR = await checAhrefs(driver, d.domain);
          } else {
            d.DR = "";
          }
        }

        // Check availability for domains that exceed the threshold
        if (domainsToCheckAvailability.length > 0) {
          console.log(
            `Checking availability for domains: ${domainsToCheckAvailability.join(
              ", "
            )}`
          );
          const availabilityResults = await checkDomainAvailability(
            driver,
            domainsToCheckAvailability
          );

          if (availabilityResults) {
            for (let d of data) {
              if (availabilityResults[d.domain]) {
                d.available = availabilityResults[d.domain];
                console.log(`Domain ${d.domain} availability: ${d.available}`);
              }
            }
          } else {
            console.log("No availability results obtained");
          }
        }

        // Insert data into the database after processing each batch
        const df = new DataFrame(data);
        console.log("Attempting to save the following data in the database:");
        console.log(df.toString());
        console.log(df.show());
        console.log(df)

        try {
          // Sync model with database

          await testConnection();

          await Domain.sync();

          // Iterate through DataFrame and save each row to the database
          for (let row of df.toCollection()) {
              await Domain.create(row);
          }
          console.log("Data saved successfully in the database");
          for (let row of df.toCollection()) {
            const availabilityInfo = row.available
              ? `, Available: ${row.available}`
              : "";
            console.log(`Domain: ${row.domain}${availabilityInfo}`);
          }
        } catch (error) {
          console.error(`Error saving to the database: ${error}`);
        }

        // Update the status of processed domains in prepostseo_data.txt
        for (let d of data) {
          console.log(
            `Domain ${d.domain} processed from prepostseo_data.txt and ready to update its status.`
          );
          updateStatusInFile("prepostseo_data.txt", d.domain, "processed");
        }
      }

      // At the end of the iteration
      console.log(
        `Domains processed in this iteration: ${processedDomainsCount}`
      );
      console.log(
        `Domains remaining in domainslist.txt: ${
          readDomainsFromFile("domainslist.txt").length
        }`
      );

      const elapsedTime = Date.now() - startTime;
      const estimatedBatchTime =
        totalBatches > 0
          ? (elapsedTime / totalBatches) * (totalBatches - batches.length)
          : 0;
      console.log(
        `Completed All Batches - Total Elapsed Time: ${formatTime(elapsedTime)}`
      );
      console.log(
        `Estimated Time Remaining for All Batches: ${formatTime(
          estimatedBatchTime
        )}`
      );

      if (!noxtoolsEnabled) {
        console.log("Noxtools is disabled. Checking if it's back up...");
        const testDomain = "example.com"; // Replace with a test domain
        if (await searchNoxtools(driver2, testDomain)) {
          noxtoolsEnabled = true;
          console.log("Noxtools is back up. Enabling Noxtools data retrieval.");
        }
      }

      // Restart PrePostSEO driver every 30 minutes (for example)
      if (Date.now() - lastPrepostseoDriverRestart > 1800000) {
        console.log("Restarting PrePostSEO driver every 30 minutes");
        driver = await restartDriver(driver);
        const { cookies: newCookies, token: newToken } =
          await loadTokenAndCookies(driver);
        cookies = newCookies;
        token = newToken;
        lastPrepostseoDriverRestart = Date.now();
      }

      // Restart Noxtools driver every 30 minutes (for example)
      if (Date.now() - lastNoxtoolsDriverRestart > 1800000) {
        console.log("Restarting Noxtools driver every 30 minutes");
        driver2 = await restartDriver(driver2);
        noxtoolsLoginResult = await loginNoxtools();
        lastNoxtoolsDriverRestart = Date.now();
      }

      console.log("Waiting 60 seconds before the next iteration");
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 60 seconds before the next iteration
    }
  } catch (error) {
    console.error("An error occurred:", error);
    if (
      error.name === "WebDriverException" &&
      error.message.includes("disconnected: not connected to DevTools")
    ) {
      console.log(
        `Error 'disconnected: not connected to DevTools' occurred: ${error}`
      );
      console.log("Restarting the script...");
      // Implement your restart script logic here
    } else {
      throw error;
    }
  }
}

// Example usage
main().catch((err) => console.error("Error in main function:", err));

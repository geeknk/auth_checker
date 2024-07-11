const fs = require('fs');
const mysql = require('mysql2/promise');
const { Builder, By, Key, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const axios = require('axios');


const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
console.log(config)

async function setupDatabase() {
    return await mysql.createConnection({
      host: config['db']['hostname'],
      port:config['db']['port'],
      user: config['db']['Database user'],
      password: config['db']['Database pass'],
      database: config['db']['Database name']
    });
  }

  
  async function setupDriver() {
    let options = new chrome.Options();
    options.addArguments('--disable-gpu', '--no-sandbox');
  
    let driver = await new Builder()
      .forBrowser('chrome')
      .setChromeOptions(options)
      .build();
  
    return driver;
  }

  
  async function loginPrePostSEO(driver) {
    await driver.get('https://www.prepostseo.com/login');
    await driver.sleep(5000);
  
    try {
      await driver.findElement(By.id('accept-choices')).click();
    } catch (e) {
      // Ignore if element not found
    }
  
    await driver.findElement(By.css('input[name="email"]')).sendKeys(config.dpachecker.email);
    await driver.findElement(By.css('input[name="password"]')).sendKeys(config.dpachecker.password);
    await driver.findElement(By.css('button[type="submit"]')).click();
    await driver.sleep(4000);
  
    console.log('Logged in to prepostseo');
    await driver.get('https://www.prepostseo.com/domain-authority-checker');
    await driver.sleep(5000);
  
    let cookies = await driver.manage().getCookies();
    let token = await driver.findElement(By.css('meta[name="_token"]')).getAttribute('content');
  
    fs.writeFileSync('token.json', JSON.stringify({ token, added_time: new Date().toISOString() }));
    fs.writeFileSync('cookies.json', JSON.stringify(cookies));
  
    console.log('Got cookies and token');
    return { cookies, token };
  }
  
  // Main function to start the process
  async function main() {
    const db = await setupDatabase();
    const driver = await setupDriver();
  
    try {
      await loginPrePostSEO(driver);
      // Add more functionality here: domain processing, database operations, etc.
    } catch (e) {
      console.error('An error occurred:', e);
    } finally {
      await driver.quit();
      await db.end();
    }
  }
  
  main().catch(console.error);
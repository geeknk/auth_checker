# from seleniumbase import Driver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
import pandas as pd
from bs4 import BeautifulSoup as bs
from sqlalchemy import text, select, create_engine, Table, MetaData
from sqlalchemy.orm import sessionmaker
from selenium.common.exceptions import NoSuchElementException, TimeoutException

from selenium.common.exceptions import NoSuchElementException, TimeoutException, StaleElementReferenceException



import json
from tqdm import tqdm
import pymysql
import time
import glob
import time
import re
from sqlalchemy import or_
from sqlalchemy import and_
from sqlalchemy.sql.expression import bindparam
from io import StringIO
import numpy as np
import selenium
import sys
import botasaurus as bt


from googleapiclient.discovery import build

import random
from datetime import datetime, timedelta
from googleapiclient.discovery import build
import requests
from anticaptchaofficial.turnstileproxyless import *
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
# from seleniumbase import Driver
import os
from botasaurus import *
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError
from pymysql.err import OperationalError as PyMySQLOperationalError
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.proxy import Proxy, ProxyType
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
from selenium import webdriver



# Read the config file
with open('config.json', 'r') as f:
    config = json.load(f)

da_check = config['DA Check']
pa_check = config['PA Check']
processed_days = 3  # Number of days to check if a domain has been processed

db_name = config['db']['Database name']
db_user = config['db']['Database user']
db_password = config['db']['Database pass']
db_host = config['db']['hostname']
db_port = config['db']['port']

noxtools_enabled = True

# Create MySQL engine
engine = create_engine(f'mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}', pool_pre_ping=True)

def login_cookies(browser):
    browser.get('https://www.prepostseo.com/login')
    time.sleep(5)
    # Accept cookies
    try:
        browser.find_element(By.ID, 'accept-choices').click()
    except:
        pass
    # Send email
    browser.find_element(By.CSS_SELECTOR, 'input[name="email"]').send_keys(config['dpachecker']['email'])
    # Send password
    browser.find_element(By.CSS_SELECTOR, 'input[name="password"]').send_keys(config['dpachecker']['password'])
    # Click login
    browser.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
    time.sleep(4)
    print('Logged in to prepostseo')
    browser.get('https://www.prepostseo.com/domain-authority-checker')
    time.sleep(5)
    print('Got cookies')
    cookies = browser.get_cookies()
    cookies = {cookie['name']: cookie['value'] for cookie in cookies}
    token = browser.find_element(By.CSS_SELECTOR, 'meta[name="_token"]').get_attribute('content')
    token_expires = 3600
    with open('token.json', 'w') as f:
        json.dump({'token': token, 'added_time': datetime.now().isoformat()}, f)
    with open('cookies.json', 'w') as f:
        json.dump(cookies, f)
    print('Got cookies and token')
    return cookies, token

def restart_script():
    """Reinicia el script actual"""
    print("Reiniciando el script...")
    os.execl(sys.executable, sys.executable, *sys.argv)

def check_da_pa(cookies, token, domain_list):
    headers = {
        'accept': 'application/json, text/javascript, */*; q=0.01',
        'accept-language': 'en',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'dnt': '1',
        'origin': 'https://www.prepostseo.com',
        'pragma': 'no-cache',
        'referer': 'https://www.prepostseo.com/domain-authority-checker',
        'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'x-csrf-token': token,
        'x-requested-with': 'XMLHttpRequest',
        'X-CSRF-Token': token,

    }

    csv_df = []
    failed_domains = []

    for domain in domain_list:
        data = {
            'urls[]': [domain],
            'count': '0',
            'tool_key': 'domain_authority_checker',
        }

        response = requests.post('https://www.prepostseo.com/ajax/check-authority', cookies=cookies, headers=headers, data=data)

        if response.ok:
            try:
                r_data = response.json()
                if type(r_data) == list:
                    for d in r_data:
                        domain = d['url']
                        da = d['domain_auth']
                        pa = d['page_auth']
                        ss = d['spam_score']
                        extract_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        domain_data = {
                            "domain": domain,
                            "da": da,
                            "pa": pa,
                            "ss": ss,
                            "time": extract_time
                        }
                        print(domain_data)
                        csv_df.append(domain_data)
                else:
                    print(f"Unexpected response format for domain: {domain}")
                    failed_domains.append((domain, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
            except requests.exceptions.JSONDecodeError as e:
                print(f"Error decoding JSON response for domain: {domain}")
                print(f"Response content: {response.text}")
                failed_domains.append((domain, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
        else:
            print(f"Request failed for domain: {domain}")
            print(f"Status code: {response.status_code}")
            print(f"Response content: {response.text}")
            failed_domains.append((domain, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

    # Log failed domains with timestamp
    if failed_domains:
        with open("log.txt", "a") as log_file:
            for domain, timestamp in failed_domains:
                log_file.write(f"{timestamp} - {domain}\n")

    df = pd.DataFrame(csv_df)
    return csv_df


def check_da_pa2(cookies, domain_list, browser):
    browser.get('https://www.prepostseo.com/domain-authority-checker')
    time.sleep(5)
    textarea = driver.find_element(By.CSS_SELECTOR, 'textarea#urls')
    textarea.send_keys('\n'.join(domain_list))
    # click check Authority
    browser.find_element(By.CSS_SELECTOR, 'span#checkBtn').click()
    time.sleep(15)
    s = bs(driver.page_source, 'html.parser')
    df = pd.read_html(str(s.select('table#resultsTable')))[0]
    df.reset_index(drop=True, inplace=True)
    df.columns = df.columns.get_level_values(1)
    df = df[['Web Page', 'DA', 'PA', 'SS']]
    df = df.rename(columns={'Web Page': 'domain', 'DA': 'da', 'PA': 'pa', 'SS': 'ss'})
    df['time'] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f'Got data for {len(df)} domains from prepostseo')
    # Imprimir los valores obtenidos
    for index, row in df.iterrows():
        print(f"Domain: {row['domain']}, DA: {row['da']}, PA: {row['pa']}, SS: {row['ss']}")
    
    textarea.clear()
    return df.to_dict('records')
def process_prepostseo_data(file, processed_domains, engine):
    with open(file, 'r') as f:
        lines = f.readlines()
    
    processed_data = []
    
    for line in lines:
        domain, data, status = line.strip().split('\t')
        if status == 'pendiente de procesar':
            data = json.loads(data)
            # Procesar los datos...
            processed_data.append(data)
    
    # Guardar los datos procesados en la base de datos
    df = pd.DataFrame(processed_data)
    df.to_sql('domains', engine, if_exists='append', index=False)
    print("Data saved to the database:")
    print(df.to_string(index=False))
    
    # Actualizar el estado en el archivo y agregar los dominios a processed_domains
    with open(file, 'w') as f:
        for line in lines:
            domain, data, status = line.strip().split('\t')
            if status == 'pendiente de procesar' and domain in df['domain'].values:
                update_status_in_file(file, domain, 'tramitado')
                processed_domains.add(domain)
            else:
                f.write(line)

def update_status_in_file(file, domain, new_status):
    with open(file, 'r') as f:
        lines = f.readlines()
    with open(file, 'w') as f:
        for line in lines:
            if line.startswith(domain + '\t'):
                f.write(f"{domain}\t{data}\t{new_status}\n")
            else:
                f.write(line)


def restart_driver(driver):
    try:
        driver.quit()
    except:
        pass
    driver = configure_driver()
    return driver

def get_proxy():
    username = "c3iplh8bpfkt9pb"
    password = "jdjj3psiadzy1xs"
    proxy = "rp.proxyscrape.com:6060"
    proxy_auth = "{}:{}@{}".format(username, password, proxy)
    proxies = {
        "http": "http://{}".format(proxy_auth),
        "https": "http://{}".format(proxy_auth)
    }
    return proxies


def check_google(domain):
    while True:
        proxies = get_proxy()
        print(f"Using proxy: {proxies['http']}")

        try:
            headers = {
                'authority': 'www.google.com',
                'accept': '*/*',
                'accept-language': 'en,bn;q=0.9,en-GB;q=0.8,en-AU;q=0.7,en-US;q=0.6',
                'cache-control': 'no-cache',
                'dnt': '1',
                'pragma': 'no-cache',
                'referer': 'https://www.google.com/',
                'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
                'sec-ch-ua-mobile': '?0',
                'sec-ch-ua-platform': '"Windows"',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-origin',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
            }

            url = f'https://www.google.com/search?q=site:{domain}'
            print(f'Checking Google search results for {domain}')

            wait_time = random.uniform(1, 3)
            print(f"Waiting for {wait_time:.2f} seconds before making the request...")
            time.sleep(wait_time)

            response = requests.get(url, headers=headers, proxies=proxies, timeout=30)

            if response.status_code == 200:
                print(f'Successfully retrieved Google search results for {domain}')
                html = response.text
                s = bs(html, 'html.parser')
                result_stats = s.find('div', {'id': 'result-stats'})
                if result_stats:
                    total = result_stats.text.strip().split('(')[0]
                    total = re.findall(r'\d+', total)
                    if total:
                        total = int(''.join(total))
                    else:
                        total = 0
                else:
                    total = 0

                print(f'Total indexed pages for {domain}: {total}')
                return total
            elif response.status_code == 429:
                print(f'Error checking Google search results for {domain}: {response.status_code} (Too Many Requests)')
                print('Switching to a new proxy and retrying...')
                continue

            else:              
                print(f'Error checking Google search results for {domain}: {response.status_code}')
                print('Switching to a new proxy and retrying...')

                continue

        except requests.exceptions.RequestException as e:
            print(f"Error checking Google search results for {domain}: {e}")
            print('Switching to a new proxy and retrying...')

            continue


def check_domain_availability(driver, domains):
    url = "https://www.mrdomain.com/en/masiva/"
    
    try:
        driver.get(url)
        time.sleep(5)  # Esperar a que la página cargue completamente
        print(f"Navegando a {url}")

        # Encontrar el campo de entrada de texto
        textarea = WebDriverWait(driver, 20).until(
            EC.presence_of_element_located((By.ID, "massive_domains"))
        )
        print("Textarea encontrado")

        # Ingresar los dominios en el textarea
        domains_text = "\n".join(domains)
        textarea.send_keys(domains_text)
        print(f"Dominios ingresados: {domains_text}")

        # Encontrar y hacer clic en el botón "Search domains"
        submit_button = WebDriverWait(driver, 20).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn-violet[type='submit']"))
        )
        submit_button.click()
        print("Botón 'Search domains' clickeado")

        # Esperar a que la nueva página de resultados cargue completamente
        try:
            WebDriverWait(driver, 40).until(
                EC.presence_of_all_elements_located((By.CLASS_NAME, "searchresults-item"))
            )
            print("Página de resultados cargada")
        except TimeoutException:
            print("Tiempo de espera agotado al cargar los resultados. Capturando screenshot.")
            driver.save_screenshot("timeout_error.png")
            return None

        # Obtener los resultados
        results = driver.find_elements(By.CSS_SELECTOR, ".searchresults-item")
        print(f"Encontrados {len(results)} resultados")
        
        availability_dict = {}
        for _ in range(3):  # Intentar hasta 3 veces para manejar el StaleElementReferenceException
            try:
                for result in results:
                    result_html = result.get_attribute('outerHTML')
                    print(f"HTML del resultado:\n{result_html}\n")
                    
                    try:
                        domain_element = result.find_element(By.CSS_SELECTOR, ".searchresults-item-domain-name")
                        domain = domain_element.text.strip()
                        print(f"Procesando dominio: {domain}")
                        
                        # Esperar a que el estado "Checking ..." desaparezca
                        WebDriverWait(driver, 30).until_not(
                            EC.presence_of_element_located((By.CSS_SELECTOR, ".loading-spinner-label"))
                        )

                        # Verificar la disponibilidad
                        print("Buscando botón 'Add to cart'")
                        add_to_cart_button = result.find_element(By.XPATH, ".//button[span[text()='Add to cart']]")
                        print(f"Encontrado botón 'Add to cart' para {domain}")
                        availability_dict[domain] = 1  # Disponible
                        print(f"Dominio {domain}: Disponible")
                    except NoSuchElementException:
                        print(f"No se encontró botón 'Add to cart' para {domain}")
                        try:
                            print("Buscando botón 'Transfer'")
                            transfer_button = result.find_element(By.XPATH, ".//button[span[text()='Transfer']]")
                            print(f"Encontrado botón 'Transfer' para {domain}")
                            availability_dict[domain] = 0  # No disponible
                            print(f"Dominio {domain}: Registrado")
                        except NoSuchElementException:
                            print(f"No se encontró botón 'Transfer' para {domain}")
                            availability_dict[domain] = None  # Estado desconocido
                            print(f"Dominio {domain}: Estado desconocido")
                break  # Salir del bucle si todo va bien
            except StaleElementReferenceException:
                print(f"Stale element reference encontrado. Reintentando...")
                time.sleep(2)  # Esperar antes de reintentar
                results = driver.find_elements(By.CSS_SELECTOR, ".searchresults-item")  # Obtener los elementos nuevamente

        return availability_dict

    except Exception as e:
        print(f"Error checking domain availability: {e}")
        driver.save_screenshot("error_screenshot.png")
        return None


def check_high_traffic_domains_availability(browser, engine, config):
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        metadata = MetaData()
        domains = Table('domains', metadata, autoload_with=engine)

        now = datetime.now()
        two_days_ago = now - timedelta(days=2)

        stmt = select(domains).where(
            domains.c.time >= two_days_ago,
            domains.c.organic_search_traffic >= config['organic_traffic_threshold'],
            domains.c.available.is_(None)
        )
        result = session.execute(stmt)
        domains_to_check = [row.domain for row in result]

        print(f"Found {len(domains_to_check)} records with high organic traffic and unknown availability in the last two days.")

        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36'
        ]

        for i in range(0, len(domains_to_check), 10):
            batch = domains_to_check[i:i+10]
            print(f"Checking availability for batch {i//10 + 1}: {', '.join(batch)}")
            
            proxy = get_proxy()
            print(f"Attempting to use proxy: {proxy['http']}")

            try:
                response = requests.get('https://api.ipify.org', proxies=proxy, timeout=30)
                if response.status_code == 200:
                    print(f"Successfully connected through proxy. Current IP: {response.text}")
                else:
                    print(f"Failed to connect through proxy. Status code: {response.status_code}")
                    continue
            except requests.exceptions.RequestException as e:
                print(f"Error checking proxy: {e}")
                continue

            browser.proxy = proxy['http']
            browser.execute_cdp_cmd('Network.setUserAgentOverride', {"userAgent": random.choice(user_agents)})
            
            browser.delete_all_cookies()
            browser.execute_script("window.localStorage.clear();")
            browser.execute_script("window.sessionStorage.clear();")
            
            url = "https://www.mrdomain.com/en/masiva/"
            try:
                browser.get(url)
                time.sleep(5)
                print(f"Navigating to {url}")

                cookie = {'name': 'userUUID', 'value': '8a2896a9-761d-4b95-a560-02e488eaf36f', 'domain': '.mrdomain.com'}
                browser.add_cookie(cookie)

            except Exception as e:
                print(f"Error navigating to {url}: {e}")
                continue

            textarea = WebDriverWait(browser, 20).until(
                EC.presence_of_element_located((By.ID, "massive_domains"))
            )
            print("Textarea found")

            domains_text = "\n".join(batch)
            textarea.send_keys(domains_text)
            print(f"Domains entered: {domains_text}")

            submit_button = WebDriverWait(browser, 20).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "button.btn-violet[type='submit']"))
            )
            
            browser.execute_script("arguments[0].click();", submit_button)
            print("Search domains button clicked")

            try:
                WebDriverWait(browser, 40).until(
                    EC.presence_of_all_elements_located((By.CLASS_NAME, "searchresults-item"))
                )
                print("Results page loaded")
            except TimeoutException:
                print("Timeout reached while loading results. Capturing screenshot.")
                browser.save_screenshot("timeout_error.png")
                continue

            # Aquí asumimos que hay una función que comprueba la disponibilidad de los dominios y actualiza la base de datos
            availability_results = check_domain_availability(browser, batch)
            
            if availability_results:
                for domain, availability in availability_results.items():
                    update_stmt = domains.update().\
                        where(domains.c.domain == domain).\
                        values(available=availability)
                    session.execute(update_stmt)
                session.commit()
                print(f"Database updated with availability information for batch {i//10 + 1}")
            else:
                print(f"No availability results obtained for batch {i//10 + 1}")

            time.sleep(random.uniform(5, 10))

    except Exception as e:
        print(f"An error occurred during the process: {e}")
    finally:
        try:
            session.close()
        except Exception as e:
            print(f"Failed to close the database session properly: {e}")




def chec_ahrefs(driver, domain):
    headers = {
        'accept': '*/*',
        'accept-language': 'en,bn;q=0.9,en-GB;q=0.8,en-AU;q=0.7,en-US;q=0.6',
        'cache-control': 'no-cache',
        'content-type': 'application/json; charset=utf-8',
        'dnt': '1',
        'origin': 'https://ahrefs.com',
        'pragma': 'no-cache',
        'referer': 'https://ahrefs.com/es/website-authority-checker/?input=google.com',
        'sec-ch-ua': '"Google Chrome";v="123", "Not:A-Brand";v="8", "Chromium";v="123"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    }
    print(f'Checking Ahrefs Domain Rating (DR) for {domain}')

    max_retries = 3  # Maximum number of retries
    for attempt in range(1, max_retries + 1):
        try:
            driver.get(f'https://ahrefs.com/es/website-authority-checker/?input={domain}')
            time.sleep(5)
            s = bs(driver.page_source, 'html.parser')
            iframe = s.find('iframe')['src']
            sitekey = iframe.split('/light/')[0].split('/')[-1]
            solver = turnstileProxyless()
            solver.set_verbose(1)
            solver.set_key(config['captcha_api'])
            solver.set_website_url(f"https://ahrefs.com/es/website-authority-checker/?input={domain}")
            solver.set_website_key(sitekey)
            solver.set_soft_id(0)
            token = solver.solve_and_return_solution()
            if token != 0:
                json_data = {
                    'captcha': token,
                    'url': domain,
                }

                response = requests.post('https://ahrefs.com/v4/stGetFreeWebsiteOverview', headers=headers, json=json_data)
                domain_rating = response.json()[1]['domainRating']
                print("Captcha token: " + token)
            else:
                print("Task finished with error: " + solver.error_code)
                domain_rating = 'Failed to get domain rating'
            print(f'Ahrefs Domain Rating (DR) for {domain}: {domain_rating}')
            return domain_rating
        except Exception as e:
            print(f"Error getting Ahrefs DR for {domain} (Attempt {attempt}/{max_retries}): {e}")
            if attempt == max_retries:
                print(f"Failed to get Ahrefs DR for {domain} after {max_retries} attempts.")
                return 'Failed to get domain rating'
            else:
                print("Retrying in 5 seconds...")
                time.sleep(5)
                
def get_and_save_processed_domains(engine, processed_days):
    cutoff_date = datetime.now() - timedelta(days=processed_days)
    query = text("SELECT domain, da, pa, ss FROM domains WHERE time >= :cutoff_date")
    data = pd.read_sql_query(query, params={"cutoff_date": cutoff_date}, con=engine)

    processed_domains = set(data['domain'])
    domains_to_reprocess = []

    for index, row in data.iterrows():
        domain = row['domain']
        da = row['da']
        pa = row['pa']
        ss = row['ss']

        if pd.isna(da) or pd.isna(pa) or pd.isna(ss):
            domains_to_reprocess.append(domain)
            print(f"El dominio '{domain}' se agregará a la lista de dominios a reprocesar debido a valores nulos en da, pa o ss.")

    print(f"Domains processed in the last {processed_days} days: {', '.join(processed_domains)}")
    print(f"Domains with null da, pa, or ss to be reprocessed: {', '.join(domains_to_reprocess)}")

    with open('processed_domains.json', 'w') as f:
        json.dump(list(processed_domains), f)

    with open('domains_to_reprocess.txt', 'w') as f:
        f.write('\n'.join(domains_to_reprocess))

    return processed_domains, domains_to_reprocess

def check_domain_processed(domain, processed_domains):
    print(f"Verificando si '{domain}' está en processed_domains (ya procesado anteriormente)")
    result = any(domain.lower() == d.lower() for d in processed_domains)
    print(f"Resultado para '{domain}': {result}")
    return result
def write_domain_to_file(file_path, domain_data):
    with open(file_path, 'a') as f:
        f.write(json.dumps(domain_data) + '\n')

def read_domains_from_file(file):
    try:
        with open(file, 'r') as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        return []



def process_failed_domains(file_path, engine):
    failed_domains = read_domains_from_file(file_path)
    if failed_domains:
        df_failed_domains = pd.DataFrame(failed_domains)
        try:
            # Extraer las columnas individuales del DataFrame
            df_failed_domains = df_failed_domains.rename(columns={'authority_score': 'authority', 'organic_search_traffic': 'organic_traffic'})
            df_failed_domains.to_sql('domains', engine, if_exists='append', index=False)
            processed_domains = df_failed_domains['domain'].tolist()
            print(f"Previously failed domains processed and saved to the database: {', '.join(processed_domains)}")
            print(df_failed_domains.to_string(index=False))
            # Borrar el contenido del archivo de dominios fallidos
            open(temp_domains.txt, 'w').close()
        except Exception as e:
            failed_domain_list = df_failed_domains['domain'].tolist()
            print(f"Error saving the following domains to the database: {', '.join(failed_domain_list)}")
            print(f"Error details: {str(e)}")

def load_json(filename):
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            return json.load(f)
    return None

def get_new_prepostseo_token(driver):
    print('Obteniendo un nuevo token de PrePostSEO')
    cookies, token = login_cookies(driver)
    with open('token.json', 'w') as f:
        json.dump({'token': token, 'added_time': datetime.now().isoformat()}, f)
    return cookies, token

def load_token_and_cookies(driver):
    if os.path.exists('cookies.json') and os.path.exists('token.json'):
        cookies = load_json('cookies.json')
        token = load_json('token.json')
        added_time = datetime.strptime(token['added_time'], '%Y-%m-%dT%H:%M:%S.%f')
        token_expiration_time = added_time + timedelta(minutes=30)
        
        if datetime.now() >= token_expiration_time:
            print('El token de PrePostSEO ha caducado, obteniendo un nuevo token...')
            # Iniciar un proceso asíncrono para obtener un nuevo token
            cookies, token = get_new_prepostseo_token(driver)
        else:
            print('El token de PrePostSEO sigue siendo válido')
            print(f"Fecha de caducidad del token de PrePostSEO: {token_expiration_time.strftime('%Y-%m-%d %H:%M:%S')}")
            driver.get('https://www.prepostseo.com/domain-authority-checker')
            cookies = load_json('cookies.json')
            # load cookies to browser
            for key, value in cookies.items():
                driver.add_cookie({'name': key, 'value': value})
            driver.refresh()
            token = token['token']
    else:
        print('No se encontraron el token o las cookies de PrePostSEO, obteniendo nuevos')
        cookies, token = get_new_prepostseo_token(driver)
        driver.get('https://www.prepostseo.com/domain-authority-checker')
    return cookies, token

def get_proxies():
    url = f"https://api.proxyscrape.com/v2/account/datacenter_shared/proxy-list?auth={config['proxy_api']}&type=getproxies&country[]=all&protocol=http&format=normal&status=all"
    payload={}
    headers = {}

    response = requests.request("GET", url, headers=headers, data=payload)
    proxies = response.text.split('\n')
    proxies = [proxy.strip('\r') for proxy in proxies]
    return proxies

def format_time(seconds):
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours}h {minutes}min"

def configure_driver(proxy=None):
    chrome_options = Options()
    #chrome_options.add_argument('--headless') # Ejecutar Chrome sin interfaz gráfica
    chrome_options.add_argument('--disable-gpu')
    chrome_options.add_argument('--no-sandbox')

    if proxy:
        prox = Proxy()
        prox.proxy_type = ProxyType.MANUAL
        prox.http_proxy = proxy
        prox.ssl_proxy = proxy
        prox.add_to_capabilities(DesiredCapabilities.CHROME)
        chrome_options.add_argument(f'--proxy-server={proxy}')

    driver = webdriver.Chrome(ChromeDriverManager().install(), options=chrome_options)
    return driver

def read_domains_from_file(file_path):
    try:
        with open(file_path, 'r') as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        open(file_path, 'w').close()
        return []

def write_domains_to_file(file, domains):
    # Convertir la lista a un conjunto para eliminar duplicados
    unique_domains = set(domains)
    with open(file, 'w') as f:
        for domain in unique_domains:
            f.write(f"{domain}\n")
    
    # Informar sobre los duplicados eliminados
    duplicates_removed = len(domains) - len(unique_domains)
    if duplicates_removed > 0:
        print(f"Se eliminaron {duplicates_removed} dominios duplicados de {file}")  

def remove_processed_domains(domain_list, processed_domains):
    # borrar print(f"Dominios a eliminar: {', '.join(processed_domains)}")
    # borrar print(f"Lista de dominios antes de la eliminación: {', '.join(domain_list)}")
    updated_list = [d for d in domain_list if d not in processed_domains]
    return updated_list

def get_processed_domains_from_db(engine, days=5):
    now = datetime.now()
    five_days_ago = now - timedelta(days=days)
    
    with engine.connect() as connection:
        result = connection.execute(text("""
            SELECT DISTINCT domain
            FROM domains 
            WHERE time >= :five_days_ago
        """), {"five_days_ago": five_days_ago})
        
        return {row[0] for row in result}

def log_failed_domain(domain, attempt, file):
    with open(file, 'r') as f:
        lines = f.readlines()
    with open(file, 'w') as f:
        updated = False
        for line in lines:
            if line.startswith(domain + '\t'):
                f.write(f"{domain}\t{data}\tfallido\n")
                updated = True
            else:
                f.write(line)
        if not updated:
            f.write(f"{domain}\t{{}}\tfallido\n")

def login_noxtools(browser):
    browser.get('https://noxtools.com/secure/login?amember_redirect_url=%2Fsecure%2Fsignup')
    time.sleep(5)

    # Verificar si aparece el captcha de Cloudflare
    if "Cloudflare" in browser.page_source:
        print("Cloudflare detected")
        s = bs(browser.page_source, 'html.parser')
        iframe = s.find('iframe')
        if iframe:
            iframe_src = iframe['src']
            sitekey = iframe_src.split('/light/')[0].split('/')[-1]
            solver = turnstileProxyless()
            solver.set_verbose(1)
            solver.set_key(config['captcha_api'])
            solver.set_website_url("https://noxtools.com/secure/login?amember_redirect_url=%2Fsecure%2Fsignup")
            solver.set_website_key(sitekey)
            solver.set_soft_id(0)
            token = solver.solve_and_return_solution()
            if token != 0:
                # Ejecutar el token en la página
                browser.execute_script(f"document.querySelector('textarea[name=\"cf_captcha_kind\"]').innerHTML = '{token}';")
                browser.execute_script("document.querySelector('form[id=\"challenge-form\"]').submit();")
                time.sleep(5)  # Esperar a que se cargue la página después de enviar el captcha
            else:
                print("Error solving Cloudflare captcha: " + solver.error_code)
                return False
        else:
            print("Cloudflare captcha iframe not found. Trying to log in without solving the captcha.")

    # Esperar hasta que el elemento de inicio de sesión sea visible
    login_element = WebDriverWait(browser, 10).until(
        EC.visibility_of_element_located((By.ID, 'amember-login'))
    )
    login_element.send_keys(config['noxtools']['user'])

    # Esperar hasta que el elemento de contraseña sea visible
    password_element = WebDriverWait(browser, 10).until(
        EC.visibility_of_element_located((By.ID, 'amember-pass'))
    )
    password_element.send_keys(config['noxtools']['pass'])

    # Esperar hasta que el botón de inicio de sesión sea visible y hacer clic en él
    login_button = WebDriverWait(browser, 10).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, 'input[value="Login"]'))
    )
    login_button.click()

    time.sleep(random.uniform(8, 10))

    # Verificar si el inicio de sesión fue exitoso
    if "Dashboard" in browser.page_source:
        print('Logged in to Noxtools!')
        cookies = browser.get_cookies()
        cookies = {cookie['name']: cookie['value'] for cookie in cookies}
        with open('noxtools_cookies.json', 'w') as f:
            json.dump(cookies, f)
        return True
    else:
        print('Failed to log in to Noxtools, disabling noxtools functions')
        return False

def find_noxtools_data(report_page, label, next_element, attrs=None):
    text = report_page.find('span', string=label).find_next(next_element, attrs).text.strip()
    last_char = text[-1]

    number_map = {'K': 1000, 'M': 1000000, 'B': 1000000000}

    if last_char in number_map:
        number = float(text[:-1]) * number_map[last_char]
    else:
        number = float(text)
    return number

def search_noxtools(browser, domain):
    server_list = ['smr1', 'smr2', 'smr3', 'smr4', 'smr5']
    result = {'authority_score': '', 'organic_search_traffic': '', 'backlinks': ''}

    for server in server_list:
        try:
            q = f'https://{server}.noxtools.com/analytics/overview/?searchType=domain&q={domain}'
            browser.get(q)
            
            # Add a random delay between 5 and 10 seconds before continuing
            random_delay = random.uniform(5, 10)
            print(f"Waiting for {random_delay:.2f} seconds before processing {server}...")
            time.sleep(random_delay)
            
            s = bs(browser.page_source, 'lxml')
            report_page = s.select_one('div#reportPageContent section[aria-label="Domain summary"]')
            result['authority_score'] = find_noxtools_data(report_page, 'Authority Score', 'span', {"data-ui-name": "Link.Text"})

            try:
                result['organic_search_traffic'] = find_noxtools_data(report_page, 'Organic search traffic', 'span', {"data-ui-name": "Link.Text"})
            except:
                result['organic_search_traffic'] = ''

            result['backlinks'] = find_noxtools_data(report_page, 'Backlinks', 'span', {"data-ui-name": "Link.Text"})
            print(f"Data from Noxtools-sermrush - {server} for domain {domain}: {result}")

            # Check if all three fields are empty
            if result['authority_score'] == '' and result['organic_search_traffic'] == '' and result['backlinks'] == '':
                continue  # Move to the next server in the list
            else:
                return result
        except Exception as e:
            print(f"Error getting Noxtools data from {server} for {domain}: {e}")
            continue  # Try with the next server in the list

    print(f"Failed to get Noxtools data for {domain} after trying all servers.")
    return False

def all_fields_empty(row):
    return (
        (row.authority_score is None or row.authority_score == '') and
        (row.organic_search_traffic is None or row.organic_search_traffic == '') and
        (row.backlinks is None or row.backlinks == '')
    )

def fill_blank_fields(browser, engine, noxtools_enabled):
    Session = sessionmaker(bind=engine)
    session = Session()


    # Reflect your table
    metadata = MetaData()
    domains = Table('domains', metadata, autoload_with=engine)

    # Get the current date and time
    now = datetime.now()

    # Calculate the date and time two days ago
    two_days_ago = now - timedelta(days=2)

    
    
    #  consulta: Registros con google_results > config['noxtools']['google_results'] y authority_score, organic_search_traffic, backlinks son None
    stmt2 = select(domains).where(
        domains.c.time >= two_days_ago,
        domains.c.google_results > config['noxtools']['google_results'],
        or_(
            (domains.c.authority_score.is_(None)) | (domains.c.authority_score == ''),
            (domains.c.organic_search_traffic.is_(None)) | (domains.c.organic_search_traffic == ''),
            (domains.c.backlinks.is_(None)) | (domains.c.backlinks == '')
        )
    )
    result2 = session.execute(stmt2)
    print(f"Found {result2.rowcount} records with google_results > {config['noxtools']['google_results']} and authority_score, organic_search_traffic, and backlinks are all blank in the last two days.")

    
    for row in result2:
        print(f'Processing for updating authority_score, organic_search_traffic y backlinks for: {row.domain}')
        if all_fields_empty(row):
             data = search_noxtools(browser, row.domain)
        if data:
            update_stmt = domains.update().\
                where(domains.c.time == row.time).\
                where(domains.c.domain == row.domain).\
                values(**data)
            session.execute(update_stmt)
            session.commit()
            print(f"Record successfully updated in the database for domain for authority_score, organic_search_traffic y backlinks fields and domian: {row.domain}")
        else:
            print(f"Noxtools data not found for {row.domain}. Skipping database update.")
    

    session.close()

if __name__ == '__main__':
    try:
        driver = bt.create_driver(headless=False, user_agent=bt.UserAgent.REAL, window_size=bt.WindowSize.REAL)
        driver2 = bt.create_driver(headless=False, user_agent=bt.UserAgent.REAL, window_size=bt.WindowSize.REAL)
        print('Drivers created')

        # Login to Noxtools
        noxtools_login_result = login_noxtools(driver2)
        if noxtools_login_result:
            print('Noxtools logged in')
            fill_blank_fields(driver2, engine, noxtools_enabled)  # Fill blank fields in the database
        else:
            print('Failed to log in to Noxtools, disabling Noxtools functions')
            noxtools_enabled = False

        # Check availability of high traffic domains
        check_high_traffic_domains_availability(driver, engine, config)

        # Now login to PrePostSEO
        cookies, token = load_token_and_cookies(driver)

        proxies = get_proxies()

        last_prepostseo_driver_restart = time.time()
        last_noxtools_driver_restart = time.time()

        while True:
            # Obtener dominios procesados de la base de datos
            db_processed_domains = get_processed_domains_from_db(engine)
            print(f"Dominios en la base de datos de los últimos 5 días: {len(db_processed_domains)}")

            # Cargar dominios de domainslist.txt
            domain_list = read_domains_from_file('domainslist.txt')
            print(f"Dominios en domainslist.txt antes de filtrar: {len(domain_list)}")

            # Eliminar duplicados de domain_list
            unique_domain_list = list(set(domain_list))
            if len(unique_domain_list) < len(domain_list):
                print(f"Se encontraron {len(domain_list) - len(unique_domain_list)} dominios duplicados en domainslist.txt")
                domain_list = unique_domain_list
                write_domains_to_file('domainslist.txt', domain_list)
                print(f"domainslist.txt actualizado con {len(domain_list)} dominios únicos")

            # Filtrar dominios que ya están en la base de datos
            new_domain_list = [d for d in domain_list if d not in db_processed_domains]

            # Actualizar domainslist.txt
            write_domains_to_file('domainslist.txt', new_domain_list)
            print(f"Dominios en domainslist.txt después de filtrar: {len(new_domain_list)}")
            print(f"Dominios eliminados de domainslist.txt: {len(domain_list) - len(new_domain_list)}")

            # Ahora procesamos solo los nuevos dominios
            domains_to_process = new_domain_list

            # Crear batches solo con los dominios que necesitan ser procesados
            batches = [domains_to_process[i:i + 10] for i in range(0, len(domains_to_process), 10)]
            total_batches = len(batches)
            total_domains = len(domains_to_process)
            processed_domains_count = 0
            start_time = time.time()

            print(f"Dominios a procesar en esta iteración: {total_domains}")

            for domain_batch in batches:
                print(f"Dominios en el batch actual: {', '.join(domain_batch)}")

                data = check_da_pa2(cookies, domain_batch, driver)

                # Escribir los datos en prepostseo_data.txt
                with open('prepostseo_data.txt', 'a') as f:
                    for d in data:
                        f.write(f"{d['domain']}\t{json.dumps(d)}\tpendiente de procesar\n")

                domains_to_check_availability = []

                for d in data:
                    processed_domains_count += 1
                    elapsed_time = time.time() - start_time

                    # Calcular el tiempo estimado restante
                    domains_remaining = total_domains - processed_domains_count
                    if processed_domains_count == 1:
                        estimated_remaining_time = 0
                    else:
                        avg_time_per_domain = elapsed_time / (processed_domains_count - 1)
                        estimated_remaining_time = avg_time_per_domain * domains_remaining

                    # Mostrar el progreso y el tiempo estimado restante
                    progress_percentage = (processed_domains_count / total_domains) * 100
                    print(f"Domain {processed_domains_count} of {total_domains} in total- Progress: {progress_percentage:.2f}% - Estimated Time Remaining: {format_time(estimated_remaining_time)}")

                    google_results = check_google(d['domain'])
                    d['google_results'] = google_results

                    if google_results > config['noxtools']['google_results'] and noxtools_enabled:
                        print('Getting Noxtools data')
                        noxtools_data = search_noxtools(driver2, d['domain'])
                        if noxtools_data:
                            d.update(noxtools_data)
                            
                            # Verificar si el tráfico orgánico supera el umbral
                            if float(d['organic_search_traffic']) >= config['organic_traffic_threshold']:
                                domains_to_check_availability.append(d['domain'])
                        else:
                            print("Noxtools data not found. Skipping Noxtools data for this domain.")
                            d.update({'authority_score': '', 'organic_search_traffic': '', 'backlinks': ''})
                    else:
                        d.update({'authority_score': '', 'organic_search_traffic': '', 'backlinks': ''})

                    if d['da'] >= da_check or d['pa'] >= pa_check:
                        d['DR'] = chec_ahrefs(driver, d['domain'])
                    else:
                        d['DR'] = ''

                # Verificar disponibilidad de dominios que superaron el umbral
                if domains_to_check_availability:
                    print(f"Checking availability for domains: {', '.join(domains_to_check_availability)}")
                    availability_results = check_domain_availability(driver, domains_to_check_availability)
                    
                    if availability_results:
                        for d in data:
                            if d['domain'] in availability_results:
                                d['available'] = availability_results[d['domain']]
                                print(f"Domain {d['domain']} availability: {d['available']}")
                    else:
                        print("No se obtuvieron resultados de disponibilidad")

                # Insertar los datos en la base de datos después de procesar cada batch
                df = pd.DataFrame(data)
                print("Intentando guardar los siguientes datos en la base de datos:")
                print(df.to_string(index=False))
                
                try:
                    df.to_sql('domains', engine, if_exists='append', index=False)
                    print("Datos guardados exitosamente en la base de datos")
                    for index, row in df.iterrows():
                        availability_info = f", Disponible: {row['available']}" if 'available' in row else ""
                        print(f"Dominio: {row['domain']}{availability_info}")
                except Exception as e:
                    print(f"Error al guardar en la base de datos: {e}")

                # Actualizar el estado de los dominios procesados en prepostseo_data.txt
                for d in data:
                    print(f"Dominio {d['domain']} procesado de prepostseo_data.txt y listo para actualizar su estado.")
                    update_status_in_file('prepostseo_data.txt', d['domain'], 'tramitado')

            # Al final de la iteración
            print(f"Dominios procesados en esta iteración: {processed_domains_count}")
            print(f"Dominios restantes en domainslist.txt: {len(read_domains_from_file('domainslist.txt'))}")

            elapsed_time = time.time() - start_time
            if total_batches > 0:
                estimated_batch_time = (elapsed_time / total_batches) * (total_batches - len(batches))
            else:
                estimated_batch_time = 0
            print(f"Completed All Batches - Total Elapsed Time: {format_time(elapsed_time)}")
            print(f"Estimated Time Remaining for All Batches: {format_time(estimated_batch_time)}")

            if not noxtools_enabled:
                print("Noxtools is disabled. Checking if it's back up...")
                test_domain = "example.com"  # Reemplaza con un dominio de prueba
                if search_noxtools(driver2, test_domain):
                    noxtools_enabled = True
                    print("Noxtools is back up. Enabling Noxtools data retrieval.")

            # Reiniciar el driver de PrePostSEO cada 30 minutos (por ejemplo)
            if time.time() - last_prepostseo_driver_restart > 1800:
                print("Reiniciando el driver de PrepostSEO cada 30 minutos")
                driver = restart_driver(driver)
                cookies, token = load_token_and_cookies(driver)
                last_prepostseo_driver_restart = time.time()

            # Reiniciar el driver de Noxtools cada 30 minutos (por ejemplo)
            if time.time() - last_noxtools_driver_restart > 1800:
                print("Reiniciando el driver de noxtools cada 30 minutos")
                driver2 = restart_driver(driver2)
                noxtools_login_result = login_noxtools(driver2)
                last_noxtools_driver_restart = time.time()

            print(f"Esperando 60 segundos antes de la siguiente iteración")
            time.sleep(60)  # Esperar 60 segundos antes de la siguiente iteración

    except selenium.common.exceptions.WebDriverException as e:
        if "disconnected: not connected to DevTools" in str(e):
            print(f"Se produjo el error 'disconnected: not connected to DevTools': {e}")
            print("Reiniciando el script...")
            restart_script()
        else:
            raise e
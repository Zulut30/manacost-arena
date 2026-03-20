import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
});

const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
await page.setViewport({ width: 1400, height: 900 });

// Intercept network requests to find API calls
const apiCalls: string[] = [];
page.on('request', req => {
  const url = req.url();
  if (url.includes('api') || url.includes('json') || url.includes('legion') || url.includes('legendary') || url.includes('arena')) {
    apiCalls.push(`[${req.method()}] ${url}`);
  }
});

const apiResponses: Array<{ url: string; status: number; body: string }> = [];
page.on('response', async res => {
  const url = res.url();
  if ((url.includes('api') || url.includes('json')) && res.headers()['content-type']?.includes('json')) {
    try {
      const body = await res.text();
      apiResponses.push({ url, status: res.status(), body: body.slice(0, 500) });
    } catch {}
  }
});

console.log('Navigating to hsreplay legendaries...');
await page.goto('https://hsreplay.net/arena/legendaries/', {
  waitUntil: 'networkidle2',
  timeout: 60000,
});
await new Promise(r => setTimeout(r, 6000));

console.log('\n=== API calls intercepted:');
apiCalls.forEach(u => console.log(' ', u));
console.log('\n=== JSON API responses:');
apiResponses.forEach(r => console.log(`  [${r.status}] ${r.url}\n  ${r.body}\n`));

const result = await page.evaluate(() => {
  const h1s   = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map(h => h.textContent?.trim()).filter(Boolean);
  const tables = document.querySelectorAll('table').length;

  // Look for group/section containers
  const sections = Array.from(document.querySelectorAll('section, article, .group, .legendary-group, [class*="group"], [class*="Group"]'))
    .slice(0,8)
    .map(el => ({ cls: el.className.slice(0,80), text: el.textContent?.trim().slice(0,120) }));

  // Get list items content
  const listItems = Array.from(document.querySelectorAll('li')).slice(0, 20)
    .map(li => li.textContent?.trim().slice(0, 60)).filter(Boolean);

  // Full body text
  const bodyText = document.body.innerText?.slice(0, 5000);

  // Inline JSON in page source
  const inlineData: string[] = [];
  document.querySelectorAll('script:not([src])').forEach(s => {
    const t = s.textContent || '';
    if (t.includes('legendary') || t.includes('group') || t.includes('arena') || t.length > 100) {
      inlineData.push(t.slice(0, 300));
    }
  });

  // Get the actual DOM structure around main content
  const main = document.querySelector('main, #root, #app, .container, [role="main"]');
  const mainHTML = main?.innerHTML?.slice(0, 3000) || document.body.innerHTML.slice(0, 3000);

  return { h1s, tables, sections, listItems, bodyText, inlineData: inlineData.slice(0,5), mainHTML };
});

console.log('\n=== Headings:', result.h1s);
console.log('=== Tables:', result.tables);
console.log('\n=== Section-like elements:', result.sections);
console.log('\n=== List items:', result.listItems);
console.log('\n=== Body text:\n', result.bodyText);
console.log('\n=== Inline script data:', result.inlineData);
console.log('\n=== Main HTML:\n', result.mainHTML);

await browser.close();

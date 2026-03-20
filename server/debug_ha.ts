import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
await page.goto('https://www.heartharena.com/ru/tierlist', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  // Get all H3 headings (rarity groups)
  const h3Texts = Array.from(document.querySelectorAll('h3')).map(h => h.textContent?.trim());

  // Find legendary H3
  const legendaryH3 = Array.from(document.querySelectorAll('h3'))
    .find(h => h.textContent?.toLowerCase().includes('легенд'));

  // Get parent of legendary H3 and sample its cards
  let legendaryHtml = '';
  let legendaryCards: string[] = [];
  if (legendaryH3) {
    const parent = legendaryH3.parentElement;
    legendaryHtml = parent?.outerHTML?.slice(0, 1500) || '';
    // Try different card selectors in the legendary section
    const cardEls = parent?.querySelectorAll('.card, [class*="card"], li, .item');
    cardEls?.forEach(el => {
      const text = el.textContent?.trim().slice(0, 60);
      if (text) legendaryCards.push(text);
    });
  }

  // Get ALL card names to see what we're getting
  const allNames: string[] = [];
  document.querySelectorAll('.card').forEach(el => {
    const scoreEl = el.querySelector('.score');
    // Get name without score
    const name = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent?.trim())
      .filter(Boolean)
      .join('');
    const altName = el.querySelector('a, .name, span:not(.score)')?.textContent?.trim();
    allNames.push((altName || name || el.textContent?.replace(scoreEl?.textContent||'','').trim() || '').slice(0,50));
  });

  // Get structure of a few legendary cards
  const legendarySection = Array.from(document.querySelectorAll('section, .class-section, .rarity-section'))
    .find(s => s.querySelector('h3')?.textContent?.toLowerCase().includes('легенд'));

  // Count cards per rarity
  const rarityCount: Record<string, number> = {};
  document.querySelectorAll('h3').forEach(h3 => {
    const rarity = h3.textContent?.trim() || '';
    let next = h3.nextElementSibling;
    let count = 0;
    while (next && next.tagName !== 'H3') {
      count += next.querySelectorAll ? next.querySelectorAll('.card').length : 0;
      next = next.nextElementSibling;
    }
    if (count > 0) rarityCount[rarity] = count;
  });

  return {
    h3Texts: h3Texts.slice(0, 40),
    legendaryH3Exists: !!legendaryH3,
    legendaryHtml: legendaryHtml,
    legendaryCards: legendaryCards.slice(0, 20),
    allNamesCount: allNames.length,
    sampleNames: allNames.slice(0, 20),
    rarityCount,
  };
});

console.log('=== H3 headings:', result.h3Texts);
console.log('=== Legendary H3 found:', result.legendaryH3Exists);
console.log('=== Legendary HTML:\n', result.legendaryHtml);
console.log('=== Legendary cards:', result.legendaryCards);
console.log('=== Total .card elements:', result.allNamesCount);
console.log('=== Sample card names:', result.sampleNames);
console.log('=== Rarity counts:', result.rarityCount);

await browser.close();

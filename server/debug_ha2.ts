// temp debug - verify new approach
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
await page.goto('https://www.heartharena.com/ru/tierlist', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  const RARITY_CLASSES = new Set(['commons', 'rares', 'epics', 'legendaries']);
  const CLASS_NAMES = new Set(['any','death-knight','demon-hunter','druid','hunter','mage','paladin','priest','rogue','shaman','warlock','warrior']);
  const TIER_CLASSES = new Set(['great','good','above-average','aboveaverage','average','below-average','belowaverage','terrible','neverpick','never-pick']);

  const sample: any[] = [];
  const stats = { total: 0, withImage: 0, withId: 0, legendary: 0 };

  document.querySelectorAll('dl.card').forEach(cardEl => {
    const dt = cardEl.querySelector('dt');
    const dd = cardEl.querySelector('dd.score');
    if (!dt) return;
    stats.total++;

    const imageUrl = dt.getAttribute('data-card-image') || '';
    const cardId = imageUrl ? (imageUrl.split('/').pop()?.replace(/\.\w+$/, '') || null) : null;
    if (imageUrl) stats.withImage++;
    if (cardId) stats.withId++;

    const dtClasses = Array.from(dt.classList);
    const rarityKey = dtClasses.find(c => RARITY_CLASSES.has(c)) || 'commons';
    const classKey = dtClasses.find(c => CLASS_NAMES.has(c)) || 'any';
    if (rarityKey === 'legendaries') stats.legendary++;

    // Get tier class by walking up
    let tierClass = '';
    let el: Element | null = cardEl;
    while (el) {
      if (el.tagName === 'LI') {
        const tc = Array.from(el.classList).find(c => TIER_CLASSES.has(c));
        if (tc) { tierClass = tc; break; }
      }
      el = el.parentElement;
    }

    const newSpan = dt.querySelector('.new');
    const name = (dt.textContent || '').replace(newSpan?.textContent || '', '').trim();
    const score = parseInt((dd?.textContent || '').trim(), 10) || 0;

    if (sample.length < 5 || (rarityKey === 'legendaries' && sample.length < 15)) {
      sample.push({ name, score, cardId, imageUrl: imageUrl.slice(-40), classKey, rarityKey, tierClass });
    }
  });

  return { stats, sample };
});

console.log('Stats:', result.stats);
console.log('Sample cards:', result.sample);

await browser.close();

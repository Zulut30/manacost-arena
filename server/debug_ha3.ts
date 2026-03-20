import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
await page.goto('https://www.heartharena.com/ru/tierlist', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  const RARITY_CLASSES = new Set(['commons', 'rares', 'epics', 'legendaries']);
  const CLASS_NAMES    = new Set(['any','death-knight','demon-hunter','druid','hunter','mage','paladin','priest','rogue','shaman','warlock','warrior']);
  const TIER_CLASSES   = new Set(['great','good','above-average','aboveaverage','average','below-average','belowaverage','terrible','neverpick','never-pick']);

  // Get ALL tabs (class sections)
  const tabs = Array.from(document.querySelectorAll('section.tab.tierlist')).map(sec => ({
    id: sec.id,
    cards: sec.querySelectorAll('dl.card').length,
  }));

  // Get the tier headers text for one section
  const deathKnightSection = document.getElementById('death-knight');
  const tierHeaders: string[] = [];
  deathKnightSection?.querySelectorAll('li.tier header').forEach(h => {
    tierHeaders.push(h.textContent?.trim() || '');
  });

  // Map tier CSS class → header text for all sections
  const tierClassToText: Record<string, string> = {};
  document.querySelectorAll('li.tier').forEach(li => {
    const tierCls = Array.from(li.classList).find(c => TIER_CLASSES.has(c)) || '';
    const hdr = li.querySelector('header')?.textContent?.trim() || '';
    if (tierCls && hdr) tierClassToText[tierCls] = hdr;
  });

  // Count cards per tier class per rarity (to understand the full structure)
  const stats: Record<string, Record<string, number>> = {};
  document.querySelectorAll('dl.card').forEach(cardEl => {
    const dt = cardEl.querySelector('dt');
    if (!dt) return;
    const dtClasses = Array.from(dt.classList);
    const rarityKey = dtClasses.find(c => RARITY_CLASSES.has(c)) || 'commons';

    let tierClass = '';
    let el: Element | null = cardEl;
    while (el && el.tagName !== 'BODY') {
      if (el.tagName === 'LI') {
        const tc = Array.from(el.classList).find(c => TIER_CLASSES.has(c));
        if (tc) { tierClass = tc; break; }
      }
      el = el.parentElement;
    }

    if (!stats[tierClass]) stats[tierClass] = {};
    stats[tierClass][rarityKey] = (stats[tierClass][rarityKey] || 0) + 1;
  });

  // Get section (class) tabs list
  const tabNav = Array.from(document.querySelectorAll('ul.class-tabs li, nav li, .nav-tabs li, [role="tab"]')).map(li => li.textContent?.trim()).filter(Boolean);

  return { tabs, tierHeaders, tierClassToText, stats, tabNav };
});

console.log('=== Class tabs (sections):', result.tabs);
console.log('=== Tier header texts:', result.tierHeaders);
console.log('=== Tier CSS class → display text:', result.tierClassToText);
console.log('=== Cards per tier/rarity (raw):', result.stats);
console.log('=== Tab nav items:', result.tabNav);

await browser.close();

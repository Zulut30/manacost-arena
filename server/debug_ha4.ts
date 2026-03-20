import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu'] });
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
await page.goto('https://www.heartharena.com/ru/tierlist', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise(r => setTimeout(r, 5000));

const result = await page.evaluate(() => {
  // Find ALL li elements that contain ol.cards
  const tierLis = new Set<string>();
  document.querySelectorAll('li').forEach(li => {
    if (li.querySelector(':scope > ol.cards, :scope > header + ol.cards')) {
      tierLis.add(Array.from(li.classList).join('.'));
    }
  });

  // Also check direct parents of ol.cards
  const olCardsParents = new Set<string>();
  document.querySelectorAll('ol.cards').forEach(ol => {
    const p = ol.parentElement;
    if (p) olCardsParents.add(`${p.tagName}.${Array.from(p.classList).join('.')}`);
  });

  // Check what's inside li.tier - specific CSS classes
  const tierLiClasses: Record<string, number> = {};
  document.querySelectorAll('li[class*="tier"], li.tier').forEach(li => {
    const cls = Array.from(li.classList).join('.');
    tierLiClasses[cls] = (tierLiClasses[cls] || 0) + 1;
  });

  // Get FULL set of tier CSS classes
  const TIER_NAMES = new Set(['great','good','above-average','aboveaverage','average','below-average','belowaverage','terrible','neverpick','never-pick','bad','plohaya','плохо']);
  const allTierClasses = new Set<string>();
  document.querySelectorAll('li').forEach(li => {
    const cls = Array.from(li.classList);
    if (cls.includes('tier')) {
      cls.filter(c => c !== 'tier').forEach(c => allTierClasses.add(c));
    }
  });

  // Find cards with no tier by checking their parent chain
  let noTierSample: string[] = [];
  document.querySelectorAll('dl.card').forEach(cardEl => {
    let found = false;
    let el: Element | null = cardEl;
    while (el && el.tagName !== 'BODY') {
      if (el.tagName === 'LI' && el.classList.contains('tier')) {
        found = true; break;
      }
      el = el.parentElement;
    }
    if (!found && noTierSample.length < 5) {
      const dt = cardEl.querySelector('dt');
      const name = dt?.textContent?.trim().slice(0, 30) || '';
      // Walk up and collect class hierarchy
      const hierarchy: string[] = [];
      let el2: Element | null = cardEl;
      while (el2 && el2.tagName !== 'BODY') {
        hierarchy.push(`${el2.tagName}[${Array.from(el2.classList).join('.')}]`);
        el2 = el2.parentElement;
      }
      noTierSample.push(`CARD: ${name} | PARENTS: ${hierarchy.slice(0,8).join(' → ')}`);
    }
  });

  return { tierLis: [...tierLis], olCardsParents: [...olCardsParents], tierLiClasses, allTierClasses: [...allTierClasses], noTierSample };
});

console.log('li elements containing ol.cards:', result.tierLis);
console.log('\nol.cards parents:', result.olCardsParents);
console.log('\nli.tier CSS classes:', result.tierLiClasses);
console.log('\nALL tier CSS subclasses:', result.allTierClasses);
console.log('\nNo-tier cards sample:');
result.noTierSample.forEach(s => console.log(' ', s));

await browser.close();

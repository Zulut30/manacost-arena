import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// English class name → display info
const CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
  'death knight':  { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  'deathknight':   { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  'paladin':       { id: 'paladin', name: 'Паладин',            color: '#a88a45' },
  'shaman':        { id: 'shaman',  name: 'Шаман',              color: '#2a2e6b' },
  'hunter':        { id: 'hunter',  name: 'Охотник',            color: '#1d5921' },
  'mage':          { id: 'mage',    name: 'Маг',                color: '#2b5c85' },
  'rogue':         { id: 'rogue',   name: 'Разбойник',          color: '#333333' },
  'warlock':       { id: 'warlock', name: 'Чернокнижник',       color: '#5c265c' },
  'druid':         { id: 'druid',   name: 'Друид',              color: '#704a16' },
  'warrior':       { id: 'warrior', name: 'Воин',               color: '#7a1e1e' },
  'priest':        { id: 'priest',  name: 'Жрец',               color: '#d1d1d1', textDark: true },
  'demon hunter':  { id: 'dh',     name: 'Охотник на демонов', color: '#224722' },
  'demonhunter':   { id: 'dh',     name: 'Охотник на демонов', color: '#224722' },
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  S: 'Авто-пик. Невероятно сильные карты, меняющие ход игры.',
  A: 'Отличные карты, всегда полезны и эффективны.',
  B: 'Хорошие карты для заполнения кривой маны.',
  C: 'Средние карты, берите при нехватке выбора.',
  D: 'Слабые карты, избегайте при наличии альтернатив.',
  F: 'Не берите эти карты.',
};

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

// ─── Firestone scraper ────────────────────────────────────────────────────────
export async function scrapeFirestoneWinrates(): Promise<boolean> {
  console.log('[Scraper] Firestone: starting...');
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    // Capture all JSON responses
    const captured: Array<{ url: string; data: any }> = [];
    page.on('response', async (res) => {
      const ct = res.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      const url = res.url();
      try {
        const text = await res.text();
        const data = JSON.parse(text);
        captured.push({ url, data });
      } catch { /* skip */ }
    });

    await page.goto(
      'https://www.firestoneapp.com/arena/classes?arenaActiveMode=arena',
      { waitUntil: 'networkidle2', timeout: 45000 }
    );
    await new Promise(r => setTimeout(r, 4000));

    // Try to extract from captured API responses
    let classes: any[] | null = null;
    for (const { url, data } of captured) {
      classes = tryExtractClassesFromFirestoneData(url, data);
      if (classes) {
        console.log(`[Scraper] Firestone: got ${classes.length} classes from API (${url})`);
        break;
      }
    }

    // Fall back to DOM parsing
    if (!classes) {
      classes = await extractClassesFromDOM(page);
    }

    if (classes && classes.length >= 3) {
      saveData('winrates.json', {
        classes: classes.sort((a, b) => b.winrate - a.winrate),
        updatedAt: new Date().toISOString(),
        source: 'firestoneapp.com',
      });
      console.log('[Scraper] Firestone: saved', classes.length, 'classes');
      return true;
    }

    console.log('[Scraper] Firestone: could not extract data, keeping cache');
    return false;
  } catch (err) {
    console.error('[Scraper] Firestone error:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    await browser.close();
  }
}

function tryExtractClassesFromFirestoneData(url: string, data: any): any[] | null {
  const candidates: any[] = Array.isArray(data) ? data : [];
  if (!Array.isArray(data) && data) {
    const vals = Object.values(data);
    for (const v of vals) {
      if (Array.isArray(v)) candidates.push(...v);
    }
  }

  // Look for objects that have a class name + winrate-like field
  const result: any[] = [];
  for (const item of candidates) {
    if (typeof item !== 'object' || !item) continue;
    const wr = item.winRate ?? item.winrate ?? item.winRatePercent ?? item.win_rate;
    const cls = (item.playerClass ?? item.class ?? item.className ?? item.name ?? '').toString().toLowerCase().trim();
    if (wr !== undefined && cls && CLASS_INFO[cls]) {
      const info = CLASS_INFO[cls];
      result.push({ ...info, winrate: parseFloat(wr.toString()), games: item.totalGames ?? item.games ?? 0 });
    }
  }
  return result.length >= 3 ? result : null;
}

async function extractClassesFromDOM(page: any): Promise<any[] | null> {
  try {
    const rows = await page.evaluate(() => {
      const result: Array<{ text: string }> = [];
      // Collect all leaf text nodes alongside their parent chain text
      document.querySelectorAll('*').forEach((el: Element) => {
        if (el.children.length > 0) return;
        const t = (el as HTMLElement).innerText?.trim();
        if (t && t.length < 100) result.push({ text: t });
      });
      return result;
    });

    // Look for percentage values and try to match them to classes
    const percentages: number[] = rows
      .map((r: any) => {
        const m = r.text.match(/^(\d{2,3}\.?\d*)%?$/);
        return m ? parseFloat(m[1]) : null;
      })
      .filter((v: number | null): v is number => v !== null && v > 30 && v < 80);

    if (percentages.length < 3) return null;

    // We got some percentages but can't reliably map to classes
    // Return null to keep the cache
    return null;
  } catch {
    return null;
  }
}

// ─── HearthArena scraper ──────────────────────────────────────────────────────
export async function scrapeHearthArenaTierlist(): Promise<boolean> {
  console.log('[Scraper] HearthArena: starting...');
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto('https://www.heartharena.com/ru/tierlist', {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });
    await new Promise(r => setTimeout(r, 3000));

    const rawTiers = await page.evaluate(() => {
      const tiers: Record<string, { name: string; score: number; class: string; cost: number; rarity: string; type: string; attack?: number; health?: number }[]> = {};

      // Strategy 1: look for tier sections with letter labels (S/A/B/C/D/F)
      const tierLabels = ['S', 'A', 'B', 'C', 'D', 'F'];

      // Try selector: .arena-tier or similar
      const tierSections = document.querySelectorAll('[class*="tier"], [data-tier]');
      tierSections.forEach(section => {
        const labelEl = section.querySelector('h2, h3, [class*="label"], [class*="title"], [class*="name"]');
        const label = labelEl?.textContent?.trim().toUpperCase();
        if (!label || !tierLabels.includes(label)) return;

        const cards: typeof tiers[string] = [];
        section.querySelectorAll('[class*="card"]').forEach(cardEl => {
          const name = cardEl.querySelector('[class*="name"], [class*="title"]')?.textContent?.trim();
          const scoreEl = cardEl.querySelector('[class*="score"], [class*="value"], [class*="rating"]');
          const score = scoreEl ? parseFloat(scoreEl.textContent?.replace(/[^0-9.]/g, '') || '0') : 0;
          const costEl = cardEl.querySelector('[class*="cost"], [class*="mana"]');
          const cost = costEl ? parseInt(costEl.textContent?.trim() || '0') : 0;
          if (name) cards.push({ name, score, class: 'neutral', cost, rarity: 'common', type: 'minion' });
        });

        if (cards.length > 0) tiers[label] = (tiers[label] || []).concat(cards);
      });

      // Strategy 2: look for li/tr items near tier headers
      if (Object.keys(tiers).length === 0) {
        const headings = document.querySelectorAll('h1, h2, h3, h4, [class*="tier-header"], [class*="tierHeader"]');
        headings.forEach(h => {
          const label = h.textContent?.trim().toUpperCase();
          if (!label || !tierLabels.includes(label)) return;
          const container = h.closest('section, article, div') || h.parentElement;
          if (!container) return;
          const cards: typeof tiers[string] = [];
          container.querySelectorAll('[class*="card"], li, tr').forEach(item => {
            const name = (item as HTMLElement).innerText?.split('\n')[0]?.trim();
            if (name && name.length > 1 && name.length < 80) {
              cards.push({ name, score: 0, class: 'neutral', cost: 0, rarity: 'common', type: 'minion' });
            }
          });
          if (cards.length > 0) tiers[label] = cards;
        });
      }

      // Strategy 3: generic - find all text that looks like card names under tier labels
      if (Object.keys(tiers).length === 0) {
        const allText = Array.from(document.querySelectorAll('*')).map(el => ({
          tag: el.tagName,
          text: (el as HTMLElement).innerText?.trim() || '',
          classes: el.className,
        }));
        return { tiers, debug: allText.slice(0, 50) };
      }

      return { tiers, debug: [] };
    });

    const { tiers } = rawTiers as any;
    const tierKeys = Object.keys(tiers || {});

    if (tierKeys.length > 0) {
      const result = tierKeys.map(t => ({
        tier: t,
        description: TIER_DESCRIPTIONS[t] || '',
        cards: (tiers[t] as any[]).map(card => ({
          name: card.name,
          cost: card.cost || 0,
          attack: card.attack,
          health: card.health,
          rarity: card.rarity || 'common',
          type: card.type || 'minion',
          class: card.class || 'neutral',
          score: card.score,
        })),
      }));

      saveData('tierlist.json', {
        tiers: result,
        updatedAt: new Date().toISOString(),
        source: 'heartharena.com',
      });
      console.log(`[Scraper] HearthArena: saved ${tierKeys.length} tiers`);
      return true;
    }

    // Try alternate selectors - page structure may differ
    const altResult = await page.evaluate(() => {
      // Look for all anchor/div/span elements with card-related content
      // HearthArena sometimes uses specific class patterns
      const items: any[] = [];

      // Try .card-list or .arena-card patterns
      const cards = document.querySelectorAll('.arena-card, .card-item, [class*="arenaCard"], [class*="card-row"]');
      cards.forEach(card => {
        const name = card.querySelector('[class*="name"]')?.textContent?.trim()
          || (card as HTMLElement).innerText?.split('\n')[0]?.trim();
        const tier = card.closest('[data-tier]')?.getAttribute('data-tier')
          || card.getAttribute('data-tier');
        const score = card.querySelector('[class*="score"]')?.textContent?.trim();
        if (name) items.push({ name, tier: tier || 'B', score: score ? parseFloat(score) : 0 });
      });
      return items;
    });

    if (altResult.length > 0) {
      const grouped: Record<string, any[]> = {};
      for (const item of altResult) {
        const t = (item.tier || 'B').toUpperCase();
        if (!grouped[t]) grouped[t] = [];
        grouped[t].push({
          name: item.name, cost: 0, rarity: 'common', type: 'minion', class: 'neutral', score: item.score,
        });
      }

      const result = Object.entries(grouped).map(([tier, cards]) => ({
        tier, description: TIER_DESCRIPTIONS[tier] || '', cards,
      }));

      saveData('tierlist.json', {
        tiers: result,
        updatedAt: new Date().toISOString(),
        source: 'heartharena.com',
      });
      console.log(`[Scraper] HearthArena: saved ${result.length} tiers (alt method)`);
      return true;
    }

    console.log('[Scraper] HearthArena: could not extract data, keeping cache');
    return false;
  } catch (err) {
    console.error('[Scraper] HearthArena error:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function saveData(filename: string, data: object) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}

export function loadData(filename: string): any {
  const p = join(DATA_DIR, filename);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf-8'));
}

export async function scrapeAll(): Promise<{ winrates: boolean; tierlist: boolean }> {
  console.log('[Scraper] Starting full scrape...');
  const [winrates, tierlist] = await Promise.allSettled([
    scrapeFirestoneWinrates(),
    scrapeHearthArenaTierlist(),
  ]);
  return {
    winrates: winrates.status === 'fulfilled' && winrates.value,
    tierlist: tierlist.status === 'fulfilled' && tierlist.value,
  };
}

// Run directly: npx tsx server/scraper.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAll().then(res => {
    console.log('[Scraper] Done:', res);
    process.exit(0);
  });
}

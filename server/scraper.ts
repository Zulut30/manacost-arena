import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Mappings ─────────────────────────────────────────────────────────────────

const CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
  deathknight:   { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  'death knight':{ id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  'рыцарь смерти':{ id: 'dk',     name: 'Рыцарь смерти',     color: '#1f252d' },
  paladin:       { id: 'paladin', name: 'Паладин',            color: '#a88a45' },
  паладин:       { id: 'paladin', name: 'Паладин',            color: '#a88a45' },
  shaman:        { id: 'shaman',  name: 'Шаман',              color: '#2a2e6b' },
  шаман:         { id: 'shaman',  name: 'Шаман',              color: '#2a2e6b' },
  hunter:        { id: 'hunter',  name: 'Охотник',            color: '#1d5921' },
  охотник:       { id: 'hunter',  name: 'Охотник',            color: '#1d5921' },
  mage:          { id: 'mage',    name: 'Маг',                color: '#2b5c85' },
  маг:           { id: 'mage',    name: 'Маг',                color: '#2b5c85' },
  rogue:         { id: 'rogue',   name: 'Разбойник',          color: '#333333' },
  разбойник:     { id: 'rogue',   name: 'Разбойник',          color: '#333333' },
  warlock:       { id: 'warlock', name: 'Чернокнижник',       color: '#5c265c' },
  чернокнижник:  { id: 'warlock', name: 'Чернокнижник',       color: '#5c265c' },
  druid:         { id: 'druid',   name: 'Друид',              color: '#704a16' },
  друид:         { id: 'druid',   name: 'Друид',              color: '#704a16' },
  warrior:       { id: 'warrior', name: 'Воин',               color: '#7a1e1e' },
  воин:          { id: 'warrior', name: 'Воин',               color: '#7a1e1e' },
  priest:        { id: 'priest',  name: 'Жрец',               color: '#d1d1d1', textDark: true },
  жрец:          { id: 'priest',  name: 'Жрец',               color: '#d1d1d1', textDark: true },
  demonhunter:   { id: 'dh',     name: 'Охотник на демонов', color: '#224722' },
  'demon hunter':{ id: 'dh',     name: 'Охотник на демонов', color: '#224722' },
  'охотник на демонов': { id: 'dh', name: 'Охотник на демонов', color: '#224722' },
};

// HearthArena CSS tier class → display tier
const HA_TIER_MAP: Record<string, string> = {
  great:         'S',
  good:          'A',
  'above-average': 'B',
  aboveaverage:  'B',
  average:       'C',
  'below-average': 'D',
  belowaverage:  'D',
  terrible:      'F',
  neverpick:     'F',
  'never-pick':  'F',
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  S: 'Авто-пик. Доминирующие карты текущего мета.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Слабые карты, берите только в крайнем случае.',
  F: 'Не стоит брать — очень слабые карты.',
};

// HearthArena Russian rarity names
const RARITY_MAP: Record<string, string> = {
  'обычные': 'common', 'обычная': 'common', 'common': 'common',
  'редкие': 'rare', 'редкая': 'rare', 'rare': 'rare',
  'эпические': 'epic', 'эпическая': 'epic', 'epic': 'epic',
  'легендарные': 'legendary', 'легендарная': 'legendary', 'legendary': 'legendary',
};

// ─── Firestone Winrates (direct public API) ───────────────────────────────────

export async function scrapeFirestoneWinrates(): Promise<boolean> {
  console.log('[Scraper] Firestone: fetching public API...');
  try {
    const url = 'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json() as any;
    const stats: any[] = data.stats || [];

    const classes = stats
      .map(s => {
        const key = (s.playerClass || '').toLowerCase().replace(/\s+/g, '');
        const info = CLASS_INFO[key] || CLASS_INFO[s.playerClass?.toLowerCase() || ''];
        if (!info || !s.totalGames) return null;
        const winrate = Math.round((s.totalsWins / s.totalGames) * 1000) / 10;
        return { ...info, winrate, games: s.totalGames };
      })
      .filter(Boolean) as any[];

    if (classes.length < 3) throw new Error('Too few classes: ' + classes.length);

    saveData('winrates.json', {
      classes: classes.sort((a: any, b: any) => b.winrate - a.winrate),
      updatedAt: data.lastUpdated || new Date().toISOString(),
      source: 'firestoneapp.com',
    });
    console.log(`[Scraper] Firestone: saved ${classes.length} classes`);
    return true;
  } catch (err) {
    console.error('[Scraper] Firestone error:', err instanceof Error ? err.message : err);
    return false;
  }
}

// ─── HearthArena Tier List (Puppeteer) ───────────────────────────────────────

export async function scrapeHearthArenaTierlist(): Promise<boolean> {
  console.log('[Scraper] HearthArena: launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

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

    // Extract all card data using the known DOM structure:
    // h2 = class section, h3 = rarity section, .tier.{quality} = tier group, .card = card, .score = score
    const raw = await page.evaluate(() => {
      const result: Array<{
        name: string;
        score: number;
        tierClass: string;
        classKey: string;
        rarityKey: string;
      }> = [];

      // Walk every .card element
      document.querySelectorAll('.card').forEach(cardEl => {
        // Card name = first text node inside the card (before the score)
        const allText = Array.from(cardEl.childNodes)
          .filter(n => n.nodeType === 3 || (n.nodeType === 1 && !(n as Element).classList.contains('score')))
          .map(n => n.textContent?.trim())
          .filter(Boolean)
          .join(' ')
          .trim();
        const nameFromEl = cardEl.querySelector('a, span:first-child, .card-name');
        const name = nameFromEl?.textContent?.trim() || allText.split('\n')[0]?.trim() || '';

        // Score
        const scoreEl = cardEl.querySelector('.score');
        const score = scoreEl ? parseInt(scoreEl.textContent?.trim() || '0', 10) : 0;

        // Tier quality class from parent (.tier.great, .tier.good, etc.)
        const tierContainer = cardEl.closest('[class*="tier "], [class^="tier"]') as HTMLElement | null;
        const tierClass = tierContainer ? tierContainer.className.replace('tier', '').trim().split(' ')[0] : '';

        // Class from ancestor h2
        let classKey = 'neutral';
        let node: Element | null = cardEl;
        while (node && node.tagName !== 'BODY') {
          if (node.tagName === 'H2') { classKey = node.textContent?.trim().toLowerCase() || 'neutral'; break; }
          const prevH2 = node.previousElementSibling;
          if (prevH2?.tagName === 'H2') { classKey = prevH2.textContent?.trim().toLowerCase() || 'neutral'; break; }
          // Check if parent section has h2
          const parentH2 = node.parentElement?.querySelector(':scope > h2');
          if (parentH2) { classKey = parentH2.textContent?.trim().toLowerCase() || 'neutral'; break; }
          node = node.parentElement;
        }

        // Rarity from ancestor h3
        let rarityKey = 'common';
        node = cardEl;
        while (node && node.tagName !== 'BODY') {
          const prevH3 = node.previousElementSibling;
          if (prevH3?.tagName === 'H3') { rarityKey = prevH3.textContent?.toLowerCase() || 'common'; break; }
          const parentH3 = node.parentElement?.querySelector(':scope > h3');
          if (parentH3) { rarityKey = parentH3.textContent?.toLowerCase() || 'common'; break; }
          node = node.parentElement;
        }

        if (name && name.length > 1 && name.length < 80) {
          result.push({ name, score, tierClass, classKey, rarityKey });
        }
      });

      return result;
    });

    console.log(`[Scraper] HearthArena: found ${raw.length} raw cards`);

    if (raw.length < 5) {
      console.error('[Scraper] HearthArena: too few cards found, dumping page...');
      return false;
    }

    // Map tier class → tier letter
    const scoreToTier = (score: number, tierCls: string): string => {
      // Use tierClass name first
      for (const [key, tier] of Object.entries(HA_TIER_MAP)) {
        if (tierCls === key || tierCls.includes(key)) return tier;
      }
      // Fall back to score ranges (HearthArena scores centered at ~50, high cards 80-100+)
      if (score >= 90) return 'S';
      if (score >= 75) return 'A';
      if (score >= 60) return 'B';
      if (score >= 45) return 'C';
      if (score >= 30) return 'D';
      return 'F';
    };

    // Map class name → class id
    const mapClass = (key: string): string => {
      const info = CLASS_INFO[key.toLowerCase().trim()] || CLASS_INFO[key.toLowerCase().replace(/\s+/g, '')];
      return info?.id || 'neutral';
    };

    // Map rarity string → rarity id
    const mapRarity = (key: string): string => {
      for (const [k, v] of Object.entries(RARITY_MAP)) {
        if (key.includes(k)) return v;
      }
      return 'common';
    };

    // Deduplicate: same card appears once per class section on HearthArena
    // Keep the entry with highest score
    const INVALID_NAMES = new Set(['новый', 'new', 'новая', 'новое', '']);
    const seen = new Map<string, typeof raw[0]>();
    for (const card of raw) {
      const key = card.name.toLowerCase().trim();
      if (INVALID_NAMES.has(key) || key.length < 2) continue;
      if (!seen.has(key) || card.score > seen.get(key)!.score) {
        seen.set(key, card);
      }
    }
    const deduped = Array.from(seen.values());
    console.log(`[Scraper] HearthArena: ${raw.length} raw → ${deduped.length} unique cards`);

    // Group into tiers
    const grouped: Record<string, any[]> = {};
    for (const card of deduped) {
      const tier = scoreToTier(card.score, card.tierClass);
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push({
        name: card.name,
        cost: 0,             // HearthArena doesn't expose cost in the tier list
        rarity: mapRarity(card.rarityKey),
        type: 'minion',
        class: mapClass(card.classKey),
        score: card.score,
      });
    }

    // Sort each tier by score desc, limit to top 40 per tier
    const tierOrder = ['S', 'A', 'B', 'C', 'D', 'F'];
    const tiers = tierOrder
      .filter(t => grouped[t]?.length > 0)
      .map(t => ({
        tier: t,
        description: TIER_DESCRIPTIONS[t] || '',
        cards: grouped[t]
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 40),
      }));

    saveData('tierlist.json', {
      tiers,
      updatedAt: new Date().toISOString(),
      source: 'heartharena.com',
    });
    console.log(`[Scraper] HearthArena: saved ${tiers.length} tiers, ${raw.length} cards`);
    return true;
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
  const [wr, tl] = await Promise.allSettled([
    scrapeFirestoneWinrates(),
    scrapeHearthArenaTierlist(),
  ]);
  return {
    winrates: wr.status === 'fulfilled' && wr.value,
    tierlist: tl.status === 'fulfilled' && tl.value,
  };
}

// Run directly: npx tsx server/scraper.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAll().then(res => {
    console.log('[Scraper] Done:', res);
    process.exit(0);
  });
}

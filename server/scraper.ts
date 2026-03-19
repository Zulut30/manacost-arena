import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const BLIZZARD_CLIENT_ID     = process.env.BLIZZARD_CLIENT_ID     ?? '';
const BLIZZARD_CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET ?? '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Class / Tier / Rarity mappings ──────────────────────────────────────────

const CLASS_INFO: Record<string, { id: string; name: string; color: string; textDark?: boolean }> = {
  deathknight:    { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  'death-knight': { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  'death knight': { id: 'dk',      name: 'Рыцарь смерти',     color: '#1f252d' },
  paladin:        { id: 'paladin', name: 'Паладин',            color: '#a88a45' },
  shaman:         { id: 'shaman',  name: 'Шаман',              color: '#2a2e6b' },
  hunter:         { id: 'hunter',  name: 'Охотник',            color: '#1d5921' },
  mage:           { id: 'mage',    name: 'Маг',                color: '#2b5c85' },
  rogue:          { id: 'rogue',   name: 'Разбойник',          color: '#333333' },
  warlock:        { id: 'warlock', name: 'Чернокнижник',       color: '#5c265c' },
  druid:          { id: 'druid',   name: 'Друид',              color: '#704a16' },
  warrior:        { id: 'warrior', name: 'Воин',               color: '#7a1e1e' },
  priest:         { id: 'priest',  name: 'Жрец',               color: '#d1d1d1', textDark: true },
  demonhunter:    { id: 'dh',      name: 'Охотник на демонов', color: '#224722' },
  'demon-hunter': { id: 'dh',      name: 'Охотник на демонов', color: '#224722' },
  'demon hunter': { id: 'dh',      name: 'Охотник на демонов', color: '#224722' },
  // Firestone API keys
  'рыцарь смерти': { id: 'dk', name: 'Рыцарь смерти', color: '#1f252d' },
  паладин:         { id: 'paladin', name: 'Паладин',   color: '#a88a45' },
  шаман:           { id: 'shaman',  name: 'Шаман',     color: '#2a2e6b' },
  охотник:         { id: 'hunter',  name: 'Охотник',   color: '#1d5921' },
  маг:             { id: 'mage',    name: 'Маг',       color: '#2b5c85' },
  разбойник:       { id: 'rogue',   name: 'Разбойник', color: '#333333' },
  чернокнижник:    { id: 'warlock', name: 'Чернокнижник', color: '#5c265c' },
  друид:           { id: 'druid',   name: 'Друид',     color: '#704a16' },
  воин:            { id: 'warrior', name: 'Воин',      color: '#7a1e1e' },
  жрец:            { id: 'priest',  name: 'Жрец',      color: '#d1d1d1', textDark: true },
  'охотник на демонов': { id: 'dh', name: 'Охотник на демонов', color: '#224722' },
};

// HearthArena CSS tier class → tier letter
const HA_TIER_MAP: Record<string, string> = {
  great:           'S',
  good:            'A',
  'above-average': 'B',
  aboveaverage:    'B',
  average:         'C',
  'below-average': 'D',
  belowaverage:    'D',
  terrible:        'F',
  neverpick:       'F',
  'never-pick':    'F',
};

// HearthArena dt CSS class → normalized rarity
const HA_RARITY_MAP: Record<string, string> = {
  commons:     'common',
  rares:       'rare',
  epics:       'epic',
  legendaries: 'legendary',
};

// HearthArena dt CSS class → card class id
const HA_CLASS_MAP: Record<string, string> = {
  any:            'neutral',
  'death-knight': 'dk',
  'demon-hunter': 'dh',
  druid:          'druid',
  hunter:         'hunter',
  mage:           'mage',
  paladin:        'paladin',
  priest:         'priest',
  rogue:          'rogue',
  shaman:         'shaman',
  warlock:        'warlock',
  warrior:        'warrior',
};

const TIER_DESCRIPTIONS: Record<string, string> = {
  S: 'Авто-пик. Доминирующие карты текущего мета.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Слабые карты, берите только в крайнем случае.',
  F: 'Не стоит брать — очень слабые карты.',
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
      timeout: 60000,
    });
    await new Promise(r => setTimeout(r, 4000));

    // ── Extract card data using the correct DOM structure ──────────────────
    // Structure: dl.card > dt[data-card-image] (name + class + rarity + imageUrl + cardId)
    //                      dd.score (numeric score)
    // Parent chain: li.tier.{quality} > ul.tiers > li.rarity.{rarity} > section.{class}
    const raw = await page.evaluate(() => {
      const RARITY_CLASSES = new Set(['commons', 'rares', 'epics', 'legendaries']);
      const CLASS_NAMES    = new Set(['any','death-knight','demon-hunter','druid','hunter','mage','paladin','priest','rogue','shaman','warlock','warrior']);
      const TIER_CLASSES   = new Set(['great','good','above-average','aboveaverage','average','below-average','belowaverage','terrible','neverpick','never-pick']);

      const result: Array<{
        name: string;
        score: number;
        cardId: string;
        imageHa: string;
        classKey: string;
        rarityKey: string;
        tierClass: string;
      }> = [];

      document.querySelectorAll('dl.card').forEach(cardEl => {
        const dt = cardEl.querySelector('dt');
        const dd = cardEl.querySelector('dd.score');
        if (!dt) return;

        // ── Card image URL and extracted ID ─────────────────────────────
        const imageHa = dt.getAttribute('data-card-image') || '';
        if (!imageHa) return; // skip cards with no image URL
        const cardId = imageHa.split('/').pop()?.replace(/\.\w+$/, '') || '';
        if (!cardId) return;

        // ── Card name (strip the "Новый" badge span) ─────────────────────
        const newSpan = dt.querySelector('.new, .badge, span');
        const name = (dt.textContent || '').replace(newSpan?.textContent || '', '').trim();
        if (!name || name.length < 2 || name.length > 80) return;

        // ── Score ─────────────────────────────────────────────────────────
        const score = parseInt((dd?.textContent || '').trim(), 10) || 0;

        // ── Class and rarity from dt.classList ────────────────────────────
        const dtClasses = Array.from(dt.classList);
        const classKey  = dtClasses.find(c => CLASS_NAMES.has(c))    || 'any';
        const rarityKey = dtClasses.find(c => RARITY_CLASSES.has(c)) || 'commons';

        // ── Tier from parent li.tier.{class} ──────────────────────────────
        let tierClass = '';
        let el: Element | null = cardEl;
        while (el && el.tagName !== 'BODY') {
          if (el.tagName === 'LI') {
            const tc = Array.from(el.classList).find(c => TIER_CLASSES.has(c));
            if (tc) { tierClass = tc; break; }
          }
          el = el.parentElement;
        }

        result.push({ name, score, cardId, imageHa, classKey, rarityKey, tierClass });
      });

      return result;
    });

    console.log(`[Scraper] HearthArena: found ${raw.length} raw cards`);
    if (raw.length < 100) {
      console.error('[Scraper] HearthArena: too few cards, aborting');
      return false;
    }

    // ── Deduplicate: same card appears once per class section ─────────────
    // Key = cardId. Keep highest score entry.
    const seen = new Map<string, typeof raw[0]>();
    for (const card of raw) {
      const existing = seen.get(card.cardId);
      if (!existing || card.score > existing.score) {
        seen.set(card.cardId, card);
      }
    }
    const deduped = Array.from(seen.values());
    console.log(`[Scraper] HearthArena: ${raw.length} raw → ${deduped.length} unique cards`);

    // ── Enrich with HearthstoneJSON stats (cost, attack, health, type) ────
    let hsMap: Map<string, { dbfId: number; cost: number; attack?: number; health?: number; type: string }> | null = null;
    try {
      hsMap = await buildHearthstoneIdMap();
    } catch (e) {
      console.warn('[Scraper] HearthstoneJSON lookup failed:', (e as Error).message);
    }

    // ── Enrich with Blizzard API Russian images (optional premium upgrade) ──
    let blizzardMaps: BlizzardMaps | null = null;
    try {
      const token = await getBlizzardToken();
      blizzardMaps = await buildBlizzardImageMap(token);
    } catch (e) {
      console.warn('[Scraper] Blizzard API failed, using HearthArena images:', (e as Error).message);
    }

    // ── Group into tiers ──────────────────────────────────────────────────
    const grouped: Record<string, any[]> = {};

    for (const card of deduped) {
      const tier = HA_TIER_MAP[card.tierClass] ?? scoreFallbackTier(card.score);
      if (!grouped[tier]) grouped[tier] = [];

      const hsData = hsMap?.get(card.cardId) ?? null;

      // Image priority: Blizzard (official Russian) > HearthArena CDN (Russian) > null
      let imageRu: string | null = null;
      if (blizzardMaps && hsData?.dbfId) {
        imageRu = blizzardMaps.byDbfId.get(hsData.dbfId) ?? null;
      }
      if (!imageRu && blizzardMaps) {
        imageRu = blizzardMaps.byName.get(normalizeRu(card.name)) ?? null;
      }

      grouped[tier].push({
        name:    card.name,
        cost:    hsData?.cost    ?? 0,
        attack:  hsData?.attack,
        health:  hsData?.health,
        rarity:  HA_RARITY_MAP[card.rarityKey] ?? 'common',
        type:    hsData?.type    ?? 'minion',
        class:   HA_CLASS_MAP[card.classKey]   ?? 'neutral',
        score:   card.score,
        cardId:  card.cardId,          // HearthstoneJSON ID (e.g. "MIS_006")
        imageHa: card.imageHa,         // HearthArena CDN – always Russian
        imageRu: imageRu,              // Blizzard official render – Russian
      });
    }

    // ── Sort tiers, cap at 60 cards each ──────────────────────────────────
    const tierOrder = ['S', 'A', 'B', 'C', 'D', 'F'];
    const tiers = tierOrder
      .filter(t => grouped[t]?.length > 0)
      .map(t => ({
        tier:        t,
        description: TIER_DESCRIPTIONS[t] || '',
        cards:       grouped[t]
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
          .slice(0, 60),
      }));

    saveData('tierlist.json', {
      tiers,
      updatedAt: new Date().toISOString(),
      source: 'heartharena.com',
    });
    console.log(`[Scraper] HearthArena: saved ${tiers.length} tiers, ${deduped.length} unique cards`);
    return true;

  } catch (err) {
    console.error('[Scraper] HearthArena error:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreFallbackTier(score: number): string {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 45) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

function normalizeRu(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\wа-яa-z0-9]/gi, '')
    .trim();
}

// ─── HearthstoneJSON — stats by card ID ──────────────────────────────────────

/** Build a map of HearthstoneJSON card ID → stats (cost, attack, health, dbfId, type) */
export async function buildHearthstoneIdMap(): Promise<Map<string, {
  dbfId: number; cost: number; attack?: number; health?: number; type: string;
}>> {
  console.log('[Scraper] HearthstoneJSON: fetching card stats...');
  const res = await fetch('https://api.hearthstonejson.com/v1/latest/ruRU/cards.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!res.ok) throw new Error(`HearthstoneJSON HTTP ${res.status}`);
  const cards: any[] = await res.json();

  const map = new Map<string, { dbfId: number; cost: number; attack?: number; health?: number; type: string }>();
  for (const card of cards) {
    if (!card.id) continue;
    map.set(card.id, {
      dbfId:  card.dbfId  ?? 0,
      cost:   card.cost   ?? 0,
      attack: card.attack,
      health: card.health ?? card.durability,
      type:   (card.type || 'MINION').toLowerCase(),
    });
  }
  console.log(`[Scraper] HearthstoneJSON: indexed ${map.size} cards`);
  return map;
}

// ─── Blizzard API — Russian card images ──────────────────────────────────────

async function getBlizzardToken(): Promise<string> {
  if (!BLIZZARD_CLIENT_ID || !BLIZZARD_CLIENT_SECRET) throw new Error('Blizzard credentials not set');
  const creds = Buffer.from(`${BLIZZARD_CLIENT_ID}:${BLIZZARD_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://oauth.battle.net/token', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Blizzard OAuth ${res.status}`);
  const data = await res.json() as any;
  return data.access_token;
}

interface BlizzardMaps {
  byDbfId: Map<number, string>;   // dbfId  → imageUrl
  byName:  Map<string, string>;   // normalizedRuName → imageUrl
}

async function buildBlizzardImageMap(token: string): Promise<BlizzardMaps> {
  console.log('[Scraper] Blizzard: fetching Russian card images...');
  const byDbfId = new Map<number, string>();
  const byName  = new Map<string, string>();
  let page = 1, pageCount = 1;
  while (page <= pageCount) {
    const res = await fetch(
      `https://us.api.blizzard.com/hearthstone/cards?locale=ru_RU&pageSize=500&page=${page}`,
      { headers: { 'Authorization': `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Blizzard cards HTTP ${res.status}`);
    const data = await res.json() as any;
    pageCount = data.pageCount ?? 1;
    for (const card of data.cards ?? []) {
      if (!card.image) continue;
      if (card.slug) {
        const dbfId = parseInt((card.slug as string).split('-')[0], 10);
        if (!isNaN(dbfId)) byDbfId.set(dbfId, card.image as string);
      }
      if (card.name) byName.set(normalizeRu(card.name as string), card.image as string);
    }
    page++;
  }
  console.log(`[Scraper] Blizzard: ${byDbfId.size} by dbfId, ${byName.size} by name`);
  return { byDbfId, byName };
}

// ─── Data persistence ─────────────────────────────────────────────────────────

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

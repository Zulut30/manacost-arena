import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });

const BLIZZARD_CLIENT_ID     = process.env.BLIZZARD_CLIENT_ID     ?? '';
const BLIZZARD_CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET ?? '';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const DATA_DIR   = join(__dirname, 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ─── Constants ────────────────────────────────────────────────────────────────

/** All 7 tier CSS classes on HearthArena */
const HA_TIER_TO_LETTER: Record<string, string> = {
  great:           'S',
  good:            'A',
  'above-average': 'B',
  average:         'C',
  'below-average': 'D',
  bad:             'E',
  terrible:        'F',
};

const TIER_LABEL: Record<string, string> = {
  S: 'Отлично',
  A: 'Хорошо',
  B: 'Выше среднего',
  C: 'Средне',
  D: 'Ниже среднего',
  E: 'Плохо',
  F: 'Ужасно',
};

const TIER_DESC: Record<string, string> = {
  S: 'Авто-пик — доминирующие карты текущего мета.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Ниже среднего — берите только если нет лучших карт.',
  E: 'Плохие карты — последний выбор.',
  F: 'Ужасные карты — никогда не стоит брать.',
};

/** HearthArena dt rarity CSS class → normalized rarity string */
const HA_RARITY: Record<string, string> = {
  commons:     'common',
  rares:       'rare',
  epics:       'epic',
  legendaries: 'legendary',
};

/** HearthArena dt class CSS name → our class ID */
const HA_CLASS: Record<string, string> = {
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

/** Ordered class sections as they appear on HearthArena */
const CLASS_SECTIONS: Record<string, { name: string; color: string; textDark?: boolean }> = {
  'death-knight': { name: 'Рыцарь смерти',     color: '#1f252d' },
  'demon-hunter': { name: 'Охотник на демонов', color: '#224722' },
  druid:          { name: 'Друид',              color: '#704a16' },
  hunter:         { name: 'Охотник',            color: '#1d5921' },
  mage:           { name: 'Маг',                color: '#2b5c85' },
  paladin:        { name: 'Паладин',            color: '#a88a45' },
  priest:         { name: 'Жрец',               color: '#d1d1d1', textDark: true },
  rogue:          { name: 'Разбойник',          color: '#333333' },
  shaman:         { name: 'Шаман',              color: '#2a2e6b' },
  warlock:        { name: 'Чернокнижник',       color: '#5c265c' },
  warrior:        { name: 'Воин',               color: '#7a1e1e' },
  any:            { name: 'Нейтральные',        color: '#4a4a4a' },
};

/** Firestone / HearthArena class key → CLASS_INFO key */
const CLASS_INFO_MAP: Record<string, string> = {
  deathknight:    'death-knight',
  'death-knight': 'death-knight',
  demonhunter:    'demon-hunter',
  'demon-hunter': 'demon-hunter',
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

// ─── HSReplay Class Winrates ──────────────────────────────────────────────────

/** Map HSReplay UPPERCASE class name → our class key */
const HSREPLAY_CLASS_MAP: Record<string, string> = {
  DEATHKNIGHT:  'death-knight',
  DEMONHUNTER:  'demon-hunter',
  DRUID:        'druid',
  HUNTER:       'hunter',
  MAGE:         'mage',
  PALADIN:      'paladin',
  PRIEST:       'priest',
  ROGUE:        'rogue',
  SHAMAN:       'shaman',
  WARLOCK:      'warlock',
  WARRIOR:      'warrior',
};

/**
 * HSReplay /api/v1/arena/classes_stats/ uses numeric deck_class IDs.
 * Confirmed mapping from network log (deck_class 1=51.7% → DK, 2=53.2% → Druid etc.)
 * Extra IDs (12, 14) added for Demon Hunter / Warlock in case numbering varies.
 */
const HSREPLAY_DECK_CLASS_NUM: Record<number, string> = {
  1:  'death-knight',
  2:  'druid',
  3:  'hunter',
  4:  'mage',
  5:  'paladin',
  6:  'priest',
  7:  'rogue',
  8:  'shaman',
  9:  'warlock',
  10: 'warrior',
  11: 'demon-hunter',
  12: 'demon-hunter',  // alternate DH id seen in some regions
  14: 'death-knight',  // alternate DK id in some API versions
  15: 'warlock',       // alternate Warlock id fallback
};

function tryParseClassList(rows: any[]): Array<{ id: string; name: string; color: string; textDark: boolean; winrate: number; games: number }> | null {
  const result = rows
    .map((row: any) => {
      // Numeric deck_class (HSReplay classes_stats format)
      let key: string | undefined;
      if (typeof row.deck_class === 'number') {
        key = HSREPLAY_DECK_CLASS_NUM[row.deck_class];
      } else {
        const cls = (row.player_class || row.playerClass || row.class || row.className || '').toUpperCase();
        key = HSREPLAY_CLASS_MAP[cls];
      }
      const info = key ? CLASS_SECTIONS[key] : null;
      if (!key || !info) return null;
      const winrate = row.win_rate ?? row.winrate ?? row.winRate;
      const games   = row.num_drafts ?? row.total_games ?? row.totalGames ?? row.games;
      if (winrate == null) return null;
      return { id: key, name: info.name, color: info.color, textDark: info.textDark ?? false, winrate: Math.round(winrate * 10) / 10, games: games ?? 0 };
    })
    .filter(Boolean) as any[];
  return result.length >= 8 ? result : null;
}

function parseHSReplayClassStats(raw: any): Array<{ id: string; name: string; color: string; textDark: boolean; winrate: number; games: number }> | null {
  // Format 1: { series: { data: { DRUID: [{win_rate, total_games}] } } }
  const seriesData = raw?.series?.data;
  if (seriesData && typeof seriesData === 'object' && !Array.isArray(seriesData)) {
    const rows = Object.entries(seriesData).map(([cls, val]: [string, any]) => {
      const row = Array.isArray(val) ? val[0] : val;
      return { player_class: cls, ...(typeof row === 'object' ? row : {}) };
    });
    const r = tryParseClassList(rows);
    if (r) return r;
  }

  // Format 2: { data: { ALL: [{player_class, win_rate}] } }
  const dataAll = raw?.data?.ALL ?? (Array.isArray(raw?.data) ? raw.data : null);
  if (Array.isArray(dataAll)) {
    const r = tryParseClassList(dataAll);
    if (r) return r;
  }

  // Format 3: flat array [{player_class, win_rate}]
  if (Array.isArray(raw)) {
    const r = tryParseClassList(raw);
    if (r) return r;
  }

  // Format 4: object with class keys at top level { DRUID: {win_rate, total_games} }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = Object.keys(raw).map(k => k.toUpperCase());
    if (keys.some(k => HSREPLAY_CLASS_MAP[k])) {
      const rows = Object.entries(raw).map(([cls, val]: [string, any]) => ({
        player_class: cls, ...(typeof val === 'object' ? val : {}),
      }));
      const r = tryParseClassList(rows);
      if (r) return r;
    }
  }

  return null;
}

export async function scrapeHSReplayClassWinrates(): Promise<boolean> {
  console.log('[Scraper] HSReplay: fetching arena class stats...');

  // ── Intercept via puppeteer (classes_stats requires browser session) ────
  console.log('[Scraper] HSReplay: launching browser for classes_stats...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );

    let intercepted: any = null;
    page.on('response', async (response) => {
      if (intercepted) return;
      const url = response.url();
      if (!url.includes('hsreplay.net')) return;
      const ct = response.headers()['content-type'] || '';
      if (!ct.includes('json')) return;
      try {
        const text = await response.text();
        const json = JSON.parse(text);
        const classes = parseHSReplayClassStats(json);
        if (classes && classes.length >= 8) {
          console.log('[Scraper] HSReplay: matched class stats from:', url);
          intercepted = classes;
        }
      } catch { /* skip */ }
    });

    await page.goto('https://hsreplay.net/arena/', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 10000));

    if (!intercepted) throw new Error('class_stats response not intercepted');

    saveData('winrates.json', {
      classes: intercepted.sort((a: any, b: any) => b.winrate - a.winrate),
      updatedAt: new Date().toISOString(),
      source: 'hsreplay.net',
    });
    console.log(`[Scraper] HSReplay: saved ${intercepted.length} classes (browser)`);
    return true;

  } catch (err) {
    console.error('[Scraper] HSReplay class stats error:', (err as Error).message);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Firestone Winrates (fallback) ────────────────────────────────────────────

export async function scrapeFirestoneWinrates(): Promise<boolean> {
  console.log('[Scraper] Firestone: fetching public API...');
  try {
    const res = await fetch(
      'https://static.zerotoheroes.com/api/arena/stats/classes/arena/last-patch/overview.gz.json',
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;

    const classes = (data.stats || []).map((s: any) => {
      const raw    = (s.playerClass || '').toLowerCase().replace(/\s+/g, '');
      const key    = CLASS_INFO_MAP[raw] || raw;
      const info   = CLASS_SECTIONS[key];
      if (!info || !s.totalGames) return null;
      return {
        id:       key,
        name:     info.name,
        color:    info.color,
        textDark: info.textDark ?? false,
        winrate:  Math.round((s.totalsWins / s.totalGames) * 1000) / 10,
        games:    s.totalGames,
      };
    }).filter(Boolean);

    if (classes.length < 3) throw new Error('Too few classes: ' + classes.length);
    saveData('winrates.json', {
      classes: classes.sort((a: any, b: any) => b.winrate - a.winrate),
      updatedAt: data.lastUpdated || new Date().toISOString(),
      source: 'firestoneapp.com',
    });
    console.log(`[Scraper] Firestone: saved ${classes.length} classes`);
    return true;
  } catch (err) {
    console.error('[Scraper] Firestone error:', (err as Error).message);
    return false;
  }
}

// ─── HearthArena Tier List ────────────────────────────────────────────────────

export async function scrapeHearthArenaTierlist(): Promise<boolean> {
  console.log('[Scraper] HearthArena: launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.goto('https://www.heartharena.com/ru/tierlist', { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    // ── Extract all card data from the DOM ──────────────────────────────────
    const raw = await page.evaluate(() => {
      const RARITY_SET   = new Set(['commons', 'rares', 'epics', 'legendaries']);
      const CLASS_SET    = new Set(['any','death-knight','demon-hunter','druid','hunter','mage','paladin','priest','rogue','shaman','warlock','warrior']);
      const TIER_SET     = new Set(['great','good','above-average','average','below-average','bad','terrible']);

      const result: Array<{
        name:      string;
        score:     number;
        cardId:    string;
        imageHa:   string;
        classKey:  string;   // e.g. 'death-knight'
        rarityKey: string;   // e.g. 'legendaries'
        tierClass: string;   // e.g. 'great'
        sectionId: string;   // parent section id, e.g. 'death-knight'
      }> = [];

      document.querySelectorAll('dl.card').forEach(cardEl => {
        const dt = cardEl.querySelector('dt');
        const dd = cardEl.querySelector('dd.score');
        if (!dt) return;

        // Image URL → card ID
        const imageHa = dt.getAttribute('data-card-image') || '';
        if (!imageHa) return;
        const cardId = imageHa.split('/').pop()?.replace(/\.\w+$/, '') || '';
        if (!cardId) return;

        // Card name — strip "Новый" badge
        const newSpan = dt.querySelector('.new, span');
        const name = (dt.textContent || '').replace(newSpan?.textContent || '', '').trim();
        if (!name || name.length < 2 || name.length > 80) return;

        // Score
        const score = parseInt((dd?.textContent || '').trim(), 10) || 0;

        // Class + rarity from dt.classList
        const dtClasses = Array.from(dt.classList);
        const classKey  = dtClasses.find(c => CLASS_SET.has(c))   || 'any';
        const rarityKey = dtClasses.find(c => RARITY_SET.has(c))  || 'commons';

        // Tier by walking up to li.tier.{class}
        let tierClass = '';
        let el: Element | null = cardEl;
        while (el && el.tagName !== 'BODY') {
          if (el.tagName === 'LI') {
            const tc = Array.from(el.classList).find(c => TIER_SET.has(c));
            if (tc) { tierClass = tc; break; }
          }
          el = el.parentElement;
        }

        // Section (class tab) from closest section.tab
        const sectionEl = cardEl.closest('section.tab');
        const sectionId = sectionEl?.id || 'any';

        result.push({ name, score, cardId, imageHa, classKey, rarityKey, tierClass, sectionId });
      });

      return result;
    });

    console.log(`[Scraper] HearthArena: ${raw.length} raw cards from DOM`);
    if (raw.length < 500) throw new Error('Too few cards: ' + raw.length);

    // ── Enrich: HearthstoneJSON stats (cost, attack, health, type, dbfId) ──
    let hsById = new Map<string, { dbfId: number; cost: number; attack?: number; health?: number; type: string }>();
    try {
      hsById = await buildHearthstoneIdMap();
    } catch (e) {
      console.warn('[Scraper] HearthstoneJSON failed:', (e as Error).message);
    }

    // ── Enrich: Blizzard Russian card renders ───────────────────────────────
    let blizzardMap: Map<number, string> | null = null;
    let blizzardByName: Map<string, string> | null = null;
    try {
      const token = await getBlizzardToken();
      const maps = await buildBlizzardImageMap(token);
      blizzardMap    = maps.byDbfId;
      blizzardByName = maps.byName;
    } catch (e) {
      console.warn('[Scraper] Blizzard API failed, using HearthArena images:', (e as Error).message);
    }

    // ── Load cards_ru.json for authoritative rarity overrides ───────────────
    let cardsRuDb: Record<string, { rarity: string; mana: number; type: string }> = {};
    try {
      cardsRuDb = JSON.parse(readFileSync(join(DATA_DIR, 'cards_ru.json'), 'utf-8'));
      console.log(`[Scraper] cards_ru.json loaded: ${Object.keys(cardsRuDb).length} cards`);
    } catch {
      console.warn('[Scraper] cards_ru.json not found, rarity from HearthArena DOM');
    }

    // ── Build global card lookup (images + stats), keyed by cardId ─────────
    const cardLookup: Record<string, {
      cost?: number; attack?: number; health?: number; type?: string;
      rarity?: string;
      imageHa: string; imageRu: string | null;
    }> = {};

    for (const card of raw) {
      if (cardLookup[card.cardId]) continue; // already enriched
      const hs = hsById.get(card.cardId);
      let imageRu: string | null = null;
      if (blizzardMap && hs?.dbfId) imageRu = blizzardMap.get(hs.dbfId) ?? null;
      if (!imageRu && blizzardByName) imageRu = blizzardByName.get(normalizeRu(card.name)) ?? null;
      // Rarity: prefer cards_ru.json, fallback to HearthArena DOM class
      const ruCard = cardsRuDb[card.cardId];
      const rarityFromDom = HA_RARITY[card.rarityKey] ?? 'common';
      const rarity = ruCard
        ? (ruCard.rarity === 'free' ? 'common' : ruCard.rarity)
        : rarityFromDom;

      cardLookup[card.cardId] = {
        cost:    ruCard?.mana ?? hs?.cost,
        attack:  hs?.attack,
        health:  hs?.health,
        type:    ruCard?.type ?? hs?.type,
        rarity,
        imageHa: card.imageHa,
        imageRu,
      };
    }

    // ── Build per-section tier lists ────────────────────────────────────────
    // sectionId → tierLetter → Map<cardId, best card entry>
    type SectionMap = Record<string, Record<string, Map<string, typeof raw[0]>>>;
    const bySection: SectionMap = {};

    for (const card of raw) {
      const { sectionId, cardId, tierClass, score } = card;
      if (!tierClass) continue; // skip cards without detected tier

      const tier = HA_TIER_TO_LETTER[tierClass];
      if (!tier) continue;

      if (!bySection[sectionId]) bySection[sectionId] = {};
      if (!bySection[sectionId][tier]) bySection[sectionId][tier] = new Map();

      const existing = bySection[sectionId][tier].get(cardId);
      if (!existing || score > existing.score) {
        bySection[sectionId][tier].set(cardId, card);
      }
    }

    // ── Assemble final sections array ───────────────────────────────────────
    const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'E', 'F'];
    const SECTION_ORDER = ['death-knight','demon-hunter','druid','hunter','mage','paladin','priest','rogue','shaman','warlock','warrior','any'];

    const sections = SECTION_ORDER
      .filter(sid => bySection[sid])
      .map(sid => {
        const info  = CLASS_SECTIONS[sid] || { name: sid, color: '#555' };
        const tiers = TIER_ORDER
          .filter(t => bySection[sid][t]?.size > 0)
          .map(t => ({
            tier:        t,
            label:       TIER_LABEL[t],
            description: TIER_DESC[t],
            cards: Array.from(bySection[sid][t].values())
              .sort((a, b) => b.score - a.score)
              .map(card => {
                const ruCard = cardsRuDb[card.cardId];
                const rarity = ruCard
                  ? (ruCard.rarity === 'free' ? 'common' : ruCard.rarity)
                  : (HA_RARITY[card.rarityKey] ?? 'common');
                return {
                  name:     card.name,
                  score:    card.score,
                  rarity,
                  cardId:   card.cardId,
                  classKey: card.classKey,
                };
              }),
          }));

        const totalCards = tiers.reduce((s, t) => s + t.cards.length, 0);
        return { id: sid, name: info.name, color: info.color, textDark: info.textDark ?? false, tiers, totalCards };
      });

    // Count totals
    const totalUnique = Object.keys(cardLookup).length;
    const totalCards  = sections.reduce((s, sec) => s + sec.totalCards, 0);
    console.log(`[Scraper] HearthArena: ${totalUnique} unique cards, ${totalCards} section entries across ${sections.length} classes`);

    saveData('tierlist.json', {
      sections,
      cards:     cardLookup,
      updatedAt: new Date().toISOString(),
      source:    'heartharena.com',
    });
    return true;

  } catch (err) {
    console.error('[Scraper] HearthArena error:', (err as Error).message);
    return false;
  } finally {
    await browser.close();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeRu(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е').replace(/[^\wа-яa-z0-9]/gi, '').trim();
}

async function buildHearthstoneIdMap() {
  console.log('[Scraper] HearthstoneJSON: fetching card stats...');
  const res = await fetch('https://api.hearthstonejson.com/v1/latest/ruRU/cards.json', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const cards: any[] = await res.json();

  const map = new Map<string, { dbfId: number; cost: number; attack?: number; health?: number; type: string }>();
  for (const c of cards) {
    if (!c.id) continue;
    map.set(c.id, {
      dbfId:  c.dbfId  ?? 0,
      cost:   c.cost   ?? 0,
      attack: c.attack,
      health: c.health ?? c.durability,
      type:   (c.type || 'MINION').toLowerCase(),
    });
  }
  console.log(`[Scraper] HearthstoneJSON: ${map.size} cards indexed`);
  return map;
}

async function getBlizzardToken(): Promise<string> {
  if (!BLIZZARD_CLIENT_ID || !BLIZZARD_CLIENT_SECRET) throw new Error('Blizzard credentials not configured');
  const creds = Buffer.from(`${BLIZZARD_CLIENT_ID}:${BLIZZARD_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://oauth.battle.net/token', {
    method:  'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}`);
  return ((await res.json()) as any).access_token;
}

async function buildBlizzardImageMap(token: string) {
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
      const dbfId = parseInt((card.slug as string || '').split('-')[0], 10);
      if (!isNaN(dbfId)) byDbfId.set(dbfId, card.image);
      if (card.name) byName.set(normalizeRu(card.name), card.image);
    }
    page++;
  }
  console.log(`[Scraper] Blizzard: ${byDbfId.size} images by dbfId, ${byName.size} by name`);
  return { byDbfId, byName };
}

function saveData(filename: string, data: object) {
  writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
}

export function loadData(filename: string): any | null {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8'));
  } catch { return null; }
}

// ─── HSReplay Legendaries ─────────────────────────────────────────────────────

export async function scrapeLegendaries(): Promise<boolean> {
  console.log('[Scraper] HSReplay Legendaries: launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );

    // Intercept the card_packages API response
    let packagesData: any = null;
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('card_packages/free')) {
        try {
          const text = await response.text();
          packagesData = JSON.parse(text);
          console.log('[Scraper] HSReplay: intercepted card_packages/free response');
        } catch (e) {
          console.warn('[Scraper] HSReplay: failed to parse intercepted response:', (e as Error).message);
        }
      }
    });

    await page.goto('https://hsreplay.net/arena/legendaries/', { waitUntil: 'networkidle2', timeout: 60000 });
    // Wait a bit for any delayed XHR
    await new Promise(r => setTimeout(r, 8000));

    if (!packagesData) throw new Error('card_packages/free response not intercepted');

    const allPackages: Array<{
      package_key_card_id: string;
      package_card_ids: string[];
      win_rate: number;
    }> = packagesData?.data?.ALL ?? [];

    if (allPackages.length < 10) throw new Error(`Too few legendary packages: ${allPackages.length}`);
    console.log(`[Scraper] HSReplay: ${allPackages.length} legendary packages found`);

    // ── Fetch HearthstoneJSON for ruRU names and stats ──────────────────────
    console.log('[Scraper] HearthstoneJSON: fetching ruRU card data...');
    const hsRes = await fetch('https://api.hearthstonejson.com/v1/latest/ruRU/cards.json', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManacostArena/1.0)' },
    });
    if (!hsRes.ok) throw new Error(`HearthstoneJSON HTTP ${hsRes.status}`);
    const hsCards: any[] = await hsRes.json();

    // Build maps: cardId → { name, cost, dbfId, classKey }
    const hsNameMap  = new Map<string, string>();
    const hsCostMap  = new Map<string, number>();
    const hsDbfMap   = new Map<string, number>();
    const hsClassMap = new Map<string, string>();

    const HSCLASS_MAP: Record<string, string> = {
      DEATHKNIGHT: 'death-knight', DEMONHUNTER: 'demon-hunter',
      DRUID: 'druid', HUNTER: 'hunter', MAGE: 'mage', PALADIN: 'paladin',
      PRIEST: 'priest', ROGUE: 'rogue', SHAMAN: 'shaman',
      WARLOCK: 'warlock', WARRIOR: 'warrior', NEUTRAL: 'any',
    };

    for (const c of hsCards) {
      if (!c.id) continue;
      if (c.name)  hsNameMap.set(c.id, c.name);
      if (c.cost !== undefined) hsCostMap.set(c.id, c.cost);
      if (c.dbfId) hsDbfMap.set(c.id, c.dbfId);
      const cls = c.cardClass ?? c.multiClassGroup ?? 'NEUTRAL';
      hsClassMap.set(c.id, HSCLASS_MAP[cls] ?? 'any');
    }
    console.log(`[Scraper] HearthstoneJSON: ${hsNameMap.size} ruRU card names indexed`);

    // ── Optionally get Blizzard Russian image URLs ──────────────────────────
    let blizzardMap: Map<number, string> | null = null;
    try {
      const token = await getBlizzardToken();
      const maps = await buildBlizzardImageMap(token);
      blizzardMap = maps.byDbfId;
    } catch (e) {
      console.warn('[Scraper] Blizzard API failed for legendaries:', (e as Error).message);
    }

    // ── Build groups ────────────────────────────────────────────────────────
    const haImgUrl = (cardId: string) =>
      `https://cdn.heartharena.com/images/renders/ruRU/${cardId}.webp`;

    const groups = allPackages.map(pkg => {
      const keyId   = pkg.package_key_card_id;
      const keyDbf  = hsDbfMap.get(keyId);
      const imageRu = (blizzardMap && keyDbf) ? (blizzardMap.get(keyDbf) ?? null) : null;

      const keyCard = {
        cardId:  keyId,
        name:    hsNameMap.get(keyId) ?? keyId,
        imageHa: haImgUrl(keyId),
        imageRu,
      };

      const cards = pkg.package_card_ids.map(cid => ({
        cardId:  cid,
        name:    hsNameMap.get(cid) ?? cid,
        cost:    hsCostMap.get(cid) ?? 0,
        imageHa: haImgUrl(cid),
      }));

      const classKey = hsClassMap.get(keyId) ?? 'any';
      return { keyCard, cards, winRate: pkg.win_rate, classKey };
    });

    saveData('legendaries.json', {
      groups,
      updatedAt: new Date().toISOString(),
      source: 'hsreplay.net',
    });
    console.log(`[Scraper] HSReplay: saved ${groups.length} legendary groups`);
    return true;

  } catch (err) {
    console.error('[Scraper] HSReplay Legendaries error:', (err as Error).message);
    return false;
  } finally {
    await browser.close();
  }
}

export async function scrapeAll() {
  console.log('[Scraper] Starting full scrape...');

  // Winrates: try HSReplay first, fall back to Firestone
  const winratesOk = await scrapeHSReplayClassWinrates()
    || await scrapeFirestoneWinrates();

  const [tl, lg] = await Promise.allSettled([
    scrapeHearthArenaTierlist(),
    scrapeLegendaries(),
  ]);
  return {
    winrates:    winratesOk,
    tierlist:    tl.status === 'fulfilled' && tl.value,
    legendaries: lg.status === 'fulfilled' && lg.value,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAll().then(res => { console.log('[Scraper] Done:', res); process.exit(0); });
}

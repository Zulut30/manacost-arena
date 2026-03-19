import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
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

// ─── Firestone Winrates ───────────────────────────────────────────────────────

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

    // ── Build global card lookup (images + stats), keyed by cardId ─────────
    const cardLookup: Record<string, {
      cost?: number; attack?: number; health?: number; type?: string;
      imageHa: string; imageRu: string | null;
    }> = {};

    for (const card of raw) {
      if (cardLookup[card.cardId]) continue; // already enriched
      const hs = hsById.get(card.cardId);
      let imageRu: string | null = null;
      if (blizzardMap && hs?.dbfId) imageRu = blizzardMap.get(hs.dbfId) ?? null;
      if (!imageRu && blizzardByName) imageRu = blizzardByName.get(normalizeRu(card.name)) ?? null;
      cardLookup[card.cardId] = {
        cost:    hs?.cost,
        attack:  hs?.attack,
        health:  hs?.health,
        type:    hs?.type,
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
              .map(card => ({
                name:     card.name,
                score:    card.score,
                rarity:   HA_RARITY[card.rarityKey] ?? 'common',
                cardId:   card.cardId,
                classKey: card.classKey,  // 'any' = neutral, else class-specific
              })),
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

export async function scrapeAll() {
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeAll().then(res => { console.log('[Scraper] Done:', res); process.exit(0); });
}

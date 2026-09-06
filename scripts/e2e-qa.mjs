// Deterministic browser QA for the high-risk authenticated/mobile flows.
// API responses are intercepted so mutable production data and a real paid
// account are not required. Screenshots are written outside the repository.
//
// Usage:
//   npm run qa:e2e
//   npm run qa:e2e -- --url=http://127.0.0.1:4173
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { replaceControlledInputValue } from './controlled-input.mjs';
import { inspectHorizontalLayoutFault } from './mobile-layout-diagnostics.mjs';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const CHROMIUM_PATH = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
].find(candidate => candidate && existsSync(candidate));
if (!CHROMIUM_PATH) throw new Error('Chromium/Chrome executable is required for browser QA');

const BASE = (process.argv.find(arg => arg.startsWith('--url=')) || '--url=https://hearthpulse.net')
  .slice(6)
  .replace(/\/$/, '');
const BASE_ORIGIN = new URL(BASE).origin;
const OUT = process.env.QA_SCREENSHOT_DIR || `/tmp/hs-arena-qa-${process.getuid?.() ?? 'user'}`;
const responsiveInventory = JSON.parse(readFileSync(
  new URL('../config/responsive-route-fixtures.json', import.meta.url),
  'utf8',
));
const responsiveScope = (process.env.QA_RESPONSIVE_SCOPE || 'representative').trim();
const enforceResponsiveTargets = process.env.QA_RESPONSIVE_ENFORCE_TARGETS === '1';
if (!['off', 'representative', 'all-p0'].includes(responsiveScope)) {
  throw new Error(`QA_RESPONSIVE_SCOPE must be off, representative or all-p0; received ${responsiveScope}`);
}
const responsiveProfilesById = new Map(responsiveInventory.profiles.map(profile => [profile.id, profile]));
const defaultResponsiveProfiles = responsiveInventory.defaultProfiles.map(profileId => {
  const profile = responsiveProfilesById.get(profileId);
  if (!profile) throw new Error(`Responsive profile ${profileId} is missing`);
  return profile;
});
const responsiveViewportInput = (process.env.QA_RESPONSIVE_VIEWPORTS || '').trim();
const responsiveViewportTokens = responsiveViewportInput === ''
  ? []
  : responsiveViewportInput.split(',').map(value => value.trim());
if (responsiveViewportTokens.some(value => value.length === 0 || !/^\d+$/.test(value))) {
  throw new Error('QA_RESPONSIVE_VIEWPORTS must be a comma-separated list of non-empty integer widths');
}
const requestedResponsiveWidths = responsiveViewportTokens.map(Number);
if (new Set(requestedResponsiveWidths).size !== requestedResponsiveWidths.length) {
  throw new Error('QA_RESPONSIVE_VIEWPORTS must not contain duplicate widths');
}
const responsiveProfiles = requestedResponsiveWidths.length
  ? defaultResponsiveProfiles.filter(profile => requestedResponsiveWidths.includes(profile.width))
  : defaultResponsiveProfiles;
if (requestedResponsiveWidths.some(width => !defaultResponsiveProfiles.some(profile => profile.width === width))) {
  throw new Error(`QA_RESPONSIVE_VIEWPORTS contains an unknown width; expected ${defaultResponsiveProfiles.map(profile => profile.width).join(',')}`);
}
const responsiveTouchTargetRatchet = responsiveInventory.touchTargetRatchets?.[responsiveScope] ?? null;
if (responsiveTouchTargetRatchet) {
  if (!Number.isInteger(responsiveTouchTargetRatchet.total) || responsiveTouchTargetRatchet.total < 0) {
    throw new Error(`Responsive ${responsiveScope} touch-target total ratchet must be a non-negative integer`);
  }
  for (const profile of defaultResponsiveProfiles) {
    const maximum = responsiveTouchTargetRatchet.profiles?.[profile.id];
    if (!Number.isInteger(maximum) || maximum < 0) {
      throw new Error(`Responsive ${responsiveScope} touch-target ratchet is missing ${profile.id}`);
    }
  }
}
const scopedResponsiveFixtures = responsiveScope === 'off'
  ? []
  : responsiveInventory.fixtures.filter(fixture => responsiveScope === 'all-p0' || fixture.representative);
const responsiveFixtures = scopedResponsiveFixtures;
const localNotFoundDocument = responsiveFixtures.some(fixture => fixture.transport === 'nginx-html')
  && process.env.QA_PREVIEW_DIST_DIR
  ? readFileSync(`${process.env.QA_PREVIEW_DIST_DIR.replace(/\/$/, '')}/404.html`, 'utf8')
  : null;
const failures = [];
const qaCardImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560"%3E%3Crect width="400" height="560" rx="34" fill="%233b254b"/%3E%3Crect x="22" y="22" width="356" height="516" rx="26" fill="%23c49a55"/%3E%3Crect x="42" y="42" width="316" height="300" rx="18" fill="%236d1117"/%3E%3Ccircle cx="200" cy="188" r="92" fill="%23f0cf77"/%3E%3Cpath d="M145 235L200 105l55 130z" fill="%235b3470"/%3E%3Crect x="58" y="366" width="284" height="126" rx="18" fill="%23f7e8bf"/%3E%3Ctext x="200" y="420" text-anchor="middle" font-size="25" font-family="serif" font-weight="700" fill="%233d2a1e"%3EQA CARD%3C/text%3E%3Ctext x="200" y="458" text-anchor="middle" font-size="17" font-family="sans-serif" fill="%235c4938"%3EManacost%3C/text%3E%3C/svg%3E';
const qaCardGoldenImage = `${qaCardImage}#golden`;
const qaCard = {
  cardId: 'TIME_890',
  name: 'Медив Освященный',
  imageHa: qaCardGoldenImage,
  imageRu: qaCardImage,
};
const qaArticleCover = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1176" height="597" viewBox="0 0 1176 597"%3E%3Crect width="1176" height="597" fill="%236d1117"/%3E%3C/svg%3E';
const qaArticles = [
  { id: 'qa-article-1', title: 'Первая статья', date: '2026-07-11', tag: 'Арена', excerpt: 'Контрольная статья Арены.', mode: 'arena', image: qaArticleCover, url: '/articles/qa-1' },
  { id: 'qa-article-2', title: 'Вторая статья', date: '2026-07-10', tag: 'Общее', excerpt: 'Контрольный общий материал.', mode: 'general', image: qaArticleCover, url: '/articles/qa-2' },
];
const qaDeckCards = Array.from({ length: 17 }, (_, index) => ({
  id: `CARD_QA_${index + 1}`,
  dbfId: 1000 + index,
  name: `Контрольная карта ${index + 1}`,
  cost: index,
  rarity: index === 0 ? 'LEGENDARY' : index % 3 === 0 ? 'EPIC' : 'COMMON',
  elite: index === 0,
  count: index === 0 ? 1 : 2,
  image: index % 2 ? qaCard.imageRu : qaCard.imageHa,
  cardImage: qaCard.imageRu,
}));
const qaClasses = [
  ['paladin', 'Паладин', '#a88a45', 54.6],
  ['hunter', 'Охотник', '#1d5921', 52.6],
  ['mage', 'Маг', '#2b5c85', 51.8],
  ['priest', 'Жрец', '#d1d1d1', 50.9],
  ['death-knight', 'Рыцарь смерти', '#1f252d', 49.8],
  ['demon-hunter', 'Охотник на демонов', '#224722', 48.7],
  ['rogue', 'Разбойник', '#333333', 47.6],
  ['shaman', 'Шаман', '#2a2e6b', 46.5],
  ['warlock', 'Чернокнижник', '#5c265c', 45.4],
  ['druid', 'Друид', '#704a16', 44.3],
  ['warrior', 'Воин', '#7a1e1e', 43.2],
].map(([id, name, color, winrate], index) => ({ id, name, color, winrate, games: 1500 - index * 50 }));
const qaArchetypeItems = [
  ['qa-evenlock', 'Evenlock', 'Чётный Чернокнижник', 'warlock', 6476, 61.1, 5.9, 14],
  ['qa-painlock', 'Painlock', 'Пейнлок', 'warlock', 536, 60.4, 0.5, 7],
  ['qa-handbuff-warrior', 'Handbuff Warrior', 'Воин на усилениях', 'warrior', 136, 58.1, 0.1, 5],
  ['qa-mug-shaman', 'Mug Shaman', 'Кружечный Шаман', 'shaman', 3736, 56.8, 3.4, 9],
  ['qa-face-hunter', 'Face Hunter', 'Фейс Охотник', 'hunter', 2980, 55.3, 2.7, 8],
].map(([slug, archetype, archetypeLabel, classKey, games, winrate, popularity, deckCount]) => ({
  slug,
  archetype,
  archetypeLabel,
  translated: true,
  classKey,
  format: 'standard',
  games,
  winrate,
  popularity,
  turns: 6.2,
  durationMinutes: 5.3,
  climbingSpeed: 2.49,
  deckCount,
  builds: [],
  sourceUrl: `https://www.hsguru.com/archetype/${archetype}`,
}));
const qaArchetypeBuilds = Array.from({ length: 14 }, (_, index) => ({
  deckCode: `AAECAf0GQaFixtureArchetypeDeckCode${index + 1}ForBrowserQualityAssurance==`,
  games: 1200 - index * 45,
  winrate: 61.1 - index * 0.3,
  sourceUrl: `https://www.hsguru.com/deck/${index + 1}`,
  updatedAt: '2026-07-24T00:00:00.000Z',
  classKey: 'warlock',
  sampleRank: 'all',
  samplePeriod: 'past_30_days',
}));
const qaArchetypeCatalog = {
  format: 'standard',
  formatLabel: 'Стандарт',
  patch: '36.0.3',
  minimumGames: 50,
  updatedAt: '2026-07-24T00:00:00.000Z',
  coverage: { archetypes: qaArchetypeItems.length, builds: 43 },
  items: qaArchetypeItems,
};
const qaArchetypeDetail = {
  format: 'standard',
  formatLabel: 'Стандарт',
  patch: '36.0.3',
  minimumGames: 50,
  updatedAt: '2026-07-24T00:00:00.000Z',
  item: { ...qaArchetypeItems[0], builds: qaArchetypeBuilds },
  history: Array.from({ length: 4 }, (_, index) => ({
    recordedAt: `2026-07-${String(21 + index).padStart(2, '0')}T00:00:00.000Z`,
    games: 5900 + index * 192,
    winrate: 59.9 + index * 0.4,
    popularity: 5.3 + index * 0.2,
    turns: 6.2,
    durationMinutes: 5.3,
    climbingSpeed: 2.49,
  })),
};
const fixtures = {
  '/api/home/summary': {
    topClasses: qaClasses.slice(0, 3),
    topCards: [{ ...qaCard, score: 100, rarity: 'legendary', tier: 'S', classKey: 'any', cost: 10 }],
    topLegendaries: [{ ...qaCard, winRate: 59.5, classKey: 'priest', cost: 10 }],
    battlegroundSpotlight: null,
    updatedAt: {
      winrates: '2026-07-11T00:00:00.000Z',
      tierlist: '2026-07-11T00:00:00.000Z',
      legendaries: '2026-07-11T00:00:00.000Z',
      battlegrounds: '2026-07-11T00:00:00.000Z',
    },
    sources: { winrates: 'qa-fixture', tierlist: 'qa-fixture', legendaries: 'qa-fixture' },
  },
  '/api/winrates': {
    classes: qaClasses,
    updatedAt: '2026-07-11T00:00:00.000Z',
    source: 'qa-fixture',
  },
  '/api/tierlist': {
    sections: [{
      id: 'any',
      name: 'Нейтральные',
      color: '#4a4a4a',
      tiers: [{
        tier: 'S',
        label: 'Отлично',
        description: 'Контрольный тир.',
        cards: [{ ...qaCard, score: 100, winrate: 59.5, rarity: 'legendary', classKey: 'any' }],
      }],
    }, ...qaClasses.map(cls => ({ ...cls, tiers: [], totalCards: 0 }))],
    cards: {
      TIME_890: { cost: 10, attack: 7, health: 7, type: 'minion', rarity: 'legendary', imageHa: qaCard.imageHa, imageRu: qaCard.imageRu },
    },
    updatedAt: '2026-07-11T00:00:00.000Z',
    source: 'qa-fixture',
  },
  '/api/legendaries': {
    groups: [
      { keyCard: qaCard, cards: [], winRate: 66.3, classKey: 'priest' },
      { keyCard: { ...qaCard, cardId: 'TIME_890_BLUE', name: 'Медив Освященный II' }, cards: [], winRate: 55.2, classKey: 'mage' },
      { keyCard: { ...qaCard, cardId: 'TIME_890_RED', name: 'Медив Освященный III' }, cards: [], winRate: 42.1, classKey: 'warrior' },
    ],
    updatedAt: '2026-07-11T00:00:00.000Z',
    source: 'qa-fixture',
  },
  '/api/bg/tier-lists': {
    list: 'spells',
    source: 'qa-fixture',
    fetchedAt: '2026-07-11T00:00:00.000Z',
    count: 0,
    tierCounts: {},
    tiers: {},
  },
  '/api/bg/heroes': {
    ok: true,
    source_id: 'qa-heroes',
    fetched_at: '2026-07-11T00:00:00.000Z',
    view: {
      heroes: [{
        tier: 'S', hero: 'Контрольный герой', dbfId: 9001,
        avg_placement: 3.72, pick_rate: '12,4%', placement_distribution: ['18%', '16%', '14%', '13%', '12%', '10%', '9%', '8%'],
        image: qaCard.imageRu,
        hero_power: { card: { dbf: 9002, name: 'Контрольная сила героя', text: 'Даёт преимущество.', image: qaCard.imageRu } },
      }, {
        tier: 'S', hero: 'Повелитель кошмаров Ксавий', dbfId: 132608,
        avg_placement: 3.58, pick_rate: '88,64%', image: qaCard.imageRu,
      }, {
        tier: 'C', hero: "Трас'тат, паразит душ", dbfId: 132578,
        avg_placement: 4.37, pick_rate: '74,02%', image: qaCard.imageRu,
      }, ...Array.from({ length: 90 }, (_, index) => ({
        tier: ['A', 'B', 'C', 'D'][index % 4],
        hero: `Контрольный герой пула ${index + 1}`,
        dbfId: 9100 + index,
        avg_placement: 3.8 + (index % 10) / 10,
        pick_rate: '10,00%',
        image: qaCard.imageRu,
      }))],
    },
  },
  '/api/bg/heroes/9001/details': {
    ok: true,
    fetched_at: '2026-07-11T00:00:00.000Z',
    stats: {
      hero: {
        hero: 'Контрольный герой', dbfId: 9001, tier: 'S', avg_placement: 3.72, pick_rate: '12,4%',
        best_composition: 'Звери', placement_distribution: ['18%', '16%', '14%', '13%', '12%', '10%', '9%', '8%'],
      },
      as_of: { hero: '2026-07-11T00:00:00.000Z' },
      compositions: [{ name: 'Звери', avg_placement: 3.4, popularity: '11%', num_games: 120 }],
      best_composition: { name: 'Звери', final_form_minions: [] },
      hero_power: [{ turn: 3, tavern_tier: 2, gold: 6, invoked_rate: 61, times_invoked: 90, total_data_points: 120 }],
      hero_power_by_turn: [{ turn: 3, invoked_rate: 61, total_data_points: 120 }, { turn: 4, invoked_rate: 72, total_data_points: 110 }],
      tavern_up_by_turn: [{ turn: 3, recommended_tavern_tier: 2, pct_at_tier: 64 }],
      tavern_up: [{ turn: 3, tavern_tier: 2, pct_at_tier: 64 }],
      source_url: 'https://hsreplay.net/battlegrounds/heroes/',
    },
    libraryHero: {
      name: { ru: 'Контрольный герой', en: 'QA Hero' },
      images: { hero: qaCard.imageRu, full_art: qaCard.imageRu },
      hero_power: { card: { dbf: 9002, name: 'Контрольная сила героя', text: { ru: 'Даёт преимущество.' }, image: qaCard.imageRu } },
      armor: { normal: 10, duos: 8 },
      updated_at: '2026-07-11T00:00:00.000Z',
    },
    cards: {},
  },
  '/api/bg/library/extra/heroes': {
    data: [{
      card_id: 'BG_HERO_QA_9001',
      dbf: 9001,
      name: { ru: 'Контрольный герой', en: 'QA Hero' },
      images: { hero: qaCard.imageRu, full_art: qaCard.imageRu },
      hero_power: {
        card: {
          dbf: 9002,
          name: 'Контрольная сила героя',
          text: 'Даёт преимущество.',
          image: qaCard.imageRu,
        },
      },
      armor: { normal: 10, duos: 8 },
      updated_at: '2026-07-11T00:00:00.000Z',
    }, {
      card_id: 'BG36_HERO_105',
      dbf: 132608,
      name: { ru: 'Повелитель кошмаров Ксавий', en: 'Nightmare Lord Xavius' },
      images: { hero: qaCard.imageRu, full_art: qaCard.imageRu },
      updated_at: '2026-08-04T00:00:00.000Z',
    }, {
      card_id: 'BG36_HERO_101',
      dbf: 132578,
      name: { ru: "Трас'тат, паразит душ", en: "Tras'tath, Soul Parasite" },
      images: { hero: qaCard.imageRu, full_art: qaCard.imageRu },
      updated_at: '2026-08-04T00:00:00.000Z',
    }],
    pagination: { page: 1, perPage: 200, total: 3, totalPages: 1 },
  },
  '/api/bg/library/meta': {
    creature_types: [{ slug: 'beast', name_ru: 'Зверь' }],
    mechanics: [{ slug: 'battlecry', name_ru: 'Боевой клич' }],
  },
  '/api/bg/library/cards': {
    data: [{
      card_id: 'BG_QA_1', dbf: 9101, card_type: { slug: 'minion', name_ru: 'Существо' },
      name: { ru: 'Контрольное существо', en: 'QA Minion' }, tavern_tier: 3,
      creature_type: { slug: 'beast', name_ru: 'Зверь' }, attack: 4, health: 5, in_pool: true,
      mechanics: [{ slug: 'battlecry', name_ru: 'Боевой клич' }], text: { ru: 'Боевой клич: получите преимущество.' },
      images: { card: qaCard.imageRu, golden: qaCard.imageRu, art: qaCard.imageRu },
      source: 'qa-fixture', updated_at: '2026-07-11T00:00:00.000Z',
    }],
  },
  '/api/bg/library/cards/by-dbf/9101': {
    card_id: 'BG_QA_1', dbf: 9101, card_type: { slug: 'minion', name_ru: 'Существо' },
    name: { ru: 'Контрольное существо', en: 'QA Minion' }, tavern_tier: 3,
    creature_type: { slug: 'beast', name_ru: 'Зверь' }, attack: 4, health: 5, in_pool: true,
    mechanics: [{ slug: 'battlecry', name_ru: 'Боевой клич' }], text: { ru: 'Боевой клич: получите преимущество.' },
    images: { card: qaCard.imageRu, golden: qaCard.imageRu, art: qaCard.imageRu },
    source: 'qa-fixture', updated_at: '2026-07-11T00:00:00.000Z',
  },
  '/api/bg/library/minions/9101': {
    dbf_id: 9101, card_id: 'BG_QA_1', name: 'QA Minion', name_ru: 'Контрольное существо', tavern_tier: 3,
    impact: 0.42, combat_winrate: 55.1, popularity: 12.4, games_with_minion: 200, games_without_minion: 800,
    avg_placement_with: 3.7, avg_placement_without: 4.2,
    rounds: [
      { combat_round: 8, games_with_minion: 90, games_without_minion: 300, avg_placement_with: 3.9, avg_placement_without: 4.3, impact: 0.4, combat_winrate: 54, wins: 49, losses: 41 },
      { combat_round: 9, games_with_minion: 110, games_without_minion: 500, avg_placement_with: 3.6, avg_placement_without: 4.1, impact: 0.5, combat_winrate: 56, wins: 62, losses: 48 },
    ],
  },
  '/api/standard/matchups': {
    format: 'standard', formatLabel: 'Стандарт',
    rank: 'legend', rankLabel: 'Легенда', source: 'hsguru', updatedAt: '2026-07-11T00:00:00.000Z',
    columns: [
      { name: 'Control Warrior', label: 'Контроль Воин', popularity: '12,4%' },
      { name: 'Rainbow Mage', label: 'Радужный Маг', popularity: '9,8%' },
    ],
    rows: [
      { archetype: 'Control Warrior', archetypeLabel: 'Контроль Воин', winrate: 52.4, cells: [{ opponent: 'Control Warrior', opponentLabel: 'Контроль Воин', winrate: 50 }, { opponent: 'Rainbow Mage', opponentLabel: 'Радужный Маг', winrate: 54.8 }] },
      { archetype: 'Rainbow Mage', archetypeLabel: 'Радужный Маг', winrate: 49.6, cells: [{ opponent: 'Control Warrior', opponentLabel: 'Контроль Воин', winrate: 45.2 }, { opponent: 'Rainbow Mage', opponentLabel: 'Радужный Маг', winrate: 50 }] },
    ],
  },
  '/api/guides-archive': {
    page: 1,
    limit: 18,
    total: 1,
    totalPages: 1,
    items: [{
      id: 1,
      slug: 'qa-guide',
      title: 'Контрольный гайд Арены',
      description: 'Детерминированная запись для проверки адаптивного архива.',
      image: null,
      publishedAt: '2026-07-11T00:00:00.000Z',
      menuName: 'Арена',
      menuCode: 'arena',
      kind: 'Гайд',
      kindSlug: 'guide',
      oldUrl: 'https://old.kolodahearthstone.ru/qa-guide',
    }],
    filters: {
      kinds: [{ slug: 'guide', label: 'Гайд', count: 1 }],
      menus: [{ slug: 'arena', label: 'Арена', count: 1 }],
    },
  },
  '/api/articles': {
    articles: qaArticles,
  },
  '/api/search': {
    query: 'контроль',
    minimumQueryLength: 2,
    articles: [{
      id: 'qa-search-article', title: 'Контрольный мета-отчет', excerpt: 'Проверка поиска.', tag: 'Мета-отчет',
      mode: 'standard', date: '2026-07-18', url: 'https://kolodahearthstone.com/qa-vip/', image: qaArticleCover, vip: true,
    }],
    cards: [{
      id: 'CARD_QA_1', name: 'Контрольная карта', nameEn: 'QA Card', text: 'Боевой клич.', image: qaCard.imageRu,
      mana: 1, className: 'MAGE', cardType: 'Существо', formats: ['standard', 'wild'], path: '/standard/cards/standard/CARD_QA_1',
    }],
  },
};
const subscriber = {
  hasAccess: true,
  source: 'qa-fixture',
  checkedAt: new Date().toISOString(),
  stale: false,
  message: 'Deterministic browser QA subscriber',
  entitlements: {
    arena: true,
    battlegrounds: true,
    standard: true,
    contests: true,
    guidesArchive: true,
    arenaArticles: true,
    battlegroundsArticles: true,
  },
  boosty: { checked: true, found: true, hasAccess: true },
  telegram: { checked: false, hasAccess: false },
};
const adminFixtures = {
  '/api/articles': { articles: qaArticles },
  '/api/admin/constructed-cards': {
    format: 'standard', rank: 'legend', timeRange: '1d', updatedAt: '2026-07-16T05:03:02.000Z', sourceUrl: 'https://hsreplay.net/cards/',
    statsAccess: true,
    mechanicTranslations: { BATTLECRY: 'Боевой клич', TAUNT: 'Провокация' },
    cards: Array.from({ length: 8 }, (_, index) => ({
      card_id: `CARD_QA_${index + 1}`, dbf: 9000 + index, name: { ru: `Контрольная карта ${index + 1}`, en: `QA Card ${index + 1}` },
      card_set: index % 2 ? 'CATACLYSM' : 'ESCAPEFROM_VIOLET_HOLD', card_type: { slug: index % 2 ? 'MINION' : 'SPELL', name_ru: index % 2 ? 'Существо' : 'Заклинание' },
      class: index % 2 ? 'MAGE' : 'WARRIOR', multi_class: [], rarity: index % 3 ? 'RARE' : 'LEGENDARY',
      mana_cost: index + 1, attack: index % 2 ? index + 1 : null, health: index % 2 ? index + 2 : null,
      mechanics: index % 2 ? ['BATTLECRY'] : [], referenced_tags: index % 2 ? ['TAUNT'] : [],
      images: { card: qaCard.imageRu, crop: qaCard.imageRu },
      stats: index === 7 ? null : {
        deckPopularity: 18.4 - index, deckWinrate: 56.2 - index * 0.4, averageCopies: 1.7, timesPlayed: 12400 - index * 800,
        winrateWhenPlayed: 55.8, winrateWhenDrawn: 54.6, keepPercentage: 42.1, openingHandWinrate: 53.2,
        averageTurnsInHand: 2.1, averageTurnPlayed: 4.4,
      },
    })),
    facets: { classes: ['MAGE', 'WARRIOR'], sets: ['CATACLYSM', 'ESCAPEFROM_VIOLET_HOLD'], mechanics: ['BATTLECRY', 'TAUNT'], types: ['MINION', 'SPELL'], rarities: ['LEGENDARY', 'RARE'] },
    facetCounts: {
      classes: [{ value: 'MAGE', count: 4 }, { value: 'WARRIOR', count: 4 }],
      sets: [{ value: 'CATACLYSM', count: 4 }, { value: 'ESCAPEFROM_VIOLET_HOLD', count: 4 }],
      mechanics: [{ value: 'BATTLECRY', count: 4 }, { value: 'TAUNT', count: 4 }],
      types: [{ value: 'MINION', count: 4 }, { value: 'SPELL', count: 4 }],
      rarities: [{ value: 'LEGENDARY', count: 3 }, { value: 'RARE', count: 5 }],
    },
    coverage: { totalCards: 1152, cardsWithStats: 1013, cardsWithoutStats: 139, totalSets: 7 },
    pagination: { page: 1, perPage: 60, total: 8, totalPages: 1 },
  },
  '/api/admin/constructed-cards/CARD_QA_1': {
    format: 'standard', rank: 'legend', statsAccess: true, mechanicTranslations: { BATTLECRY: 'Боевой клич', TAUNT: 'Провокация' },
    card: {
      card_id: 'CARD_QA_1', dbf: 9000, name: { ru: 'Контрольная карта 1', en: 'QA Card 1' },
      text: { ru: '<b>Боевой клич:</b> возьмите карту.' }, flavor: { ru: 'Контрольный художественный текст.' },
      card_set: 'ESCAPEFROM_VIOLET_HOLD', card_type: { slug: 'SPELL', name_ru: 'Заклинание' }, class: 'WARRIOR', multi_class: [], rarity: 'LEGENDARY',
      mana_cost: 1, attack: null, health: null, artist: 'QA Artist', mechanics: ['BATTLECRY', 'Battlecry'], referenced_tags: ['TAUNT'],
      images: { card: qaCard.imageRu, golden: null, signature: null, diamond: null, crop: '/arena-logo-icon.webp?v=arena-legacy-20260629' },
      statsUpdatedAt: '2026-07-16T05:03:02.000Z', statsSourceUrl: 'https://hsreplay.net/cards/',
      stats: { deckPopularity: 18.4, deckWinrate: 56.2, averageCopies: 1.7, timesPlayed: 12400, winrateWhenPlayed: 55.8, winrateWhenDrawn: 54.6, keepPercentage: 42.1, openingHandWinrate: 53.2, averageTurnsInHand: 2.1, averageTurnPlayed: 4.4 },
      wiki_page: { title: 'QA Card 1', url: 'https://example.test/wiki' },
      wiki: {
        golden_cards: [{ label: 'Golden', file_url: qaCard.imageHa }],
        wiki_mechanics: ['Battlecry', 'Draw cards'], wiki_tags: ['Hand-related'],
        patch_changes: [{ heading: 'Card changes', entries: [
          { date: '2025-02-01', patch: 'Patch 35.0', items: ['Changed.'], manacost_title: 'Обновление 35.0: контрольный патч', manacost_url: 'https://hs-manacost.ru/qa-patch-35/', manacost_published_at: '2025-02-01T12:00:00', manacost_summary: 'Русское описание контрольного обновления.' },
          { date: '2024-01-10', patch: 'Patch 34.0', items: ['Added.'], manacost_title: 'Обновление 34.0: ранний патч', manacost_url: 'https://hs-manacost.ru/qa-patch-34/', manacost_published_at: '2024-01-10T12:00:00', manacost_summary: 'Более раннее русское описание.' },
        ] }],
        related_cards: [{}, { card_id: 'CARD_QA_2', name_ru: 'Контрольная карта 2', image_url: qaCard.imageRu }],
        generated_card_pools: [{
          pool: 'Fire spells',
          card_ids: ['CARD_QA_2', 'CARD_QA_TOKEN'],
          cards: Array.from({ length: 12 }, (_, index) => index === 0
            ? { card_id: 'CARD_QA_2', name: { ru: 'Контрольная карта 2', en: 'QA Card 2' }, image_url: qaCard.imageRu, can_open: true }
            : { card_id: `CARD_QA_TOKEN_${index}`, name: { ru: `Контрольный токен ${index}`, en: `QA Token ${index}` }, image_url: qaCard.imageHa, url: `https://example.test/token-${index}`, can_open: false }),
        }],
        gallery: [{ caption: 'QA full art', file_url: '/wallpaper/arena-parchment.jpg', thumb_url: '/wallpaper/arena-parchment.jpg' }],
        sounds: [],
        external_links: [{ label: 'HSReplay.net', url: 'https://example.test/hsreplay' }],
      },
      related_cards_localized: [
        {
          heading: { ru: 'Варианты задания', en: 'Quest variants' },
          cards: [
            {
              card_id: 'CARD_QA_TOKEN_1', name: { ru: 'Первый этап', en: 'First Step' },
              text: { ru: 'Сыграйте контрольную карту.' }, mana_cost: 1, artist: 'QA Wiki Artist',
              images: {
                card: qaCard.imageRu, art: '/wallpaper/profile-hero-hth.jpg', crop: '/arena-logo-icon-256.webp',
                art_metadata: { file_page_url: 'https://example.test/wiki/file/shared', width: 3000, height: 4000, sha1: 'qa-shared-wiki-art' },
              },
              relationship: { wiki_url: 'https://example.test/wiki/token-1' },
            },
            {
              card_id: 'CARD_QA_TOKEN_2', name: { ru: 'Второй этап', en: 'Second Step' },
              text: { ru: 'Сыграйте ещё одну контрольную карту.' }, mana_cost: 2,
              images: {
                card: qaCard.imageHa, art: '/wallpaper/profile-hero-hth.jpg',
                art_metadata: { width: 3000, height: 4000, sha1: 'qa-shared-wiki-art' },
              },
              relationship: { wiki_url: 'https://example.test/wiki/token-2' },
            },
          ],
        },
        {
          heading: { ru: 'Награды', en: 'Rewards' },
          cards: [
            {
              card_id: 'CARD_QA_REWARD', name: { ru: 'Контрольная награда', en: 'QA Reward' },
              text: { ru: 'Получите контрольную награду.' }, mana_cost: 5, attack: 7, health: 7,
              images: {
                card: qaCard.imageRu, art: '/wallpaper/home-paladin-hero.webp',
                art_metadata: { file_page_url: 'https://example.test/wiki/file/reward', width: 3543, height: 4724, sha1: 'qa-reward-wiki-art' },
              },
              relationship: { wiki_url: 'https://example.test/wiki/reward' },
            },
            {
              card_id: 'CARD_QA_MISSING_ART', name: { ru: 'Карта без полного арта', en: 'Missing Full Art' },
              images: { card: qaCard.imageHa, crop: '/arena-logo-icon-256.webp' },
              relationship: { wiki_url: 'https://example.test/wiki/missing-art' },
            },
          ],
        },
      ],
      decks: Array.from({ length: 7 }, (_, index) => ({
        id: `qa-deck-${index + 1}`,
        title: `Контрольная колода ${index + 1}`,
        archetype: index % 2 ? 'Face Hunter' : 'Control Warrior',
        archetypeLabel: index % 2 ? 'Фейс Охотник' : 'Контроль Воин',
        className: index % 2 ? 'Hunter' : 'Warrior',
        deckCode: `AAECAQaFixtureDeckCode${index + 1}ForBrowserQualityAssurance1234567890==`,
        source: 'qa-fixture', sourceUrl: '', winrate: 55.4 - index, score: `${18 - index}-${8 + index}`,
        updatedAt: `2026-07-${String(16 - index).padStart(2, '0')}T12:00:00.000Z`,
      })),
    },
  },
  '/api/admin/standard-meta': {
    format: 'standard',
    formatLabel: 'Стандарт',
    rank: 'legend',
    rankLabel: 'Легенда',
    period: 'past_day',
    availablePeriods: ['past_day', 'past_3_days', 'past_week', 'past_2_weeks', 'patch_36.0.3', 'violet_hold'],
    currentPatchPeriod: 'patch_36.0.3',
    source: 'qa-fixture',
    sourceUrl: '',
    translationSource: 'qa-fixture',
    updatedAt: '2026-07-11T00:00:00.000Z',
    items: [
      {
        id: 'qa-evenlock', slug: 'qa-evenlock', archetype: 'Evenlock', archetypeLabel: 'Чётный Чернокнижник', translated: true,
        classKey: 'warlock', winrate: 61.1, popularity: 5.9, games: 6476, turns: 6.2,
        durationMinutes: 5.3, climbingSpeed: 2.49,
      },
      {
        id: 'qa-painlock', slug: 'qa-painlock', archetype: 'Painlock', archetypeLabel: 'Пейнлок', translated: true,
        classKey: 'warlock', winrate: 60.4, popularity: 0.5, games: 536, turns: 6.7,
        durationMinutes: 5.9, climbingSpeed: 2.11,
      },
      {
        id: 'qa-handbuff-warrior', slug: 'qa-handbuff-warrior', archetype: 'Handbuff Warrior', archetypeLabel: 'Воин на усилениях', translated: true,
        classKey: 'warrior', winrate: 58.1, popularity: 0.1, games: 136, turns: 4.6,
        durationMinutes: 3.7, climbingSpeed: 2.63,
      },
      {
        id: 'qa-mug-shaman', slug: 'qa-mug-shaman', archetype: 'Mug Shaman', archetypeLabel: 'Кружечный Шаман', translated: true,
        classKey: 'shaman', winrate: 56.8, popularity: 3.4, games: 3736, turns: 7.2,
        durationMinutes: 6.4, climbingSpeed: 1.2,
      },
      {
        id: 'qa-face-hunter', slug: 'qa-face-hunter', archetype: 'Face Hunter', archetypeLabel: 'Фейс Охотник', translated: true,
        classKey: 'hunter', winrate: 55.3, popularity: 2.7, games: 2980, turns: 6.8,
        durationMinutes: 6.1, climbingSpeed: 0.9,
      },
    ],
  },
  '/api/admin/vicious-syndicate-gold': {
    title: 'Vicious Syndicate Gold',
    format: 'Standard',
    games: 355561,
    source: 'Vicious Syndicate Live',
    sourceUrl: 'https://www.vicioussyndicate.com/',
    updatedAt: '2026-07-13T00:00:00.000Z',
    minimumDeckFrequency: 0.5,
    buildCoverage: { found: 2, total: 2 },
    classDistribution: [
      { class: 'warlock', classLabel: 'Чернокнижник', classIcon: 'warlock', frequency: 18.4 },
      { class: 'shaman', classLabel: 'Шаман', classIcon: 'shaman', frequency: 13.8 },
    ],
    deckDistribution: [{
      class: 'warlock', classLabel: 'Чернокнижник', classIcon: 'warlock', frequency: 7.36,
      deck: 'Painlock', deckLabel: 'Пейнлок',
      build: {
        deckCode: 'AAECAf0GQaFixtureViciousDeckCodeForBrowserQualityAssurance123456==',
        source: 'qa-fixture', sourceLabel: 'QA fixture', sourceUrl: '', matchedArchetype: 'Painlock',
        matchMethod: 'exact', updatedAt: '2026-07-13T00:00:00.000Z', winrate: 55.2, sampleGames: 900,
        deckCards: qaDeckCards,
      },
    }],
    tierList: [{
      rankBracket: 'All ranks', rankLabel: 'Все ранги',
      decks: [{
        rank: 1, class: 'warlock', classLabel: 'Чернокнижник', classIcon: 'warlock', winrate: 55.2,
        deck: 'Painlock', deckLabel: 'Пейнлок',
        build: {
          deckCode: 'AAECAf0GQaFixtureViciousDeckCodeForBrowserQualityAssurance123456==',
          source: 'qa-fixture', sourceLabel: 'QA fixture', sourceUrl: '', matchedArchetype: 'Painlock',
          matchMethod: 'exact', updatedAt: '2026-07-13T00:00:00.000Z', winrate: 55.2, sampleGames: 900,
          deckCards: qaDeckCards,
        },
      }],
    }],
  },
  '/api/admin/vicious-syndicate-gold/builds': {
    builds: [{
      deck: 'Painlock',
      build: {
        deckCode: 'AAECAf0GQaFixtureViciousDeckCodeForBrowserQualityAssurance123456==',
        source: 'qa-fixture', sourceLabel: 'QA fixture', sourceUrl: '', matchedArchetype: 'Painlock',
        matchMethod: 'exact', updatedAt: '2026-07-13T00:00:00.000Z', winrate: 55.2, sampleGames: 900,
        deckCards: qaDeckCards,
      },
    }],
    buildCoverage: { found: 1, total: 1 },
  },
  '/api/admin/contests': {
    contests: [{
      id: 'qa-contest',
      title: 'Контрольный конкурс',
      description: 'Детерминированный конкурс для browser QA.',
      prize: 'Приз',
      imageUrl: '',
      startsAt: '2026-07-11T00:00:00.000Z',
      endsAt: '2026-07-20T00:00:00.000Z',
      status: 'active',
      winners: [],
      entriesCount: 3,
    }],
  },
  '/api/admin/contests/qa-contest/entries': {
    entries: [
      {
        id: 'entry-qa-1', contestId: 'qa-contest', userId: 'user-qa-1', profileId: 'PROFILE-001', name: 'Одобренный участник',
        email: 'winner@example.test', status: 'approved', createdAt: '2026-07-11T01:00:00.000Z',
        contact: { telegram: '@winner' }, subscription: { hasAccess: true }, profileContacts: { vk: 'vk.com/winner', telegram: '@winner' },
      },
      {
        id: 'entry-qa-2', contestId: 'qa-contest', userId: 'user-qa-2', profileId: 'PROFILE-002', name: 'Участник на проверке',
        email: 'pending@example.test', status: 'pending', createdAt: '2026-07-11T02:00:00.000Z',
        contact: {}, subscription: { hasAccess: true }, profileContacts: {},
      },
    ],
  },
  '/api/admin/gallery': {
    items: [{
      id: 'qa-art',
      title: 'Контрольный арт',
      description: 'Детерминированный арт для browser QA.',
      tag: 'QA',
      source: 'fixture',
      width: 1920,
      height: 1080,
      bytes: 125000,
      previewUrl: '/favicon-192.png',
      thumbUrl: '/favicon-192.png',
      imageUrl: '/favicon-192.png',
      downloadUrl: '/favicon-192.png',
      createdAt: '2026-07-11T00:00:00.000Z',
    }],
  },
  '/api/admin/referrals': {
    referrals: [{
      id: 'qa-referral',
      slug: 'qa-campaign',
      label: 'QA campaign',
      campaign: 'qa',
      targetPath: '/',
      status: 'active',
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z',
      url: 'https://hearthpulse.net/r/qa-campaign',
      clicks: 7,
      uniqueClicks: 5,
      lastClickAt: '2026-07-11T00:00:00.000Z',
    }],
    recentClicks: [],
  },
  '/api/admin/archetype-translations': {
    items: [
      {
        id: 1, blizzcoreId: 11, nameEn: 'Control Warrior', nameRu: 'Контроль Воин', source: 'blizzcore',
        createdAt: '2026-07-11T00:00:00.000Z', updatedAt: '2026-07-11T00:00:00.000Z',
        syncedAt: '2026-07-11T00:00:00.000Z', updatedBy: 'system',
      },
      {
        id: 2, blizzcoreId: null, nameEn: 'Rainbow Mage', nameRu: 'Радужный Маг', source: 'manual',
        createdAt: '2026-07-11T00:00:00.000Z', updatedAt: '2026-07-11T00:00:00.000Z',
        syncedAt: null, updatedBy: 'qa-admin',
      },
    ],
  },
  '/api/admin/mechanic-translations': {
    items: [
      { key: 'BATTLECRY', nameEn: 'Battlecry', nameRu: 'Боевой клич', source: 'default', kind: 'mechanic', cardCount: 412, updatedAt: null, example: { cardId: 'CARD_QA_2', name: { ru: 'Контрольная карта 2', en: 'QA Card 2' }, imageUrl: qaCard.imageRu, type: 'MINION' } },
      { key: 'NEW_MECHANIC', nameEn: 'New Mechanic', nameRu: '', source: 'missing', kind: 'tag', cardCount: 7, updatedAt: null, example: { cardId: 'CARD_QA_4', name: { ru: 'Контрольная карта 4', en: 'QA Card 4' }, imageUrl: qaCard.imageRu, type: 'MINION' } },
    ],
  },
  '/api/admin/standard-operations': {
    generatedAt: '2026-07-16T12:00:00.000Z',
    publicRoutes: ['/standard/cards'],
    diamondRoutes: ['/standard/matchups', '/standard/meta', '/standard/vicious-gold'],
    caches: { meta: { entries: 8, fresh: 8 }, viciousGold: { entries: 1, fresh: 1 }, recommendations: { entries: 24, active: 0 }, previews: { entries: 19, activeJobs: 0 } },
    deckView: { queued: 0, active: 0, succeeded: 31, failed: 1, timeoutMs: 30000 },
    sources: {
      viciousSyndicate: 'vicious-syndicate-live-standard',
      cardStatistics: {
        standard: { legend: { '1d': 'cards-standard-legend-1d', '3d': 'cards-standard-legend-3d' } },
        wild: { legend: { '1d': 'cards-wild-legend-1d' } },
      },
      renderApi: 'http://127.0.0.1:5000/deckview-api/v1',
    },
  },
  '/api/admin/parser-control': {
    revision: 3,
    generated_at: '2026-07-21T01:00:00.000Z',
    policy: {
      mode: 'stable', effective_mode: 'stable', early_until: null, reason: '',
      updated_at: '2026-07-21T00:30:00.000Z', updated_by: 'qa-admin', managed_by: 'admin',
    },
    sections: {
      standard: {
        group: 'traditional', label: 'Стандарт', description: 'Мета, матчапы и карты', enabled: true, status: 'healthy',
        last_success_at: '2026-07-21T00:00:00.000Z', schedule: 'каждые 5 часов',
        sources: [{
          source_id: 'vicious_syndicate_live', label: 'Vicious Syndicate Live', enabled: true,
          supports_early: true, can_run_manually: true, health: 'healthy',
          last_success_at: '2026-07-21T00:00:00.000Z', published_fetched_at: '2026-07-21T00:00:00.000Z',
          candidate_fetched_at: '2026-07-21T00:00:00.000Z', publication_channel: 'stable',
          stable_baseline_available: true, item_count: 128, state: 'ready',
        }],
      },
      arena: {
        group: 'arena', label: 'Арена', description: 'Тир-листы и винрейты', enabled: true, status: 'healthy',
        last_success_at: '2026-07-21T00:00:00.000Z', schedule: 'каждые 5 часов',
        sources: [{
          source_id: 'hsreplay_arena', label: 'HSReplay Arena', enabled: true,
          supports_early: true, can_run_manually: true, health: 'healthy',
          last_success_at: '2026-07-21T00:00:00.000Z', published_fetched_at: '2026-07-21T00:00:00.000Z',
          candidate_fetched_at: '2026-07-21T00:00:00.000Z', publication_channel: 'stable',
          stable_baseline_available: true, item_count: 731, state: 'ready',
        }],
      },
    },
    scheduleInventory: {
      schemaVersion: 2,
      inventoryVersion: '2026-07-21.2',
      generatedAt: '2026-07-21T01:00:00.000Z',
      timeSemantics: 'runtime',
      runtimeTimerStateIncluded: true,
      runtimeTimerState: {
        provider: 'host-systemd', checkedAt: '2026-07-21T01:00:00.000Z',
        available: true, status: 'ok', timingAvailable: true,
      },
      schedules: [{
        id: 'refresh-post-patch-tierlists',
        label: 'Каждые 5 часов с 21 по 27 июля 2026 года',
        systemdUnit: 'hs-data-api-docker-refresh-post-patch-tierlists.timer',
        onCalendar: [
          '2026-07-21 00,05,10,15,20:20:00 Europe/Warsaw',
          '2026-07-22 01,06,11,16,21:20:00 Europe/Warsaw',
        ],
        timezone: 'Europe/Warsaw',
        sourceIds: ['firestone_arena_cards_normal', 'heartharena_tierlist', 'hsreplay_arena_cards_advanced'],
        sectionIds: ['arena'],
        nominalNextRunAt: '2026-07-21T03:20:00+00:00',
        nextRunAt: '2026-07-21T03:21:00+00:00',
        nextRunAtSource: 'runtime',
        runtimeStateAvailable: true,
        enabled: true,
        active: true,
        lastRunAt: '2026-07-20T22:20:00+00:00',
        failure: null,
        loadState: 'loaded',
        activeState: 'active',
        subState: 'waiting',
        unitFileState: 'enabled',
        result: 'success',
        serviceUnit: 'hs-data-api-docker-refresh-post-patch-tierlists.service',
        serviceActiveState: 'inactive',
        serviceResult: 'success',
        validUntil: '2026-07-27T19:20:00+00:00',
        isActive: true,
      }],
    },
    summary: { total_sources: 2, enabled_sections: 2, early_capable_sources: 2, active_runs: 0, failed_sources: 0 },
    warnings: [],
  },
  '/api/admin/parser-control/runs': {
    runs: [{
      id: 'qa-run-1', status: 'partial', reason: 'Проверка после патча', requested_at: '2026-07-21T00:00:00.000Z',
      source_ids: ['hsreplay_arena'], requested_source_ids: ['hsreplay_arena', 'vicious_syndicate_live'],
      deduplicated_source_ids: ['vicious_syndicate_live'], total_sources: 1, completed_sources: 1, failed_sources: 1,
      results: [{
        source_id: 'hsreplay_arena', state: 'ok', serving_cached_dataset: true, rows_total: 731,
        error: 'Свежий ответ не прошёл проверку качества',
      }],
    }],
  },
  '/api/admin/parser-control/audit': {
    entries: [{
      id: 'qa-audit-1',
      actor: { id: 'qa-admin', name: 'QA администратор' },
      action: 'parser-control.policy.update',
      entityId: 'stable',
      details: {
        summary: 'Включена стабильная мета',
        revision: 3,
        requestId: 'qa-parser-audit-request',
        before: { revision: 2, mode: 'early' },
        after: { revision: 3, mode: 'stable' },
      },
      createdAt: '2026-07-21T01:00:00.000Z',
    }],
  },
  '/api/admin/boosty/status': {
    configured: true,
    ok: true,
    importStatus: 'ok',
    source: 'qa-fixture',
    stale: false,
    summary: { boostyPaid: 4, activePaid: 4 },
    checkedAt: '2026-07-11T00:00:00.000Z',
  },
  '/api/admin/boosty/subscribers': {
    configured: true,
    source: 'qa-fixture',
    stale: false,
    summary: { boostyPaid: 2, activePaid: 1 },
    levels: { 'Любитель Арены': 1, 'Зритель': 1 },
    subscribers: [
      {
        id: 'boosty-qa-1', name: 'Активный подписчик', email: 'active@example.test', hasEmail: true,
        avatarUrl: '', status: 'active', subscribed: true, active: true, paid: true, hasActivePaidAccess: true,
        willRenew: true, blacklisted: false, canWrite: true, audienceType: 'boosty-paid', contactStatus: 'known',
        level: { id: 1, name: 'Любитель Арены', price: 500, currency: 'RUB' },
        money: { currentPrice: 500, totalPayments: 1500, currency: 'RUB' },
        dates: { subscribedAt: '2026-06-01T00:00:00.000Z', unsubscribedAt: null, nextPaymentAt: '2026-08-01T00:00:00.000Z' },
        entitlements: { arena: true, battlegrounds: true }, siteAccess: true,
      },
      {
        id: 'boosty-qa-2', name: 'Неактивный подписчик', email: '', hasEmail: false,
        avatarUrl: '', status: 'inactive', subscribed: false, active: false, paid: false, hasActivePaidAccess: false,
        willRenew: false, blacklisted: false, canWrite: false, audienceType: 'boosty-free', contactStatus: 'missing-email',
        level: { id: 2, name: 'Зритель', price: 0, currency: 'RUB' },
        money: { currentPrice: 0, totalPayments: 0, currency: 'RUB' },
        dates: { subscribedAt: null, unsubscribedAt: '2026-06-02T00:00:00.000Z', nextPaymentAt: null },
        entitlements: {}, siteAccess: false,
      },
    ],
    fetchedAt: '2026-07-11T00:00:00.000Z',
  },
  '/api/admin/telegram/accounts': {
    configured: true,
    chatIds: ['-100123456'],
    summary: { total: 2, access: 1, checkable: 1, contactOnly: 1, stale: 1, blocked: 0 },
    accounts: [
      {
        id: 'telegram-qa-1', profileId: 'TG-0001', name: 'Участник VIP', email: 'vip@example.test', role: 'user', blockedAt: '',
        telegramId: '10001', telegramOidcId: 'oidc-10001', telegramUsername: 'vip_member', contactTelegram: 'vip_member', photoUrl: '',
        hasTelegramIdentity: true, hasContactOnly: false, canBeChecked: true, hasAccess: true, telegramHasAccess: true,
        accessState: 'access', source: 'telegram', message: 'Участник найден', checkedAt: '2026-07-11T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z', stale: false, entitlements: { arena: true, battlegrounds: true },
        chats: [{ chatId: '-100123456', status: 'member', isMember: true, hasAccess: true }], boostyHasAccess: false,
        createdAt: '2026-07-01T00:00:00.000Z', userUpdatedAt: '2026-07-11T00:00:00.000Z',
      },
      {
        id: 'telegram-qa-2', profileId: 'TG-0002', name: 'Контакт без привязки', email: 'contact@example.test', role: 'user', blockedAt: '',
        telegramId: '', telegramOidcId: '', telegramUsername: 'contact_only', contactTelegram: 'contact_only', photoUrl: '',
        hasTelegramIdentity: false, hasContactOnly: true, canBeChecked: false, hasAccess: false, telegramHasAccess: false,
        accessState: 'contact-only', source: 'profile', message: 'Нужна привязка Telegram', checkedAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-07-11T00:00:00.000Z', stale: true, entitlements: {}, chats: [], boostyHasAccess: false,
        createdAt: '2026-07-02T00:00:00.000Z', userUpdatedAt: '2026-07-11T00:00:00.000Z',
      },
    ],
    fetchedAt: '2026-07-11T00:00:00.000Z',
  },
  '/api/admin/users': {
    users: [
      {
        id: 'qa-user-1',
        profileId: 'QA-0001',
        name: 'Первый пользователь',
        email: 'first@example.test',
        role: 'user',
        country: 'RU',
        telegramUsername: 'first_user',
        contactVkUrl: '',
        contactTelegram: '@first_user',
        contactEmail: 'first@example.test',
        lifetimeAccess: false,
        manualAccess: { enabled: false, expiresAt: null },
        subscription: { hasAccess: true, source: 'qa', checkedAt: '2026-07-11T00:00:00.000Z' },
        contestEntriesCount: 2,
        createdAt: '2026-07-01T00:00:00.000Z',
      },
      {
        id: 'qa-user-2',
        profileId: 'QA-0002',
        name: 'Заблокированный пользователь',
        email: 'blocked@example.test',
        role: 'user',
        country: 'KZ',
        telegramUsername: '',
        contactVkUrl: '',
        contactTelegram: '',
        contactEmail: 'blocked@example.test',
        lifetimeAccess: false,
        manualAccess: { enabled: false, expiresAt: null },
        blockedAt: '2026-07-10T00:00:00.000Z',
        subscription: { hasAccess: false, source: 'qa', checkedAt: '2026-07-11T00:00:00.000Z' },
        contestEntriesCount: 0,
        createdAt: '2026-07-02T00:00:00.000Z',
      },
    ],
    total: 2,
  },
  '/api/admin/mailings/overview': {
    campaigns: [{
      id: 'mailing-qa-1', subject: 'Прошлая рассылка', preheader: 'Архив', templateKey: 'blank', segment: 'active',
      status: 'completed', recipientCount: 3, acceptedCount: 3, failedCount: 0, skippedCount: 0,
      createdAt: '2026-07-10T00:00:00.000Z', startedAt: '2026-07-10T00:01:00.000Z', completedAt: '2026-07-10T00:02:00.000Z', error: '',
    }],
    templates: [{
      id: 'latest-article', label: 'Свежая статья', description: 'Анонс нового материала',
      subject: 'Новая статья Manacost', preheader: 'Читайте свежий материал', htmlBody: '<h2>Новая статья</h2><p>Текст анонса.</p>',
    }],
    contacts: [{
      id: 'mail-contact-1', email: 'reader@example.test', name: 'Читатель', consentStatus: 'subscribed', consentSource: 'profile',
      lifecycle: 'active', accountState: 'current', eligible: true, updatedAt: '2026-07-11T00:00:00.000Z',
    }],
    summary: { total: 4, eligible: 3, active: 2, former: 1, excluded: 1, unsubscribed: 1, pendingConsent: 0, suppressed: 0 },
    transport: { configured: true, from: 'Manacost <news@example.test>' },
  },
  '/api/admin/mailings/preview': {
    html: '<!doctype html><html lang="ru"><body><h1>Предпросмотр QA</h1></body></html>',
    recipientCount: 3,
    sanitizedHtmlBody: '<h1>Предпросмотр QA</h1>',
    previewDigest: 'qa-preview-digest',
  },
};

const wildMatchupsFixture = {
  format: 'wild',
  formatLabel: 'Вольный',
  rank: 'legend',
  rankLabel: 'Легенда',
  source: 'hsguru',
  updatedAt: '2026-07-12T00:00:00.000Z',
  columns: [
    { name: 'Wild Control Rogue', label: 'Вольный Контроль Разбойник', popularity: '14,2%' },
    { name: 'Wild Reno Mage', label: 'Вольный Рено Маг', popularity: '8,1%' },
    { name: 'Wild Pirate Warrior', label: 'Вольный Пират Воин', popularity: '6,7%' },
    { name: 'Other Rogue', label: 'Other Rogue', popularity: '2,4%' },
  ],
  rows: [
    {
      archetype: 'Wild Control Rogue',
      archetypeLabel: 'Вольный Контроль Разбойник',
      winrate: 55.6,
      cells: [
        { opponent: 'Wild Control Rogue', opponentLabel: 'Вольный Контроль Разбойник', winrate: 50 },
        { opponent: 'Wild Reno Mage', opponentLabel: 'Вольный Рено Маг', winrate: 57.2 },
        { opponent: 'Wild Pirate Warrior', opponentLabel: 'Вольный Пират Воин', winrate: 45.4 },
        { opponent: 'Other Rogue', opponentLabel: 'Other Rogue', winrate: 52.1 },
      ],
    },
    {
      archetype: 'Wild Reno Mage',
      archetypeLabel: 'Вольный Рено Маг',
      winrate: 51.8,
      cells: [
        { opponent: 'Wild Control Rogue', opponentLabel: 'Вольный Контроль Разбойник', winrate: 42.8 },
        { opponent: 'Wild Reno Mage', opponentLabel: 'Вольный Рено Маг', winrate: 50 },
        { opponent: 'Wild Pirate Warrior', opponentLabel: 'Вольный Пират Воин', winrate: 53.9 },
        { opponent: 'Other Rogue', opponentLabel: 'Other Rogue', winrate: 48.4 },
      ],
    },
    {
      archetype: 'Wild Pirate Warrior',
      archetypeLabel: 'Вольный Пират Воин',
      winrate: 49.7,
      cells: [
        { opponent: 'Wild Control Rogue', opponentLabel: 'Вольный Контроль Разбойник', winrate: 54.6 },
        { opponent: 'Wild Reno Mage', opponentLabel: 'Вольный Рено Маг', winrate: 46.1 },
        { opponent: 'Wild Pirate Warrior', opponentLabel: 'Вольный Пират Воин', winrate: 50 },
        { opponent: 'Other Rogue', opponentLabel: 'Other Rogue', winrate: 51.3 },
      ],
    },
    {
      archetype: 'Other Rogue',
      archetypeLabel: 'Other Rogue',
      winrate: 49.1,
      cells: [
        { opponent: 'Wild Control Rogue', opponentLabel: 'Вольный Контроль Разбойник', winrate: 47.9 },
        { opponent: 'Wild Reno Mage', opponentLabel: 'Вольный Рено Маг', winrate: 51.6 },
        { opponent: 'Wild Pirate Warrior', opponentLabel: 'Вольный Пират Воин', winrate: 48.7 },
        { opponent: 'Other Rogue', opponentLabel: 'Other Rogue', winrate: 50 },
      ],
    },
  ],
};

const publicStandardFixtureAliases = {
  '/api/constructed-cards': '/api/admin/constructed-cards',
  '/api/constructed-cards/CARD_QA_1': '/api/admin/constructed-cards/CARD_QA_1',
  '/api/standard-meta': '/api/admin/standard-meta',
  '/api/standard-meta/teaser': '/api/admin/standard-meta',
  '/api/vicious-syndicate-gold': '/api/admin/vicious-syndicate-gold',
  '/api/vicious-syndicate-gold/builds': '/api/admin/vicious-syndicate-gold/builds',
};

mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(OUT)) {
  if (entry === 'responsive-manifest.json' || entry.startsWith('responsive-manifest.json.tmp-') || entry.startsWith('responsive-')) {
    unlinkSync(`${OUT}/${entry}`);
  }
}

function jsonResponse(body) {
  return {
    status: 200,
    contentType: 'application/json; charset=utf-8',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  };
}

async function mockApplicationApi(page, {
  authenticated,
  admin = false,
  adminState = {},
  strictApi = false,
  notFoundDocument = null,
}) {
  let shellChunkFailures = 0;
  let shellRenderOverrides = 0;
  await page.setRequestInterception(true);
  page.on('request', request => {
    const url = new URL(request.url());
    if (notFoundDocument
      && request.isNavigationRequest()
      && request.resourceType() === 'document'
      && request.frame() === page.mainFrame()
      && url.origin === BASE_ORIGIN
      && url.pathname === notFoundDocument.pathname) {
      request.respond({
        status: 404,
        contentType: 'text/html; charset=utf-8',
        headers: {
          'cache-control': 'no-cache, no-store, must-revalidate',
          'x-robots-tag': 'noindex, nofollow',
        },
        body: notFoundDocument.html,
      });
      return;
    }
    if (adminState.shellRenderFailure
      && shellRenderOverrides === 0
      && /^\/assets\/GlobalUtilityHeader-[^/]+\.js$/.test(url.pathname)) {
      shellRenderOverrides += 1;
      request.respond({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        headers: { 'cache-control': 'no-store' },
        body: 'let shouldFail=true;document.addEventListener("click",event=>{if(event.target instanceof Element&&event.target.closest(".app-error-action--primary"))shouldFail=false},{capture:true});export default function QaRenderFailure(){if(shouldFail)throw new Error("QA render failure");return null}',
      });
      return;
    }
    if (adminState.shellChunkFailure
      && shellChunkFailures === 0
      && /^\/assets\/GlobalUtilityHeader-[^/]+\.js$/.test(url.pathname)) {
      shellChunkFailures += 1;
      request.abort('failed');
      return;
    }
    if (adminState.homeArticlesChunkFailure
      && /^\/assets\/HomeLatestArticles-[^/]+\.js$/.test(url.pathname)) {
      request.abort('failed');
      return;
    }
    if (url.pathname === '/api/auth/telegram/config') {
      request.respond(jsonResponse({
        enabled: true,
        mode: 'oidc',
        authUrl: '/api/auth/telegram/start',
        socialProviders: [
          { provider: 'google', authUrl: '/api/auth/google/start' },
          { provider: 'discord', authUrl: '/api/auth/discord/start' },
          { provider: 'yandex', authUrl: '/api/auth/yandex/start' },
        ],
      }));
      return;
    }
    if (url.pathname === '/api/telemetry/web-vitals' && request.method() === 'POST') {
      request.respond({
        status: 204,
        headers: { 'cache-control': 'no-store' },
        body: '',
      });
      return;
    }
    if (/^\/api\/card-image\/[A-Za-z0-9_]+\/(?:thumb|full)\.webp$/.test(url.pathname)) {
      request.respond({
        status: 200,
        contentType: 'image/svg+xml',
        headers: {
          'access-control-allow-origin': '*',
          'cache-control': 'public, max-age=2592000, immutable',
        },
        body: decodeURIComponent(qaCardImage.slice(qaCardImage.indexOf(',') + 1)),
      });
      return;
    }
    if (!authenticated && url.pathname === '/api/auth/login' && request.method() === 'POST') {
      request.respond({
        ...jsonResponse({ error: 'Контрольная ошибка входа' }),
        status: 401,
      });
      return;
    }
    if (url.pathname === '/api/auth/me') {
      request.respond(jsonResponse(authenticated ? {
        user: {
          id: admin ? 'qa-admin' : 'qa-subscriber',
          profileId: admin ? 'qa-admin' : 'qa-subscriber',
          email: 'qa@example.test',
          name: admin ? 'QA Administrator' : 'QA Subscriber',
          role: admin ? 'admin' : 'user',
          adminAllowed: admin,
          contestAdminAllowed: admin,
          photoUrl: '/__qa_missing_avatar__.png',
        },
      } : { user: null }));
      return;
    }
    if (url.pathname === '/api/auth/profile' && request.method() === 'PATCH') {
      if (adminState.profileSaveFailure) {
        request.respond({ ...jsonResponse({ error: 'Контрольная ошибка сохранения' }), status: 500 });
        return;
      }
      const payload = JSON.parse(request.postData() || '{}');
      request.respond(jsonResponse({
        user: {
          id: admin ? 'qa-admin' : 'qa-subscriber',
          profileId: admin ? 'qa-admin' : 'qa-subscriber',
          email: 'qa@example.test',
          name: admin ? 'QA Administrator' : 'QA Subscriber',
          role: admin ? 'admin' : 'user',
          adminAllowed: admin,
          contestAdminAllowed: admin,
          photoUrl: '/__qa_missing_avatar__.png',
          ...payload,
        },
      }));
      return;
    }
    if (url.pathname === '/api/subscription/status' || url.pathname === '/api/subscription/refresh') {
      request.respond(jsonResponse(authenticated ? subscriber : {
        hasAccess: false,
        source: 'none',
        checkedAt: new Date().toISOString(),
        stale: false,
        message: 'Deterministic browser QA guest',
        entitlements: {},
        boosty: { checked: false, found: false, hasAccess: false },
        telegram: { checked: false, hasAccess: false },
      }));
      return;
    }
    if (admin && adminState.galleryEmpty && url.pathname === '/api/admin/gallery') {
      request.respond(jsonResponse({ items: [] }));
      return;
    }
    if (admin && adminState.boostyFailure && url.pathname === '/api/admin/boosty/status') {
      request.respond({
        ...jsonResponse({
          configured: true,
          ok: false,
          importStatus: 'error',
          source: 'unavailable',
          stale: true,
          lastErrorMessage: 'Boosty API временно недоступен.',
          warnings: ['boosty-api-unavailable'],
          summary: {},
          checkedAt: '2026-07-13T03:00:00.000Z',
        }),
        status: 502,
      });
      return;
    }
    if (admin && adminState.boostyFailure && url.pathname === '/api/admin/boosty/subscribers') {
      request.respond({
        ...jsonResponse({
          configured: true,
          source: 'unavailable',
          stale: true,
          subscribers: [],
          summary: {},
          levels: {},
          fetchedAt: '2026-07-13T03:00:00.000Z',
          error: 'Не удалось загрузить подписчиков Boosty',
        }),
        status: 502,
      });
      return;
    }
    if (admin && adminState.telegramFailure && url.pathname === '/api/admin/telegram/accounts') {
      request.respond({
        ...jsonResponse({ error: 'Не удалось загрузить Telegram-аккаунты' }),
        status: 500,
      });
      return;
    }
    if (admin && url.pathname === '/api/articles') {
      request.respond(jsonResponse({ articles: adminState.articles ?? adminFixtures['/api/articles'].articles }));
      return;
    }
    if (admin && url.pathname === '/api/admin/uploads/image' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.sourceUrl) {
        request.respond(jsonResponse({ success: true, url: '/uploads/admin/qa-article-cover.webp' }));
        return;
      }
    }
    if (admin && url.pathname === '/api/admin-articles') {
      const payload = JSON.parse(request.postData() || '{}');
      const articles = adminState.articles ??= structuredClone(adminFixtures['/api/articles'].articles);
      if (request.method() === 'POST') {
        const article = { id: 'qa-created-article', ...payload.article };
        articles.unshift(article);
        request.respond(jsonResponse({ success: true, article }));
        return;
      }
      if (request.method() === 'PATCH') {
        const index = articles.findIndex(article => article.id === payload.id);
        const article = { ...articles[index], ...payload.article, id: payload.id };
        if (index >= 0) articles[index] = article;
        request.respond(jsonResponse({ success: true, article }));
        return;
      }
      if (request.method() === 'DELETE') {
        adminState.articles = articles.filter(article => article.id !== payload.id);
        request.respond(jsonResponse({ success: true }));
        return;
      }
    }
    if (admin && url.pathname === '/api/admin/contests') {
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      if (request.method() === 'GET') {
        if (adminState.contestReadFailure) {
          request.respond({ ...jsonResponse({ error: 'Не удалось загрузить конкурсы' }), status: 500 });
          return;
        }
        request.respond(jsonResponse({ contests }));
        return;
      }
      if (request.method() === 'POST') {
        const payload = JSON.parse(request.postData() || '{}');
        const id = payload.id || 'qa-created-contest';
        const index = contests.findIndex(contest => contest.id === id);
        const contest = {
          ...(index >= 0 ? contests[index] : { entriesCount: 0, winners: [] }),
          ...payload,
          id,
        };
        if (index >= 0) contests[index] = contest;
        else contests.unshift(contest);
        request.respond(jsonResponse({ success: true, contest }));
        return;
      }
    }
    if (admin && url.pathname === '/api/admin/archetype-translations/untranslated') {
      const translations = adminState.translations ??= structuredClone(adminFixtures['/api/admin/archetype-translations'].items);
      const observed = [
        { nameEn: 'Control Warrior', ranks: ['Легенда', 'Алмаз 4-1'] },
        { nameEn: 'Rainbow Mage', ranks: ['Легенда'] },
        {
          nameEn: 'Void Soul DH',
          ranks: ['Легенда', 'Алмаз 4-1'],
          deckCode: 'AAECAea5AwSongaPzwbHpAbEuAYNgIUEtp8E0Z4G7Z8G7p8G17gG9OUGjfgGkfgGAAA=',
        },
        { nameEn: 'Starship Rogue', ranks: ['Легенда'] },
        { nameEn: 'Discover Hunter', ranks: ['Топ-5000'] },
        { nameEn: 'Imbue Paladin', ranks: ['Алмаз 4-1'] },
        { nameEn: 'Protoss Priest', ranks: ['Легенда'] },
        { nameEn: 'Zerg Death Knight', ranks: ['Топ-5000'] },
        { nameEn: 'Spell Damage Druid', ranks: ['Алмаз 4-1'] },
        { nameEn: 'Quest Shaman', ranks: ['Легенда'] },
        { nameEn: 'Location Warlock', ranks: ['Топ-5000'] },
        { nameEn: 'Menagerie Warrior', ranks: ['Легенда'] },
      ];
      const translatedKeys = translations.map(item => item.nameEn.toLocaleLowerCase('en-US'));
      const items = observed.filter(item => {
        const key = item.nameEn.toLocaleLowerCase('en-US');
        return !translatedKeys.some(translationKey => key === translationKey || key.includes(translationKey));
      });
      request.respond(jsonResponse({
        items,
        totalObserved: observed.length,
        translated: observed.length - items.length,
        missing: items.length,
        coveragePercent: Math.round(((observed.length - items.length) / observed.length) * 1_000) / 10,
      }));
      return;
    }
    if (admin && url.pathname === '/api/admin/archetype-translations') {
      const translations = adminState.translations ??= structuredClone(adminFixtures['/api/admin/archetype-translations'].items);
      if (request.method() === 'POST') {
        const payload = JSON.parse(request.postData() || '{}').translation || {};
        translations.push({
          id: Math.max(0, ...translations.map(item => item.id)) + 1,
          blizzcoreId: null,
          nameEn: payload.nameEn,
          nameRu: payload.nameRu,
          source: 'manual',
          createdAt: '2026-07-13T03:00:00.000Z',
          updatedAt: '2026-07-13T03:00:00.000Z',
          syncedAt: null,
          updatedBy: 'qa-admin',
        });
        request.respond({ ...jsonResponse({ success: true, translation: translations.at(-1) }), status: 201 });
        return;
      }
      const query = (url.searchParams.get('q') || '').toLocaleLowerCase('ru-RU');
      const source = url.searchParams.get('source') || '';
      const items = translations.filter(item => (!query || `${item.nameEn} ${item.nameRu}`.toLocaleLowerCase('ru-RU').includes(query))
        && (!source || item.source === source));
      request.respond(jsonResponse({
        items,
        total: items.length,
        page: 1,
        pageSize: 40,
        pages: 1,
        stats: {
          total: translations.length,
          manual: translations.filter(item => item.source === 'manual').length,
          blizzcore: translations.filter(item => item.source === 'blizzcore').length,
          lastSyncedAt: '2026-07-11T00:00:00.000Z',
        },
      }));
      return;
    }
    const translationEditMatch = admin && url.pathname.match(/^\/api\/admin\/archetype-translations\/(\d+)$/);
    if (translationEditMatch && request.method() === 'PATCH') {
      const translations = adminState.translations ??= structuredClone(adminFixtures['/api/admin/archetype-translations'].items);
      const item = translations.find(row => row.id === Number(translationEditMatch[1]));
      const payload = JSON.parse(request.postData() || '{}').translation || {};
      if (item) Object.assign(item, payload, { source: 'manual', updatedBy: 'qa-admin' });
      request.respond(jsonResponse({ success: true, translation: item }));
      return;
    }
    if (admin && url.pathname === '/api/admin/archetype-translations/sync' && request.method() === 'POST') {
      request.respond(jsonResponse({ success: true, rows: 2, imported: 0, updated: 1, preservedManual: 1 }));
      return;
    }
    if (admin && url.pathname === '/api/admin/mechanic-translations') {
      const mechanics = adminState.mechanics ??= structuredClone(adminFixtures['/api/admin/mechanic-translations'].items);
      const query = (url.searchParams.get('q') || '').toLocaleLowerCase('ru-RU');
      const status = url.searchParams.get('status') || '';
      const kind = url.searchParams.get('kind') || '';
      const items = mechanics.filter(item => (!query || `${item.nameEn} ${item.nameRu} ${item.example?.name?.ru || ''}`.toLocaleLowerCase('ru-RU').includes(query))
        && (!status || item.source === status) && (!kind || item.kind === kind || item.kind === 'both'));
      request.respond(jsonResponse({
        items, total: items.length, page: 1, pageSize: 40, pages: 1,
        stats: {
          total: mechanics.length,
          manual: mechanics.filter(item => item.source === 'manual').length,
          default: mechanics.filter(item => item.source === 'default').length,
          missing: mechanics.filter(item => item.source === 'missing').length,
          mechanics: mechanics.filter(item => item.kind === 'mechanic' || item.kind === 'both').length,
          tags: mechanics.filter(item => item.kind === 'tag' || item.kind === 'both').length,
        },
      }));
      return;
    }
    if (admin && url.pathname === '/api/admin/standard-operations/reset' && request.method() === 'POST') {
      const target = JSON.parse(request.postData() || '{}').target;
      const status = structuredClone(adminFixtures['/api/admin/standard-operations']);
      if (target === 'previews' || target === 'all') status.caches.previews.entries = 0;
      request.respond(jsonResponse({ success: true, target, status }));
      return;
    }
    const mechanicEditMatch = admin && url.pathname.match(/^\/api\/admin\/mechanic-translations\/([^/]+)$/);
    if (mechanicEditMatch && request.method() === 'PUT') {
      const mechanics = adminState.mechanics ??= structuredClone(adminFixtures['/api/admin/mechanic-translations'].items);
      const key = decodeURIComponent(mechanicEditMatch[1]);
      const item = mechanics.find(row => row.key === key);
      const payload = JSON.parse(request.postData() || '{}');
      if (item) Object.assign(item, { nameEn: payload.nameEn, nameRu: payload.nameRu, source: 'manual', updatedAt: '2026-07-16T12:30:00.000Z' });
      request.respond(jsonResponse({ success: true, translation: item }));
      return;
    }
    const contestEntriesMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)\/entries$/);
    if (contestEntriesMatch) {
      const entries = contestEntriesMatch[1] === 'qa-contest'
        ? adminFixtures['/api/admin/contests/qa-contest/entries'].entries
        : [];
      request.respond(jsonResponse({ entries }));
      return;
    }
    const contestWinnersMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)\/winners$/);
    if (contestWinnersMatch && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      const contest = contests.find(item => item.id === contestWinnersMatch[1]);
      if (contest) {
        contest.winners = payload.winners;
        contest.status = 'completed';
      }
      request.respond(jsonResponse({ success: true, contest }));
      return;
    }
    const contestDeleteMatch = admin && url.pathname.match(/^\/api\/admin\/contests\/([^/]+)$/);
    if (contestDeleteMatch && request.method() === 'DELETE') {
      const contests = adminState.contests ??= structuredClone(adminFixtures['/api/admin/contests'].contests);
      adminState.contests = contests.filter(contest => contest.id !== contestDeleteMatch[1]);
      request.respond(jsonResponse({ success: true, deletedId: contestDeleteMatch[1] }));
      return;
    }
    if (admin && url.pathname === '/api/admin/users' && request.method() === 'GET') {
      const users = adminState.users ??= structuredClone(adminFixtures['/api/admin/users'].users);
      request.respond(jsonResponse({ users, total: users.length }));
      return;
    }
    const adminUserMatch = admin && url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
    if (adminUserMatch && request.method() === 'PATCH') {
      const users = adminState.users ??= structuredClone(adminFixtures['/api/admin/users'].users);
      const user = users.find(item => item.id === decodeURIComponent(adminUserMatch[1]));
      const payload = JSON.parse(request.postData() || '{}');
      if (user) {
        if (payload.role === 'admin' || payload.role === 'user') user.role = payload.role;
        if (typeof payload.blocked === 'boolean') user.blockedAt = payload.blocked ? '2026-07-13T02:00:00.000Z' : '';
        if (typeof payload.lifetimeAccess === 'boolean') user.lifetimeAccess = payload.lifetimeAccess;
        if (payload.manualAccess && typeof payload.manualAccess.enabled === 'boolean') {
          user.manualAccess = payload.manualAccess;
          user.lifetimeAccess = payload.manualAccess.enabled && payload.manualAccess.expiresAt === null;
          user.subscription = { ...user.subscription, hasAccess: payload.manualAccess.enabled || user.subscription?.hasAccess };
        }
      }
      request.respond(jsonResponse({
        success: true,
        user,
        manualAccess: user?.manualAccess,
        lifetimeAccess: Boolean(user?.lifetimeAccess),
      }));
      return;
    }
    if (admin && url.pathname === '/api/admin/mailings/overview' && request.method() === 'GET') {
      const overview = structuredClone(adminFixtures['/api/admin/mailings/overview']);
      overview.campaigns = adminState.mailingCampaigns ??= structuredClone(overview.campaigns);
      request.respond(jsonResponse(overview));
      return;
    }
    if (admin && url.pathname === '/api/admin/mailings/test' && request.method() === 'POST') {
      request.respond(jsonResponse({ success: true, message: 'Тестовое письмо принято для qa@example.test' }));
      return;
    }
    if (admin && url.pathname === '/api/admin/mailings/send' && request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const campaigns = adminState.mailingCampaigns ??= structuredClone(adminFixtures['/api/admin/mailings/overview'].campaigns);
      campaigns.unshift({
        id: 'mailing-qa-created', subject: payload.subject, preheader: payload.preheader || '', templateKey: payload.templateKey || 'custom',
        segment: payload.segment || 'all-consented', status: 'queued', recipientCount: payload.expectedRecipients,
        acceptedCount: 0, failedCount: 0, skippedCount: 0, createdAt: '2026-07-13T03:00:00.000Z', startedAt: '', completedAt: '', error: '',
      });
      request.respond({ ...jsonResponse({ success: true, campaign: campaigns[0] }), status: 202 });
      return;
    }
    if ((url.pathname === '/api/standard-meta/recommendation' || (admin && url.pathname === '/api/admin/standard-meta/recommendation')) && request.method() === 'GET') {
      adminState.standardMetaRecommendationRequests = (adminState.standardMetaRecommendationRequests || 0) + 1;
      adminState.standardMetaRecommendationRank = url.searchParams.get('rank');
      request.respond(jsonResponse({
        recommendation: {
          archetype: 'Evenlock', archetypeLabel: 'Чётный Чернокнижник', format: 'standard',
          rank: 'legend',
          deckCode: 'AAECAf0GQaFixtureDeckCodeForBrowserQualityAssurance1234567890==',
          source: 'qa-fixture', sourceUrl: '', streamer: null, sampleGames: 6476, winrate: 61.1,
          updatedAt: '2026-07-13T00:00:00.000Z', classKey: 'warlock', matchedArchetype: 'Evenlock', matchMethod: 'exact',
          deckCards: qaDeckCards,
        },
      }));
      return;
    }
    if ((url.pathname === '/api/standard-meta/preview' || (admin && url.pathname === '/api/admin/standard-meta/preview')) && request.method() === 'POST') {
      adminState.standardMetaPreviewRequests = (adminState.standardMetaPreviewRequests || 0) + 1;
      adminState.standardMetaPreviewRank = JSON.parse(request.postData() || '{}').rank;
      request.respond(jsonResponse({
        recommendation: {
          archetype: 'Evenlock', archetypeLabel: 'Чётный Чернокнижник', format: 'standard',
          rank: 'legend',
          deckCode: 'AAECAf0GQaFixtureDeckCodeForBrowserQualityAssurance1234567890==',
          source: 'qa-fixture', sourceUrl: '', streamer: null, sampleGames: 6476, winrate: 61.1,
          updatedAt: '2026-07-13T00:00:00.000Z', classKey: 'warlock', matchedArchetype: 'Evenlock', matchMethod: 'exact',
          deckCards: qaDeckCards,
        },
        preview: { hash: 'qa-preview-hash', state: 'done', ready: true, imageUrl: '/ad/wallpaper_info.webp', error: null },
      }));
      return;
    }
    if ((url.pathname === '/api/constructed-archetypes'
      || url.pathname === '/api/constructed-archetypes/teaser')
      && request.method() === 'GET') {
      if (adminState.constructedArchetypeReadFailureOnce) {
        adminState.constructedArchetypeReadFailureOnce = false;
        adminState.constructedArchetypeReadFailures = (adminState.constructedArchetypeReadFailures || 0) + 1;
        request.respond({ ...jsonResponse({ error: 'Контрольная ошибка загрузки меты' }), status: 503 });
        return;
      }
      const requestedFormat = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
      const items = qaArchetypeCatalog.items.map(item => ({
        ...item,
        format: requestedFormat,
        builds: url.pathname.endsWith('/teaser') ? [] : item.builds,
      }));
      request.respond(jsonResponse({
        ...qaArchetypeCatalog,
        format: requestedFormat,
        formatLabel: requestedFormat === 'wild' ? 'Вольный' : 'Стандарт',
        coverage: url.pathname.endsWith('/teaser') ? {} : qaArchetypeCatalog.coverage,
        items,
      }));
      return;
    }
    if (url.pathname === '/api/constructed-archetypes/standard/qa-evenlock' && request.method() === 'GET') {
      request.respond(jsonResponse(qaArchetypeDetail));
      return;
    }
    if (url.pathname === '/api/deck/resolve' && request.method() === 'GET') {
      request.respond(jsonResponse({
        ok: true,
        format: url.searchParams.get('format') === 'wild' ? 'wild' : 'standard',
        deckCode: url.searchParams.get('code') || '',
        cards: qaDeckCards,
        sideboards: [],
        totalCards: 30,
        deckSizeLimit: 30,
        archetype: {
          archetype: url.searchParams.get('archetype') || 'Evenlock',
          archetypeLabel: 'Чётный Чернокнижник',
          score: 1,
          deckCode: url.searchParams.get('code') || '',
        },
      }));
      return;
    }
    if (url.pathname === '/api/deck/render' && request.method() === 'POST') {
      request.respond(jsonResponse({
        ok: true,
        ready: true,
        renderer: 'rust',
        style: 'parchment',
        imageUrl: '/wallpaper/home-paladin-hero.webp',
        previewImageUrl: '/wallpaper/home-paladin-hero.webp',
      }));
      return;
    }
    if ((url.pathname === '/api/standard-meta' || (admin && url.pathname === '/api/admin/standard-meta'))
      && request.method() === 'GET' && adminState.standardMetaReadFailureOnce) {
      adminState.standardMetaReadFailureOnce = false;
      adminState.standardMetaReadFailures = (adminState.standardMetaReadFailures || 0) + 1;
      request.respond({ ...jsonResponse({ error: 'Контрольная ошибка загрузки меты' }), status: 503 });
      return;
    }
    if ((url.pathname === '/api/standard-meta' || (admin && url.pathname === '/api/admin/standard-meta'))
      && request.method() === 'GET' && adminState.standardMetaContractFailureOnce) {
      adminState.standardMetaContractFailureOnce = false;
      request.respond(jsonResponse({
        schemaVersion: 999,
        dataset: 'standard-meta',
        data: adminFixtures['/api/admin/standard-meta'],
      }));
      return;
    }
    const standardFixturePath = publicStandardFixtureAliases[url.pathname] || url.pathname;
    if ((admin || Boolean(publicStandardFixtureAliases[url.pathname])) && adminFixtures[standardFixturePath]) {
      const fixture = structuredClone(adminFixtures[standardFixturePath]);
      if (!authenticated && url.pathname === '/api/constructed-cards') {
        fixture.statsAccess = false;
        fixture.cards = fixture.cards.map(card => ({ ...card, stats: null }));
      }
      if (!authenticated && url.pathname === '/api/constructed-cards/CARD_QA_1') {
        fixture.statsAccess = false;
        fixture.card = { ...fixture.card, stats: null, statsUpdatedAt: null };
      }
      request.respond(jsonResponse(fixture));
      return;
    }
    if (url.pathname === '/api/standard/matchups') {
      const requestedFormat = url.searchParams.get('format') === 'wild' ? 'wild' : 'standard';
      adminState.matchupFormats ??= [];
      adminState.matchupFormats.push(requestedFormat);
      request.respond(jsonResponse(
        requestedFormat === 'wild'
          ? wildMatchupsFixture
          : fixtures['/api/standard/matchups'],
      ));
      return;
    }
    const fixtureKey = Object.keys(fixtures).find(key => url.pathname === key);
    if (fixtureKey) {
      request.respond(jsonResponse(fixtures[fixtureKey]));
      return;
    }
    if (strictApi && url.origin === BASE_ORIGIN && url.pathname.startsWith('/api/')) {
      request.respond({
        ...jsonResponse({ error: `Unmocked browser QA endpoint: ${url.pathname}` }),
        status: 500,
      });
      return;
    }
    request.continue();
  });
}

function collectRuntimeErrors(page, { sameOriginNetwork = false } = {}) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // Third-party image CDNs are not application runtime failures.
    if (/Failed to load resource|ERR_BLOCKED_BY_CLIENT/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  if (sameOriginNetwork) {
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin !== BASE_ORIGIN) return;
      if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/assets/')) return;
      if (response.status() >= 400) {
        errors.push(`http ${response.status()}: ${url.pathname}`);
        return;
      }
      const contentType = response.headers()['content-type'] || '';
      const isCardImageResponse = /^\/api\/card-image\/[A-Za-z0-9_]+\/(?:thumb|full)\.webp$/.test(url.pathname);
      if (isCardImageResponse && !/^image\/(?:avif|gif|jpe?g|png|svg\+xml|webp)(?:;|$)/i.test(contentType)) {
        errors.push(`unexpected card image content-type ${contentType || 'missing'}: ${url.pathname}`);
      } else if (url.pathname.startsWith('/api/')
        && response.status() !== 204
        && !isCardImageResponse
        && !/application\/(?:[^;]+\+)?json/i.test(contentType)) {
        errors.push(`unexpected API content-type ${contentType || 'missing'}: ${url.pathname}`);
      }
    });
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.origin !== BASE_ORIGIN) return;
      if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/assets/')) return;
      const failure = request.failure()?.errorText || 'unknown';
      // sendBeacon/fetch telemetry is intentionally best-effort. Chromium can
      // abort it while a QA page is being replaced or closed; product/API
      // requests must still fail the scenario.
      if (url.pathname === '/api/telemetry/web-vitals' && failure === 'net::ERR_ABORTED') return;
      errors.push(`requestfailed: ${url.pathname} (${failure})`);
    });
  }
  return errors;
}

async function waitForMeaningfulPage(page, expectedText) {
  await page.waitForFunction(
    text => document.body?.innerText.includes(text),
    { timeout: 45_000 },
    expectedText,
  );
  await page.waitForFunction(
    () => !document.body.innerText.includes('Загрузка данных'),
    { timeout: 15_000 },
  ).catch(() => {});
}

async function waitForAuthenticatedShell(page) {
  await page.waitForSelector(
    '.arena-sidebar-profile[aria-label="Открыть профиль"]',
    { timeout: 20_000 },
  );
  await page.waitForFunction(() => {
    const shell = document.querySelector('#root > .arena-app-shell');
    const skipLink = shell?.firstElementChild;
    return Boolean(skipLink?.matches('.arena-skip-link') && skipLink.isConnected);
  }, { timeout: 5_000 });
}

async function chooseConstructedCardFilter(page, tourId, optionLabel) {
  const rootSelector = `[data-tour-id="${tourId}"]`;
  await page.click(`${rootSelector} .constructed-cards__filter-trigger`);
  await page.waitForSelector(`${rootSelector} [role="listbox"]`, { visible: true, timeout: 5_000 });
  const selected = await page.$$eval(`${rootSelector} [role="option"]`, (options, label) => {
    const option = options.find(element => element.textContent?.replace(/\s+/g, ' ').trim() === label);
    if (!(option instanceof HTMLElement) || option.getAttribute('aria-disabled') === 'true') return false;
    option.click();
    return true;
  }, optionLabel);
  if (!selected) throw new Error(`Constructed-card filter option is unavailable: ${optionLabel}`);
  await page.waitForFunction((selector, label) => (
    document.querySelector(`${selector} .constructed-cards__filter-value`)?.textContent?.replace(/\s+/g, ' ').trim() === label
  ), { timeout: 5_000 }, rootSelector, optionLabel);
}

async function auditAccessibility(page, label, context = 'document') {
  await page.addScriptTag({ path: AXE_PATH });
  const results = await page.evaluate(async auditContext => {
    const target = auditContext === 'document' ? document : document.querySelector(auditContext);
    if (!target) throw new Error(`Accessibility audit target is missing: ${auditContext}`);
    return window.axe.run(target, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations'],
    });
  }, context);
  for (const violation of results.violations) {
    const selectors = violation.nodes.slice(0, 3).flatMap(node => node.target).join(' | ');
    const summary = violation.nodes[0]?.failureSummary?.replace(/\s+/g, ' ').trim() || '';
    failures.push(`${label} [a11y ${violation.impact || 'unknown'}] ${violation.id}: ${violation.help}; ${selectors}; ${summary}`);
  }
  return results.violations.length;
}

async function auditPageTour(page, { label, expectedSteps = null, minSteps = 2, mobile }) {
  await page.evaluate(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('manacost:page-tour:')) window.localStorage.removeItem(key);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  });

  await page.click('.global-faq-button');
  await page.waitForSelector('.global-help-menu', { visible: true, timeout: 10_000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.global-help-menu', { hidden: true, timeout: 10_000 });
  const helpFocusRestored = await page.$eval('.global-faq-button', button => document.activeElement === button);
  if (!helpFocusRestored) failures.push(`${label}: Escape did not restore focus to the Help trigger`);

  await page.click('.global-faq-button');
  await page.waitForSelector('.global-help-menu__item.is-tour', { visible: true, timeout: 10_000 });
  await page.click('.global-help-menu__item.is-tour');
  await page.waitForSelector('.page-tour__dialog', { visible: true, timeout: 10_000 });
  await page.waitForFunction(() => Boolean(
    document.querySelector('.page-tour__progress-row')
    && document.querySelector('.page-tour__spotlight'),
  ), { timeout: 10_000 });
  await page.waitForFunction(() => document.activeElement?.classList.contains('page-tour__dialog'), { timeout: 10_000 });
  await page.keyboard.down('Shift');
  try {
    await page.keyboard.press('Tab');
  } finally {
    await page.keyboard.up('Shift');
  }
  const reverseTabTrapped = await page.$eval('.page-tour__dialog', dialog => (
    dialog.contains(document.activeElement) && document.activeElement !== dialog
  ));
  if (!reverseTabTrapped) failures.push(`${label}: Shift+Tab escaped the guided-tour dialog from its initial focus`);

  const detectedSteps = await page.$eval('.page-tour__progress-row', element => {
    const match = (element.getAttribute('aria-label') || '').match(/из\s+(\d+)/i);
    return match ? Number(match[1]) : 0;
  });
  const totalSteps = detectedSteps;
  if ((expectedSteps !== null && detectedSteps !== expectedSteps) || detectedSteps < minSteps) {
    failures.push(`${label}: unexpected guided-tour step count (${detectedSteps}; expected ${expectedSteps ?? `at least ${minSteps}`})`);
  }

  const violationCount = await auditAccessibility(page, `${label} guided tour`, '.page-tour__dialog');

  for (let index = 0; index < totalSteps; index += 1) {
    await page.waitForFunction(expectedIndex => {
      const labelText = document.querySelector('.page-tour__progress-row')?.getAttribute('aria-label') || '';
      return labelText.startsWith(`Шаг ${expectedIndex} из `);
    }, { timeout: 10_000 }, index + 1);
    await new Promise(resolve => setTimeout(resolve, 120));

    const state = await page.evaluate(isMobile => {
      const dialog = document.querySelector('.page-tour__dialog');
      const spotlight = document.querySelector('.page-tour__spotlight');
      const root = document.querySelector('#root');
      const dialogRect = dialog?.getBoundingClientRect();
      const spotlightRect = spotlight?.getBoundingClientRect();
      const intersectionWidth = dialogRect && spotlightRect
        ? Math.max(0, Math.min(dialogRect.right, spotlightRect.right) - Math.max(dialogRect.left, spotlightRect.left))
        : 0;
      const intersectionHeight = dialogRect && spotlightRect
        ? Math.max(0, Math.min(dialogRect.bottom, spotlightRect.bottom) - Math.max(dialogRect.top, spotlightRect.top))
        : 0;
      return {
        progress: document.querySelector('.page-tour__progress-row')?.getAttribute('aria-label') || '',
        ariaModal: dialog?.getAttribute('aria-modal') || '',
        placement: dialog?.getAttribute('data-placement') || '',
        rootInert: Boolean(root?.inert && root.hasAttribute('inert')),
        focusInside: Boolean(dialog?.contains(document.activeElement)),
        dialogInsideViewport: Boolean(dialogRect
          && dialogRect.left >= -1 && dialogRect.top >= -1
          && dialogRect.right <= innerWidth + 1 && dialogRect.bottom <= innerHeight + 1),
        spotlightInsideViewport: Boolean(spotlightRect
          && spotlightRect.left >= -1 && spotlightRect.top >= -1
          && spotlightRect.right <= innerWidth + 1 && spotlightRect.bottom <= innerHeight + 1),
        overlapArea: intersectionWidth * intersectionHeight,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        mobilePlacementCorrect: !isMobile || dialog?.getAttribute('data-placement') === 'bottom-sheet',
      };
    }, mobile);

    if (!state.progress.includes(`из ${totalSteps}`) || state.ariaModal !== 'true'
      || !state.rootInert || !state.focusInside || !state.dialogInsideViewport
      || !state.spotlightInsideViewport || state.overlapArea > 1 || state.documentOverflow
      || !state.mobilePlacementCorrect) {
      failures.push(`${label}: step ${index + 1}/${totalSteps} geometry or accessibility regressed (${JSON.stringify(state)})`);
    }

    await page.click('.page-tour__button.is-next');
  }

  await page.waitForSelector('.page-tour__dialog', { hidden: true, timeout: 10_000 });
  await page.waitForFunction(() => document.activeElement?.classList.contains('global-faq-button'), { timeout: 10_000 });
  const completionState = await page.evaluate(() => {
    const progressEntry = Object.entries(window.localStorage)
      .find(([key]) => key.startsWith('manacost:page-tour:'));
    let progress = null;
    try { progress = progressEntry ? JSON.parse(progressEntry[1]) : null; } catch { progress = null; }
    const root = document.querySelector('#root');
    window.scrollTo({ top: 0, behavior: 'auto' });
    return {
      focusRestored: document.activeElement?.classList.contains('global-faq-button') || false,
      rootInert: Boolean(root?.inert || root?.hasAttribute('inert')),
      status: progress?.status || '',
    };
  });
  if (!completionState.focusRestored || completionState.rootInert || completionState.status !== 'completed') {
    failures.push(`${label}: completion did not restore the page or persist progress (${JSON.stringify(completionState)})`);
  }
  return violationCount;
}

async function auditDelayedPageTourResume(page, label) {
  const prepared = await page.evaluate(() => {
    const target = document.querySelector('[data-tour-id="bg-library-search"]');
    const storageKey = Object.keys(window.localStorage)
      .find(key => key.startsWith('manacost:page-tour:battlegrounds-library:'));
    if (!(target instanceof HTMLElement) || !storageKey) return false;
    target.hidden = true;
    window.localStorage.setItem(storageKey, JSON.stringify({ status: 'dismissed', stepId: 'search' }));
    return true;
  });
  if (!prepared) {
    failures.push(`${label}: could not prepare delayed-target resume check`);
    return;
  }

  await page.click('.global-faq-button');
  await page.waitForSelector('.global-help-menu__item.is-tour', { visible: true, timeout: 10_000 });
  await page.click('.global-help-menu__item.is-tour');
  await page.waitForFunction(() => document.querySelector('.page-tour__state')?.textContent?.includes('Готовим подсказку'), { timeout: 10_000 });
  const pendingStep = await page.evaluate(() => {
    const entry = Object.entries(window.localStorage)
      .find(([key]) => key.startsWith('manacost:page-tour:battlegrounds-library:'));
    try { return entry ? JSON.parse(entry[1]).stepId : ''; } catch { return ''; }
  });
  if (pendingStep !== 'search') failures.push(`${label}: delayed target overwrote the saved step before it appeared`);

  await page.$eval('[data-tour-id="bg-library-search"]', target => { target.hidden = false; });
  await page.waitForFunction(() => (
    document.querySelector('.page-tour__progress-row')?.getAttribute('aria-label') || ''
  ).startsWith('Шаг 2 из '), { timeout: 10_000 });
  const restoredStep = await page.evaluate(() => {
    const entry = Object.entries(window.localStorage)
      .find(([key]) => key.startsWith('manacost:page-tour:battlegrounds-library:'));
    try { return entry ? JSON.parse(entry[1]).stepId : ''; } catch { return ''; }
  });
  if (restoredStep !== 'search') failures.push(`${label}: delayed target did not resume at the saved step`);
  await page.keyboard.press('Escape');
  await page.waitForSelector('.page-tour__dialog', { hidden: true, timeout: 10_000 });
}

async function inspectLayout(page, { mobile }) {
  const layout = await page.evaluate(isMobile => {
    const root = document.documentElement;
    const shell = document.querySelector('.arena-app-shell');
    const banner = document.querySelector('.section-banner-modern');
    const shellStyle = shell ? getComputedStyle(shell) : null;
    const routeParchmentExpected = Boolean(shell && (
      shell.classList.contains('arena-app-editorial')
      || shell.classList.contains('arena-app-game-data')
      || shell.classList.contains('arena-app-battlegrounds')
    ));
    const routeParchmentLoaded = [...document.styleSheets]
      .some(sheet => sheet.href?.includes('/assets/route-parchment-'));
    const content = document.querySelector('.arena-content-open');
    const contentStyle = content ? getComputedStyle(content) : null;
    const workspace = document.querySelector('.arena-workspace');
    const workspaceRect = workspace?.getBoundingClientRect();
    const bannerStyle = banner ? getComputedStyle(banner) : null;
    const suspiciousOverlays = [...document.querySelectorAll('body *')]
      .map(element => ({ element, style: getComputedStyle(element), rect: element.getBoundingClientRect() }))
      .filter(({ style, rect }) => (
        ['fixed', 'absolute'].includes(style.position)
        && rect.width >= innerWidth * 0.8
        && rect.height >= innerHeight * 0.8
        && Number(style.opacity || 1) > 0.05
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && !element.classList.contains('arena-mobile-drawer-backdrop')
      ))
      .filter(({ style }) => {
        const rgb = style.backgroundColor.match(/[\d.]+/g)?.map(Number) || [];
        const isDark = rgb.length >= 3 && rgb[0] < 70 && rgb[1] < 70 && rgb[2] < 70;
        const alpha = rgb.length >= 4 ? rgb[3] : 1;
        return isDark && alpha > 0.08;
      })
      .map(({ element }) => element.className || element.tagName)
      .slice(0, 5);

    return {
      title: document.title,
      textLength: document.body?.innerText.length || 0,
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      wideWorkspace: content?.classList.contains('arena-content-wide') || false,
      workspaceRight: workspaceRect?.right || 0,
      contentMinWidth: contentStyle?.minWidth || '',
      shellOpacity: shellStyle?.opacity || null,
      shellFilter: shellStyle?.filter || null,
      routeParchmentExpected,
      routeParchmentLoaded,
      battlegroundsSurface: shell?.classList.contains('arena-app-battlegrounds') || false,
      battlegroundsBackground: shellStyle?.backgroundImage || '',
      battlegroundsSign: content ? getComputedStyle(content, '::before').backgroundImage : '',
      contentPadding: contentStyle?.padding || '',
      contentBorder: contentStyle?.borderTopWidth || '',
      contentRadius: contentStyle?.borderRadius || '',
      contentBackgroundColor: contentStyle?.backgroundColor || '',
      contentBackgroundImage: contentStyle?.backgroundImage || '',
      contentShadow: contentStyle?.boxShadow || '',
      contentFilter: contentStyle?.filter || '',
      contentBackdrop: contentStyle?.backdropFilter || '',
      bannerPosition: bannerStyle?.position || null,
      bannerOverflow: bannerStyle?.overflow || null,
      bannerHeight: banner?.getBoundingClientRect().height || 0,
      suspiciousOverlays,
      mobile: isMobile,
    };
  }, mobile);
  const diagnostic = await page.evaluate(inspectHorizontalLayoutFault);
  return { ...layout, ...diagnostic };
}

function assertLayout(path, layout) {
  if (!layout.title || layout.textLength < 100) failures.push(`${path}: blank or unidentified page`);
  if (layout.scrollWidth > layout.clientWidth + 1) {
    failures.push(`${path}: horizontal overflow at ${layout.viewport.width}x${layout.viewport.height} `
      + `${layout.scrollWidth} > ${layout.clientWidth}; first fault: ${JSON.stringify(layout.firstLayoutFault)}`);
  }
  if (!layout.mobile && layout.wideWorkspace && (
    Math.abs(layout.workspaceRight - layout.clientWidth) > 0.5
    || layout.contentMinWidth !== '0px'
  )) {
    failures.push(`${path}: desktop full-width canvas escaped the workspace (${JSON.stringify({
      workspaceRight: layout.workspaceRight,
      viewportRight: layout.clientWidth,
      contentMinWidth: layout.contentMinWidth,
    })})`);
  }
  if (layout.shellOpacity !== '1') failures.push(`${path}: app shell opacity is ${layout.shellOpacity}`);
  if (layout.shellFilter && layout.shellFilter !== 'none') failures.push(`${path}: app shell filter is ${layout.shellFilter}`);
  if (layout.routeParchmentExpected && !layout.routeParchmentLoaded) failures.push(`${path}: route-owned parchment CSS was not loaded`);
  if (layout.routeParchmentExpected && (
    layout.contentBorder !== '0px'
    || layout.contentRadius !== '0px'
    || layout.contentShadow !== 'none'
    || layout.contentFilter !== 'none'
  )) {
    failures.push(`${path}: public content canvas fell back to the legacy dashboard frame (${JSON.stringify({
      border: layout.contentBorder,
      radius: layout.contentRadius,
      shadow: layout.contentShadow,
      filter: layout.contentFilter,
    })})`);
  }
  if (layout.routeParchmentExpected && !layout.battlegroundsSurface && (
    layout.contentBackgroundColor !== 'rgba(0, 0, 0, 0)'
    || layout.contentBackgroundImage !== 'none'
    || layout.contentBackdrop !== 'none'
  )) {
    failures.push(`${path}: editorial/game-data canvas inherited the legacy blue surface (${JSON.stringify({
      backgroundColor: layout.contentBackgroundColor,
      backgroundImage: layout.contentBackgroundImage,
      backdrop: layout.contentBackdrop,
    })})`);
  }
  if (layout.routeParchmentExpected && !layout.battlegroundsSurface) {
    const expectedPadding = layout.mobile ? '16px 12.8px 40px' : '0px 40.32px 56px';
    if (layout.contentPadding !== expectedPadding) {
      failures.push(`${path}: route content padding changed (${layout.contentPadding}; expected ${expectedPadding})`);
    }
  }
  if (layout.battlegroundsSurface && !layout.battlegroundsBackground.includes('arena-parchment')) {
    failures.push(`${path}: route-owned Battlegrounds parchment CSS was not loaded`);
  }
  if (layout.battlegroundsSurface && layout.battlegroundsSign !== 'none') {
    failures.push(`${path}: retired Battlegrounds section plaque returned (${layout.battlegroundsSign})`);
  }
  if (layout.bannerPosition && layout.bannerPosition !== 'relative') {
    failures.push(`${path}: banner is not a containing block (${layout.bannerPosition})`);
  }
  if (layout.bannerOverflow && layout.bannerOverflow !== 'hidden') {
    failures.push(`${path}: banner decoration is not contained (${layout.bannerOverflow})`);
  }
  if (layout.mobile && layout.bannerHeight > 260) failures.push(`${path}: mobile banner is unexpectedly tall (${layout.bannerHeight}px)`);
  if (layout.suspiciousOverlays.length) {
    failures.push(`${path}: dark viewport overlay detected (${layout.suspiciousOverlays.join(', ')})`);
  }
}

async function settleResponsiveSnapshot(page, { waitForFooter }) {
  if (waitForFooter) {
    await page.waitForSelector('.arena-footer', { visible: true, timeout: 10_000 });
  }
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 10_000 });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    const images = [...document.querySelectorAll('img')].filter(image => {
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    await Promise.all(images.map(image => Promise.race([
      image.decode().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 2_000)),
    ])));
    window.scrollTo({ top: 0, behavior: 'auto' });
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function auditTouchTargets(page) {
  return page.evaluate(minimum => {
    const describe = element => {
      const id = element.id ? `#${element.id}` : '';
      const classes = [...element.classList].slice(0, 3).map(name => `.${name}`).join('');
      return `${element.tagName.toLowerCase()}${id}${classes}`;
    };
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && style.pointerEvents !== 'none'
        && !element.closest('[inert], [aria-hidden="true"]');
    };
    const effectiveTarget = element => {
      if (!(element instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(element.type)) return element;
      const wrappingLabel = element.closest('label');
      if (wrappingLabel) return wrappingLabel;
      if (!element.id) return element;
      return document.querySelector(`label[for="${CSS.escape(element.id)}"]`) || element;
    };
    const undersized = [...document.querySelectorAll('a[href], button, input, select, textarea, summary, [role="button"]')]
      .filter((element, index, elements) => elements.indexOf(element) === index)
      .filter(element => visible(element))
      .filter(element => !(element instanceof HTMLButtonElement && element.disabled))
      .filter(element => !(element instanceof HTMLInputElement && (element.disabled || element.type === 'hidden')))
      .filter(element => !(element instanceof HTMLSelectElement && element.disabled))
      .filter(element => !(element instanceof HTMLTextAreaElement && element.disabled))
      .filter(element => {
        if (!(element instanceof HTMLAnchorElement)) return true;
        const style = getComputedStyle(element);
        return style.display !== 'inline';
      })
      .map(element => {
        const target = effectiveTarget(element);
        const rect = target.getBoundingClientRect();
        return {
          element: describe(element),
          target: target === element ? null : describe(target),
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        };
      })
      .filter(target => target.width < minimum || target.height < minimum);
    return { total: undersized.length, samples: undersized.slice(0, 8) };
  }, 44);
}

async function inspectSharedMobileChrome(page) {
  return page.evaluate(() => {
    const bounds = element => {
      const rect = element?.getBoundingClientRect();
      return rect ? { width: rect.width, height: rect.height } : null;
    };
    const footer = document.querySelector('.arena-footer');
    const footerColumns = document.querySelector('.arena-footer__columns');
    const footerLinks = [...document.querySelectorAll('.arena-footer__link')];
    return {
      viewportWidth: innerWidth,
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      header: bounds(document.querySelector('.global-utility-header')),
      searchInput: bounds(document.querySelector('.global-search__input')),
      faqButton: bounds(document.querySelector('.global-faq-button')),
      footer: bounds(footer),
      footerOverflows: Boolean(footer && footer.scrollWidth > footer.clientWidth + 1),
      footerColumnCount: footerColumns
        ? getComputedStyle(footerColumns).gridTemplateColumns.split(/\s+/).filter(Boolean).length
        : 0,
      footerLinks: footerLinks.map(bounds),
    };
  });
}

function assertSharedMobileChrome(label, profileId, chrome) {
  // The developer resources are a first-class third footer section. On
  // phones the sections stack into one column; the medium profile has enough
  // room for all three columns. Keep the height caps close to the measured
  // geometry so future content growth still has an explicit review point.
  const footerHeightMaximum = { 'compact-min': 800, 'phone-baseline': 780, medium: 360 }[profileId];
  const expectedFooterColumns = profileId === 'medium' ? 3 : 1;
  const targetIsLargeEnough = target => target && target.width >= 44 && target.height >= 44;
  const valid = chrome.header?.height >= 40 && chrome.header.height <= 50
    && targetIsLargeEnough(chrome.searchInput)
    && targetIsLargeEnough(chrome.faqButton)
    && chrome.footerColumnCount === expectedFooterColumns
    && chrome.footerLinks.length === 10
    && chrome.footerLinks.every(targetIsLargeEnough)
    && chrome.footer?.height <= footerHeightMaximum
    && !chrome.pageOverflows
    && !chrome.footerOverflows;
  if (!valid) failures.push(`${label}: shared mobile chrome contract regressed (${JSON.stringify(chrome)})`);
}

async function assertResponsiveFixtureState(page, fixture, label) {
  const state = await page.evaluate(readySelector => {
    const visible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const paywall = document.querySelector('.arena-paywall');
    const inlinePaywall = document.querySelector('.arena-inline-paywall');
    const ready = document.querySelector(readySelector);
    return {
      readyVisible: visible(ready),
      readyText: ready?.textContent?.replace(/\s+/g, ' ').trim() || '',
      paywallVisible: visible(paywall),
      paywallPreviewInert: Boolean(paywall?.querySelector('.arena-paywall__preview')?.hasAttribute('inert')),
      inlinePaywallVisible: visible(inlinePaywall),
      deniedText: document.querySelector('.admin-access-state')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      notFoundText: document.querySelector('.not-found-page')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    };
  }, fixture.ready.selector);

  if (!state.readyVisible) failures.push(`${label}: readiness selector is not visible (${fixture.ready.selector})`);
  if (fixture.ready.text && !state.readyText.includes(fixture.ready.text)) {
    failures.push(`${label}: readiness text is missing (${fixture.ready.text})`);
  }
  if (fixture.state === 'paywall' && !((state.paywallVisible && state.paywallPreviewInert) || state.inlinePaywallVisible)) {
    failures.push(`${label}: locked state is not an inert visible paywall (${JSON.stringify(state)})`);
  }
  if (fixture.state === 'content' && (state.paywallVisible || state.inlinePaywallVisible)) {
    failures.push(`${label}: entitled/public content is still covered by a paywall`);
  }
  if (fixture.state === 'denied' && !state.deniedText.toLocaleLowerCase('ru').includes('недоступ')) {
    failures.push(`${label}: admin denial copy is missing (${JSON.stringify(state)})`);
  }
  if (fixture.state === 'not-found' && !state.notFoundText.includes('Страница не найдена')) {
    failures.push(`${label}: not-found copy is missing (${JSON.stringify(state)})`);
  }
}

const browserLaunchOptions = {
  headless: 'new',
  executablePath: CHROMIUM_PATH,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
};

const browser = await puppeteer.launch(browserLaunchOptions);

async function createQaPage() {
  const page = await browser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  return page;
}

const shellViewportMatrix = [
  ['compact portrait', { width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['mobile portrait', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['medium portrait', { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['compact desktop', { width: 1024, height: 768, deviceScaleFactor: 1 }],
  ['desktop', { width: 1440, height: 900, deviceScaleFactor: 1 }],
  ['mobile landscape', { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
];

async function inspectStickyShell(page) {
  return page.evaluate(() => {
    const topbar = document.querySelector('.arena-mobile-topbar');
    const brand = document.querySelector('.arena-mobile-brand');
    const menu = document.querySelector('.arena-mobile-nav-toggle');
    const utility = document.querySelector('.global-utility-header');
    const root = document.documentElement;
    const isVisible = element => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden'
        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const describe = element => {
      if (!(element instanceof Element)) return null;
      const names = [];
      for (let current = element; current && current !== document.body; current = current.parentElement) {
        const id = current.id ? `#${current.id}` : '';
        const classes = [...current.classList].slice(0, 2).map(name => `.${name}`).join('');
        names.unshift(`${current.tagName.toLowerCase()}${id}${classes}`);
        if (names.length === 4) break;
      }
      return names.join(' > ');
    };
    const hasIntentionalHorizontalScroller = element => {
      for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
        const overflow = getComputedStyle(ancestor).overflowX;
        if (['auto', 'scroll'].includes(overflow) && ancestor.scrollWidth > ancestor.clientWidth + 1) return true;
      }
      return false;
    };
    const visibleElements = [...document.body.querySelectorAll('*')].filter(isVisible);
    const firstPageOverflowElement = visibleElements.find(element => {
      const rect = element.getBoundingClientRect();
      return (rect.left < -1 || rect.right > innerWidth + 1) && !hasIntentionalHorizontalScroller(element);
    });
    const firstClippedShellElement = [
      ...document.querySelectorAll('.arena-mobile-topbar *, .global-utility-header *'),
    ].find(element => {
      if (!isVisible(element) || element instanceof HTMLInputElement || element instanceof SVGElement) return false;
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      const intentionallyVisuallyHidden = bounds.width <= 1.5 && bounds.height <= 1.5
        && style.clipPath.includes('50%');
      if (intentionallyVisuallyHidden) return false;
      return ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1;
    });
    const rect = element => {
      const bounds = element?.getBoundingClientRect();
      return bounds ? {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      } : null;
    };
    const topbarRect = rect(topbar);
    const utilityRect = rect(utility);
    const topbarVisible = isVisible(topbar);
    const utilityVisible = isVisible(utility);
    const headerOverlap = topbarVisible && utilityVisible && topbarRect && utilityRect
      ? Math.max(0, Math.min(topbarRect.right, utilityRect.right) - Math.max(topbarRect.left, utilityRect.left))
        * Math.max(0, Math.min(topbarRect.bottom, utilityRect.bottom) - Math.max(topbarRect.top, utilityRect.top))
      : 0;
    return {
      scrollY,
      viewport: { width: innerWidth, height: innerHeight },
      page: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      topbar: {
        visible: topbarVisible,
        position: topbar ? getComputedStyle(topbar).position : '',
        rect: topbarRect,
      },
      utility: {
        visible: utilityVisible,
        position: utility ? getComputedStyle(utility).position : '',
        rect: utilityRect,
      },
      targets: {
        brand: rect(brand),
        menu: rect(menu),
      },
      headerOverlap,
      firstLayoutFault: firstPageOverflowElement
        ? { kind: 'page-overflow', element: describe(firstPageOverflowElement), rect: rect(firstPageOverflowElement) }
        : firstClippedShellElement
          ? { kind: 'shell-clipping', element: describe(firstClippedShellElement), rect: rect(firstClippedShellElement) }
          : null,
    };
  });
}

function assertStickyShellState(label, state, { afterScroll }) {
  const compact = state.viewport.width < 1024;
  const pageOverflows = state.page.scrollWidth > state.page.clientWidth + 1;
  const scrollIncorrect = afterScroll && Math.abs(state.scrollY - 500) > 1;
  const compactContractBroken = compact && (
    !state.topbar.visible
    || state.topbar.position !== 'sticky'
    || Math.abs(state.topbar.rect?.top || 0) > 1
    || state.utility.position === 'sticky'
    || (afterScroll && (state.utility.rect?.bottom || 0) > 1)
    || (state.targets.brand?.height || 0) < 48
    || (state.targets.menu?.width || 0) < 44
    || (state.targets.menu?.height || 0) < 44
  );
  const desktopContractBroken = !compact && (
    state.topbar.visible
    || !state.utility.visible
    || state.utility.position !== 'sticky'
    || Math.abs(state.utility.rect?.top || 0) > 1
  );
  if (pageOverflows || state.headerOverlap > 1 || state.firstLayoutFault
    || scrollIncorrect || compactContractBroken || desktopContractBroken) {
    failures.push(`shell viewport [${label}]${afterScroll ? ' after scrollY=500' : ''}: sticky/overflow contract regressed (${JSON.stringify(state)})`);
  }
}

const authenticatedRouteFilter = (process.env.QA_AUTH_ROUTE_FILTER || '')
  .split(',')
  .map(path => path.trim())
  .filter(Boolean);
const authenticatedRoutes = [
  { path: '/articles', expected: 'Первая статья', selector: '.article-image-shell img' },
  { path: '/faq', expected: 'Частые вопросы', selector: '.faq-page__questions details' },
  { path: '/classes', expected: 'Паладин', selector: '.arena-app-winrates', tour: { expectedSteps: 3 } },
  { path: '/tierlist', expected: 'Тир-лист', selector: '.hs-tier-card', tour: { expectedSteps: 5 } },
  { path: '/legendaries', expected: 'Медив Освященный', selector: '.legendary-group-card', tour: { expectedSteps: 3 } },
  { path: '/guides-archive', expected: 'Контрольный гайд Арены', selector: '.guide-archive-card' },
  { path: '/battlegrounds/tier-list?list=spells', expected: 'Тир-лист заклинаний', selector: '.bg-tier-list-page', tour: { minSteps: 2 } },
  { path: '/heroes', expected: 'Контрольный герой', selector: '.battleground-hero-card', tour: { expectedSteps: 4 } },
  { path: '/heroes/9001', expected: 'Контрольный герой', selector: '.bg-hero-detail-page', tour: { minSteps: 5 } },
  { path: '/library', expected: 'Библиотека Полей Сражений', selector: '.bg-library-page', tour: { expectedSteps: 4 } },
  { path: '/library/minions/kontrolnoe-sushchestvo-9101', expected: 'Контрольное существо', selector: '.bg-library-detail-page', tour: { expectedSteps: 4 } },
  { path: '/battlegrounds/strategies', expected: 'Готовые сборки', selector: '[data-tour-id="bg-strategy-builder-presets"]', tour: { expectedSteps: 7 } },
  { path: '/battlegrounds/tier-builder', expected: 'Поиск по картам', selector: '[data-tour-id="bg-tier-builder-board"]', tour: { expectedSteps: 7 } },
].filter(route => authenticatedRouteFilter.length === 0 || authenticatedRouteFilter.includes(route.path));

async function assertArenaDataRoutePresentation(page, path, device) {
  const state = await page.evaluate(routePath => {
    const style = (selector, pseudo) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element, pseudo) : null;
    };
    const snapshot = computed => computed ? {
      color: computed.color,
      backgroundColor: computed.backgroundColor,
      backgroundImage: computed.backgroundImage,
      borderImageSource: computed.borderImageSource,
      borderRadius: computed.borderRadius,
      boxShadow: computed.boxShadow,
      textShadow: computed.textShadow,
      display: computed.display,
    } : null;

    if (routePath === '/classes') {
      return {
        kind: 'classes',
        winner: snapshot(style(".arena-class-row[data-rank='1']")),
        title: snapshot(style(".arena-class-row[data-rank='1'] .font-hs")),
        games: snapshot(style(".arena-class-row[data-rank='1'] > div:last-child span")),
      };
    }
    if (routePath === '/tierlist') {
      const grid = document.querySelector('.tierlist-card-grid');
      const firstCard = document.querySelector('.hs-tier-card');
      const firstImage = firstCard?.querySelector('.hs-tier-card-inner > img');
      const firstImageStyle = firstImage ? getComputedStyle(firstImage) : null;
      return {
        kind: 'tierlist',
        sourceShell: snapshot(style('.tierlist-source-toggle')),
        activeSource: snapshot(style(".tierlist-source-toggle .source-toggle-button[data-active='true']")),
        classTabs: snapshot(style('.tierlist-class-tabs')),
        activeFilter: snapshot(style(".tierlist-rarity-filter > button[data-active='true']")),
        heading: snapshot(style('.tierlist-group-heading h3')),
        gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length : 0,
        gridGap: grid ? getComputedStyle(grid).gap : '',
        gridPaddingInline: grid ? getComputedStyle(grid).paddingInline : '',
        firstCardRarity: firstCard?.getAttribute('data-rarity') || '',
        firstCardMaxWidth: firstCard ? getComputedStyle(firstCard).maxWidth : '',
        firstImageMaxWidth: firstImageStyle?.maxWidth || '',
        firstImageAspectRatio: firstImageStyle?.aspectRatio || '',
        firstImageObjectFit: firstImageStyle?.objectFit || '',
      };
    }
    if (routePath === '/legendaries') {
      return {
        kind: 'legendaries',
        sourceShell: snapshot(style('.legendary-source-toggle')),
        activeSource: snapshot(style(".legendary-source-toggle .source-toggle-button[data-active='true']")),
        classTabs: snapshot(style('.legendary-class-tabs')),
        selectedClass: snapshot(style(".legendary-class-tabs button[aria-pressed='true'] > div")),
        count: snapshot(style('.legendary-count-pill')),
        firstCard: snapshot(style(".legendary-group-card[data-rank='1']")),
        firstCardAfter: snapshot(style(".legendary-group-card[data-rank='1']", '::after')),
      };
    }
    if (routePath === '/articles') {
      const image = document.querySelector('.article-image-shell img');
      const shell = image?.parentElement;
      const imageStyle = image ? getComputedStyle(image) : null;
      const shellRect = shell?.getBoundingClientRect();
      return {
        kind: 'articles',
        objectFit: imageStyle?.objectFit || '',
        shellRatio: shellRect?.height ? shellRect.width / shellRect.height : 0,
        imageRatio: image?.naturalHeight ? image.naturalWidth / image.naturalHeight : 0,
      };
    }
    if (routePath === '/heroes') {
      return {
        kind: 'heroes',
        cardOverflow: style('.battleground-hero-card')?.overflow || '',
      };
    }
    return { kind: 'other' };
  }, path);

  const prefix = `${path} [${device}] route materials`;
  if (state.kind === 'articles') {
    if (state.objectFit !== 'contain' || Math.abs(state.shellRatio - state.imageRatio) > 0.03) {
      failures.push(`${prefix}: article cover is cropped (${JSON.stringify(state)})`);
    }
    return;
  }
  if (state.kind === 'classes') {
    if (!state.winner?.backgroundImage.includes('arena-rail-red.jpg') || !state.winner?.borderImageSource.includes('main-page-rail-border.png')) {
      failures.push(`${prefix}: winner row lost its red timber material`);
    }
    if (state.title?.color !== 'rgb(255, 240, 197)' || state.title?.textShadow === 'none') {
      failures.push(`${prefix}: winner title color changed (${state.title?.color || 'missing'})`);
    }
    if (state.games?.color !== 'rgb(225, 195, 139)') failures.push(`${prefix}: winner games color changed (${state.games?.color || 'missing'})`);
    return;
  }
  if (state.kind === 'heroes') {
    if (state.cardOverflow !== 'visible') failures.push(`${prefix}: hero hover cards are clipped (${state.cardOverflow})`);
    return;
  }
  if (state.kind === 'tierlist' || state.kind === 'legendaries') {
    if (!state.sourceShell?.backgroundImage.includes('arena-parchment.jpg') || state.sourceShell?.borderRadius !== '2px') {
      failures.push(`${prefix}: source switcher lost its parchment frame`);
    }
    if (state.activeSource?.backgroundColor !== 'rgb(109, 17, 23)' || state.activeSource?.color !== 'rgb(255, 240, 196)') {
      failures.push(`${prefix}: active source material changed (${JSON.stringify(state.activeSource)})`);
    }
    if (!state.classTabs?.borderImageSource.includes('linear-gradient')) failures.push(`${prefix}: class tabs lost the wooden divider`);
  }
  if (state.kind === 'tierlist') {
    if (state.activeFilter?.backgroundColor !== 'rgb(109, 17, 23)' || state.activeFilter?.color !== 'rgb(255, 240, 196)') {
      failures.push(`${prefix}: active filter material changed (${JSON.stringify(state.activeFilter)})`);
    }
    if (state.heading?.color !== 'rgb(61, 41, 29)') failures.push(`${prefix}: tier heading color changed (${state.heading?.color || 'missing'})`);
    const expectedColumns = device === 'desktop' ? 6 : 2;
    if (state.gridColumns !== expectedColumns || state.firstCardRarity !== 'legendary') {
      failures.push(`${prefix}: responsive card grid or rarity metadata changed (${JSON.stringify({ columns: state.gridColumns, rarity: state.firstCardRarity })})`);
    }
    const expectedImageMaxWidth = device === 'desktop' ? '230px' : '190px';
    const expectedGap = device === 'desktop' ? '17.28px' : '7.2px';
    const expectedPaddingInline = device === 'desktop' ? '4.8px' : '0px';
    if (state.firstCardMaxWidth !== '230px'
      || state.firstImageMaxWidth !== expectedImageMaxWidth
      || state.firstImageAspectRatio !== '512 / 776'
      || state.firstImageObjectFit !== 'contain'
      || state.gridGap !== expectedGap
      || state.gridPaddingInline !== expectedPaddingInline) {
      failures.push(`${prefix}: tier cards no longer match the constructed-card scale (${JSON.stringify(state)})`);
    }
  }
  if (state.kind === 'legendaries') {
    if (state.count?.backgroundColor !== 'rgb(77, 11, 16)' || state.count?.color !== 'rgb(224, 195, 141)') {
      failures.push(`${prefix}: group count material changed (${JSON.stringify(state.count)})`);
    }
    if (!state.firstCard?.backgroundImage.includes('arena-rail-red.jpg') || !state.firstCard?.borderImageSource.includes('main-page-rail-border.png')) {
      failures.push(`${prefix}: first legendary group lost its red timber material`);
    }
    if (state.firstCardAfter?.display !== 'none') failures.push(`${prefix}: retired legendary overlay became visible`);
    if (!state.selectedClass?.boxShadow.includes('rgb(239, 197, 104)')) failures.push(`${prefix}: selected class ring changed (${state.selectedClass?.boxShadow || 'missing'})`);
  }
}

async function auditShellErrorRecovery() {
  const page = await createQaPage();
  const adminState = { shellChunkFailure: true };
  let documentRequests = 0;
  page.on('request', request => {
    if (request.resourceType() === 'document') documentRequests += 1;
  });
  await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true, adminState });
  try {
    await page.goto(`${BASE}/articles/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('[data-app-error="shell"]', { visible: true, timeout: 20_000 });
    await page.waitForFunction(() => document.activeElement?.classList.contains('app-error-card'), { timeout: 5_000 });
    await new Promise(resolve => setTimeout(resolve, 750));

    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const alert = document.querySelector('[data-app-error="shell"] [role="alert"]');
      const button = document.querySelector('.app-error-action--primary');
      const link = document.querySelector('.app-error-action--secondary');
      const rect = element => {
        const bounds = element?.getBoundingClientRect();
        return bounds ? { width: bounds.width, height: bounds.height } : null;
      };
      return {
        alertLabel: alert?.getAttribute('aria-labelledby') || '',
        title: document.querySelector('#app-error-title')?.textContent || '',
        incidentId: document.querySelector('[data-app-error-incident]')?.textContent || '',
        releaseId: document.querySelector('[data-app-error-release]')?.textContent || '',
        buttonText: button?.textContent?.trim() || '',
        button: rect(button),
        link: rect(link),
        focused: document.activeElement?.classList.contains('app-error-card') || false,
        overflow: root.scrollWidth > root.clientWidth + 1,
      };
    });
    const validIncident = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
      .test(state.incidentId);
    const validRelease = state.releaseId === 'development' || /^[a-f0-9]{7,40}$/.test(state.releaseId);
    if (documentRequests !== 1 || state.alertLabel !== 'app-error-title'
      || !state.title.includes('обновить') || !validIncident || !validRelease
      || state.buttonText !== 'Обновить страницу' || (state.button?.height || 0) < 44
      || (state.link?.height || 0) < 44 || !state.focused || state.overflow) {
      failures.push(`shell error recovery: fallback contract regressed (${JSON.stringify({ documentRequests, ...state })})`);
    }
    const violationCount = await auditAccessibility(page, 'shell error recovery');
    await page.screenshot({ path: `${OUT}/shell-error-recovery-mobile.png`, fullPage: false });

    const requestsBeforeReload = documentRequests;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45_000 }),
      page.click('.app-error-action--primary'),
    ]);
    await waitForAuthenticatedShell(page);
    await page.waitForSelector('.global-utility-header', { visible: true, timeout: 20_000 });
    if (documentRequests !== requestsBeforeReload + 1) {
      failures.push(`shell error recovery: explicit retry caused ${documentRequests - requestsBeforeReload} document requests`);
    }
    console.log(`✓ shell error recovery [mobile] explicit reload + axe (${violationCount} violations)`);
  } catch (error) {
    const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 240).replace(/\s+/g, ' ') || 'empty body')
      .catch(() => 'unavailable body');
    failures.push(`shell error recovery [mobile]: ${error.message}; page: ${diagnostic}`);
  } finally {
    await page.close();
  }
}

await auditShellErrorRecovery();

async function auditShellRenderRetry() {
  // The preceding chunk-recovery scenario intentionally reloads the same shell
  // module successfully. A fresh browser profile gives this scenario a cold
  // module cache, so interception can install a deterministic render failure.
  const isolatedBrowser = await puppeteer.launch(browserLaunchOptions);
  const page = await isolatedBrowser.newPage();
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  let documentRequests = 0;
  page.on('request', request => {
    if (request.resourceType() === 'document') documentRequests += 1;
  });
  await page.setViewport({ width: 320, height: 568, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true, adminState: { shellRenderFailure: true } });
  try {
    await page.goto(`${BASE}/articles/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('[data-app-error="shell"]', { visible: true, timeout: 20_000 });
    const fallback = await page.evaluate(() => ({
      title: document.querySelector('#app-error-title')?.textContent || '',
      action: document.querySelector('.app-error-action--primary')?.textContent?.trim() || '',
    }));
    if (!fallback.title.includes('ошибка интерфейса') || fallback.action !== 'Повторить' || documentRequests !== 1) {
      failures.push(`shell render recovery: fallback contract regressed (${JSON.stringify({ documentRequests, ...fallback })})`);
    }

    const requestsBeforeRetry = documentRequests;
    await page.click('.app-error-action--primary');
    await page.waitForSelector('[data-app-error="shell"]', { hidden: true, timeout: 20_000 });
    await waitForAuthenticatedShell(page);
    if (documentRequests !== requestsBeforeRetry) {
      failures.push(`shell render recovery: in-place retry caused ${documentRequests - requestsBeforeRetry} document requests`);
    }
    console.log('✓ shell render recovery [mobile] in-place retry without reload');
  } catch (error) {
    const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 240).replace(/\s+/g, ' ') || 'empty body')
      .catch(() => 'unavailable body');
    failures.push(`shell render recovery [mobile]: ${error.message}; page: ${diagnostic}`);
  } finally {
    await isolatedBrowser.close();
  }
}

await auditShellRenderRetry();

for (const route of authenticatedRoutes) {
  for (const [device, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const page = await createQaPage();
    const runtimeErrors = collectRuntimeErrors(page);
    await page.setViewport(viewport);
    await mockApplicationApi(page, { authenticated: true });
    try {
      console.log(`→ ${route.path} [${device}]`);
      await page.goto(BASE + route.path, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      await waitForMeaningfulPage(page, route.expected);
      await page.waitForSelector(route.selector, { timeout: 20_000 });
      await assertArenaDataRoutePresentation(page, route.path, device);
      if (route.path === '/battlegrounds/strategies' && device === 'desktop') {
        await page.waitForFunction(() => [...document.querySelectorAll('#builder-source-filters button')]
          .some(button => button.textContent?.trim() === 'Герои'), { timeout: 10_000 });
        await page.evaluate(() => {
          const heroesButton = [...document.querySelectorAll('#builder-source-filters button')]
            .find(button => button.textContent?.trim() === 'Герои');
          if (!(heroesButton instanceof HTMLElement)) throw new Error('Фильтр героев не найден');
          heroesButton.click();
        });
        await page.type('#builder-search', 'Ксавий');
        await page.waitForFunction(() => {
          const cards = [...document.querySelectorAll('#builder-library .builder-card')];
          return cards.length === 1
            && cards[0].classList.contains('is-hero')
            && cards[0].getAttribute('title')?.includes('Ксавий');
        }, { timeout: 10_000 });
        await page.waitForSelector('.builder-card.is-hero[title*="Ксавий"]', { visible: true, timeout: 10_000 });
        await page.$eval('.builder-card.is-hero[title*="Ксавий"]', card => card.scrollIntoView({ block: 'center' }));
        await page.waitForFunction(() => {
          const image = document.querySelector('.builder-card.is-hero[title*="Ксавий"] img');
          return Boolean(image?.complete && image.naturalWidth >= 300 && image.naturalHeight >= 400);
        }, { timeout: 10_000 });
        const liveHeroState = await page.$eval('.builder-card.is-hero[title*="Ксавий"]', card => {
          const image = card.querySelector('img');
          return {
            title: card.getAttribute('title') || '',
            decoded: Boolean(image?.complete && image.naturalWidth >= 300 && image.naturalHeight >= 400),
          };
        });
        if (!liveHeroState.title.includes('Повелитель кошмаров Ксавий') || !liveHeroState.decoded) {
          failures.push(`/battlegrounds/strategies [desktop]: current hero did not render at full fixture quality (${JSON.stringify(liveHeroState)})`);
        }
        await page.click('.builder-card.is-hero[title*="Ксавий"]');
        await page.waitForFunction(() => document.querySelector('#builder-counter')?.textContent?.startsWith('1 '));
        await page.waitForFunction(() => {
          const image = document.querySelector('.placed-card-art');
          return Boolean(image?.complete && image.naturalWidth >= 300 && image.naturalHeight >= 400);
        }, { timeout: 10_000 });
        await page.screenshot({ path: `${OUT}/battlegrounds-strategies-live-hero-desktop.png`, fullPage: false });
        await page.click('#builder-clear');
        await page.$eval('#builder-search', input => {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await page.evaluate(() => {
          const allButton = [...document.querySelectorAll('#builder-source-filters button')]
            .find(button => button.textContent?.trim() === 'Все карты');
          if (!(allButton instanceof HTMLElement)) throw new Error('Общий фильтр не найден');
          allButton.click();
        });
      }
      if (route.path === '/battlegrounds/tier-builder' && device === 'desktop') {
        await page.waitForFunction(() => [...document.querySelectorAll('#tier-builder-source-filters button')]
          .some(button => button.textContent?.trim() === 'Герои'), { timeout: 10_000 });
        await page.click('#tier-builder-unassigned');
        await page.evaluate(() => {
          const heroesButton = [...document.querySelectorAll('#tier-builder-source-filters button')]
            .find(button => button.textContent?.trim() === 'Герои');
          if (!(heroesButton instanceof HTMLElement)) throw new Error('Фильтр героев не найден');
          heroesButton.click();
        });
        await page.type('#tier-builder-search', 'Ксавий');
        await page.waitForFunction(() => {
          const cards = [...document.querySelectorAll('#tier-builder-pool .tier-builder-card')];
          return cards.length === 1 && cards[0].getAttribute('title')?.includes('Ксавий');
        }, { timeout: 10_000 });
        await page.waitForSelector('#tier-builder-pool .tier-builder-card[title*="Ксавий"]', { visible: true, timeout: 10_000 });
        const liveHeroState = await page.$eval('#tier-builder-pool .tier-builder-card[title*="Ксавий"]', async card => {
          const image = card.querySelector('img');
          await image?.decode().catch(() => {});
          return {
            title: card.getAttribute('title') || '',
            decoded: Boolean(image?.complete && image.naturalWidth >= 300 && image.naturalHeight >= 400),
          };
        });
        if (!liveHeroState.title.includes('Повелитель кошмаров Ксавий') || !liveHeroState.decoded) {
          failures.push(`/battlegrounds/tier-builder [desktop]: current hero did not render at full fixture quality (${JSON.stringify(liveHeroState)})`);
        }
        const liveHero = await page.$('#tier-builder-pool .tier-builder-card[title*="Ксавий"]');
        const sTier = await page.$('.tier-builder-dropzone[data-tier="S"]');
        if (!liveHero || !sTier) throw new Error('Герой или S-тир не найден');
        try {
          await sTier.drop(liveHero);
        } finally {
          await Promise.allSettled([liveHero.dispose(), sTier.dispose()]);
        }
        await page.waitForSelector('.tier-builder-dropzone[data-tier="S"] .tier-builder-card[title*="Ксавий"]', { visible: true, timeout: 10_000 });
        await page.waitForFunction(async () => {
          const image = document.querySelector('.tier-builder-dropzone[data-tier="S"] .tier-builder-card[title*="Ксавий"] img');
          await image?.decode().catch(() => {});
          return Boolean(image?.complete && image.naturalWidth >= 300 && image.naturalHeight >= 400);
        }, { timeout: 10_000 });
        await page.waitForFunction(() => (
          !document.querySelector('#tier-builder-pool .tier-builder-card[title*="Ксавий"]')
          && document.querySelector('#tier-builder-counter')?.textContent?.startsWith('1 ')
        ), { timeout: 10_000 });
        await page.screenshot({ path: `${OUT}/battlegrounds-tier-builder-live-hero-desktop.png`, fullPage: false });
        await page.click('#tier-builder-unassigned');
        await page.click('#tier-builder-reset');
        await page.waitForFunction(() => (
          document.querySelector('#tier-builder-counter')?.textContent?.startsWith('0 ')
          && document.querySelector('#tier-builder-search')?.value === ''
          && document.querySelector('#tier-builder-source-filters button.is-active')?.textContent?.trim() === 'Все карты'
        ), { timeout: 10_000 });
      }
      if (route.path === '/heroes' && device === 'desktop') {
        const hoverHeroSelector = '.battleground-hero-card[data-has-related="true"]';
        await page.waitForSelector(hoverHeroSelector, { visible: true, timeout: 10_000 });
        await page.hover(hoverHeroSelector);
        await page.waitForFunction((selector) => {
          const related = document.querySelector(selector)?.querySelector('.battleground-hero-related-card');
          return related && Number.parseFloat(getComputedStyle(related).opacity) > 0.9;
        }, { timeout: 10_000 }, hoverHeroSelector);
        const hoverContainment = await page.evaluate((selector) => {
          const clippedBy = (element) => {
            const rect = element.getBoundingClientRect();
            const ancestors = [];
            for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              const clipsX = style.overflowX === 'hidden' || style.overflowX === 'clip';
              const clipsY = style.overflowY === 'hidden' || style.overflowY === 'clip';
              const ancestorRect = ancestor.getBoundingClientRect();
              if ((clipsX && (rect.left < ancestorRect.left - 1 || rect.right > ancestorRect.right + 1))
                || (clipsY && (rect.top < ancestorRect.top - 1 || rect.bottom > ancestorRect.bottom + 1))) {
                ancestors.push(ancestor.className || ancestor.tagName);
              }
            }
            return ancestors;
          };
          const hoveredCard = document.querySelector(selector);
          const main = hoveredCard?.querySelector('.battleground-hero-main');
          const related = hoveredCard?.querySelector('.battleground-hero-related-card');
          return {
            main: main ? clippedBy(main) : ['missing-main-card'],
            related: related ? clippedBy(related) : ['missing-related-card'],
          };
        }, hoverHeroSelector);
        if (hoverContainment.main.length || hoverContainment.related.length) {
          failures.push(`/heroes [desktop]: hover cards are clipped (${JSON.stringify(hoverContainment)})`);
        }
        await page.screenshot({ path: `${OUT}/heroes-hover-desktop.png`, fullPage: false });
        await page.mouse.move(1, 1);
      }
      if (route.path === '/tierlist' && device === 'desktop') {
        await page.hover('.hs-tier-card');
        await page.waitForFunction(() => getComputedStyle(document.querySelector('.hs-tier-card .hs-tier-card-inner')).filter.includes('drop-shadow'));
        const rarityHoverState = await page.$eval('.hs-tier-card', card => ({
          rarity: card.getAttribute('data-rarity') || '',
          glow: getComputedStyle(card).getPropertyValue('--tier-card-rarity-glow').trim(),
          cardFilter: getComputedStyle(card.querySelector('.hs-tier-card-inner')).filter,
        }));
        if (rarityHoverState.rarity !== 'legendary'
          || !rarityHoverState.glow.startsWith('rgba(255, 151, 38,')
          || !rarityHoverState.cardFilter.includes('drop-shadow')) {
          failures.push(`/tierlist [desktop]: rarity hover glow regressed (${JSON.stringify(rarityHoverState)})`);
        }
        await page.mouse.move(1, 1);
        await page.waitForSelector('.card-stats-tooltip--parchment', { hidden: true, timeout: 5_000 });
        await page.focus('.hs-tier-card');
        await page.keyboard.press('Enter');
        await page.waitForSelector('.card-modal-lightbox', { visible: true });
        await page.keyboard.press('Escape');
        await page.waitForSelector('.card-modal-lightbox', { hidden: true });
      }
      if (route.path === '/tierlist' && device === 'mobile') {
        await page.type('.tierlist-class-search input', 'Медив');
        await page.waitForSelector('[aria-label="Очистить поиск"]');
        const searchTargets = await page.evaluate(() => {
          const bounds = selector => document.querySelector(selector)?.getBoundingClientRect();
          const input = bounds('.tierlist-class-search input');
          const clear = bounds('[aria-label="Очистить поиск"]');
          return { input: input ? [input.width, input.height] : null, clear: clear ? [clear.width, clear.height] : null };
        });
        if (!searchTargets.input || searchTargets.input[1] < 44
          || !searchTargets.clear || searchTargets.clear[0] < 44 || searchTargets.clear[1] < 44) {
          failures.push(`/tierlist [mobile]: search targets are smaller than 44px (${JSON.stringify(searchTargets)})`);
        }
        await page.click('[aria-label="Очистить поиск"]');
        await page.waitForFunction(() => document.querySelector('.tierlist-class-search input')?.value === '');
        await page.click('.tierlist-view-toggle button:last-child');
        await page.waitForSelector('.hsrdv-table-card');
        const tableCardHeight = await page.$eval('.hsrdv-table-card', element => element.getBoundingClientRect().height);
        if (tableCardHeight < 44) failures.push(`/tierlist [mobile]: table card target is ${tableCardHeight}px high`);
        await page.click('.tierlist-view-toggle button:first-child');
        await page.waitForSelector('.hs-tier-card');
      }
      if (route.path === '/legendaries' && device === 'desktop') {
        await page.focus('.legendary-card-button');
        await page.keyboard.press('Enter');
        await page.waitForSelector('.card-modal-lightbox', { visible: true });
        await page.keyboard.press('Escape');
        await page.waitForSelector('.card-modal-lightbox', { hidden: true });
      }
      if (route.path === '/tierlist') {
        const firstTier = await page.$('.tierlist-group');
        await firstTier?.screenshot({ path: `${OUT}/tierlist-cards-${device}.png` });
      }
      if (route.path === '/faq') {
        await page.click('.global-faq-button');
        await page.waitForSelector('.global-help-menu', { visible: true, timeout: 10_000 });
        const faqPageState = await page.evaluate(() => ({
          sections: document.querySelectorAll('.faq-page__section').length,
          questions: document.querySelectorAll('.faq-page__questions details').length,
          quickSteps: document.querySelectorAll('.faq-page__start li').length,
          authLinks: document.querySelectorAll('a[href="/?login"]').length,
          activeHeaderLink: document.querySelector('.global-help-menu a[href="/faq"]')?.getAttribute('aria-current') || '',
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        }));
        if (faqPageState.sections !== 5 || faqPageState.questions < 18 || faqPageState.quickSteps !== 3
          || faqPageState.authLinks < 1 || faqPageState.activeHeaderLink !== 'page' || faqPageState.overflow) {
          failures.push(`/faq [${device}]: standalone help content regressed (${JSON.stringify(faqPageState)})`);
        }
        await page.keyboard.press('Escape');
      }
      if (route.path === '/articles') {
        const searchInput = await page.waitForSelector('.global-search input', { visible: true, timeout: 10_000 });
        await searchInput.type('контроль');
        await page.waitForSelector('.global-search-result', { visible: true, timeout: 10_000 });
        const utilityState = await page.evaluate(() => {
          const header = document.querySelector('.global-utility-header');
          const searchPanel = document.querySelector('.global-search-panel');
          const search = document.querySelector('.global-search');
          const main = document.querySelector('.arena-main');
          const headerRect = header?.getBoundingClientRect();
          return {
            height: headerRect?.height || 0,
            searchVisible: Boolean(searchPanel && getComputedStyle(searchPanel).display !== 'none'),
            resultText: searchPanel?.textContent || '',
            woodenSearchFrame: getComputedStyle(search).borderImageSource.includes('main-page-rail-border'),
            contentGap: Number.parseFloat(getComputedStyle(main).paddingTop || '0'),
            helpElement: document.querySelector('.global-faq-button')?.tagName || '',
            helpLabel: document.querySelector('.global-faq-button')?.textContent?.trim() || '',
            sidebarFaqLinks: document.querySelectorAll('.arena-sidebar a[href="/faq"]').length,
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          };
        });
        if (utilityState.height > 50 || utilityState.height < 40 || !utilityState.searchVisible
          || !utilityState.resultText.includes('Контрольный мета-отчет')
          || !utilityState.resultText.includes('Контрольная карта') || !utilityState.woodenSearchFrame
          || utilityState.contentGap < 10 || utilityState.helpElement !== 'BUTTON'
          || !utilityState.helpLabel.includes('Помощь') || utilityState.sidebarFaqLinks !== 0 || utilityState.overflow) {
          failures.push(`/articles [${device}]: global utility header regressed (${JSON.stringify(utilityState)})`);
        }
        await page.click('.global-faq-button');
        await page.waitForSelector('.global-help-menu a[href="/faq"]', { visible: true, timeout: 10_000 });
        await page.keyboard.press('Escape');
      }
      const tourViolationCount = route.tour
        ? await auditPageTour(page, { label: `${route.path} [${device}]`, mobile: device === 'mobile', ...route.tour })
        : 0;
      if (route.path === '/library' && device === 'desktop') {
        await auditDelayedPageTourResume(page, '/library [desktop]');
      }
      const violationCount = await auditAccessibility(page, `${route.path} [${device}]`);
      const paywallVisible = await page.$eval('.arena-paywall', element => getComputedStyle(element).display !== 'none').catch(() => false);
      if (paywallVisible) failures.push(`${route.path} [${device}]: subscriber still sees paywall`);
      const layout = await inspectLayout(page, { mobile: device === 'mobile' });
      assertLayout(`${route.path} [${device}]`, layout);
      const screenshotName = route.path.replace(/^\//, '').replace(/[^a-z0-9-]+/gi, '-');
      await page.screenshot({ path: `${OUT}/${screenshotName}-${device}.png`, fullPage: false });
      if (runtimeErrors.length) failures.push(`${route.path} [${device}]: ${runtimeErrors.join(' | ')}`);
      console.log(`✓ ${route.path} [${device}] subscriber layout + axe (${violationCount + tourViolationCount} violations)`);
    } catch (error) {
      const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 240).replace(/\s+/g, ' ') || 'empty body').catch(() => 'unavailable body');
      failures.push(`${route.path} [${device}]: ${error.message}; page: ${diagnostic}`);
    } finally {
      await page.close();
    }
  }
}

// The shell breakpoints are a product contract, not screenshots sampled from
// one desktop and one phone. Verify portrait, landscape and breakpoint edges;
// include a post-scroll pass so nested overflow cannot silently disable sticky.
for (const [label, viewport] of shellViewportMatrix) {
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewport(viewport);
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForAuthenticatedShell(page);
    await page.waitForFunction(() => document.documentElement.scrollHeight - innerHeight >= 500, { timeout: 20_000 });
    const initial = await inspectStickyShell(page);
    assertStickyShellState(label, initial, { afterScroll: false });
    await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'auto' }));
    await page.waitForFunction(() => Math.abs(window.scrollY - 500) <= 1, { timeout: 5_000 });
    const scrolled = await inspectStickyShell(page);
    assertStickyShellState(label, scrolled, { afterScroll: true });
    if (runtimeErrors.length) failures.push(`shell viewport [${label}]: ${runtimeErrors.join(' | ')}`);
    console.log(`✓ shell viewport [${label}] initial + scrollY=500`);
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewport: { width: innerWidth, height: innerHeight },
      text: document.body?.innerText.slice(0, 180).replace(/\s+/g, ' ') || 'empty body',
    })).catch(() => ({ unavailable: true }));
    failures.push(`shell viewport [${label}]: ${error.message}; diagnostic=${JSON.stringify(diagnostic)}`);
  } finally {
    await page.close();
  }
}

if (authenticatedRouteFilter.length > 0) {
  await browser.close();
  if (failures.length) {
    console.error('\nFocused authenticated-route QA failures:');
    failures.forEach(failure => console.error(`  ✗ ${failure}`));
    process.exit(1);
  }
  console.log(`\nFocused authenticated-route QA passed. Screenshots: ${OUT}`);
  process.exit(0);
}

const responsiveScreenshotManifest = [];
if (responsiveFixtures.length) {
  console.log(`\nResponsive screenshot matrix: ${responsiveScope} (${responsiveFixtures.length} fixtures × ${responsiveProfiles.length} profiles)`);
}
for (const fixture of responsiveFixtures) {
  for (const profile of responsiveProfiles) {
    const page = await createQaPage();
    const runtimeErrors = collectRuntimeErrors(page, { sameOriginNetwork: true });
    const scenarioFailureStart = failures.length;
    const label = `responsive ${fixture.id} [${profile.width}x${profile.height}]`;
    const screenshotPath = `${OUT}/responsive-${fixture.id}-${profile.id}.png`;
    const transport = fixture.transport === 'nginx-html'
      ? (localNotFoundDocument ? 'status-preserving-local' : 'production-nginx')
      : 'preview';
    let httpStatus = null;
    await page.setViewport({
      width: profile.width,
      height: profile.height,
      deviceScaleFactor: profile.deviceScaleFactor,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
    });
    await mockApplicationApi(page, {
      authenticated: fixture.access !== 'anonymous',
      admin: fixture.access === 'admin',
      strictApi: true,
      notFoundDocument: fixture.transport === 'nginx-html' && localNotFoundDocument
        ? { pathname: fixture.path, html: localNotFoundDocument }
        : null,
    });
    try {
      const navigationResponse = await page.goto(`${BASE}${fixture.path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
      httpStatus = navigationResponse?.status() ?? null;
      if (fixture.transport === 'nginx-html' && httpStatus !== 404) {
        failures.push(`${label}: expected status-preserving HTTP 404, received ${httpStatus ?? 'no response'}`);
      }
      if (fixture.access === 'subscriber') await waitForAuthenticatedShell(page);
      await page.waitForSelector(fixture.ready.selector, { visible: true, timeout: 20_000 });
      await settleResponsiveSnapshot(page, { waitForFooter: !fixture.path.startsWith('/admin') });
      await assertResponsiveFixtureState(page, fixture, label);
      if (fixture.id === 'home') {
        assertSharedMobileChrome(label, profile.id, await inspectSharedMobileChrome(page));
      }
      let touchTargets = { total: 0, samples: [] };

      if (fixture.checks.includes('overflow')) {
        const layout = await inspectLayout(page, { mobile: true });
        if (layout.scrollWidth > layout.clientWidth + 1) {
          failures.push(`${label}: horizontal overflow ${layout.scrollWidth} > ${layout.clientWidth}; first fault: ${JSON.stringify(layout.firstLayoutFault)}`);
        }
      }
      if (fixture.checks.includes('axe')) await auditAccessibility(page, label);
      if (fixture.checks.includes('targets')) {
        touchTargets = await auditTouchTargets(page);
        if (enforceResponsiveTargets && touchTargets.total) {
          failures.push(`${label}: touch targets below 44px (${JSON.stringify(touchTargets.samples)})`);
        }
      }
      if (fixture.checks.includes('runtime-errors') && runtimeErrors.length) {
        failures.push(`${label}: ${runtimeErrors.join(' | ')}`);
      }

      await page.screenshot({ path: screenshotPath, fullPage: false });
      const screenshotSha256 = createHash('sha256').update(readFileSync(screenshotPath)).digest('hex');
      if (fixture.id === 'not-found' && profile.id === 'compact-min') {
        await page.waitForFunction(() => window.history.state?.routeKnown === false);
        const initial404State = await page.evaluate(() => ({
          knowledge: window.history.state?.routeKnown,
          staleMarker: document.getElementById('root')?.hasAttribute('data-route-status') ?? false,
        }));
        if (initial404State.knowledge !== false || initial404State.staleMarker) {
          failures.push(`${label}: bootstrap 404 state was not captured cleanly (${JSON.stringify(initial404State)})`);
        }

        await page.click('.not-found-page a[href="/"]');
        await page.waitForFunction(() => window.location.pathname === '/');
        await page.waitForSelector('.home-modern', { visible: true });
        await page.evaluate(() => {
          window.__qaSawHomeMutationWhileReturningTo404 = false;
          const observer = new MutationObserver(() => {
            if (window.location.pathname !== '/' && document.querySelector('.home-modern')) {
              window.__qaSawHomeMutationWhileReturningTo404 = true;
            }
          });
          observer.observe(document.getElementById('root'), { childList: true, subtree: true });
          window.__qa404ReturnObserver = observer;
          window.history.back();
        });
        await page.waitForFunction(path => window.location.pathname === path, {}, fixture.path);
        await page.waitForSelector('.not-found-page', { visible: true });
        const returned404State = await page.evaluate(() => {
          window.__qa404ReturnObserver?.disconnect();
          return {
            knowledge: window.history.state?.routeKnown,
            sawHomeMutation: Boolean(window.__qaSawHomeMutationWhileReturningTo404),
            staleMarker: document.getElementById('root')?.hasAttribute('data-route-status') ?? false,
          };
        });
        if (returned404State.knowledge !== false || returned404State.sawHomeMutation || returned404State.staleMarker) {
          failures.push(`${label}: 404 → Home → Back recovery regressed (${JSON.stringify(returned404State)})`);
        }
      }
      const scenarioFailures = failures.slice(scenarioFailureStart);
      responsiveScreenshotManifest.push({
        fixture: fixture.id,
        routeId: fixture.routeId,
        profile: profile.id,
        viewport: { width: profile.width, height: profile.height },
        access: fixture.access,
        state: fixture.state,
        transport,
        httpStatus,
        screenshot: screenshotPath.split('/').at(-1),
        screenshotSha256,
        captureStatus: 'captured',
        qaStatus: scenarioFailures.length ? 'failed' : 'passed',
        failures: scenarioFailures,
        findings: { touchTargetsBelow44px: touchTargets.total, touchTargetSamples: touchTargets.samples },
      });
      console.log(`${scenarioFailures.length ? '✗' : '✓'} ${label}${touchTargets.total ? ` · ${touchTargets.total} touch findings` : ''}`);
    } catch (error) {
      const failure = `${label}: ${error.message}`;
      failures.push(failure);
      responsiveScreenshotManifest.push({
        fixture: fixture.id,
        routeId: fixture.routeId,
        profile: profile.id,
        viewport: { width: profile.width, height: profile.height },
        access: fixture.access,
        state: fixture.state,
        transport,
        httpStatus,
        screenshot: null,
        captureStatus: 'failed',
        qaStatus: 'failed',
        failures: failures.slice(scenarioFailureStart),
      });
    } finally {
      await page.close();
    }
  }
}
if (responsiveScope !== 'off') {
  const responsiveManifestPath = `${OUT}/responsive-manifest.json`;
  const responsiveManifestTemporaryPath = `${responsiveManifestPath}.tmp-${process.pid}`;
  const responsiveSummary = responsiveScreenshotManifest.reduce((summary, entry) => {
    if (entry.captureStatus === 'captured') summary.captured += 1;
    if (entry.qaStatus === 'passed') summary.passed += 1;
    if (entry.qaStatus === 'failed') summary.failed += 1;
    summary.touchTargetsBelow44px += entry.findings?.touchTargetsBelow44px || 0;
    return summary;
  }, { captured: 0, passed: 0, failed: 0, deferred: 0, touchTargetsBelow44px: 0 });
  const touchTargetsByProfile = Object.fromEntries(responsiveProfiles.map(profile => [
    profile.id,
    responsiveScreenshotManifest
      .filter(entry => entry.profile === profile.id)
      .reduce((total, entry) => total + (entry.findings?.touchTargetsBelow44px || 0), 0),
  ]));
  if (responsiveTouchTargetRatchet) {
    if (responsiveSummary.touchTargetsBelow44px > responsiveTouchTargetRatchet.total) {
      failures.push(`responsive ${responsiveScope}: touch targets grew to ${responsiveSummary.touchTargetsBelow44px}; maximum ${responsiveTouchTargetRatchet.total}`);
    }
    for (const profile of responsiveProfiles) {
      const observed = touchTargetsByProfile[profile.id];
      const maximum = responsiveTouchTargetRatchet.profiles[profile.id];
      if (observed > maximum) failures.push(`responsive ${responsiveScope} [${profile.id}]: touch targets grew to ${observed}; maximum ${maximum}`);
    }
  }
  writeFileSync(responsiveManifestTemporaryPath, `${JSON.stringify({
    schemaVersion: 2,
    scope: responsiveScope,
    touchTargetPolicy: enforceResponsiveTargets ? 'enforce' : responsiveTouchTargetRatchet ? 'ratchet' : 'report',
    profiles: responsiveProfiles.map(profile => profile.id),
    summary: responsiveSummary,
    touchTargetRatchet: responsiveTouchTargetRatchet ? {
      limits: responsiveTouchTargetRatchet,
      observed: { total: responsiveSummary.touchTargetsBelow44px, profiles: touchTargetsByProfile },
      passed: responsiveSummary.touchTargetsBelow44px <= responsiveTouchTargetRatchet.total
        && responsiveProfiles.every(profile => touchTargetsByProfile[profile.id] <= responsiveTouchTargetRatchet.profiles[profile.id]),
    } : null,
    screenshots: responsiveScreenshotManifest,
  }, null, 2)}\n`);
  renameSync(responsiveManifestTemporaryPath, responsiveManifestPath);
}

// Full-admin dashboard: deterministic KPI rendering, empty state, quick
// navigation, responsive layout and accessibility after component extraction.
for (const [device, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  const adminState = {
    galleryEmpty: false,
    boostyFailure: false,
    telegramFailure: false,
    contestReadFailure: false,
    articles: structuredClone(adminFixtures['/api/articles'].articles),
    contests: structuredClone(adminFixtures['/api/admin/contests'].contests),
    users: structuredClone(adminFixtures['/api/admin/users'].users),
    translations: structuredClone(adminFixtures['/api/admin/archetype-translations'].items),
    mechanics: structuredClone(adminFixtures['/api/admin/mechanic-translations'].items),
    mailingCampaigns: structuredClone(adminFixtures['/api/admin/mailings/overview'].campaigns),
  };
  await page.setViewport(viewport);
  await mockApplicationApi(page, { authenticated: true, admin: true, adminState });
  try {
    await page.goto(`${BASE}/?admin&section=dashboard`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-stat-grid', { timeout: 20_000 });
    await page.waitForFunction(() => {
      const cards = [...document.querySelectorAll('.admin-stat-grid > div')];
      return cards.length === 4
        && cards[0]?.querySelector('strong')?.textContent?.trim() === '2'
        && cards[1]?.querySelector('strong')?.textContent?.trim() === '4'
        && cards[2]?.querySelector('small')?.textContent?.includes('3 заявок')
        && cards[3]?.querySelector('small')?.textContent?.includes('7 переходов');
    });
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const shell = document.querySelector('.bg-wood');
      const stats = [...document.querySelectorAll('.admin-stat-grid > div')].map(element => ({
        label: element.querySelector('span')?.textContent?.trim() || '',
        value: element.querySelector('strong')?.textContent?.trim() || '',
        detail: element.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      }));
      const quickActions = [...document.querySelectorAll('.admin-quick-actions button')].map(element => element.textContent?.trim() || '');
      return {
        stats,
        quickActions,
        emptyClicksStatus: document.querySelector('.admin-referral-clicks [role="status"]')?.textContent?.trim() || '',
        dashboardColumns: getComputedStyle(document.querySelector('.admin-dashboard-grid')).gridTemplateColumns.split(/\s+/).length,
        scrollWidth: root.scrollWidth,
        clientWidth: root.clientWidth,
        shellAfterBackground: shell ? getComputedStyle(shell, '::after').backgroundImage : '',
      };
    });
    if (state.stats.length !== 4) failures.push(`admin dashboard [${device}]: expected 4 KPI cards, got ${state.stats.length}`);
    const expectedStats = [
      { label: 'Контент', value: '2', detail: 'статей · 1 артов' },
      { label: 'Аудитория', value: '4', detail: 'платных Boosty · Telegram 1' },
      { label: 'Конкурсы', value: '1', detail: '3 заявок' },
      { label: 'Кампании', value: '1', detail: '7 переходов' },
    ];
    for (const [index, expected] of expectedStats.entries()) {
      if (JSON.stringify(state.stats[index]) !== JSON.stringify(expected)) {
        failures.push(`admin dashboard [${device}]: KPI ${index + 1} mismatch ${JSON.stringify(state.stats[index])}`);
      }
    }
    if (state.quickActions.length !== 9) failures.push(`admin dashboard [${device}]: expected 9 quick actions, got ${state.quickActions.length}`);
    if (state.dashboardColumns !== (device === 'desktop' ? 2 : 1)) failures.push(`admin dashboard [${device}]: expected owned ${device === 'desktop' ? 'two' : 'single'}-column layout, got ${state.dashboardColumns}`);
    if (!state.emptyClicksStatus.includes('Переходов пока нет')) failures.push(`admin dashboard [${device}]: recent-click empty state is not exposed`);
    if (state.scrollWidth > state.clientWidth + 1) failures.push(`admin dashboard [${device}]: horizontal overflow ${state.scrollWidth} > ${state.clientWidth}`);
    if (state.shellAfterBackground === 'none' || !state.shellAfterBackground.includes('linear-gradient')) {
      failures.push(`admin dashboard [${device}]: admin shell background overlay was lost`);
    }
    const violationCount = await auditAccessibility(page, `admin dashboard [${device}]`, '.admin-workspace-content');
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-quick-actions button')]
        .find(element => element.textContent?.trim() === 'Добавить статью');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Add article quick action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('#admin-section-title')?.textContent?.trim() === 'Статьи');
    if (!new URL(page.url()).searchParams.has('section') || !page.url().includes('section=articles')) {
      failures.push(`admin dashboard [${device}]: quick navigation did not update URL`);
    }
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 2);
    await page.click('.admin-article-row button:not(.admin-danger-button)');
    await page.waitForFunction(() => document.querySelector('.admin-article-form h2')?.textContent?.trim() === 'Редактирование статьи');
    const editedArticleTitle = await page.$eval('.admin-article-form input[required]', element => element.value);
    if (editedArticleTitle !== 'Первая статья') failures.push(`admin articles [${device}]: edit did not populate the form`);
    await replaceControlledInputValue(page, '.admin-article-form input[required]', 'Первая статья — обновлена');
    const articleImageUrlInput = '.admin-article-form input[aria-label="Картинка статьи: URL"]';
    await replaceControlledInputValue(page, articleImageUrlInput, 'https://images.example.test/cover.png');
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-article-form .admin-image-uploader-actions button')]
        .find(element => element.textContent?.trim() === 'Загрузить по ссылке');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Remote image import action is missing');
      button.click();
    });
    await page.waitForFunction(selector => (
      document.querySelector(selector)?.value === '/uploads/admin/qa-article-cover.webp'
    ), {}, articleImageUrlInput);
    const articleAccessOptions = await page.$$eval('.admin-article-form select option', options => options.map(option => ({
      value: option.value,
      text: option.textContent?.trim() || '',
    })));
    if (!articleAccessOptions.some(option => option.value === 'standard' && option.text.includes('Алмаз'))
      || !articleAccessOptions.some(option => option.value === 'wild' && option.text.includes('Алмаз'))) {
      failures.push(`admin articles [${device}]: Standard/Wild Diamond access options are missing`);
    }
    await page.click('.admin-article-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Статья обновлена.'));
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-article-row strong')]
      .some(element => element.textContent?.trim() === 'Первая статья — обновлена'));

    await page.type('.admin-article-form input[required]', 'Новая QA статья');
    await page.select('.admin-article-form select', 'standard');
    await page.click('.admin-article-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Статья добавлена.'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 3);
    const createdArticleRow = await page.$eval('.admin-article-row:first-child', element => element.textContent?.replace(/\s+/g, ' ').trim() || '');
    if (!createdArticleRow.includes('Стандарт')) failures.push(`admin articles [${device}]: saved Standard mode is not labelled`);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.admin-article-row')]
        .find(element => element.querySelector('strong')?.textContent?.trim() === 'Новая QA статья');
      const button = row?.querySelector('.admin-danger-button');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Created article delete action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Статья удалена.'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 2);

    const articleSearch = await page.$('.admin-list-toolbar input');
    if (!articleSearch) throw new Error('Article search input is missing');
    await articleSearch.type('несуществующий материал');
    await page.waitForFunction(() => document.querySelectorAll('.admin-article-row').length === 0);
    const articleEmptyState = await page.$eval('.admin-article-list [role="status"]', element => element.textContent?.trim() || '');
    if (!articleEmptyState.includes('ничего не найдено')) failures.push(`admin articles [${device}]: filtered empty state is missing`);
    const articleLayout = await page.evaluate(() => ({
      columns: getComputedStyle(document.querySelector('.admin-article-layout')).gridTemplateColumns.split(/\s+/).length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (articleLayout.scrollWidth > articleLayout.clientWidth + 1) {
      failures.push(`admin articles [${device}]: horizontal overflow ${articleLayout.scrollWidth} > ${articleLayout.clientWidth}`);
    }
    if (articleLayout.columns !== (device === 'desktop' ? 2 : 1)) failures.push(`admin articles [${device}]: expected owned ${device === 'desktop' ? 'two' : 'single'}-column layout, got ${articleLayout.columns}`);
    const articlesViolationCount = await auditAccessibility(page, `admin articles [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=translations`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-translation-table tbody tr').length === 2);
    await page.waitForFunction(() => document.querySelectorAll('.admin-untranslated-list li').length === 10);
    await page.screenshot({ path: `${OUT}/admin-translations-${device}.png`, fullPage: false });
    const translationEditorLayout = await page.evaluate(() => {
      const editor = document.querySelector('.admin-translation-editor');
      const coverage = document.querySelector('.admin-translation-coverage');
      const editorRect = editor?.getBoundingClientRect();
      const coverageRect = coverage?.getBoundingClientRect();
      return {
        editorBeforeCoverage: (editorRect?.top ?? 0) < (coverageRect?.top ?? 0),
        editorPosition: editor ? getComputedStyle(editor).position : '',
        fields: getComputedStyle(document.querySelector('.admin-translation-editor-fields')).gridTemplateColumns.split(/\s+/).length,
      };
    });
    if (!translationEditorLayout.editorBeforeCoverage
      || translationEditorLayout.editorPosition !== (device === 'desktop' ? 'sticky' : 'static')
      || translationEditorLayout.fields !== (device === 'desktop' ? 2 : 1)) {
      failures.push(`admin translations [${device}]: stable editor layout regressed (${JSON.stringify(translationEditorLayout)})`);
    }
    const missingName = await page.$eval('.admin-untranslated-list strong', element => element.textContent?.trim() || '');
    if (missingName !== 'Void Soul DH') failures.push(`admin translations [${device}]: current missing archetype was not detected`);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => { window.__qaTranslationDeckCode = value; } },
      });
      document.querySelector('.admin-copy-deck-code')?.scrollIntoView({ block: 'center' });
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    const translationScrollBeforeCopy = await page.evaluate(() => window.scrollY);
    await page.click('.admin-copy-deck-code');
    await page.waitForFunction(() => document.querySelector('.admin-copy-deck-code')?.textContent?.includes('Скопировано'));
    const copiedTranslationDeck = await page.evaluate(() => ({
      value: window.__qaTranslationDeckCode || '',
      scrollY: window.scrollY,
    }));
    if (!copiedTranslationDeck.value.startsWith('AAECAea5')
      || Math.abs(copiedTranslationDeck.scrollY - translationScrollBeforeCopy) > 2) {
      failures.push(`admin translations [${device}]: exact deck code copy failed or shifted the page (${JSON.stringify(copiedTranslationDeck)})`);
    }
    await page.screenshot({ path: `${OUT}/admin-translations-deck-code-${device}.png`, fullPage: false });
    await page.click('.admin-untranslated-list .contest-primary-button');
    const translationInputs = await page.$$('.admin-translation-form input');
    if (translationInputs.length !== 2) throw new Error('Translation editor fields are missing');
    const queuedEnglishName = await page.$eval('#admin-translation-name-en', element => element.value);
    if (queuedEnglishName !== 'Void Soul DH') failures.push(`admin translations [${device}]: missing archetype did not prefill the editor`);
    await translationInputs[1].type('Душа Бездны Охотник на демонов');
    const translationPositionBeforeSave = await page.evaluate(() => ({
      scrollY: window.scrollY,
      editorTop: document.querySelector('.admin-translation-editor')?.getBoundingClientRect().top ?? 0,
    }));
    await page.click('.admin-translation-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Перевод добавлен'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-translation-table tbody tr').length === 3);
    await page.waitForFunction(() => document.querySelectorAll('.admin-untranslated-list li').length === 9);
    const translationPositionAfterSave = await page.evaluate(() => ({
      scrollY: window.scrollY,
      editorTop: document.querySelector('.admin-translation-editor')?.getBoundingClientRect().top ?? 0,
      activeField: document.activeElement?.id || '',
      englishValue: document.querySelector('#admin-translation-name-en')?.value || '',
      russianValue: document.querySelector('#admin-translation-name-ru')?.value || '',
    }));
    if (Math.abs(translationPositionAfterSave.scrollY - translationPositionBeforeSave.scrollY) > 2
      || Math.abs(translationPositionAfterSave.editorTop - translationPositionBeforeSave.editorTop) > 2
      || translationPositionAfterSave.activeField !== 'admin-translation-name-en'
      || translationPositionAfterSave.englishValue || translationPositionAfterSave.russianValue) {
      failures.push(`admin translations [${device}]: save shifted the workspace or did not prepare the next entry (${JSON.stringify({ before: translationPositionBeforeSave, after: translationPositionAfterSave })})`);
    }
    await page.screenshot({ path: `${OUT}/admin-translations-after-add-${device}.png`, fullPage: false });
    await page.click('.admin-translation-table tbody tr:first-child button');
    await page.waitForFunction(() => document.querySelector('.admin-translation-form h2')?.textContent?.includes('Редактирование'));
    const editInputs = await page.$$('.admin-translation-form input');
    await replaceControlledInputValue(page, editInputs[1], 'Контрольный Воин');
    await page.click('.admin-translation-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Перевод обновлён'));
    const translationSearch = await page.$('.admin-translation-toolbar input');
    if (!translationSearch) throw new Error('Translation search field is missing');
    await translationSearch.type('несуществующий архетип');
    await page.waitForFunction(() => document.querySelectorAll('.admin-translation-table tbody tr').length === 0);
    const translationEmpty = await page.$eval('.admin-translation-empty', element => element.textContent?.trim() || '');
    if (!translationEmpty.includes('не найдены')) failures.push(`admin translations [${device}]: filtered empty state is missing`);
    await page.click('.admin-translation-search-control button[aria-label="Очистить поиск"]');
    await page.waitForFunction(() => document.querySelectorAll('.admin-translation-table tbody tr').length === 3);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-translation-source-filter button')]
        .find(element => element.textContent?.trim() === 'BlizzCore');
      if (!(button instanceof HTMLButtonElement)) throw new Error('BlizzCore source filter is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('.admin-translation-table tbody tr').length === 0);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-translation-source-filter button')]
        .find(element => element.textContent?.trim() === 'Все');
      if (!(button instanceof HTMLButtonElement)) throw new Error('All translations source filter is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelectorAll('.admin-translation-table tbody tr').length === 3);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-translation-list-card > .admin-card-heading button')]
        .find(element => element.textContent?.includes('Обновить из BlizzCore'));
      if (!(button instanceof HTMLButtonElement)) throw new Error('BlizzCore sync action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('BlizzCore синхронизирован'));
    const translationLayout = await page.evaluate(() => ({
      rows: document.querySelectorAll('.admin-translation-table tbody tr').length,
      columns: getComputedStyle(document.querySelector('.admin-translation-layout')).gridTemplateColumns.split(/\s+/).length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (translationLayout.rows !== 3) failures.push(`admin translations [${device}]: create/edit/sync fixture did not persist`);
    if (translationLayout.columns !== 1) failures.push(`admin translations [${device}]: responsive layout has ${translationLayout.columns} columns`);
    if (translationLayout.scrollWidth > translationLayout.clientWidth + 1) {
      failures.push(`admin translations [${device}]: horizontal overflow ${translationLayout.scrollWidth} > ${translationLayout.clientWidth}`);
    }
    const translationsViolationCount = await auditAccessibility(page, `admin translations [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=mechanics`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-mechanic-table tbody tr').length === 2);
    const mechanicInitialState = await page.evaluate(() => ({
      navLabel: document.querySelector('.admin-section-header h1')?.textContent?.trim() || '',
      rows: document.querySelectorAll('.admin-mechanic-table tbody tr').length,
      examples: document.querySelectorAll('.admin-mechanic-example img').length,
      inputs: document.querySelectorAll('.admin-mechanic-table input').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (mechanicInitialState.navLabel !== 'Механики и теги' || mechanicInitialState.rows !== 2 || mechanicInitialState.examples !== 2
      || mechanicInitialState.inputs !== 2 || mechanicInitialState.overflow) {
      failures.push(`admin mechanic translations [${device}]: list, examples or containment regressed (${JSON.stringify(mechanicInitialState)})`);
    }
    const missingMechanicInput = await page.$('#mechanic-NEW_MECHANIC');
    if (!missingMechanicInput) throw new Error('Missing mechanic translation input was not rendered');
    await missingMechanicInput.type('Новая механика');
    await page.evaluate(() => {
      const row = [...document.querySelectorAll('.admin-mechanic-table tbody tr')]
        .find(element => element.textContent?.includes('New Mechanic'));
      const button = row?.querySelector('button');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Mechanic save action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('New Mechanic'));
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-mechanic-table tbody tr')]
      .some(element => element.textContent?.includes('New Mechanic') && element.textContent?.includes('Ручной')));
    const mechanicTranslationsViolationCount = await auditAccessibility(page, `admin mechanic translations [${device}]`, '.admin-workspace-content');
    await page.screenshot({ path: `${OUT}/admin-mechanic-translations-${device}.png`, fullPage: false });

    await page.goto(`${BASE}/?admin&section=standard-data`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-standard-operations__routes a').length === 4);
    await page.waitForSelector('.admin-parser-schedule', { timeout: 20_000 });
    const standardOperationsState = await page.evaluate(() => {
      const scheduleCard = document.querySelector('#parser-schedules-title')?.closest('.admin-parser-card');
      return {
        title: document.querySelector('.admin-section-header h1')?.textContent?.trim() || '',
        parserMode: document.querySelector('.admin-parser-mode-badge')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        parserSections: document.querySelectorAll('.admin-parser-section').length,
        parserSchedules: scheduleCard?.querySelectorAll('.admin-parser-schedule').length ?? 0,
        parserScheduleCopy: scheduleCard?.querySelector('.contest-muted')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        parserScheduleVersion: scheduleCard?.querySelector('.admin-parser-schedule-updated')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        parserScheduleState: scheduleCard?.querySelector('.admin-parser-schedule__state')?.textContent?.trim() || '',
        parserScheduleRules: scheduleCard?.querySelector('.admin-parser-schedule__rules summary')?.textContent?.trim() || '',
        parserScheduleTimer: scheduleCard?.querySelector('.admin-parser-schedule dl code')?.textContent?.trim() || '',
        parserRunResults: document.querySelectorAll('.admin-parser-run-results li').length,
        parserDeduplicated: document.querySelectorAll('.admin-parser-run__deduplicated').length,
        stats: document.querySelectorAll('.admin-standard-operations .admin-stat-grid > div').length,
        sources: document.querySelectorAll('.admin-standard-operations__sources > div').length,
        actions: document.querySelectorAll('.admin-standard-operations__actions button').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (standardOperationsState.title !== 'Данные и парсеры' || standardOperationsState.parserMode !== 'Стабильная мета'
      || standardOperationsState.parserSections !== 2 || standardOperationsState.parserSchedules !== 1
      || !standardOperationsState.parserScheduleCopy.includes('Фактическое состояние systemd проверено')
      || !standardOperationsState.parserScheduleVersion.includes('версия 2026-07-21.2')
      || standardOperationsState.parserScheduleState !== 'Активен'
      || standardOperationsState.parserScheduleRules !== 'Правила systemd: 2'
      || standardOperationsState.parserScheduleTimer !== 'hs-data-api-docker-refresh-post-patch-tierlists.timer'
      || standardOperationsState.parserRunResults !== 1 || standardOperationsState.parserDeduplicated !== 1
      || standardOperationsState.stats !== 4
      || standardOperationsState.sources !== 4 || standardOperationsState.actions !== 4 || standardOperationsState.overflow) {
      failures.push(`admin Standard operations [${device}]: status workspace regressed (${JSON.stringify(standardOperationsState)})`);
    }
    await page.evaluate(() => {
      const button = document.querySelector('.admin-standard-operations__actions button:nth-child(3)');
      if (!(button instanceof HTMLButtonElement)) throw new Error('DeckView preview cache reset action is missing');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Кеш очищен'));
    const standardOpsViolationCount = await auditAccessibility(page, `admin Standard operations [${device}]`, '.admin-workspace-content');
    await page.click('.admin-parser-schedule__rules summary');
    const scheduleRuleCount = await page.$$eval('.admin-parser-schedule__rules li', elements => elements.length);
    if (scheduleRuleCount !== 2) failures.push(`admin Standard operations [${device}]: schedule rules did not expand (${scheduleRuleCount})`);

    await page.goto(`${BASE}/?admin&section=gallery`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-gallery-row').length === 1);
    await page.type('.admin-gallery-form input:not([type="file"])', 'Новый контрольный арт');
    const galleryFileInput = await page.$('.admin-gallery-form input[type="file"]');
    if (!galleryFileInput) throw new Error('Gallery file input is missing');
    await galleryFileInput.uploadFile(`${process.cwd()}/public/favicon-192.png`);
    await page.waitForFunction(() => document.querySelector('.admin-gallery-selected')?.textContent?.includes('favicon-192.png'));
    await page.click('.admin-gallery-form button[type="submit"]');
    await page.waitForFunction(() => {
      const title = document.querySelector('.admin-gallery-form input:not([type="file"])');
      return title?.value === '' && !document.querySelector('.admin-gallery-selected');
    });
    const galleryLayout = await page.evaluate(() => ({
      rows: document.querySelectorAll('.admin-gallery-row').length,
      downloadHref: document.querySelector('.admin-gallery-actions a')?.getAttribute('href') || '',
      columns: getComputedStyle(document.querySelector('.admin-gallery-layout')).gridTemplateColumns.split(/\s+/).length,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (galleryLayout.rows !== 1 || galleryLayout.downloadHref !== '/favicon-192.png') {
      failures.push(`admin gallery [${device}]: upload/list fixture did not render correctly`);
    }
    if (galleryLayout.scrollWidth > galleryLayout.clientWidth + 1) {
      failures.push(`admin gallery [${device}]: horizontal overflow ${galleryLayout.scrollWidth} > ${galleryLayout.clientWidth}`);
    }
    if (galleryLayout.columns !== (device === 'desktop' ? 2 : 1)) failures.push(`admin gallery [${device}]: expected owned ${device === 'desktop' ? 'two' : 'single'}-column layout, got ${galleryLayout.columns}`);
    adminState.galleryEmpty = true;
    await page.click('.admin-gallery-layout .contest-secondary-button');
    await page.waitForFunction(() => document.querySelectorAll('.admin-gallery-row').length === 0);
    const galleryEmptyState = await page.$eval('.admin-gallery-list [role="status"]', element => element.textContent?.trim() || '');
    if (!galleryEmptyState.includes('пока нет артов')) failures.push(`admin gallery [${device}]: empty state is missing`);
    const galleryViolationCount = await auditAccessibility(page, `admin gallery [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=boosty`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-boosty-row').length === 2);
    const boostyState = await page.evaluate(() => {
      const person = document.querySelector('.admin-boosty-person');
      const personStyle = person ? getComputedStyle(person) : null;
      return {
        rows: document.querySelectorAll('.admin-boosty-row').length,
        stats: [...document.querySelectorAll('.admin-boosty-stats strong')].map(element => element.textContent?.trim() || ''),
        apiStatus: document.querySelector('.admin-boosty-status strong')?.textContent?.trim() || '',
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        personDirection: personStyle?.flexDirection || '',
        personGap: parseFloat(personStyle?.gap || '0') || 0,
      };
    });
    if (boostyState.rows !== 2 || boostyState.stats.join(',') !== '2,2,1,1' || !boostyState.apiStatus.includes('работает')) {
      failures.push(`admin Boosty [${device}]: deterministic status, KPI or subscriber list did not render`);
    }
    if (boostyState.scrollWidth > boostyState.clientWidth + 1) {
      failures.push(`admin Boosty [${device}]: horizontal overflow ${boostyState.scrollWidth} > ${boostyState.clientWidth}`);
    }
    if (boostyState.personDirection !== 'row' || boostyState.personGap < 10) {
      failures.push(`admin Boosty [${device}]: subscriber identity layout changed (${JSON.stringify(boostyState)})`);
    }
    await page.select('.admin-boosty-filters label:last-child select', 'inactive');
    await page.waitForFunction(() => document.querySelectorAll('.admin-boosty-row').length === 1);
    await page.type('.admin-boosty-filters input', 'нет такого подписчика');
    await page.waitForFunction(() => document.querySelectorAll('.admin-boosty-row').length === 0);
    const boostyEmptyState = await page.$eval('.admin-boosty-list [role="status"]', element => element.textContent?.trim() || '');
    if (!boostyEmptyState.includes('не найдены')) failures.push(`admin Boosty [${device}]: filtered empty state is missing`);
    const boostyViolationCount = await auditAccessibility(page, `admin Boosty [${device}]`, '.admin-workspace-content');
    adminState.boostyFailure = true;
    await page.click('.contest-users-head .contest-secondary-button');
    await page.waitForFunction(() => {
      const text = document.querySelector('.admin-workspace-content')?.textContent || '';
      return text.includes('Boosty API: ошибка') && text.includes('Не удалось загрузить подписчиков Boosty');
    });
    const boostyFailureState = await page.$eval('.admin-workspace-content', element => ({
      text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
      rows: element.querySelectorAll('.admin-boosty-row').length,
      alerts: element.querySelectorAll('[role="alert"]').length,
    }));
    if (boostyFailureState.rows !== 0
      || boostyFailureState.alerts < 1
      || /private|127\.0\.0\.1|token/i.test(boostyFailureState.text)) {
      failures.push(`admin Boosty [${device}]: upstream failure fallback is unsafe or incomplete (${JSON.stringify(boostyFailureState)})`);
    }
    adminState.boostyFailure = false;

    await page.goto(`${BASE}/?admin&section=telegram`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-telegram-row').length === 2);
    const telegramState = await page.evaluate(() => {
      const person = document.querySelector('.admin-telegram-person');
      const personStyle = person ? getComputedStyle(person) : null;
      return {
        rows: document.querySelectorAll('.admin-telegram-row').length,
        stats: [...document.querySelectorAll('.admin-telegram-stats strong')].map(element => element.textContent?.trim() || ''),
        botStatus: document.querySelector('.admin-telegram-status strong')?.textContent?.trim() || '',
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        personDirection: personStyle?.flexDirection || '',
        personGap: parseFloat(personStyle?.gap || '0') || 0,
      };
    });
    if (telegramState.rows !== 2 || telegramState.stats.join(',') !== '2,1,1,1' || !telegramState.botStatus.includes('настроен')) {
      failures.push(`admin Telegram [${device}]: deterministic status, KPI or account list did not render`);
    }
    if (telegramState.scrollWidth > telegramState.clientWidth + 1) {
      failures.push(`admin Telegram [${device}]: horizontal overflow ${telegramState.scrollWidth} > ${telegramState.clientWidth}`);
    }
    if (telegramState.personDirection !== 'row' || telegramState.personGap < 10) {
      failures.push(`admin Telegram [${device}]: account identity layout changed (${JSON.stringify(telegramState)})`);
    }
    await page.select('.admin-telegram-filters select', 'contact-only');
    await page.waitForFunction(() => document.querySelectorAll('.admin-telegram-row').length === 1);
    await page.type('.admin-telegram-filters input', 'нет такого аккаунта');
    await page.waitForFunction(() => document.querySelectorAll('.admin-telegram-row').length === 0);
    const telegramEmptyState = await page.$eval('.admin-telegram-list [role="status"]', element => element.textContent?.trim() || '');
    if (!telegramEmptyState.includes('не найдены')) failures.push(`admin Telegram [${device}]: filtered empty state is missing`);
    const telegramViolationCount = await auditAccessibility(page, `admin Telegram [${device}]`, '.admin-workspace-content');
    adminState.telegramFailure = true;
    const telegramReloadPoint = await page.$eval('.contest-users-head .contest-secondary-button', async element => {
      element.scrollIntoView({ block: 'center', inline: 'center' });
      await new Promise(resolve => requestAnimationFrame(() => resolve()));
      const rect = element.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    });
    const telegramReloadHit = await page.evaluate(point => {
      const button = document.querySelector('.contest-users-head .contest-secondary-button');
      const target = document.elementFromPoint(point.x, point.y);
      return Boolean(button && target && (button === target || button.contains(target)));
    }, telegramReloadPoint);
    if (!telegramReloadHit) failures.push(`admin Telegram [${device}]: reload button is obscured after filtering`);
    if (device === 'mobile') await page.touchscreen.tap(telegramReloadPoint.x, telegramReloadPoint.y);
    else await page.mouse.click(telegramReloadPoint.x, telegramReloadPoint.y);
    await page.waitForFunction(() => {
      const text = document.querySelector('.admin-workspace-content')?.textContent || '';
      return text.includes('Не удалось получить данные Telegram') && text.includes('Не удалось загрузить Telegram-аккаунты');
    });
    const telegramFailureState = await page.$eval('.admin-workspace-content', element => ({
      text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
      rows: element.querySelectorAll('.admin-telegram-row').length,
      alerts: element.querySelectorAll('[role="alert"]').length,
    }));
    if (telegramFailureState.rows !== 0
      || telegramFailureState.alerts < 1
      || /private|sqlite|token/i.test(telegramFailureState.text)) {
      failures.push(`admin Telegram [${device}]: storage failure fallback is unsafe or incomplete (${JSON.stringify(telegramFailureState)})`);
    }
    adminState.telegramFailure = false;

    await page.goto(`${BASE}/?admin&section=mailing`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-mailing-template-grid button').length === 1);
    await page.waitForFunction(() => document.querySelector('.admin-mailing-preview-stage iframe'));
    const mailingInitial = await page.evaluate(() => ({
      stats: [...document.querySelectorAll('.admin-mailing-stats strong')].map(element => element.textContent?.trim() || ''),
      campaigns: document.querySelectorAll('.admin-mailing-history > div').length,
      contacts: document.querySelectorAll('.admin-mailing-contacts > div').length,
      previewCount: document.querySelector('.admin-mailing-preview-meta strong')?.textContent?.trim() || '',
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (mailingInitial.stats.join(',') !== '3,2,1,1' || mailingInitial.campaigns !== 1 || mailingInitial.contacts !== 1 || mailingInitial.previewCount !== '3') {
      failures.push(`admin mailing [${device}]: KPI, preview, history or contacts fixture did not render`);
    }
    if (mailingInitial.scrollWidth > mailingInitial.clientWidth + 1) {
      failures.push(`admin mailing [${device}]: horizontal overflow ${mailingInitial.scrollWidth} > ${mailingInitial.clientWidth}`);
    }
    await page.click('.admin-mailing-template-grid button');
    await page.waitForFunction(() => document.querySelector('.admin-mailing-field input')?.value === 'Новая статья Manacost');
    await page.click('.admin-mailing-preview-toolbar fieldset button:last-child');
    const mobilePreviewSelected = await page.$eval('.admin-mailing-preview-stage', element => element.classList.contains('is-mobile'));
    if (!mobilePreviewSelected) failures.push(`admin mailing [${device}]: mobile preview mode did not activate`);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.admin-mailing-actions button:nth-child(2)');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Тестовое письмо принято'));
    await page.click('.admin-mailing-actions button:nth-child(3)');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Рассылка поставлена в очередь'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-mailing-history > div').length === 2);
    const mailingViolationCount = await auditAccessibility(page, `admin mailing [${device}]`, '.admin-workspace-content');

    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.contest-entry-row').length === 2);
    const contestsState = await page.evaluate(() => ({
      summaryButtons: document.querySelectorAll('.admin-contest-summary-grid button').length,
      selectedTitle: document.querySelector('.admin-selected-contest h3')?.textContent?.trim() || '',
      entries: document.querySelectorAll('.contest-entry-row').length,
      disabledEntries: document.querySelectorAll('.contest-entry-row input:disabled').length,
      dangerButton: (() => {
        const element = document.querySelector('.admin-contest-detail .admin-danger-button');
        if (!(element instanceof HTMLButtonElement)) return null;
        const style = getComputedStyle(element);
        return {
          borderColor: style.borderColor,
          color: style.color,
          backgroundColor: style.backgroundColor,
        };
      })(),
      viewSwitch: (() => {
        const element = document.querySelector('.admin-view-switch');
        if (!(element instanceof HTMLElement)) return null;
        const style = getComputedStyle(element);
        return {
          display: style.display,
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
          width: element.getBoundingClientRect().width,
          parentWidth: element.parentElement?.getBoundingClientRect().width || 0,
        };
      })(),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    if (contestsState.summaryButtons !== 6 || contestsState.selectedTitle !== 'Контрольный конкурс' || contestsState.entries !== 2 || contestsState.disabledEntries !== 1) {
      failures.push(`admin contests [${device}]: summary, selection or entries fixture did not render`);
    }
    if (contestsState.scrollWidth > contestsState.clientWidth + 1) {
      failures.push(`admin contests [${device}]: horizontal overflow ${contestsState.scrollWidth} > ${contestsState.clientWidth}`);
    }
    if (!contestsState.dangerButton
      || contestsState.dangerButton.borderColor !== 'rgb(226, 168, 168)'
      || contestsState.dangerButton.color !== 'rgb(179, 45, 46)'
      || contestsState.dangerButton.backgroundColor !== 'rgb(255, 247, 247)') {
      failures.push(`admin contests [${device}]: danger action lost its owned visual state (${JSON.stringify(contestsState.dangerButton)})`);
    }
    if (!contestsState.viewSwitch
      || contestsState.viewSwitch.display !== 'grid'
      || contestsState.viewSwitch.marginLeft !== '0px'
      || contestsState.viewSwitch.marginRight !== '0px'
      || contestsState.viewSwitch.width >= contestsState.viewSwitch.parentWidth) {
      failures.push(`admin contests [${device}]: view switch lost its compact owned layout (${JSON.stringify(contestsState.viewSwitch)})`);
    }
    await page.click('.contest-entry-row:not(.is-disabled) input[type="checkbox"]');
    await page.waitForFunction(() => document.querySelector('.admin-winner-publish button')?.disabled === false);
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.admin-winner-publish button');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Победители опубликованы.'));
    await page.waitForFunction(() => document.querySelector('.admin-selected-contest .admin-status-badge')?.textContent?.includes('Завершен'));

    await page.click('.admin-form-actions .contest-secondary-button');
    await page.waitForFunction(() => document.querySelector('.admin-contest-form h2')?.textContent?.includes('Редактирование'));
    const contestEditorState = await page.evaluate(() => ({
      title: document.querySelector('.admin-contest-form input:not([type="datetime-local"]):not([type="file"])')?.value || '',
      previewTitle: document.querySelector('.admin-contest-preview-card h3')?.textContent?.trim() || '',
    }));
    if (contestEditorState.title !== 'Контрольный конкурс' || contestEditorState.previewTitle !== 'Контрольный конкурс') {
      failures.push(`admin contests [${device}]: edit action did not populate form and preview`);
    }
    await replaceControlledInputValue(page, '.admin-contest-section:first-of-type input', 'Контрольный конкурс — обновлён');
    await page.click('.admin-contest-submit-row button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Конкурс сохранен.'));
    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-contest-manage-card', { timeout: 20_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.admin-contest-list button strong')]
      .some(element => element.textContent?.trim() === 'Контрольный конкурс — обновлён'));

    await page.click('.admin-contest-manage-card .admin-contest-form-head > button');
    await page.waitForFunction(() => document.querySelector('.admin-contest-form h2')?.textContent?.trim() === 'Новый конкурс');
    const contestMainInputs = await page.$$('.admin-contest-section:first-of-type input');
    if (contestMainInputs.length < 2) throw new Error('Contest title and prize inputs are missing');
    await contestMainInputs[0].type('Новый QA конкурс');
    await contestMainInputs[1].type('QA приз');
    await page.click('.admin-contest-submit-row button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Конкурс сохранен.'));
    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-contest-manage-card', { timeout: 20_000 });
    await page.waitForFunction(() => document.querySelectorAll('.admin-contest-list > div').length === 2);
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('.admin-contest-list button')]
        .find(element => element.querySelector('strong')?.textContent?.trim() === 'Новый QA конкурс');
      if (!(button instanceof HTMLButtonElement)) throw new Error('Created contest is missing from manager');
      button.click();
    });
    await page.waitForFunction(() => document.querySelector('.admin-selected-contest h3')?.textContent?.trim() === 'Новый QA конкурс');
    await page.evaluate(() => { window.confirm = () => true; });
    await page.click('.admin-contest-detail .admin-danger-button');
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Конкурс удален.'));
    await page.waitForFunction(() => document.querySelectorAll('.admin-contest-list > div').length === 1);

    await page.click('.admin-contest-summary-grid button:nth-child(6)');
    await page.waitForFunction(() => document.querySelectorAll('.admin-contest-list button').length === 0);
    const contestEmptyState = await page.$eval('.admin-contest-list [role="status"]', element => element.textContent?.trim() || '');
    if (!contestEmptyState.includes('нет')) failures.push(`admin contests [${device}]: filtered empty state is missing`);
    const contestsViolationCount = await auditAccessibility(page, `admin contests [${device}]`, '.admin-workspace-content');
    adminState.contestReadFailure = true;
    await page.goto(`${BASE}/?admin&section=contests`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelector('.admin-toast')?.textContent?.includes('Не удалось загрузить конкурсы'));
    const contestReadFailureState = await page.$eval('.admin-workspace-content', element => ({
      text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
      contests: element.querySelectorAll('.admin-contest-list > div').length,
    }));
    if (contestReadFailureState.contests !== 0 || /private|sqlite|token/i.test(contestReadFailureState.text)) {
      failures.push(`admin contests [${device}]: storage failure fallback is unsafe or incomplete (${JSON.stringify(contestReadFailureState)})`);
    }
    adminState.contestReadFailure = false;

    await page.goto(`${BASE}/?admin&section=users`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.contest-user-row').length === 2);
    const usersState = await page.evaluate(() => {
      const row = document.querySelector('.contest-user-row');
      const badges = row?.querySelector('.contest-user-badges');
      const role = badges?.querySelector(':scope > span');
      const menuWrap = badges?.querySelector('.contest-user-action-menu-wrap');
      const rowStyle = row ? getComputedStyle(row) : null;
      const badgesStyle = badges ? getComputedStyle(badges) : null;
      const roleStyle = role ? getComputedStyle(role) : null;
      const menuWrapStyle = menuWrap ? getComputedStyle(menuWrap) : null;
      return {
        rows: document.querySelectorAll('.contest-user-row').length,
        summary: document.querySelector('.contest-users-head .contest-muted')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        badgesDisplay: badgesStyle?.display || '',
        badgesGap: parseFloat(badgesStyle?.gap || '0') || 0,
        roleColor: roleStyle?.color || '',
        rowColor: rowStyle?.color || '',
        menuWrapDisplay: menuWrapStyle?.display || '',
      };
    });
    if (usersState.rows !== 2 || !usersState.summary.includes('Показано 2 из 2')) {
      failures.push(`admin users [${device}]: deterministic user list did not render`);
    }
    if (usersState.scrollWidth > usersState.clientWidth + 1) {
      failures.push(`admin users [${device}]: horizontal overflow ${usersState.scrollWidth} > ${usersState.clientWidth}`);
    }
    if (usersState.badgesDisplay !== 'flex' || usersState.badgesGap < 5 || usersState.roleColor === usersState.rowColor || usersState.menuWrapDisplay !== 'block') {
      failures.push(`admin users [${device}]: badge/menu cascade changed (${JSON.stringify(usersState)})`);
    }
    await page.click('.contest-user-menu-trigger');
    await page.waitForSelector('.contest-user-menu[role="menu"]', { visible: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
    const menuVisualState = await page.evaluate(() => {
      const firstLabel = document.querySelector('.contest-user-menu button > span');
      const firstHint = firstLabel?.querySelector('small');
      const divider = document.querySelector('.contest-user-menu-divider');
      const labelStyle = firstLabel ? getComputedStyle(firstLabel) : null;
      const hintStyle = firstHint ? getComputedStyle(firstHint) : null;
      const dividerStyle = divider ? getComputedStyle(divider) : null;
      return {
        labelDisplay: labelStyle?.display || '',
        labelColor: labelStyle?.color || '',
        hintDisplay: hintStyle?.display || '',
        hintColor: hintStyle?.color || '',
        dividerDisplay: dividerStyle?.display || '',
        dividerHeight: divider?.getBoundingClientRect().height || 0,
        dividerBackground: dividerStyle?.backgroundColor || '',
        dividerPadding: dividerStyle?.padding || '',
      };
    });
    if (menuVisualState.labelDisplay !== 'block'
      || menuVisualState.labelColor !== 'rgb(36, 56, 74)'
      || menuVisualState.hintDisplay !== 'block'
      || menuVisualState.hintColor !== 'rgb(82, 96, 109)'
      || menuVisualState.dividerDisplay !== 'block'
      || menuVisualState.dividerHeight !== 1
      || menuVisualState.dividerBackground !== 'rgb(227, 233, 239)'
      || menuVisualState.dividerPadding !== '0px') {
      failures.push(`admin users [${device}]: menu visual ownership changed (${JSON.stringify(menuVisualState)})`);
    }
    const obscuredTriggerState = await page.$$eval('.contest-user-menu-trigger[aria-expanded="false"]', triggers => (
      triggers.map(trigger => getComputedStyle(trigger).visibility)
    ));
    if (obscuredTriggerState.some(visibility => visibility !== 'hidden')) {
      failures.push(`admin users [${device}]: background menu triggers remain exposed below the open popover`);
    }
    await page.keyboard.press('ArrowDown');
    const focusedMenuItem = await page.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '');
    if (!focusedMenuItem.includes('Сделать администратором')) {
      failures.push(`admin users [${device}]: ArrowDown did not move focus to the next menu action`);
    }
    const usersViolationCount = await auditAccessibility(page, `admin users menu [${device}]`, '.admin-workspace-content');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.contest-user-menu'));
    const focusRestored = await page.evaluate(() => document.activeElement?.classList.contains('contest-user-menu-trigger') === true);
    if (!focusRestored) failures.push(`admin users [${device}]: Escape did not restore focus to the action trigger`);
    await page.evaluate(() => { window.confirm = () => true; });
    for (const actionText of ['Дать полный доступ', 'Сделать администратором', 'Заблокировать']) {
      await page.click('.contest-user-row:first-child .contest-user-menu-trigger');
      await page.waitForSelector('.contest-user-menu[role="menu"]', { visible: true });
      await page.evaluate(text => {
        const button = [...document.querySelectorAll('.contest-user-menu button[role="menuitem"]')]
          .find(element => element.textContent?.includes(text));
        if (!(button instanceof HTMLButtonElement)) throw new Error(`Missing user action: ${text}`);
        button.click();
      }, actionText);
      if (actionText === 'Дать полный доступ') {
        await page.waitForSelector('.admin-access-dialog[role="dialog"]', { visible: true });
        await page.select('.admin-access-dialog select', '30');
        await page.click('.admin-access-dialog button[type="submit"]');
      }
      await page.waitForFunction(text => {
        const row = document.querySelector('.contest-user-row:first-child');
        if (!row) return false;
        if (text === 'Дать полный доступ') return row.querySelector('.contest-access-ok')?.textContent?.includes('полный доступ');
        if (text === 'Сделать администратором') return row.textContent?.includes('администратор');
        return row.querySelector('.contest-role-blocked')?.textContent?.includes('заблокирован');
      }, {}, actionText);
      await page.waitForFunction(() => !document.querySelector('.contest-user-menu'));
      await page.waitForFunction(() => !document.querySelector('.contest-user-menu-trigger')?.hasAttribute('disabled'));
    }
    await page.goto(`${BASE}/?admin&section=users`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => document.querySelectorAll('.contest-user-row').length === 2);
    const persistedUser = await page.$eval('.contest-user-row:first-child', element => element.textContent?.replace(/\s+/g, ' ').trim() || '');
    if (!persistedUser.includes('администратор') || !persistedUser.includes('заблокирован') || !persistedUser.includes('полный доступ')) {
      failures.push(`admin users [${device}]: role/block/manual-access mutations did not persist after navigation`);
    }

    await page.goto(`${BASE}/?login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.profile-card .profile-hero__body', { timeout: 20_000 });
    const profileState = await page.evaluate(() => {
      const card = document.querySelector('.profile-card');
      const hero = document.querySelector('.profile-hero');
      const body = document.querySelector('.profile-hero__body');
      const status = document.querySelector('.profile-status-chips');
      const cardStyle = card ? getComputedStyle(card) : null;
      const heroStyle = hero ? getComputedStyle(hero) : null;
      const bodyStyle = body ? getComputedStyle(body) : null;
      const statusStyle = status ? getComputedStyle(status) : null;
      const arenaMainStyle = getComputedStyle(document.querySelector('.arena-main'));
      const arenaContent = document.querySelector('.arena-content.arena-content-open');
      const arenaContentStyle = getComputedStyle(arenaContent);
      const profilePlaqueStyle = getComputedStyle(arenaContent, '::before');
      const material = selector => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const computed = getComputedStyle(element);
        return {
          minHeight: computed.minHeight,
          borderRadius: computed.borderRadius,
          borderImageSource: computed.borderImageSource,
          backgroundColor: computed.backgroundColor,
          backgroundImage: computed.backgroundImage,
          color: computed.color,
        };
      };
      return {
        cardPadding: cardStyle?.padding || '',
        cardRadius: cardStyle?.borderRadius || '',
        heroMinHeight: heroStyle?.minHeight || '',
        heroMargin: heroStyle?.margin || '',
        heroPadding: heroStyle?.padding || '',
        heroAlign: heroStyle?.alignItems || '',
        heroBackground: heroStyle?.backgroundImage || '',
        heroBorderImage: heroStyle?.borderImageSource || '',
        heroOverflow: heroStyle?.overflow || '',
        bodyDisplay: bodyStyle?.display || '',
        bodyDirection: bodyStyle?.flexDirection || '',
        bodyAlign: bodyStyle?.alignItems || '',
        bodyGap: bodyStyle?.gap || '',
        statusDisplay: statusStyle?.display || '',
        statusColumns: statusStyle?.gridTemplateColumns || '',
        heroScrollWidth: hero?.scrollWidth || 0,
        heroClientWidth: hero?.clientWidth || 0,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        routeShell: {
          mainPadding: arenaMainStyle.padding,
          contentMaxWidth: arenaContentStyle.maxWidth,
          contentPadding: arenaContentStyle.padding,
          plaqueContent: profilePlaqueStyle.content,
          plaqueBackground: profilePlaqueStyle.backgroundImage,
        },
        materials: {
          settings: material('.profile-settings-form'),
          subscription: material('.profile-subscription-panel'),
          source: material('.profile-subscription-source'),
          contests: material('.profile-contests'),
          statusChip: material('.profile-status-chip'),
          input: material('.profile-settings-form input:not([type="checkbox"])'),
        },
        adminMetaHref: document.querySelector('[data-profile-admin-destination="standard-meta"]')?.getAttribute('href') || '',
      };
    });
    const expectedProfile = device === 'desktop'
      ? {
          cardPadding: '0px', cardRadius: '0px', heroMinHeight: '240px',
          heroMargin: '0px', heroAlign: 'center', bodyDisplay: 'flex',
          bodyDirection: 'row', bodyAlign: 'center', statusDisplay: 'flex',
        }
      : {
          cardPadding: '0px', cardRadius: '0px', heroMinHeight: '276px',
          heroMargin: '0px', heroPadding: '16px', heroAlign: 'center', bodyDisplay: 'flex',
          bodyDirection: 'row', bodyAlign: 'center', statusDisplay: 'grid',
        };
    for (const [property, expected] of Object.entries(expectedProfile)) {
      if (profileState[property] !== expected) {
        failures.push(`profile [${device}]: ${property} expected ${expected}, got ${profileState[property]}`);
      }
    }
    const profileGap = Number.parseFloat(profileState.bodyGap);
    const mobileStatusColumns = profileState.statusColumns.split(/\s+/).filter(Boolean).length;
    if (!profileState.heroBackground.includes('profile-hero-hth')
      || !profileState.heroBorderImage.includes('main-page-rail-border')
      || profileState.heroOverflow !== 'hidden'
      || !Number.isFinite(profileGap)
      || profileGap < 12
      || (device === 'mobile' && mobileStatusColumns !== 2)
      || profileState.heroScrollWidth > profileState.heroClientWidth + 1
      || profileState.scrollWidth > profileState.clientWidth + 1) {
      failures.push(`profile [${device}]: hero asset or horizontal reflow changed (${JSON.stringify(profileState)})`);
    }
    if (device === 'mobile' && (profileState.routeShell.mainPadding !== '12px 0px 0px'
      || profileState.routeShell.contentMaxWidth !== '100%'
      || profileState.routeShell.contentPadding !== '0px 16px 32px')) {
      failures.push(`profile [${device}]: responsive route shell changed (${JSON.stringify(profileState.routeShell)})`);
    }
    if (profileState.routeShell.plaqueContent !== 'none' || profileState.routeShell.plaqueBackground !== 'none') {
      failures.push(`profile [${device}]: retired profile plaque returned (${JSON.stringify(profileState.routeShell)})`);
    }
    const framedProfileSurfaces = [profileState.materials.settings, profileState.materials.subscription];
    if (framedProfileSurfaces.some(surface => !surface
      || !surface.borderImageSource.includes('main-page-rail-border.png')
      || !surface.backgroundImage.includes('arena-parchment.jpg')
      || surface.borderRadius !== '0px')) {
      failures.push(`profile [${device}]: settings or subscription frame changed (${JSON.stringify(framedProfileSurfaces)})`);
    }
    if (!profileState.materials.source?.borderImageSource.includes('deck-border.png')
      || profileState.materials.source?.minHeight !== '78px'
      || profileState.materials.source?.borderRadius !== '0px') {
      failures.push(`profile [${device}]: subscription source frame changed (${JSON.stringify(profileState.materials.source)})`);
    }
    if (!profileState.materials.contests?.borderImageSource.includes('main-page-rail-border.png')
      || profileState.materials.contests?.borderRadius !== '0px') {
      failures.push(`profile [${device}]: contest frame changed (${JSON.stringify(profileState.materials.contests)})`);
    }
    if (!profileState.materials.statusChip?.backgroundImage.includes('deck-border.png')
      || profileState.materials.statusChip?.minHeight !== '38px') {
      failures.push(`profile [${device}]: status chip material changed (${JSON.stringify(profileState.materials.statusChip)})`);
    }
    if (profileState.materials.input?.borderRadius !== '2px'
      || profileState.materials.input?.color !== 'rgb(61, 43, 31)'
      || profileState.materials.input?.backgroundColor !== 'rgba(255, 246, 219, 0.72)') {
      failures.push(`profile [${device}]: profile input material changed (${JSON.stringify(profileState.materials.input)})`);
    }
    if (profileState.adminMetaHref !== '/standard/meta') {
      failures.push(`profile [${device}]: admin meta destination is missing or incorrect (${profileState.adminMetaHref})`);
    }
    const profileTourViolationCount = await auditPageTour(page, {
      label: `profile [${device}]`,
      minSteps: 5,
      mobile: device === 'mobile',
    });
    await page.click('.profile-settings-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.profile-message--ok')?.textContent?.includes('Профиль обновлен.'));
    const successMessage = await page.$eval('.profile-message--ok', element => {
      const style = getComputedStyle(element);
      return { role: element.getAttribute('role'), radius: style.borderRadius, color: style.color };
    });
    if (successMessage.role !== 'status' || successMessage.radius !== '2px' || successMessage.color !== 'rgb(53, 93, 57)') {
      failures.push(`profile [${device}]: success message lost semantic visual ownership (${JSON.stringify(successMessage)})`);
    }
    adminState.profileSaveFailure = true;
    await page.click('.profile-settings-form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('.profile-message--err')?.textContent?.includes('Контрольная ошибка сохранения'));
    const errorMessage = await page.$eval('.profile-message--err', element => {
      const style = getComputedStyle(element);
      return { role: element.getAttribute('role'), radius: style.borderRadius, color: style.color };
    });
    if (errorMessage.role !== 'alert' || errorMessage.radius !== '2px' || errorMessage.color !== 'rgb(125, 34, 39)') {
      failures.push(`profile [${device}]: error message lost semantic visual ownership (${JSON.stringify(errorMessage)})`);
    }
    adminState.profileSaveFailure = false;
    const profileViolationCount = await auditAccessibility(page, `profile [${device}]`, '.profile-page');
    await page.screenshot({ path: `${OUT}/profile-${device}.png`, fullPage: false });

    adminState.constructedArchetypeReadFailureOnce = true;
    await page.goto(`${BASE}/standard/archetypes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => window.location.pathname.replace(/\/+$/, '') === '/standard/archetypes');
    await page.waitForSelector('.archetypes-page [data-recovery-state="error"]', { timeout: 20_000 });
    await page.evaluate(() => { window.__qaStandardMetaDocumentMarker = 'preserve-on-retry'; });
    const archetypeErrorState = await page.evaluate(() => {
      const state = document.querySelector('.archetypes-page [data-recovery-state="error"]');
      const retry = state?.querySelector('button');
      return {
        role: state?.getAttribute('role') || '',
        text: state?.textContent?.replace(/\s+/g, ' ').trim() || '',
        retryHeight: retry?.getBoundingClientRect().height ?? 0,
        shellVisible: Boolean(document.querySelector('.arena-sidebar') && document.querySelector('.global-utility-header')),
      };
    });
    if (archetypeErrorState.role !== 'alert' || !archetypeErrorState.text.includes('Контрольная ошибка загрузки меты')
      || archetypeErrorState.retryHeight < 43.5 || !archetypeErrorState.shellVisible || adminState.constructedArchetypeReadFailures !== 1) {
      failures.push(`archetype catalog recovery [${device}]: API error did not stay local or actionable (${JSON.stringify(archetypeErrorState)})`);
    }
    await page.click('.archetypes-page [data-recovery-state="error"] button');
    await page.waitForSelector('.archetype-row', { timeout: 20_000 });
    const archetypeRetryState = await page.evaluate(() => ({
      marker: window.__qaStandardMetaDocumentMarker || '',
      errorPresent: Boolean(document.querySelector('.archetypes-page [data-recovery-state="error"]')),
      shellRecoveryPresent: Boolean(document.querySelector('.app-error-shell')),
    }));
    if (archetypeRetryState.marker !== 'preserve-on-retry' || archetypeRetryState.errorPresent || archetypeRetryState.shellRecoveryPresent) {
      failures.push(`archetype catalog recovery [${device}]: retry reloaded the document or opened shell recovery (${JSON.stringify(archetypeRetryState)})`);
    }
    const archetypeCatalogState = await page.evaluate(() => {
      const root = document.querySelector('.archetypes-page');
      const hero = document.querySelector('.traditional-mode-banner');
      const search = document.querySelector('.archetypes-search input');
      const formatButtons = [...document.querySelectorAll('.archetypes-format-switch button')];
      const openButtons = [...document.querySelectorAll('.archetype-row__open')];
      return {
        heading: root?.querySelector('h1')?.textContent?.trim() || '',
        rows: document.querySelectorAll('.archetype-row').length,
        formats: formatButtons.length,
        summaryItems: document.querySelectorAll('.traditional-mode-banner__summary div').length,
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        searchFontSize: search ? parseFloat(getComputedStyle(search).fontSize) : 0,
        smallestFormatTarget: Math.min(...formatButtons.map(button => button.getBoundingClientRect().height)),
        smallestOpenTarget: Math.min(...openButtons.map(button => button.getBoundingClientRect().height)),
        rootOverflow: (root?.scrollWidth ?? 0) > (root?.clientWidth ?? 0) + 1,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (!archetypeCatalogState.heading.includes('Архетипы') || archetypeCatalogState.rows !== qaArchetypeItems.length
      || archetypeCatalogState.formats !== 2 || archetypeCatalogState.summaryItems !== 2
      || archetypeCatalogState.heroHeight < 120 || archetypeCatalogState.heroHeight > 620
      || (device === 'mobile' && archetypeCatalogState.searchFontSize < 16)
      || archetypeCatalogState.smallestFormatTarget < 44 || archetypeCatalogState.smallestOpenTarget < 42
      || archetypeCatalogState.rootOverflow || archetypeCatalogState.documentOverflow) {
      failures.push(`archetype catalog [${device}]: layout, content or controls regressed (${JSON.stringify(archetypeCatalogState)})`);
    }
    const archetypeTourViolationCount = await auditPageTour(page, {
      label: `archetype catalog [${device}]`,
      expectedSteps: 5,
      mobile: device === 'mobile',
    });
    const archetypeViolationCount = await auditAccessibility(page, `archetype catalog [${device}]`, '.archetypes-page');
    await page.screenshot({ path: `${OUT}/archetype-catalog-${device}.png`, fullPage: false });

    await page.click('.archetype-row__open');
    await page.waitForSelector('.archetype-detail-page .archetype-trend', { timeout: 20_000 });
    await page.waitForSelector('.archetype-deck-card .deck-render-preview[data-render-state="ready"]', { timeout: 20_000 });
    const archetypeDetailState = await page.evaluate(() => {
      const root = document.querySelector('.archetype-detail-page');
      const copyButton = document.querySelector('.archetype-main-build .archetype-deck-card__copy');
      return {
        title: root?.querySelector('h1')?.textContent?.trim() || '',
        charts: root?.querySelectorAll('.archetype-trend').length ?? 0,
        builds: root?.querySelectorAll('.archetype-deck-card').length ?? 0,
        deckCards: root?.querySelectorAll('.archetype-deck-card .deck-tile').length ?? 0,
        renderSurfaces: root?.querySelectorAll('.archetype-deck-card .deck-render-preview').length ?? 0,
        previews: root?.querySelectorAll('.archetype-deck-card .deck-render-preview[data-render-state="ready"]').length ?? 0,
        previewButtons: root?.querySelectorAll('.archetype-deck-card .deck-render-preview__open').length ?? 0,
        copyButtons: root?.querySelectorAll('.archetype-deck-card__copy').length ?? 0,
        copyHeight: copyButton?.getBoundingClientRect().height ?? 0,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (!archetypeDetailState.title.includes('Чётный') || archetypeDetailState.charts !== 3
      || archetypeDetailState.builds !== 7 || archetypeDetailState.deckCards !== 35
      || archetypeDetailState.renderSurfaces !== 7 || archetypeDetailState.previews < 1
      || archetypeDetailState.previewButtons < 1 || archetypeDetailState.copyButtons !== 7
      || archetypeDetailState.copyHeight < 42 || archetypeDetailState.documentOverflow) {
      failures.push(`archetype detail [${device}]: charts, builds, code or containment regressed (${JSON.stringify(archetypeDetailState)})`);
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => { window.__qaCopiedDeckCode = value; } },
      });
    });
    await page.click('.archetype-main-build .archetype-deck-card__copy');
    await page.waitForFunction(() => document.querySelector('.archetype-main-build .archetype-deck-card__copy')
      ?.getAttribute('aria-label')?.startsWith('Код скопирован'));
    const archetypeCopyState = await page.evaluate(() => ({
      label: document.querySelector('.archetype-main-build .archetype-deck-card__copy')?.getAttribute('aria-label') || '',
      value: window.__qaCopiedDeckCode || '',
    }));
    if (!archetypeCopyState.label.startsWith('Код скопирован') || !archetypeCopyState.value.startsWith('AA')) {
      failures.push(`archetype detail [${device}]: deck code copy did not expose success (${JSON.stringify(archetypeCopyState)})`);
    }
    await page.click('.archetype-builds__more');
    await page.waitForFunction(() => document.querySelectorAll('.archetype-deck-card').length === 13);
    await auditAccessibility(page, `archetype detail [${device}]`, '.archetype-detail-page');
    await page.screenshot({ path: `${OUT}/archetype-detail-${device}.png`, fullPage: false });
    await page.click('.archetype-breadcrumb a');
    await page.waitForSelector('.archetype-row', { timeout: 20_000 });

    adminState.standardMetaReadFailureOnce = true;
    await page.goto(`${BASE}/standard/meta`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForFunction(() => window.location.pathname.replace(/\/+$/, '') === '/standard/meta');
    await page.waitForSelector('.standard-meta', { timeout: 20_000 });
    await page.waitForSelector('.standard-meta [data-recovery-state="error"]', { timeout: 20_000 });
    await page.evaluate(() => { window.__qaStandardMetaDocumentMarker = 'preserve-on-retry'; });
    const metaErrorState = await page.evaluate(() => {
      const state = document.querySelector('.standard-meta [data-recovery-state="error"]');
      const retry = state?.querySelector('button');
      return {
        role: state?.getAttribute('role') || '',
        text: state?.textContent?.replace(/\s+/g, ' ').trim() || '',
        retryHeight: retry?.getBoundingClientRect().height ?? 0,
        shellVisible: Boolean(document.querySelector('.arena-sidebar') && document.querySelector('.global-utility-header')),
      };
    });
    if (metaErrorState.role !== 'alert' || !metaErrorState.text.includes('Контрольная ошибка загрузки меты')
      || metaErrorState.retryHeight < 44 || !metaErrorState.shellVisible || adminState.standardMetaReadFailures !== 1) {
      failures.push(`standard meta recovery [${device}]: API error did not stay local or actionable (${JSON.stringify(metaErrorState)})`);
    }
    await page.click('.standard-meta [data-recovery-state="error"] button');
    await page.waitForSelector('[data-meta-view="cards"]', { timeout: 20_000 });
    const metaRetryState = await page.evaluate(() => ({
      marker: window.__qaStandardMetaDocumentMarker || '',
      errorPresent: Boolean(document.querySelector('.standard-meta [data-recovery-state="error"]')),
      shellRecoveryPresent: Boolean(document.querySelector('.app-error-shell')),
    }));
    if (metaRetryState.marker !== 'preserve-on-retry' || metaRetryState.errorPresent || metaRetryState.shellRecoveryPresent) {
      failures.push(`standard meta recovery [${device}]: Retry reloaded the document or opened shell recovery (${JSON.stringify(metaRetryState)})`);
    }
    adminState.standardMetaContractFailureOnce = true;
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.standard-meta__rank-tabs button')];
      const diamond = buttons.find(button => button.textContent?.trim() === 'Алмаз 1–4');
      if (diamond instanceof HTMLElement) diamond.click();
    });
    await page.waitForSelector('.standard-meta [data-recovery-state="error"]', { timeout: 20_000 });
    const contractErrorState = await page.evaluate(() => {
      const state = document.querySelector('.standard-meta [data-recovery-state="error"]');
      return {
        text: state?.textContent?.replace(/\s+/g, ' ').trim() || '',
        shellVisible: Boolean(document.querySelector('.arena-sidebar') && document.querySelector('.global-utility-header')),
        shellRecoveryPresent: Boolean(document.querySelector('.app-error-shell')),
      };
    });
    if (!contractErrorState.text.includes('Формат данных обновился')
      || !contractErrorState.shellVisible || contractErrorState.shellRecoveryPresent) {
      failures.push(`standard meta contract [${device}]: incompatible schema was not controlled (${JSON.stringify(contractErrorState)})`);
    }
    await page.click('.standard-meta [data-recovery-state="error"] button');
    await page.waitForSelector('[data-meta-view="cards"]', { timeout: 20_000 });
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('.standard-meta__rank-tabs button')];
      const legend = buttons.find(button => button.textContent?.trim() === 'Легенда');
      if (legend instanceof HTMLElement) legend.click();
    });
    await page.waitForFunction(() => document.querySelector('.standard-meta-chart__heading p')?.textContent?.includes('Легенда'));
    const standardMetaState = await page.evaluate(() => {
      const pageRoot = document.querySelector('.standard-meta');
      const masthead = document.querySelector('.traditional-mode-banner');
      const stats = document.querySelector('.traditional-mode-banner__summary');
      const controls = document.querySelector('.standard-meta__controls');
      const cardsView = document.querySelector('[data-meta-view="cards"]');
      const tableView = document.querySelector('[data-meta-view="table"]');
      const searchInput = document.querySelector('.standard-meta__search input');
      const title = document.querySelector('.traditional-mode-banner h1');
      const firstCard = document.querySelector('.standard-meta-card');
      const ornament = document.querySelector('.standard-meta__hero-ornament');
      const rankButtons = [...document.querySelectorAll('.standard-meta__rank-tabs button')];
      const formatButtons = [...document.querySelectorAll('.standard-meta__segmented button')];
      const periodSelect = document.querySelector('.standard-meta__secondary-filters select');
      const rankSelect = document.querySelector('.standard-meta__rank-select');
      const mastheadRect = masthead?.getBoundingClientRect();
      const statsStyle = stats ? getComputedStyle(stats) : null;
      const controlsStyle = controls ? getComputedStyle(controls) : null;
      const firstCardStyle = firstCard ? getComputedStyle(firstCard) : null;
      return {
        mastheadHeight: mastheadRect?.height ?? 0,
        titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        statsColumns: statsStyle?.gridTemplateColumns || '',
        statsCount: stats?.children.length ?? 0,
        controlsVisible: Boolean(controls && controls.getBoundingClientRect().height > 0),
        viewControlsPresent: Boolean(cardsView && tableView),
        rankLabels: rankButtons.map(button => button.textContent?.trim() || ''),
        formatCount: formatButtons.length,
        periodLabels: periodSelect ? [...periodSelect.options].map(option => option.textContent?.trim() || '') : [],
        rankSelectVisible: Boolean(rankSelect && rankSelect.getBoundingClientRect().height >= 44),
        searchFontSize: searchInput ? parseFloat(getComputedStyle(searchInput).fontSize) : 0,
        viewTargetHeight: tableView?.getBoundingClientRect().height ?? 0,
        legacyOrnamentPresent: Boolean(ornament),
        controlsFrame: controlsStyle?.borderImageSource || '',
        cardContentVisibility: firstCardStyle?.contentVisibility || '',
        scrollWidth: pageRoot?.scrollWidth ?? 0,
        clientWidth: pageRoot?.clientWidth ?? 0,
      };
    });
    if (standardMetaState.mastheadHeight < 150 || standardMetaState.mastheadHeight > 540
      || standardMetaState.titleSize > 112 || standardMetaState.statsCount !== 2
      || !standardMetaState.controlsVisible
      || !standardMetaState.viewControlsPresent
      || JSON.stringify(standardMetaState.rankLabels) !== JSON.stringify([
        'Алмаз 1–4',
        'Алмаз — Легенда',
        'Легенда',
        'Топ-5000',
        'Топ-1000',
      ])
      || standardMetaState.formatCount !== 2
      || !standardMetaState.periodLabels.includes('За весь патч 36.0.3')
      || !standardMetaState.periodLabels.includes('За всё дополнение — Побег из Аметистовой крепости')
      || (device === 'mobile' && !standardMetaState.rankSelectVisible)
      || (device !== 'mobile' && standardMetaState.rankSelectVisible)
      || standardMetaState.legacyOrnamentPresent || !standardMetaState.controlsFrame.includes('main-page-rail-border.png')
      || standardMetaState.cardContentVisibility !== 'auto'
      || (device === 'mobile' && (standardMetaState.searchFontSize < 16 || standardMetaState.viewTargetHeight < 44))
      || standardMetaState.scrollWidth > standardMetaState.clientWidth + 1) {
      failures.push(`standard meta [${device}]: redesigned header or panels regressed (${JSON.stringify(standardMetaState)})`);
    }
    await page.click('.standard-meta-chart__header-actions button');
    await page.waitForSelector('.standard-meta-chart__point');
    const standardMetaChartState = await page.evaluate(() => {
      const chart = document.querySelector('.standard-meta-chart');
      const viewport = document.querySelector('.standard-meta-chart__viewport');
      const points = [...document.querySelectorAll('.standard-meta-chart__point')];
      const labelledPoints = document.querySelectorAll('.standard-meta-chart__point text');
      const detail = document.querySelector('.standard-meta-chart__selection');
      const archetypeLink = detail?.querySelector('.standard-meta-chart__deck-action');
      return {
        points: points.length,
        labels: labelledPoints.length,
        subtitle: document.querySelector('.standard-meta-chart__heading p')?.textContent || '',
        detail: detail?.textContent || '',
        hasAxes: document.querySelectorAll('.standard-meta-chart__axis-title').length === 2,
        firstPointRole: points[0]?.getAttribute('role') || '',
        archetypeLinkHeight: archetypeLink?.getBoundingClientRect().height ?? 0,
        archetypeHref: archetypeLink?.getAttribute('href') || '',
        viewportScrollable: (viewport?.scrollWidth ?? 0) > (viewport?.clientWidth ?? 0),
        pageOverflow: (document.querySelector('.standard-meta')?.scrollWidth ?? 0) > (document.querySelector('.standard-meta')?.clientWidth ?? 0) + 1,
        chartVisible: Boolean(chart && chart.getBoundingClientRect().height > 0),
      };
    });
    if (standardMetaChartState.points !== 5 || standardMetaChartState.labels < 1 || standardMetaChartState.labels > 5
      || !standardMetaChartState.subtitle.includes('Стандарт') || !standardMetaChartState.subtitle.includes('Легенда')
      || !standardMetaChartState.detail.includes('Чётный Чернокнижник') || !standardMetaChartState.hasAxes
      || standardMetaChartState.firstPointRole !== 'button' || standardMetaChartState.archetypeLinkHeight < 44
      || standardMetaChartState.archetypeHref !== '/standard/archetypes/standard/qa-evenlock'
      || !standardMetaChartState.chartVisible || standardMetaChartState.pageOverflow
      || (device === 'mobile' && !standardMetaChartState.viewportScrollable)) {
      failures.push(`standard meta chart [${device}]: data, interaction or responsive containment regressed (${JSON.stringify(standardMetaChartState)})`);
    }
    await page.click('.standard-meta-chart__header-actions button');
    if (await page.$('.standard-meta-chart__content')) {
      failures.push(`standard meta chart [${device}]: collapse control did not hide chart content`);
    }
    await page.click('.standard-meta-chart__header-actions button');
    await page.waitForSelector('.standard-meta-chart__content');
    const standardMetaTourViolationCount = await auditPageTour(page, {
      label: `standard meta [${device}]`,
      expectedSteps: 6,
      mobile: device === 'mobile',
    });
    const standardMetaViolationCount = await auditAccessibility(page, `standard meta [${device}]`, '.standard-meta');
    await page.screenshot({ path: `${OUT}/standard-meta-${device}.png`, fullPage: false });
    await page.click('[data-meta-view="table"]');
    await page.waitForSelector('.standard-meta-table');
    const standardMetaTableState = await page.evaluate(() => {
      const wrapper = document.querySelector('.standard-meta-table-wrap');
      const table = document.querySelector('.standard-meta-table');
      const stickyCell = document.querySelector('.standard-meta-table__archetype');
      const archetypeLink = document.querySelector('.standard-meta-table__deck-button');
      return {
        rows: table?.querySelectorAll('tbody tr').length ?? 0,
        columns: table?.querySelectorAll('thead th').length ?? 0,
        sortControls: table?.querySelectorAll('[data-sort-key]').length ?? 0,
        scrollable: (wrapper?.scrollWidth ?? 0) > (wrapper?.clientWidth ?? 0),
        stickyPosition: stickyCell ? getComputedStyle(stickyCell).position : '',
        stickyLeft: stickyCell ? getComputedStyle(stickyCell).left : '',
        archetypeHref: archetypeLink?.getAttribute('href') || '',
        pageOverflow: (document.querySelector('.standard-meta')?.scrollWidth ?? 0) > (document.querySelector('.standard-meta')?.clientWidth ?? 0) + 1,
      };
    });
    if (standardMetaTableState.rows !== 5 || standardMetaTableState.columns !== 8 || standardMetaTableState.sortControls !== 7
      || standardMetaTableState.stickyPosition !== 'sticky' || standardMetaTableState.stickyLeft !== '0px'
      || standardMetaTableState.archetypeHref !== '/standard/archetypes/standard/qa-evenlock'
      || standardMetaTableState.pageOverflow || (device === 'mobile' && !standardMetaTableState.scrollable)) {
      failures.push(`standard meta table [${device}]: structure or responsive containment regressed (${JSON.stringify(standardMetaTableState)})`);
    }
    await page.$eval('[data-sort-key="popularity"]', button => button.click());
    await page.waitForFunction(() => ['ascending', 'descending'].includes(
      document.querySelector('[data-sort-key="popularity"]')?.closest('th')?.getAttribute('aria-sort') || '',
    ));
    if (await page.$eval('[data-sort-key="popularity"]', button => button.closest('th')?.getAttribute('aria-sort')) !== 'descending') {
      await page.$eval('[data-sort-key="popularity"]', button => button.click());
      await page.waitForFunction(() => document.querySelector('[data-sort-key="popularity"]')?.closest('th')?.getAttribute('aria-sort') === 'descending');
    }
    const popularityDescendingState = await page.evaluate(() => ({
      first: document.querySelector('.standard-meta-table tbody tr')?.getAttribute('data-meta-archetype') || '',
      label: document.querySelector('[data-sort-key="popularity"]')?.getAttribute('aria-label') || '',
    }));
    await page.$eval('[data-sort-key="popularity"]', button => button.click());
    await page.waitForFunction(() => document.querySelector('[data-sort-key="popularity"]')?.closest('th')?.getAttribute('aria-sort') === 'ascending');
    const popularityAscendingState = await page.evaluate(() => ({
      first: document.querySelector('.standard-meta-table tbody tr')?.getAttribute('data-meta-archetype') || '',
      label: document.querySelector('[data-sort-key="popularity"]')?.getAttribute('aria-label') || '',
    }));
    if (popularityDescendingState.first !== 'qa-evenlock' || popularityAscendingState.first !== 'qa-handbuff-warrior'
      || !popularityDescendingState.label.includes('по убыванию') || !popularityAscendingState.label.includes('по возрастанию')) {
      failures.push(`standard meta table [${device}]: sorting direction or order regressed (${JSON.stringify({ popularityDescendingState, popularityAscendingState })})`);
    }
    await auditAccessibility(page, `standard meta table [${device}]`, '.standard-meta');
    await page.screenshot({ path: `${OUT}/standard-meta-table-${device}.png`, fullPage: false });
    await page.click('[data-meta-view="cards"]');
    await page.waitForSelector('.standard-meta-card__deck-button');
    const metaArchetypeLinkState = await page.evaluate(() => {
      const link = document.querySelector('.standard-meta-card__deck-button');
      return {
        tag: link?.tagName || '',
        href: link?.getAttribute('href') || '',
        label: link?.getAttribute('aria-label') || '',
        height: link?.getBoundingClientRect().height ?? 0,
        modalPresent: Boolean(document.querySelector('.standard-meta-modal')),
      };
    });
    if (metaArchetypeLinkState.tag !== 'A'
      || metaArchetypeLinkState.href !== '/standard/archetypes/standard/qa-evenlock'
      || !metaArchetypeLinkState.label.includes('Открыть страницу архетипа')
      || metaArchetypeLinkState.height < 44 || metaArchetypeLinkState.modalPresent) {
      failures.push(`standard meta archetype link [${device}]: action did not become a direct accessible route (${JSON.stringify(metaArchetypeLinkState)})`);
    }
    await page.click('.standard-meta-card__deck-button');
    await page.waitForFunction(() => window.location.pathname === '/standard/archetypes/standard/qa-evenlock');
    await page.waitForSelector('.archetype-detail-page', { timeout: 20_000 });
    if (adminState.standardMetaRecommendationRequests || adminState.standardMetaPreviewRequests) {
      failures.push(`standard meta archetype link [${device}]: direct navigation still requested the legacy modal (${JSON.stringify({ recommendations: adminState.standardMetaRecommendationRequests, previews: adminState.standardMetaPreviewRequests })})`);
    }
    if (process.env.QA_VALIDATE_LEGACY_META_MODAL === '1') {
    await page.click('.standard-meta-card__deck-button');
    await page.waitForSelector('.standard-meta-modal__image-stage');
    await page.waitForFunction(() => document.querySelector('.standard-meta-modal__composition-pane .deck-list-view .deck-tile')
      || document.querySelector('.standard-meta-modal__composition-pane .deck-list-view__empty'));
    await page.waitForSelector('.standard-meta-modal__image-stage img');
    const immediateDeckState = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.standard-meta-modal__composition-pane .deck-tile').length,
      artTiles: [...document.querySelectorAll('.standard-meta-modal__composition-pane .deck-tile__art')]
        .filter(art => getComputedStyle(art).backgroundImage !== 'none').length,
      columns: getComputedStyle(document.querySelector('.standard-meta-modal__composition-pane .deck-list-view__list')).gridTemplateColumns.split(' ').length,
      panelWidth: document.querySelector('.standard-meta-modal__panel')?.getBoundingClientRect().width || 0,
      panelHeight: document.querySelector('.standard-meta-modal__panel')?.getBoundingClientRect().height || 0,
      stageHorizontalOverflow: (document.querySelector('.standard-meta-modal__image-stage')?.scrollWidth || 0)
        > (document.querySelector('.standard-meta-modal__image-stage')?.clientWidth || 0) + 1,
      tileHeight: document.querySelector('.standard-meta-modal__composition-pane .deck-tile')?.getBoundingClientRect().height || 0,
      builderHeader: document.querySelector('.standard-meta-modal__composition-pane .deck-list-view__head')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      imagePresent: Boolean(document.querySelector('.standard-meta-modal__image-stage img')),
      tabsPresent: Boolean(document.querySelector('.standard-meta-modal__presentation')),
    }));
    if (immediateDeckState.tiles !== qaDeckCards.length || immediateDeckState.artTiles !== qaDeckCards.length
      || immediateDeckState.columns !== 1
      || (device === 'desktop' && (immediateDeckState.panelWidth < 1300 || immediateDeckState.panelWidth > 1410
        || immediateDeckState.panelHeight < 820))
      || immediateDeckState.stageHorizontalOverflow || immediateDeckState.tileHeight > 38
      || !immediateDeckState.builderHeader.includes('Состав из конструктора колод')
      || !immediateDeckState.imagePresent || immediateDeckState.tabsPresent
      || adminState.standardMetaPreviewRequests !== 1) {
      failures.push(`standard meta modal [${device}]: simultaneous split layout or enlarged panel regressed (${JSON.stringify(immediateDeckState)})`);
    }
    if (device === 'desktop') {
      await page.hover('.standard-meta-modal__composition-pane .deck-tile');
      await page.waitForSelector('.card-preview-tooltip img');
      await page.waitForFunction(() => {
        const image = document.querySelector('.card-preview-tooltip img');
        return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
      });
      const fullCardTooltipState = await page.evaluate(() => ({
        cardId: document.querySelector('.card-preview-tooltip')?.getAttribute('data-card-preview-id') || '',
        alt: document.querySelector('.card-preview-tooltip img')?.getAttribute('alt') || '',
      }));
      if (fullCardTooltipState.cardId !== qaDeckCards[0].id || fullCardTooltipState.alt !== qaDeckCards[0].name) {
        failures.push(`standard meta full-card tooltip [${device}]: wrong card preview (${JSON.stringify(fullCardTooltipState)})`);
      }
      await page.mouse.move(1, 1);
      await page.waitForSelector('.card-preview-tooltip', { hidden: true });
    }
    const metaModalState = await page.evaluate(() => {
      const modal = document.querySelector('.standard-meta-modal');
      const panel = document.querySelector('.standard-meta-modal__panel');
      const image = document.querySelector('.standard-meta-modal__image-stage img');
      const imageStage = document.querySelector('.standard-meta-modal__image-stage');
      const composition = document.querySelector('.standard-meta-modal__composition-pane');
      const visualPane = document.querySelector('.standard-meta-modal__visual-pane');
      const classImage = document.querySelector('.standard-meta-modal__header img');
      const copyButton = document.querySelector('.standard-meta-modal__copy-button');
      const panelRect = panel?.getBoundingClientRect();
      const imageRect = image?.getBoundingClientRect();
      const imageStageRect = imageStage?.getBoundingClientRect();
      const compositionRect = composition?.getBoundingClientRect();
      const visualPaneRect = visualPane?.getBoundingClientRect();
      const copyButtonRect = copyButton?.getBoundingClientRect();
      return {
        panelTop: panelRect?.top ?? -1,
        panelBottom: panelRect?.bottom ?? -1,
        panelWidth: panelRect?.width ?? 0,
        panelHeight: panelRect?.height ?? 0,
        viewportWidth: window.innerWidth,
        imageWidth: imageRect?.width ?? 0,
        imageHeight: imageRect?.height ?? 0,
        imageStageHeight: imageStageRect?.height ?? 0,
        viewportHeight: window.innerHeight,
        rawCodeVisible: Boolean(document.querySelector('.standard-meta-modal__code-block, .standard-meta-modal code')),
        classImage: classImage?.getAttribute('src') || '',
        copyText: copyButton?.textContent?.trim() || '',
        copyIconPresent: Boolean(copyButton?.querySelector('svg')),
        copyButtonHeight: copyButtonRect?.height ?? 0,
        copyButtonLabel: copyButton?.getAttribute('aria-label') || '',
        copyBelowStage: Boolean(copyButtonRect && imageStageRect && copyButtonRect.top >= imageStageRect.bottom - 1),
        copyCentered: Boolean(copyButtonRect && visualPaneRect
          && Math.abs((copyButtonRect.left + copyButtonRect.width / 2) - (visualPaneRect.left + visualPaneRect.width / 2)) < 3),
        imageCentered: Boolean(imageRect && imageStageRect
          && Math.abs((imageRect.left + imageRect.width / 2) - (imageStageRect.left + imageStageRect.width / 2)) < 3),
        compositionRightOfImage: Boolean(compositionRect && imageStageRect
          && compositionRect.left >= imageStageRect.right - 1),
        compositionBelowImage: Boolean(compositionRect && visualPaneRect
          && compositionRect.top >= visualPaneRect.bottom - 1),
        compositionWidth: compositionRect?.width ?? 0,
        compositionHeight: compositionRect?.height ?? 0,
        bodyLocked: getComputedStyle(document.body).position === 'fixed',
        portalIsBodyChild: modal?.parentElement === document.body,
      };
    });
    const minimumDeckImageWidth = device === 'desktop' ? 700 : 250;
    const minimumDeckImageHeight = device === 'desktop' ? 300 : 170;
    if (metaModalState.panelTop < 0 || metaModalState.panelBottom > metaModalState.viewportHeight + 1
      || (device === 'desktop' && (metaModalState.panelWidth < 1300 || metaModalState.panelWidth > 1410
        || metaModalState.panelHeight < metaModalState.viewportHeight * 0.9
        || metaModalState.panelHeight > metaModalState.viewportHeight))
      || (device === 'mobile' && metaModalState.panelHeight > metaModalState.viewportHeight)
      || metaModalState.imageWidth < minimumDeckImageWidth || metaModalState.imageHeight < minimumDeckImageHeight
      || (device === 'mobile' && (metaModalState.imageStageHeight < metaModalState.viewportHeight * 0.34
        || metaModalState.imageStageHeight > metaModalState.viewportHeight * 0.58))
      || metaModalState.rawCodeVisible || !metaModalState.classImage.includes('warlock-64.webp')
      || metaModalState.copyText !== 'Скопировать код' || !metaModalState.copyIconPresent
      || metaModalState.copyButtonHeight < 44 || metaModalState.copyButtonLabel !== 'Скопировать код колоды'
      || !metaModalState.copyBelowStage || !metaModalState.copyCentered || !metaModalState.imageCentered
      || metaModalState.compositionWidth < (device === 'desktop' ? 360 : 250)
      || metaModalState.compositionHeight < 200
      || (device === 'desktop' ? !metaModalState.compositionRightOfImage : !metaModalState.compositionBelowImage)
      || !metaModalState.bodyLocked || !metaModalState.portalIsBodyChild) {
      failures.push(`standard meta modal [${device}]: simultaneous image/composition geometry, hidden code or copy placement regressed (${JSON.stringify(metaModalState)})`);
    }
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => { window.__qaCopiedDeckCode = value; } },
      });
    });
    await page.click('.standard-meta-modal__copy-button');
    const copyState = await page.evaluate(() => ({
      label: document.querySelector('.standard-meta-modal__copy-button')?.getAttribute('aria-label') || '',
      value: window.__qaCopiedDeckCode || '',
    }));
    if (copyState.label !== 'Код колоды скопирован' || !copyState.value.startsWith('AA')) {
      failures.push(`standard meta modal [${device}]: graphical copy control did not expose success state (${JSON.stringify(copyState)})`);
    }
    await auditAccessibility(page, `standard meta modal [${device}]`, '.standard-meta-modal__panel');
    await page.screenshot({ path: `${OUT}/standard-meta-modal-${device}.png`, fullPage: false });
    await page.click('.standard-meta-modal__close');
    if (device === 'mobile') {
      await page.setViewport({ width: 320, height: 700, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    }
    await page.click('.standard-meta-card__deck-button');
    await page.waitForSelector('.standard-meta-modal__image-stage');
    await page.waitForSelector('.standard-meta-modal__composition-pane .deck-list-view .deck-tile', { timeout: 10_000 });
    const sharedBuilderState = await page.evaluate(expectedCards => {
      const stage = document.querySelector('.standard-meta-modal__composition-pane');
      return {
        cards: stage?.querySelectorAll('.deck-list-view .deck-tile').length ?? 0,
        expectedCards,
        sharedBuilderPresent: Boolean(stage?.querySelector('.deck-list-view')),
        rawCodeVisible: Boolean(document.querySelector('.standard-meta-modal__code-block, .standard-meta-modal code')),
        copyAvailable: Boolean(document.querySelector('.standard-meta-modal__copy-button')),
        shellRecoveryPresent: Boolean(document.querySelector('.app-error-shell')),
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        stageOverflow: (stage?.scrollWidth ?? 0) > (stage?.clientWidth ?? 0) + 1,
      };
    }, qaDeckCards.length);
    if (sharedBuilderState.cards !== sharedBuilderState.expectedCards || !sharedBuilderState.sharedBuilderPresent
      || sharedBuilderState.rawCodeVisible || !sharedBuilderState.copyAvailable || sharedBuilderState.shellRecoveryPresent
      || sharedBuilderState.pageOverflow || sharedBuilderState.stageOverflow) {
      failures.push(`shared deck-builder composition [${device}]: content, hidden code or containment regressed (${JSON.stringify(sharedBuilderState)})`);
    }
    if ((adminState.standardMetaRecommendationRequests || 0) !== 1 || adminState.standardMetaPreviewRequests !== 1
      || adminState.standardMetaRecommendationRank !== 'legend' || adminState.standardMetaPreviewRank !== 'legend') {
      failures.push(`standard meta modal [${device}]: reopening repeated API work or rank context was lost (${JSON.stringify({ recommendations: adminState.standardMetaRecommendationRequests, previews: adminState.standardMetaPreviewRequests, recommendationRank: adminState.standardMetaRecommendationRank, previewRank: adminState.standardMetaPreviewRank })})`);
    }
    await page.click('.standard-meta-modal__close');
    }
    if (device === 'mobile') await page.setViewport(viewport);
    await page.goto(`${BASE}/standard/matchups`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('[data-tour-id="matchups-matrix"]', { timeout: 20_000 });
    const standardMatchupsTourViolationCount = await auditPageTour(page, {
      label: `standard matchups [${device}]`,
      expectedSteps: 4,
      mobile: device === 'mobile',
    });
    await page.waitForFunction(() => (
      document.querySelector('.standard-matchups__ledger-heading h2')?.textContent?.includes('Стандарт')
      && document.querySelector('#matchups-picker select')?.value === 'Control Warrior'
    ), { timeout: 10_000 });
    await page.click('.standard-matchups__filter-chips button:nth-child(2)');
    await page.waitForFunction(() => (
      document.querySelector('.standard-matchups__filter-chips button:nth-child(2)')?.getAttribute('aria-pressed') === 'true'
    ));
    const focusedMatchupsState = await page.evaluate(() => {
      const group = document.querySelector('.standard-matchups__groups--focused .standard-matchups__group');
      const list = group?.querySelector('.standard-matchups__group-list');
      const card = list?.querySelector('.standard-matchups__group-item');
      const groupRect = group?.getBoundingClientRect();
      const cardRect = card?.getBoundingClientRect();
      const listStyle = list ? getComputedStyle(list) : null;
      return {
        groups: document.querySelectorAll('.standard-matchups__groups--focused .standard-matchups__group').length,
        cards: document.querySelectorAll('.standard-matchups__groups--focused .standard-matchups__group-item').length,
        display: listStyle?.display || '',
        columns: listStyle?.gridTemplateColumns.split(/\s+/).filter(Boolean).length ?? 0,
        groupWidth: groupRect?.width ?? 0,
        cardWidth: cardRect?.width ?? 0,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (focusedMatchupsState.groups !== 1 || focusedMatchupsState.cards !== 1
      || focusedMatchupsState.display !== 'grid' || focusedMatchupsState.cardWidth <= 0
      || focusedMatchupsState.cardWidth > 354 || focusedMatchupsState.pageOverflow
      || (device === 'desktop' && (focusedMatchupsState.columns < 2
        || focusedMatchupsState.cardWidth >= focusedMatchupsState.groupWidth * 0.7))
      || (device === 'mobile' && focusedMatchupsState.columns !== 1)) {
      failures.push(`standard matchups focused columns [${device}]: cards stretched or stopped using the responsive grid (${JSON.stringify(focusedMatchupsState)})`);
    }
    await page.screenshot({ path: `${OUT}/standard-matchups-focused-${device}.png`, fullPage: false });
    await page.click('button[aria-label="Показать матчапы: Вольный"]');
    await page.waitForFunction(() => (
      document.querySelector('button[aria-label="Показать матчапы: Вольный"]')?.getAttribute('aria-pressed') === 'true'
      && document.querySelector('.standard-matchups__ledger-heading h2')?.textContent?.includes('Вольный')
      && document.querySelector('#matchups-picker select')?.value === 'Wild Control Rogue'
    ), { timeout: 10_000 });
    const wildMatchupsState = await page.evaluate(() => ({
      heading: document.querySelector('.standard-matchups__ledger-heading h2')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      selectedFormat: document.querySelector('button[aria-label="Показать матчапы: Вольный"]')?.getAttribute('aria-pressed') || '',
      selectedArchetype: document.querySelector('#matchups-picker select')?.value || '',
      overviewCards: document.querySelectorAll('.standard-matchups__group-list > div').length,
      matrixDeferred: !document.querySelector('#matchups-matrix'),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (!wildMatchupsState.heading.includes('Вольный')
      || wildMatchupsState.selectedFormat !== 'true'
      || wildMatchupsState.selectedArchetype !== 'Wild Control Rogue'
      || wildMatchupsState.overviewCards !== 2
      || !wildMatchupsState.matrixDeferred
      || wildMatchupsState.pageOverflow
      || !adminState.matchupFormats?.includes('wild')) {
      failures.push(`standard matchups format switch [${device}]: Wild data or responsive overview did not replace Standard (${JSON.stringify(wildMatchupsState)})`);
    }
    await page.screenshot({ path: `${OUT}/standard-matchups-wild-overview-${device}.png`, fullPage: false });
    await page.click('.standard-matchups__view-switcher button[aria-pressed="false"]');
    await page.waitForSelector('#matchups-matrix');
    const matrixState = await page.evaluate(() => ({
      rowCount: document.querySelectorAll('#matchups-matrix tbody tr').length,
      columnCount: document.querySelectorAll('#matchups-matrix thead th').length,
      scrollable: (() => {
        const matrix = document.querySelector('#matchups-matrix');
        return Boolean(matrix && matrix.scrollWidth > matrix.clientWidth);
      })(),
      firstRow: document.querySelector('#matchups-matrix tbody th')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      topScrollbar: Boolean(document.querySelector('.standard-matchups__matrix-scrollbar--top')),
      bottomScrollbar: Boolean(document.querySelector('.standard-matchups__matrix-scrollbar--bottom')),
      interactiveCells: document.querySelectorAll('#matchups-matrix [data-matchup-cell]').length,
      bottomArchetypes: document.querySelectorAll('#matchups-matrix [data-matchups-bottom-archetype]').length,
      bottomPanelText: document.querySelector('#matchups-matrix tfoot')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      otherAggregateVisible: /Other\s+(?:DK|Priest|Rogue|Druid|Hunter|Mage|Paladin|Shaman|Warlock|Warrior)/i
        .test(document.querySelector('#matchups-matrix')?.textContent || ''),
    }));
    if (matrixState.rowCount !== 3 || matrixState.columnCount !== 4
      || !matrixState.scrollable || !matrixState.firstRow.includes('Вольный Контроль Разбойник')
      || !matrixState.topScrollbar || matrixState.bottomScrollbar || matrixState.interactiveCells !== 9
      || matrixState.bottomArchetypes !== 3
      || !matrixState.bottomPanelText.includes('Вольный Контроль Разбойник')
      || matrixState.otherAggregateVisible) {
      failures.push(`standard matchups matrix [${device}]: on-demand Wild matrix is incomplete (${JSON.stringify(matrixState)})`);
    }
    const scrollbarSyncState = await page.evaluate(async () => {
      const matrix = document.querySelector('#matchups-matrix');
      const top = document.querySelector('.standard-matchups__matrix-scrollbar--top');
      if (!(matrix instanceof HTMLElement) || !(top instanceof HTMLElement)) {
        return { available: false, matrixLeft: 0, topLeft: 0 };
      }
      top.scrollLeft = Math.min(180, top.scrollWidth - top.clientWidth);
      top.dispatchEvent(new Event('scroll'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        available: true,
        matrixLeft: Math.round(matrix.scrollLeft),
        topLeft: Math.round(top.scrollLeft),
      };
    });
    if (!scrollbarSyncState.available || scrollbarSyncState.topLeft <= 0
      || scrollbarSyncState.matrixLeft !== scrollbarSyncState.topLeft) {
      failures.push(`standard matchups scrollbar [${device}]: the upper rail stopped controlling the matrix (${JSON.stringify(scrollbarSyncState)})`);
    }
    await page.$eval('#matchups-matrix [data-matchup-cell]', element => element.click());
    await page.waitForSelector('#standard-matchups-cell-dialog');
    const matchupTooltipState = await page.evaluate(() => {
      const dialog = document.querySelector('#standard-matchups-cell-dialog');
      const rect = dialog?.getBoundingClientRect();
      const activeCell = document.querySelector('#matchups-matrix [data-matchup-cell][aria-expanded="true"]');
      return {
        text: dialog?.textContent?.replace(/\s+/g, ' ').trim() || '',
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        withinViewport: Boolean(rect
          && rect.left >= 0 && rect.right <= window.innerWidth + 1
          && rect.top >= 0 && rect.bottom <= window.innerHeight + 1),
        activeCell: Boolean(activeCell),
        closeHeight: dialog?.querySelector('button')?.getBoundingClientRect().height ?? 0,
        pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (!matchupTooltipState.visible || !matchupTooltipState.withinViewport
      || !matchupTooltipState.text.includes('Матчап')
      || !matchupTooltipState.text.includes('против')
      || !matchupTooltipState.text.includes('%')
      || !matchupTooltipState.activeCell || matchupTooltipState.closeHeight < 42
      || matchupTooltipState.pageOverflow) {
      failures.push(`standard matchups tooltip [${device}]: content, geometry or touch target regressed (${JSON.stringify(matchupTooltipState)})`);
    }
    await auditAccessibility(page, `standard matchups tooltip [${device}]`, '#standard-matchups-cell-dialog');
    await page.screenshot({ path: `${OUT}/standard-matchups-tooltip-${device}.png`, fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#standard-matchups-cell-dialog'));
    await page.waitForFunction(() => document.activeElement?.hasAttribute('data-matchup-cell'));
    const tooltipKeyboardState = await page.evaluate(() => ({
      restoredFocus: document.activeElement?.hasAttribute('data-matchup-cell') ?? false,
      expandedCells: document.querySelectorAll('#matchups-matrix [data-matchup-cell][aria-expanded="true"]').length,
    }));
    if (!tooltipKeyboardState.restoredFocus || tooltipKeyboardState.expandedCells !== 0) {
      failures.push(`standard matchups tooltip keyboard [${device}]: Escape did not close and restore focus (${JSON.stringify(tooltipKeyboardState)})`);
    }
    await page.$eval('#matchups-matrix', element => {
      element.scrollLeft = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.$eval('#matchups-matrix tfoot', element => element.scrollIntoView({ block: 'end' }));
    await new Promise(resolve => setTimeout(resolve, 180));
    const bottomPanelState = await page.evaluate(() => {
      const matrix = document.querySelector('#matchups-matrix');
      const footer = matrix?.querySelector('tfoot');
      const matrixRect = matrix?.getBoundingClientRect();
      const footerRect = footer?.getBoundingClientRect();
      return {
        visible: Boolean(matrixRect && footerRect
          && footerRect.bottom > matrixRect.top
          && footerRect.top < matrixRect.bottom),
        sticky: footer ? getComputedStyle(footer.querySelector('th')).position === 'sticky' : false,
        labels: footer?.querySelectorAll('[data-matchups-bottom-archetype]').length ?? 0,
      };
    });
    if (!bottomPanelState.visible || !bottomPanelState.sticky || bottomPanelState.labels !== 3) {
      failures.push(`standard matchups bottom archetypes [${device}]: repeated footer is not visible or sticky (${JSON.stringify(bottomPanelState)})`);
    }
    await page.screenshot({ path: `${OUT}/standard-matchups-bottom-${device}.png`, fullPage: false });
    await auditAccessibility(page, `standard matchups Wild matrix [${device}]`, '.standard-matchups');
    await page.screenshot({ path: `${OUT}/standard-matchups-wild-${device}.png`, fullPage: false });
    await page.goto(`${BASE}/standard/vicious-gold`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.vsgold__panel', { timeout: 20_000 });
    await page.waitForFunction(() => {
      const image = document.querySelector('.vsgold__build-copy-button img');
      return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    });
    const viciousGoldState = await page.evaluate(() => {
      const pageRoot = document.querySelector('.vsgold');
      const hero = document.querySelector('.traditional-mode-banner');
      const stats = document.querySelector('.traditional-mode-banner__summary');
      const title = document.querySelector('.traditional-mode-banner h1');
      const mobileNav = document.querySelector('.vsgold__mobile-nav');
      const deckSearch = document.querySelector('.vsgold__deck-tools input');
      const classButton = document.querySelector('.vsgold__class-bars button');
      const buildButton = document.querySelector('.vsgold__build button');
      const copyImage = buildButton?.querySelector('img');
      const deckList = document.querySelector('.vsgold__deck-list');
      const firstDeckRow = document.querySelector('.vsgold__deck-row');
      const firstTierCard = document.querySelector('.vsgold__tier-card');
      const firstPanel = document.querySelector('.vsgold__panel');
      const ornament = document.querySelector('.vsgold__hero-ornament');
      const heroRect = hero?.getBoundingClientRect();
      return {
        heroHeight: heroRect?.height ?? 0,
        titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        statsCount: stats?.children.length ?? 0,
        panelCount: document.querySelectorAll('.vsgold__panel').length,
        mobileNavCount: mobileNav?.querySelectorAll('a').length ?? 0,
        mobileNavDisplay: mobileNav ? getComputedStyle(mobileNav).display : '',
        deckSearchFontSize: deckSearch ? parseFloat(getComputedStyle(deckSearch).fontSize) : 0,
        classTargetHeight: classButton?.getBoundingClientRect().height ?? 0,
        buildTargetHeight: buildButton?.getBoundingClientRect().height ?? 0,
        buildButtonLabel: buildButton?.getAttribute('aria-label') || '',
        copyImage: copyImage?.getAttribute('src') || '',
        copyImageLoaded: copyImage instanceof HTMLImageElement && copyImage.complete && copyImage.naturalWidth > 0,
        deckListOverflowY: deckList ? getComputedStyle(deckList).overflowY : '',
        deckListMaxHeight: deckList ? getComputedStyle(deckList).maxHeight : '',
        legacyOrnamentPresent: Boolean(ornament),
        panelFrame: firstPanel ? getComputedStyle(firstPanel).borderImageSource : '',
        deckRowContainment: firstDeckRow ? getComputedStyle(firstDeckRow).contain : '',
        tierCardContentVisibility: firstTierCard ? getComputedStyle(firstTierCard).contentVisibility : '',
        scrollWidth: pageRoot?.scrollWidth ?? 0,
        clientWidth: pageRoot?.clientWidth ?? 0,
      };
    });
    if (viciousGoldState.heroHeight < 150 || viciousGoldState.heroHeight > 540
      || viciousGoldState.titleSize > 112 || viciousGoldState.statsCount !== 2
      || viciousGoldState.panelCount < 3
      || (device === 'desktop' && viciousGoldState.mobileNavDisplay !== 'none')
      || !viciousGoldState.copyImage.includes('deck-code-to-hearthstone.png')
      || !viciousGoldState.copyImageLoaded
      || !viciousGoldState.buildButtonLabel.startsWith('Скопировать код колоды')
      || viciousGoldState.legacyOrnamentPresent || !viciousGoldState.panelFrame.includes('main-page-rail-border.png')
      || (viciousGoldState.deckRowContainment !== 'content' && !viciousGoldState.deckRowContainment.includes('layout'))
      || viciousGoldState.tierCardContentVisibility !== 'auto'
      || (device === 'mobile' && (viciousGoldState.mobileNavCount !== 3 || viciousGoldState.mobileNavDisplay === 'none'
        || viciousGoldState.deckSearchFontSize < 16 || viciousGoldState.classTargetHeight < 44
        || viciousGoldState.buildTargetHeight < 44 || viciousGoldState.deckListOverflowY !== 'auto'
        || viciousGoldState.deckListMaxHeight === 'none'))
      || viciousGoldState.scrollWidth > viciousGoldState.clientWidth + 1) {
      failures.push(`vicious gold [${device}]: redesigned header or panels regressed (${JSON.stringify(viciousGoldState)})`);
    }
    const viciousGoldTourViolationCount = await auditPageTour(page, {
      label: `vicious gold [${device}]`,
      expectedSteps: 5,
      mobile: device === 'mobile',
    });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async value => { window.__qaViciousDeckCode = value; } },
      });
    });
    await page.click('.vsgold__build-open');
    await page.waitForSelector('.vsgold__deck-composition .hsrdv-card-tile');
    const viciousDeckListState = await page.evaluate(() => ({
      tiles: document.querySelectorAll('.vsgold__deck-composition .hsrdv-card-tile').length,
      expanded: document.querySelector('.vsgold__build-open')?.getAttribute('aria-expanded'),
      overflow: document.querySelector('.vsgold')?.scrollWidth > document.querySelector('.vsgold')?.clientWidth,
    }));
    if (viciousDeckListState.tiles !== qaDeckCards.length || viciousDeckListState.expanded !== 'true' || viciousDeckListState.overflow) {
      failures.push(`vicious gold deck list [${device}]: inline composition regressed (${JSON.stringify(viciousDeckListState)})`);
    }
    await page.click('.vsgold__build-copy-button');
    await page.waitForFunction(() => document.querySelector('.vsgold__build-copy-button')?.getAttribute('aria-label') === 'Код колоды скопирован');
    const viciousCopyState = await page.evaluate(() => ({
      label: document.querySelector('.vsgold__build-copy-button')?.getAttribute('aria-label') || '',
      value: window.__qaViciousDeckCode || '',
    }));
    if (viciousCopyState.label !== 'Код колоды скопирован' || !viciousCopyState.value.startsWith('AAECAf0G')) {
      failures.push(`vicious gold [${device}]: graphical copy control failed (${JSON.stringify(viciousCopyState)})`);
    }
    await page.screenshot({ path: `${OUT}/vicious-gold-copy-${device}.png`, fullPage: false });
    if (device === 'mobile') {
      await page.click('.vsgold__class-bars button');
      await new Promise(resolve => setTimeout(resolve, 250));
      const classFilterState = await page.evaluate(() => ({
        selectedClass: document.querySelector('.vsgold__deck-tools select')?.value || '',
        pressed: document.querySelector('.vsgold__class-bars button')?.getAttribute('aria-pressed') || '',
        deckSectionTop: document.querySelector('#vsgold-decks')?.getBoundingClientRect().top ?? -1,
        navHeight: document.querySelector('.vsgold__mobile-nav')?.getBoundingClientRect().height ?? 0,
      }));
      if (classFilterState.selectedClass !== 'warlock' || classFilterState.pressed !== 'true'
        || classFilterState.deckSectionTop < classFilterState.navHeight - 2
        || classFilterState.deckSectionTop > classFilterState.navHeight + 90) {
        failures.push(`vicious gold [${device}]: class-to-deck mobile flow regressed (${JSON.stringify(classFilterState)})`);
      }
      await page.click('.vsgold__mobile-nav a[href="#vsgold-power"]');
      await new Promise(resolve => setTimeout(resolve, 250));
      await page.screenshot({ path: `${OUT}/vicious-gold-power-${device}.png`, fullPage: false });
    }
    const viciousGoldViolationCount = await auditAccessibility(page, `vicious gold [${device}]`, '.vsgold');
    await page.screenshot({ path: `${OUT}/vicious-gold-${device}.png`, fullPage: false });

    await page.goto(`${BASE}/standard/cards`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.constructed-cards__gallery-card', { timeout: 20_000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.constructed-cards__gallery-card > img')].every(image => image.complete && image.naturalWidth > 0));
    const constructedCardsState = await page.evaluate(() => {
      const root = document.querySelector('.constructed-cards');
      const controls = document.querySelector('.constructed-cards__controls');
      const search = document.querySelector('.constructed-card-search__field input');
      const viewButtons = [...document.querySelectorAll('.constructed-cards__view button')];
      const menuLinks = [...document.querySelectorAll('a[href="/standard/cards"]')];
      return {
        cards: document.querySelectorAll('.constructed-cards__gallery-card').length,
        filters: document.querySelectorAll('.constructed-cards__filter').length,
        menuLinks: menuLinks.length,
        controlsVisible: Boolean(controls && controls.getBoundingClientRect().height > 0),
        searchFontSize: search ? parseFloat(getComputedStyle(search).fontSize) : 0,
        smallestViewTarget: Math.min(...viewButtons.map(button => button.getBoundingClientRect().height)),
        rootOverflow: (root?.scrollWidth ?? 0) > (root?.clientWidth ?? 0) + 1,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rankText: document.querySelector('.constructed-cards__header')?.textContent || '',
        coveragePresent: Boolean(document.querySelector('.constructed-cards__coverage')),
        resultsHeaderPresent: Boolean(document.querySelector('.constructed-cards__results-header')),
        formatControls: document.querySelectorAll('.constructed-cards__format').length,
        formatIcons: [...document.querySelectorAll('.constructed-cards__format img')].filter(image => image.complete && image.naturalWidth > 0).length,
        formatLabels: [...document.querySelectorAll('.constructed-cards__format button')].map(button => button.getAttribute('aria-label')),
        secondaryLabels: [...document.querySelectorAll('.constructed-cards__secondary-controls > .constructed-cards__filter > span')]
          .map(label => label.textContent?.trim() || ''),
        setMetricLabels: [...document.querySelectorAll('.constructed-cards__gallery-stat small')].filter(item => item.textContent?.includes('Дополнение')).length,
        defaultSort: document.querySelector('[data-tour-id="cards-sort"] .constructed-cards__filter-value')?.textContent?.trim() || '',
        rarity: document.querySelector('.constructed-cards__gallery-card')?.getAttribute('data-rarity') || '',
        rarityGlow: getComputedStyle(document.querySelector('.constructed-cards__gallery-card'), '::before').backgroundImage,
        hoverTransition: getComputedStyle(document.querySelector('.constructed-cards__gallery-card')).transitionDuration,
        advancedToggleHeight: document.querySelector('.constructed-cards__advanced-toggle')?.getBoundingClientRect().height || 0,
        advancedFiltersVisible: getComputedStyle(document.querySelector('.constructed-cards__secondary-controls')).display !== 'none',
      };
    });
    if (constructedCardsState.cards !== 8 || constructedCardsState.filters < 8 || constructedCardsState.menuLinks < 1
      || !constructedCardsState.controlsVisible || !constructedCardsState.rankText.includes('Легенда')
      || constructedCardsState.coveragePresent || constructedCardsState.resultsHeaderPresent
      || constructedCardsState.formatControls !== 1 || constructedCardsState.setMetricLabels !== 8 || constructedCardsState.defaultSort !== 'Новые дополнения'
      || constructedCardsState.formatIcons !== 2 || constructedCardsState.formatLabels.join(',') !== 'Стандарт,Вольный'
      || !constructedCardsState.secondaryLabels.includes('Класс') || !constructedCardsState.secondaryLabels.includes('Дополнение')
      || !constructedCardsState.rarity || !constructedCardsState.rarityGlow.includes('radial-gradient') || constructedCardsState.hoverTransition === '0s'
      || constructedCardsState.rootOverflow || constructedCardsState.documentOverflow
      || (device === 'mobile' && (constructedCardsState.searchFontSize < 16 || constructedCardsState.smallestViewTarget < 44
        || constructedCardsState.advancedToggleHeight < 44 || constructedCardsState.advancedFiltersVisible))) {
      failures.push(`constructed cards [${device}]: menu, controls or responsive gallery regressed (${JSON.stringify(constructedCardsState)})`);
    }
    if (device === 'mobile') {
      await page.click('.constructed-cards__advanced-toggle');
      const advancedState = await page.evaluate(() => ({
        expanded: document.querySelector('.constructed-cards__advanced-toggle')?.getAttribute('aria-expanded'),
        visible: getComputedStyle(document.querySelector('.constructed-cards__secondary-controls')).display,
      }));
      if (advancedState.expanded !== 'true' || advancedState.visible !== 'grid') {
        failures.push(`constructed cards filters [${device}]: advanced filters did not expand (${JSON.stringify(advancedState)})`);
      }
      await page.click('.constructed-cards__advanced-toggle');
    }
    const constructedTourViolationCount = await auditPageTour(page, {
      label: `constructed cards [${device}]`,
      expectedSteps: 6,
      mobile: device === 'mobile',
    });
    await chooseConstructedCardFilter(page, 'cards-sort', 'Победы колод');
    await page.waitForFunction(() => [...document.querySelectorAll('.constructed-cards__gallery-stat small')]
      .every(element => element.textContent?.trim() === 'Победы колод'));
    const winrateSortState = await page.evaluate(() => ({
      labels: [...document.querySelectorAll('.constructed-cards__gallery-stat small')].map(element => element.textContent?.trim()),
      values: [...document.querySelectorAll('.constructed-cards__gallery-stat strong')].map(element => element.textContent?.trim()),
    }));
    if (winrateSortState.labels.length !== 8 || winrateSortState.labels.some(label => label !== 'Победы колод')
      || winrateSortState.values.some(value => value === '100%')) {
      failures.push(`constructed cards sorting [${device}]: card metric did not follow deck-winrate sorting (${JSON.stringify(winrateSortState)})`);
    }
    await page.click('.constructed-cards__format button:nth-child(2)');
    await page.waitForFunction(() => window.location.pathname === '/standard/cards/wild');
    const wildFormatPressed = await page.$eval('.constructed-cards__format button:nth-child(2)', button => button.getAttribute('aria-pressed'));
    if (wildFormatPressed !== 'true') failures.push(`constructed cards [${device}]: Wild format URL state regressed`);
    await page.click('.constructed-cards__format button:first-child');
    await page.waitForFunction(() => window.location.pathname === '/standard/cards/standard');
    await page.waitForSelector('.constructed-cards__gallery-card');
    await page.evaluate(() => window.history.back());
    await page.waitForFunction(() => window.location.pathname === '/standard/cards/wild');
    await page.evaluate(() => window.history.back());
    await page.waitForFunction(() => window.location.pathname === '/standard/cards');
    await page.waitForSelector('.constructed-cards__gallery-card');
    await page.waitForFunction(() => document.querySelector('[data-tour-id="cards-sort"] .constructed-cards__filter-value')?.textContent?.trim() === 'Победы колод');
    if (device === 'desktop') {
      await page.hover('.constructed-cards__gallery-card');
      await page.waitForSelector('.constructed-cards__tooltip');
      const tooltipState = await page.evaluate(() => ({
        rows: document.querySelectorAll('.constructed-cards__tooltip .constructed-cards__stats > div').length,
        text: document.querySelector('.constructed-cards__tooltip')?.textContent || '',
        display: getComputedStyle(document.querySelector('.constructed-cards__tooltip')).display,
        borderImage: getComputedStyle(document.querySelector('.constructed-cards__tooltip')).borderImageSource,
        velvetBackground: getComputedStyle(document.querySelector('.constructed-cards__tooltip-header')).backgroundImage,
      }));
      if (tooltipState.rows !== 6 || !tooltipState.text.includes('В % колод') || tooltipState.display === 'none'
        || !tooltipState.borderImage.includes('main-page-rail-border') || !tooltipState.velvetBackground.includes('arena-rail-red')) {
        failures.push(`constructed cards tooltip [${device}]: Legend hover statistics regressed (${JSON.stringify(tooltipState)})`);
      }
      await page.screenshot({ path: `${OUT}/constructed-cards-hover-${device}.png`, fullPage: false });
      await page.mouse.move(1, 1);
    }
    const constructedCardsViolationCount = await auditAccessibility(page, `constructed cards [${device}]`, '.constructed-cards');
    await page.screenshot({ path: `${OUT}/constructed-cards-gallery-${device}.png`, fullPage: false });
    await page.click('.constructed-cards__view button:nth-child(2)');
    await page.waitForSelector('.constructed-cards__table');
    const constructedTableState = await page.evaluate(() => {
      const wrapper = document.querySelector('.constructed-cards__table-wrap');
      const table = document.querySelector('.constructed-cards__table');
      return {
        rows: table?.querySelectorAll('tbody tr').length ?? 0,
        columns: table?.querySelectorAll('thead th').length ?? 0,
        internallyScrollable: (wrapper?.scrollWidth ?? 0) > (wrapper?.clientWidth ?? 0),
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        dataDeckCards: table?.querySelectorAll('[data-deck-cards]').length ?? 0,
        renderedDeckTiles: table?.querySelectorAll('.hsrdv-card-tile').length ?? 0,
        englishSubtitles: table?.querySelectorAll('tbody th small').length ?? 0,
        maximumRowHeight: Math.max(...[...table?.querySelectorAll('tbody tr') || []].map(row => row.getBoundingClientRect().height)),
        firstArtHeightCoverage: (() => {
          const frame = table?.querySelector('.hsrdv-card-frame');
          const art = table?.querySelector('.hsrdv-card-art');
          return frame && art ? art.getBoundingClientRect().height / frame.getBoundingClientRect().height : 0;
        })(),
        firstArtWidthCoverage: (() => {
          const frame = table?.querySelector('.hsrdv-card-frame');
          const art = table?.querySelector('.hsrdv-card-art');
          return frame && art ? art.getBoundingClientRect().width / frame.getBoundingClientRect().width : 0;
        })(),
        activeSort: table?.querySelector('thead th[aria-sort]')?.textContent?.trim() || '',
        mobileRows: table ? getComputedStyle(table.querySelector('tbody')).display : '',
      };
    });
    if (constructedTableState.rows !== 8 || constructedTableState.columns !== 9 || constructedTableState.documentOverflow
      || constructedTableState.dataDeckCards !== 8 || constructedTableState.renderedDeckTiles !== 8 || constructedTableState.englishSubtitles !== 0
      // HSReplay's tile frame reserves a one-pixel border on both axes, so
      // the visible art is intentionally about 95% of the measured frame.
      || constructedTableState.firstArtHeightCoverage < 0.94
      || constructedTableState.firstArtWidthCoverage < 0.05 || constructedTableState.firstArtWidthCoverage > 0.9
      || constructedTableState.activeSort !== 'Победы колод'
      || (device === 'desktop' && constructedTableState.maximumRowHeight > 62)
      || (device === 'mobile' && (constructedTableState.internallyScrollable || constructedTableState.mobileRows !== 'grid'))) {
      failures.push(`constructed cards table [${device}]: structure or containment regressed (${JSON.stringify(constructedTableState)})`);
    }
    if (device === 'desktop') {
      await page.hover('.constructed-cards__table tbody th a');
      await page.waitForSelector('.card-preview-tooltip img');
      const tableTooltipState = await page.evaluate(() => ({
        cardId: document.querySelector('.card-preview-tooltip')?.getAttribute('data-card-preview-id') || '',
        visible: getComputedStyle(document.querySelector('.card-preview-tooltip')).display !== 'none',
      }));
      if (tableTooltipState.cardId !== 'CARD_QA_1' || !tableTooltipState.visible) {
        failures.push(`constructed cards table tooltip [${device}]: full-card preview regressed (${JSON.stringify(tableTooltipState)})`);
      }
      await page.mouse.move(1, 1);
    }
    if (device === 'mobile') {
      await page.$eval('.constructed-cards__table-wrap', element => element.scrollIntoView({ block: 'start' }));
    }
    await page.screenshot({ path: `${OUT}/constructed-cards-table-${device}.png`, fullPage: false });
    await page.click('.constructed-cards__view button:first-child');
    await page.click('.constructed-cards__gallery-card');
    await page.waitForSelector('.constructed-card-detail__hero');
    await page.waitForSelector('.constructed-card-detail__pool-toggle');
    await page.waitForFunction(() => {
      const grid = document.querySelector('.constructed-card-detail__pool-cards');
      if (!grid) return false;
      const columns = getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      return columns > 0 && grid.children.length === Math.min(columns, 12);
    });
    const constructedDetailState = await page.evaluate(() => ({
      pathname: window.location.pathname,
      scrollY: window.scrollY,
      statsRows: document.querySelectorAll('.constructed-card-detail__statistics .constructed-cards__stats > div').length,
      variants: document.querySelectorAll('.constructed-card-detail__variants button').length,
      variantLabels: [...document.querySelectorAll('.constructed-card-detail__variants button')].map(button => button.textContent?.trim()),
      tags: [...document.querySelectorAll('.constructed-card-detail__tags span')].map(tag => tag.textContent?.trim() || ''),
      patches: document.querySelectorAll('.constructed-card-detail__patches details').length,
      firstPatchText: document.querySelector('.constructed-card-detail__patches details:first-of-type summary')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      firstPatchHref: document.querySelector('.constructed-card-detail__patches details:first-of-type .constructed-card-detail__patch-body a')?.getAttribute('href') || '',
      relatedGroups: document.querySelectorAll('.constructed-card-detail__related-group').length,
      relatedCards: document.querySelectorAll('.constructed-card-detail__related-card').length,
      relatedHeadings: [...document.querySelectorAll('.constructed-card-detail__related-group h3')].map(element => element.textContent?.trim() || ''),
      pools: document.querySelectorAll('.constructed-card-detail__pool').length,
      poolCards: document.querySelectorAll('.constructed-card-detail__pool-cards > *').length,
      poolColumns: getComputedStyle(document.querySelector('.constructed-card-detail__pool-cards')).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      poolLabel: document.querySelector('.constructed-card-detail__pool > header strong')?.textContent?.trim(),
      poolDisplay: getComputedStyle(document.querySelector('.constructed-card-detail__pool-cards')).display,
      poolOverflow: (document.querySelector('.constructed-card-detail__pool-cards')?.scrollWidth ?? 0) > (document.querySelector('.constructed-card-detail__pool-cards')?.clientWidth ?? 0) + 1,
      gallery: document.querySelectorAll('.constructed-card-detail__gallery img').length,
      relatedFullArts: document.querySelectorAll('.constructed-card-detail__gallery button.is-contain img').length,
      relatedFullArtFits: [...document.querySelectorAll('.constructed-card-detail__gallery button.is-contain img')]
        .map(element => getComputedStyle(element).objectFit),
      cropInRelatedGallery: [...document.querySelectorAll('.constructed-card-detail__gallery button.is-contain img')]
        .some(element => element.getAttribute('src')?.includes('arena-logo-icon')),
      sounds: document.querySelectorAll('.constructed-card-detail__sounds audio').length,
      soundHeading: [...document.querySelectorAll('.constructed-card-detail__media-grid h2')].some(element => element.textContent?.includes('Звуки карты')),
      decks: document.querySelectorAll('.constructed-card-detail__deck').length,
      deckColumns: getComputedStyle(document.querySelector('.constructed-card-detail__deck-grid')).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
      deckRenderSurfaces: document.querySelectorAll('.constructed-card-detail__deck-grid .deck-render-preview').length,
      deckTitles: [...document.querySelectorAll('.constructed-card-detail__deck-copy h3')].map(element => element.textContent?.trim() || ''),
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (constructedDetailState.pathname !== '/standard/cards/standard/CARD_QA_1' || constructedDetailState.scrollY > 2 || constructedDetailState.statsRows < 8
      || constructedDetailState.variants !== 2 || constructedDetailState.variantLabels.includes('Арт') || constructedDetailState.tags.length < 3
      || new Set(constructedDetailState.tags.map(value => value.toLocaleLowerCase('ru-RU'))).size !== constructedDetailState.tags.length
      || constructedDetailState.tags.filter(value => value.toLocaleLowerCase('ru-RU') === 'боевой клич').length !== 1
      || constructedDetailState.patches !== 2 || !constructedDetailState.firstPatchText.includes('Обновление 35.0')
      || !constructedDetailState.firstPatchText.includes('2025') || !constructedDetailState.firstPatchHref.startsWith('https://hs-manacost.ru/')
      || constructedDetailState.relatedGroups !== 2 || constructedDetailState.relatedCards !== 4
      || constructedDetailState.relatedHeadings.join('|') !== 'Варианты задания|Награды'
      || constructedDetailState.pools !== 1 || constructedDetailState.poolCards !== constructedDetailState.poolColumns || constructedDetailState.poolCards >= 12
      || constructedDetailState.poolLabel !== 'Огненные заклинания' || constructedDetailState.poolDisplay !== 'grid' || constructedDetailState.poolOverflow
      || constructedDetailState.gallery !== 3 || constructedDetailState.relatedFullArts !== 2
      || constructedDetailState.relatedFullArtFits.some(value => value !== 'contain') || constructedDetailState.cropInRelatedGallery
      || constructedDetailState.sounds !== 0 || constructedDetailState.soundHeading
      || constructedDetailState.decks !== 3 || constructedDetailState.deckRenderSurfaces !== 3
      || constructedDetailState.deckTitles.some(title => /Control|Face|Warrior|Hunter/i.test(title))
      || (device === 'desktop' ? constructedDetailState.deckColumns !== 3 : constructedDetailState.deckColumns !== 1)
      || constructedDetailState.documentOverflow) {
      failures.push(`constructed card detail [${device}]: data sections or responsive containment regressed (${JSON.stringify(constructedDetailState)})`);
    }
    const constructedDetailTourViolationCount = await auditPageTour(page, {
      label: `constructed card detail [${device}]`,
      expectedSteps: 6,
      mobile: device === 'mobile',
    });
    await page.$eval('.constructed-card-detail__lower-grid', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${OUT}/constructed-card-detail-sections-${device}.png`, fullPage: false });
    await page.$eval('.constructed-card-detail__pools', element => element.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${OUT}/constructed-card-pool-collapsed-${device}.png`, fullPage: false });
    await page.click('.constructed-card-detail__pool-toggle');
    await page.waitForFunction(() => document.querySelectorAll('.constructed-card-detail__pool-cards > *').length === 12);
    const expandedPoolState = await page.evaluate(() => ({
      cards: document.querySelectorAll('.constructed-card-detail__pool-cards > *').length,
      expanded: document.querySelector('.constructed-card-detail__pool-toggle')?.getAttribute('aria-expanded'),
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (expandedPoolState.cards !== 12 || expandedPoolState.expanded !== 'true' || expandedPoolState.overflow) {
      failures.push(`constructed card pool [${device}]: Show all flow regressed (${JSON.stringify(expandedPoolState)})`);
    }
    await page.screenshot({ path: `${OUT}/constructed-card-pool-expanded-${device}.png`, fullPage: false });
    await page.$eval('.constructed-card-detail__decks', element => element.scrollIntoView({ block: 'start' }));
    await page.waitForSelector('.constructed-card-detail__deck-grid .deck-render-preview[data-render-state="ready"]', { timeout: 20_000 });
    await page.click('.constructed-card-detail__decks .constructed-card-detail__pool-toggle');
    await page.waitForFunction(() => document.querySelectorAll('.constructed-card-detail__deck').length === 6);
    await page.click('.constructed-card-detail__deck-copy > button');
    await page.waitForFunction(() => document.querySelector('.constructed-card-detail__deck-copy > button')?.textContent?.includes('Код скопирован'));
    const expandedDeckState = await page.evaluate(() => ({
      decks: document.querySelectorAll('.constructed-card-detail__deck').length,
      renderSurfaces: document.querySelectorAll('.constructed-card-detail__deck-grid .deck-render-preview').length,
      previews: document.querySelectorAll('.constructed-card-detail__deck-grid .deck-render-preview[data-render-state="ready"]').length,
      copied: document.querySelector('.constructed-card-detail__deck-copy > button')?.textContent?.replace(/\s+/g, ' ').trim(),
      errors: document.querySelectorAll('.constructed-card-detail__deck-list-state button, .deck-render-preview__retry').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (expandedDeckState.decks !== 6 || expandedDeckState.renderSurfaces !== 6 || expandedDeckState.previews < 1
      || expandedDeckState.errors !== 0 || !expandedDeckState.copied?.includes('Код скопирован') || expandedDeckState.overflow) {
      failures.push(`constructed card decks [${device}]: rendered deck grid, pagination or copy flow regressed (${JSON.stringify(expandedDeckState)})`);
    }
    await page.screenshot({ path: `${OUT}/constructed-card-decks-${device}.png`, fullPage: false });
    await page.click('.constructed-card-detail__visual-button');
    await page.waitForSelector('.constructed-card-lightbox');
    const constructedLightboxState = await page.evaluate(() => ({
      dialog: document.querySelector('.constructed-card-lightbox')?.getAttribute('role'),
      media: document.querySelectorAll('.constructed-card-lightbox__media img, .constructed-card-lightbox__media video').length,
      navigation: document.querySelectorAll('.constructed-card-lightbox__actions button').length,
      bodyLocked: document.body.style.overflow === 'hidden',
      bodyFixed: document.body.style.position === 'fixed',
      rootInert: document.getElementById('root')?.inert === true,
      rootHidden: document.getElementById('root')?.getAttribute('aria-hidden') === 'true',
      activeLabel: document.activeElement?.getAttribute('aria-label') || '',
      documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (constructedLightboxState.dialog !== 'dialog' || constructedLightboxState.media !== 1
      || constructedLightboxState.navigation < 2 || !constructedLightboxState.bodyLocked || !constructedLightboxState.bodyFixed
      || !constructedLightboxState.rootInert || !constructedLightboxState.rootHidden || constructedLightboxState.activeLabel !== 'Закрыть'
      || constructedLightboxState.documentOverflow) {
      failures.push(`constructed card lightbox [${device}]: media dialog regressed (${JSON.stringify(constructedLightboxState)})`);
    }
    await page.screenshot({ path: `${OUT}/constructed-card-lightbox-${device}.png`, fullPage: false });
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => document.querySelector('.constructed-card-lightbox__footer span')?.textContent?.startsWith('2 из '));
    await page.keyboard.press('Escape');
    await page.waitForSelector('.constructed-card-lightbox', { hidden: true });
    await page.waitForFunction(() => document.activeElement?.classList.contains('constructed-card-detail__visual-button'));
    const restoredLightboxState = await page.evaluate(() => ({
      rootInert: document.getElementById('root')?.inert === true,
      rootHidden: document.getElementById('root')?.hasAttribute('aria-hidden') === true,
      bodyOverflow: document.body.style.overflow,
      bodyPosition: document.body.style.position,
    }));
    if (restoredLightboxState.rootInert || restoredLightboxState.rootHidden
      || restoredLightboxState.bodyOverflow || restoredLightboxState.bodyPosition) {
      failures.push(`constructed card lightbox [${device}]: page isolation was not restored (${JSON.stringify(restoredLightboxState)})`);
    }
    await page.click('.constructed-card-detail__gallery button.is-contain');
    await page.waitForSelector('.constructed-card-lightbox');
    const relatedArtLightboxState = await page.evaluate(() => ({
      title: document.querySelector('#constructed-card-lightbox-title')?.textContent?.trim() || '',
      description: document.querySelector('.constructed-card-lightbox__footer p')?.textContent?.trim() || '',
      source: document.querySelector('.constructed-card-lightbox__actions a')?.getAttribute('href') || '',
      imageFit: getComputedStyle(document.querySelector('.constructed-card-lightbox__media img')).objectFit,
    }));
    if (!relatedArtLightboxState.title.includes('полный арт')
      || !relatedArtLightboxState.description.includes('CARD_QA_TOKEN_1, CARD_QA_TOKEN_2')
      || !relatedArtLightboxState.description.includes('3000×4000')
      || relatedArtLightboxState.source !== 'https://example.test/wiki/file/shared'
      || relatedArtLightboxState.imageFit !== 'contain') {
      failures.push(`constructed related full-art lightbox [${device}]: wiki metadata or uncropped media regressed (${JSON.stringify(relatedArtLightboxState)})`);
    }
    await page.keyboard.press('Escape');
    await page.waitForSelector('.constructed-card-lightbox', { hidden: true });
    await page.waitForFunction(() => document.activeElement?.closest('.constructed-card-detail__gallery'));
    const constructedDetailViolationCount = await auditAccessibility(page, `constructed card detail [${device}]`, '.constructed-card-detail');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
    await page.screenshot({ path: `${OUT}/constructed-card-detail-${device}.png`, fullPage: false });
    if (runtimeErrors.length) failures.push(`admin dashboard [${device}]: ${runtimeErrors.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/admin-dashboard-${device}.png`, fullPage: false });
    console.log(`✓ admin dashboard/articles/translations/mechanics/Standard data/gallery/Boosty/Telegram/mailing/contests/users/profile/standard panels [${device}] interactions + axe (${violationCount + articlesViolationCount + translationsViolationCount + mechanicTranslationsViolationCount + standardOpsViolationCount + galleryViolationCount + boostyViolationCount + telegramViolationCount + mailingViolationCount + contestsViolationCount + usersViolationCount + profileViolationCount + profileTourViolationCount + archetypeViolationCount + archetypeTourViolationCount + standardMetaViolationCount + standardMetaTourViolationCount + standardMatchupsTourViolationCount + viciousGoldViolationCount + viciousGoldTourViolationCount + constructedCardsViolationCount + constructedTourViolationCount + constructedDetailViolationCount + constructedDetailTourViolationCount} violations)`);
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      body: document.body?.innerText.slice(0, 320).replace(/\s+/g, ' ') || 'empty body',
      stats: [...document.querySelectorAll('.admin-stat-grid > div')].map(element => ({
        value: element.querySelector('strong')?.textContent?.trim() || '',
        detail: element.querySelector('small')?.textContent?.replace(/\s+/g, ' ').trim() || '',
      })),
      url: window.location.href,
    })).catch(() => ({ body: 'unavailable body', stats: [], url: page.url() }));
    failures.push(`admin dashboard [${device}]: ${error.message}; state: ${JSON.stringify(diagnostic)}`);
  } finally {
    await page.close();
  }
}

// The card dossier also needs a wide-screen check because rendered deck images
// must not float inside oversized 600px columns.
{
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewport({ width: 2048, height: 1152, deviceScaleFactor: 1 });
  await mockApplicationApi(page, { authenticated: true, admin: true, adminState: {} });
  try {
    await page.goto(`${BASE}/standard/cards/standard/CARD_QA_1`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.constructed-card-detail__decks', { timeout: 20_000 });
    await page.$eval('.constructed-card-detail__decks', element => element.scrollIntoView({ block: 'start' }));
    await page.waitForFunction(() => document.querySelectorAll(
      '.constructed-card-detail__deck-grid .deck-render-preview[data-render-state="ready"]',
    ).length === 3);
    const wideDeckState = await page.evaluate(() => {
      const grid = document.querySelector('.constructed-card-detail__deck-grid');
      const gridRect = grid?.getBoundingClientRect();
      const cards = [...document.querySelectorAll('.constructed-card-detail__deck')];
      const firstCard = cards[0]?.getBoundingClientRect();
      const firstImage = document.querySelector('.constructed-card-detail__deck-list .deck-render-preview__image img')?.getBoundingClientRect();
      const titles = [...document.querySelectorAll('.constructed-card-detail__deck-copy h3')].map(element => element.textContent?.trim() || '');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length,
        cardWidth: firstCard?.width ?? 0,
        imageWidth: firstImage?.width ?? 0,
        previews: document.querySelectorAll('.constructed-card-detail__deck-grid .deck-render-preview[data-render-state="ready"]').length,
        centered: Math.abs(((cards[0]?.getBoundingClientRect().left ?? 0) - (gridRect?.left ?? 0)) - ((gridRect?.right ?? 0) - (cards.at(-1)?.getBoundingClientRect().right ?? 0))) < 3,
        titles,
        errors: document.querySelectorAll('.constructed-card-detail__deck-list-state button, .deck-render-preview__retry').length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      };
    });
    if (wideDeckState.columns !== 3 || wideDeckState.cardWidth > 432 || wideDeckState.imageWidth < wideDeckState.cardWidth * 0.9
      || wideDeckState.previews !== 3
      || !wideDeckState.centered || wideDeckState.titles.some(title => /Control|Face|Warrior|Hunter/i.test(title))
      || wideDeckState.errors || wideDeckState.overflow || runtimeErrors.length) {
      failures.push(`constructed card decks [2048px]: wide alignment, translation or stability regressed (${JSON.stringify(wideDeckState)}; ${runtimeErrors.join(' | ')})`);
    }
    await page.screenshot({ path: `${OUT}/constructed-card-decks-wide.png`, fullPage: false });
    console.log('✓ constructed card rendered deck grid [2048px] alignment + translations');
  } catch (error) {
    failures.push(`constructed card decks [2048px]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// The two Standard analytics workspaces must remain fully usable on both the
// narrowest supported phone and a larger modern handset, not only at 390px.
for (const width of [320, 430]) {
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewport({ width, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true, admin: true, adminState: {} });
  try {
    await page.goto(`${BASE}/standard/archetypes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.archetype-row', { timeout: 20_000 });
    const metaNarrowState = await page.evaluate(() => {
      const root = document.querySelector('.archetypes-page');
      const hero = document.querySelector('.traditional-mode-banner');
      const search = document.querySelector('.archetypes-search input');
      const formatButtons = [...document.querySelectorAll('.archetypes-format-switch button')];
      const openButtons = [...document.querySelectorAll('.archetype-row__open')];
      return {
        rootOverflow: (root?.scrollWidth ?? 0) > (root?.clientWidth ?? 0) + 1,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        searchFontSize: search ? parseFloat(getComputedStyle(search).fontSize) : 0,
        smallestFormatTarget: Math.min(...formatButtons.map(button => button.getBoundingClientRect().height)),
        smallestOpenTarget: Math.min(...openButtons.map(button => button.getBoundingClientRect().height)),
        rows: document.querySelectorAll('.archetype-row').length,
      };
    });
    if (metaNarrowState.rootOverflow || metaNarrowState.documentOverflow || metaNarrowState.heroHeight > 620
      || metaNarrowState.searchFontSize < 16 || metaNarrowState.smallestFormatTarget < 44
      || metaNarrowState.smallestOpenTarget < 42 || metaNarrowState.rows !== qaArchetypeItems.length) {
      failures.push(`archetype catalog [${width}px]: narrow mobile layout regressed (${JSON.stringify(metaNarrowState)})`);
    }
    await auditAccessibility(page, `archetype catalog narrow ${width}px`, '.archetypes-page');
    await page.screenshot({ path: `${OUT}/archetype-catalog-${width}px.png`, fullPage: false });

    await page.goto(`${BASE}/standard/vicious-gold`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.vsgold__panel', { timeout: 20_000 });
    const viciousNarrowState = await page.evaluate(() => {
      const root = document.querySelector('.vsgold');
      const hero = document.querySelector('.vsgold__hero');
      const navTargets = [...document.querySelectorAll('.vsgold__mobile-nav a')];
      const inputs = [...document.querySelectorAll('.vsgold__deck-tools input, .vsgold__deck-tools select')];
      const classTargets = [...document.querySelectorAll('.vsgold__class-bars button')];
      return {
        rootOverflow: (root?.scrollWidth ?? 0) > (root?.clientWidth ?? 0) + 1,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        heroHeight: hero?.getBoundingClientRect().height ?? 0,
        smallestNavTarget: Math.min(...navTargets.map(target => target.getBoundingClientRect().height)),
        smallestClassTarget: Math.min(...classTargets.map(target => target.getBoundingClientRect().height)),
        smallestInputFont: Math.min(...inputs.map(input => parseFloat(getComputedStyle(input).fontSize))),
      };
    });
    if (viciousNarrowState.rootOverflow || viciousNarrowState.documentOverflow || viciousNarrowState.heroHeight > 390
      || viciousNarrowState.smallestNavTarget < 44 || viciousNarrowState.smallestClassTarget < 44
      || viciousNarrowState.smallestInputFont < 16) {
      failures.push(`vicious gold [${width}px]: narrow mobile layout regressed (${JSON.stringify(viciousNarrowState)})`);
    }
    await page.click('.vsgold__mobile-nav a[href="#vsgold-power"]');
    await new Promise(resolve => setTimeout(resolve, 300));
    await auditAccessibility(page, `vicious gold narrow ${width}px`, '.vsgold');
    await page.screenshot({ path: `${OUT}/vicious-gold-power-${width}px.png`, fullPage: false });

    await page.goto(`${BASE}/?admin&section=standard-data`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-parser-control', { timeout: 20_000 });
    await page.waitForSelector('.admin-parser-audit__entry', { timeout: 20_000 });
    await page.click('.admin-parser-audit__details summary');
    const parserControlNarrowState = await page.evaluate(() => {
      const root = document.querySelector('.admin-parser-control');
      const reasonInput = document.querySelector('.admin-parser-run-actions input');
      const scheduleSummary = document.querySelector('.admin-parser-schedule__rules summary');
      const scheduleState = document.querySelector('.admin-parser-schedule__state');
      const auditSummary = document.querySelector('.admin-parser-audit__details summary');
      return {
        rootOverflow: (root?.scrollWidth ?? 0) > (root?.clientWidth ?? 0) + 1,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        reasonInputFontSize: reasonInput ? parseFloat(getComputedStyle(reasonInput).fontSize) : 0,
        scheduleSummaryHeight: scheduleSummary?.getBoundingClientRect().height ?? 0,
        scheduleStateText: scheduleState?.textContent?.trim() ?? '',
        auditSummaryHeight: auditSummary?.getBoundingClientRect().height ?? 0,
      };
    });
    if (parserControlNarrowState.rootOverflow || parserControlNarrowState.documentOverflow
      || parserControlNarrowState.reasonInputFontSize < 16 || parserControlNarrowState.scheduleSummaryHeight < 44
      || parserControlNarrowState.auditSummaryHeight < 44 || parserControlNarrowState.scheduleStateText !== 'Активен') {
      failures.push(`admin parser control [${width}px]: mobile containment or touch inputs regressed (${JSON.stringify(parserControlNarrowState)})`);
    }
    await auditAccessibility(page, `admin parser control narrow ${width}px`, '.admin-parser-control');
    await page.screenshot({ path: `${OUT}/admin-parser-control-${width}px.png`, fullPage: false });
    if (runtimeErrors.length) failures.push(`standard mobile analytics [${width}px]: ${runtimeErrors.join(' | ')}`);
    console.log(`✓ Standard analytics and parser control mobile adaptation [${width}px] interactions + axe`);
  } catch (error) {
    failures.push(`Standard analytics mobile adaptation [${width}px]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Reflow and operating-system accessibility modes. A 640 CSS-pixel viewport
// is the layout width of a 1280-pixel desktop viewport at 200% zoom.
{
  const page = await createQaPage();
  await page.setViewport({ width: 640, height: 900, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true, admin: true, adminState: {} });
  const client = await page.createCDPSession();
  try {
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        { name: 'forced-colors', value: 'active' },
        { name: 'prefers-reduced-motion', value: 'reduce' },
      ],
    });
    await page.goto(`${BASE}/classes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Паладин');
    await page.waitForSelector('.arena-app-winrates');
    await page.focus('.arena-skip-link');
    const state = await page.evaluate(() => {
      const skip = document.querySelector('.arena-skip-link');
      const style = getComputedStyle(skip);
      return {
        forcedColors: matchMedia('(forced-colors: active)').matches,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        transitionSeconds: Math.max(...style.transitionDuration.split(',').map(value => parseFloat(value) || 0)),
        focusOutlineWidth: parseFloat(style.outlineWidth) || 0,
        focusOutlineStyle: style.outlineStyle,
      };
    });
    if (!state.forcedColors || !state.reducedMotion) failures.push('accessibility media: Chromium did not activate the requested modes');
    if (state.scrollWidth > state.clientWidth + 1) failures.push(`200% reflow: horizontal overflow ${state.scrollWidth} > ${state.clientWidth}`);
    if (state.transitionSeconds > 0.001) failures.push(`reduced motion: skip-link transition still lasts ${state.transitionSeconds}s`);
    if (state.focusOutlineWidth < 2 || state.focusOutlineStyle === 'none') failures.push('forced colors: focused skip link has no durable outline');
    const violationCount = await auditAccessibility(page, '/classes [200% reflow + forced colors + reduced motion]');
    await page.goto(`${BASE}/?admin&section=standard-data`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.admin-parser-control', { timeout: 20_000 });
    await page.waitForSelector('.admin-parser-audit__entry', { timeout: 20_000 });
    await page.click('.admin-parser-audit__details summary');
    const parserControlReflow = await page.evaluate(() => {
      const root = document.querySelector('.admin-parser-control');
      const reasonInput = document.querySelector('.admin-parser-run-actions input');
      const scheduleSummary = document.querySelector('.admin-parser-schedule__rules summary');
      const scheduleState = document.querySelector('.admin-parser-schedule__state');
      const auditSummary = document.querySelector('.admin-parser-audit__details summary');
      return {
        rootOverflow: (root?.scrollWidth ?? 0) > (root?.clientWidth ?? 0) + 1,
        documentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        reasonInputFontSize: reasonInput ? parseFloat(getComputedStyle(reasonInput).fontSize) : 0,
        scheduleSummaryHeight: scheduleSummary?.getBoundingClientRect().height ?? 0,
        scheduleStateText: scheduleState?.textContent?.trim() ?? '',
        auditSummaryHeight: auditSummary?.getBoundingClientRect().height ?? 0,
      };
    });
    if (parserControlReflow.rootOverflow || parserControlReflow.documentOverflow
      || parserControlReflow.reasonInputFontSize < 16 || parserControlReflow.scheduleSummaryHeight < 44
      || parserControlReflow.auditSummaryHeight < 44 || parserControlReflow.scheduleStateText !== 'Активен') {
      failures.push(`admin parser control [200% reflow]: containment or touch inputs regressed (${JSON.stringify(parserControlReflow)})`);
    }
    await auditAccessibility(page, 'admin parser control [200% reflow + forced colors + reduced motion]', '.admin-parser-control');
    console.log(`✓ 200% reflow, forced colors and reduced motion (${violationCount} axe violations)`);
  } catch (error) {
    failures.push(`accessibility media and reflow: ${error.message}`);
  } finally {
    await client.detach().catch(() => {});
    await page.close();
  }
}

// Guest access must render the themed paywall instead of leaking private data.
{
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: false });
  try {
    await page.goto(`${BASE}/classes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.arena-paywall', { visible: true, timeout: 20_000 });
    const state = await page.$eval('.arena-paywall', element => {
      const preview = element.querySelector('.arena-paywall__preview');
      const dialog = element.querySelector('.arena-paywall__dialog');
      return {
        text: element.textContent || '',
        previewInert: preview?.hasAttribute('inert') || false,
        previewHidden: preview?.getAttribute('aria-hidden') === 'true',
        landmark: dialog?.tagName || '',
        purchaseLinks: element.querySelectorAll('.arena-paywall__purchase-options a').length,
      };
    });
    if (!state.text.includes('подпис')) failures.push('/classes [guest]: paywall copy is missing');
    if (!state.previewInert || !state.previewHidden) failures.push('/classes [guest]: private preview is exposed to interaction or assistive technology');
    if (state.landmark !== 'SECTION') failures.push(`/classes [guest]: paywall must be a section, got ${state.landmark || 'nothing'}`);
    if (state.purchaseLinks !== 2) failures.push(`/classes [guest]: expected 2 purchase links, got ${state.purchaseLinks}`);
    const violationCount = await auditAccessibility(page, '/classes [mobile guest]');
    console.log(`✓ /classes [mobile guest] paywall + axe (${violationCount} violations)`);
  } catch (error) {
    failures.push(`/classes [mobile guest]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Traditional analytics require Diamond, while the card catalog stays public
// and locks only its statistical fields.
for (const path of ['/standard/meta', '/standard/vicious-gold']) {
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: false });
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    const paywallSelector = path === '/standard/meta' ? '.arena-inline-paywall' : '.arena-paywall';
    await page.waitForSelector(paywallSelector, { visible: true, timeout: 20_000 });
    const state = await page.evaluate(() => ({
      diamond: document.querySelector('.arena-paywall, .arena-inline-paywall')?.textContent?.includes('Алмаз') || false,
      previewProtected: Boolean(
        document.querySelector('.arena-paywall__preview')?.hasAttribute('inert')
        || document.querySelector('.arena-inline-paywall'),
      ),
      standardLinks: document.querySelectorAll('a[href^="/standard/"]').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    if (!state.diamond || !state.previewProtected || state.standardLinks < 4 || state.overflow) {
      failures.push(`${path} [mobile guest]: Diamond paywall regressed (${JSON.stringify(state)})`);
    }
    await auditAccessibility(page, `${path} [mobile guest]`);
    await page.screenshot({ path: `${OUT}/${path.includes('vicious') ? 'vicious-gold' : 'standard-meta'}-diamond-paywall-mobile.png`, fullPage: false });
    console.log(`✓ ${path} [mobile guest] Diamond paywall + axe`);
  } catch (error) {
    failures.push(`${path} [mobile guest]: ${error.message}`);
  } finally {
    await page.close();
  }
}

{
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: false });
  try {
    await page.goto(`${BASE}/standard/cards`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.constructed-cards__gallery-card', { visible: true, timeout: 20_000 });
    await page.click('[data-tour-id="cards-sort"] .constructed-cards__filter-trigger');
    await page.waitForSelector('[data-tour-id="cards-sort"] [role="listbox"]', { visible: true, timeout: 5_000 });
    const state = await page.evaluate(() => ({
      fullPaywall: Boolean(document.querySelector('.arena-paywall')),
      lockedBadge: document.querySelector('.constructed-cards__beta')?.textContent?.includes('Алмаз') || false,
      lockedSorts: [...document.querySelectorAll('[data-tour-id="cards-sort"] [role="option"][aria-disabled="true"]')]
        .filter(option => option.textContent?.includes('Алмаз')).length,
      defaultSort: document.querySelector('[data-tour-id="cards-sort"] .constructed-cards__filter-value')?.textContent?.trim() || '',
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    }));
    await page.keyboard.press('Escape');
    if (state.fullPaywall || !state.lockedBadge || state.lockedSorts !== 3 || state.defaultSort !== 'Новые дополнения' || state.overflow) {
      failures.push(`/standard/cards [mobile guest]: partial statistics paywall regressed (${JSON.stringify(state)})`);
    }
    await page.type('.global-search input', 'контроль');
    await page.waitForSelector('.global-search-result', { visible: true, timeout: 10_000 });
    const globalPaywallState = await page.evaluate(() => ({
      articleLocked: Boolean(document.querySelector('.global-search-result svg[aria-label="Нужна подписка"]')),
      cardStatsLocked: Boolean(document.querySelector('.global-search-result__diamond')),
    }));
    if (!globalPaywallState.articleLocked || !globalPaywallState.cardStatsLocked) {
      failures.push(`/standard/cards [mobile guest]: global search paywall regressed (${JSON.stringify(globalPaywallState)})`);
    }
    await auditAccessibility(page, '/standard/cards [mobile guest]');
    await page.screenshot({ path: `${OUT}/constructed-cards-guest-stat-lock-mobile.png`, fullPage: false });
    console.log('✓ /standard/cards [mobile guest] public catalog + locked statistics + axe');
  } catch (error) {
    failures.push(`/standard/cards [mobile guest]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Locked Battlegrounds routes must load their route shell skin even though the
// paywall deliberately prevents the heavy data component from mounting.
for (const [device, viewport] of [
  ['desktop', { width: 1280, height: 800, deviceScaleFactor: 1 }],
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const page = await createQaPage();
  await page.setViewport(viewport);
  await mockApplicationApi(page, { authenticated: false });
  try {
    await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.arena-app-battlegrounds .arena-paywall', { visible: true, timeout: 20_000 });
    const surface = await page.evaluate(() => {
      const app = document.querySelector('.arena-app-battlegrounds');
      const workspace = document.querySelector('.arena-workspace');
      const main = document.querySelector('.arena-main');
      const content = document.querySelector('.arena-content');
      const style = element => getComputedStyle(element);
      return {
        appBackground: style(app).backgroundImage,
        appVeilBackground: getComputedStyle(app, '::after').backgroundImage,
        workspaceBackground: style(workspace).backgroundColor,
        workspaceImage: style(workspace).backgroundImage,
        mainBackground: style(main).backgroundColor,
        mainImage: style(main).backgroundImage,
        contentBackground: style(content).backgroundImage,
      };
    });
    const prefix = `/library [${device} guest]`;
    if (!surface.appBackground.includes('arena-parchment.jpg')) failures.push(`${prefix}: BG route shell parchment is missing`);
    if (surface.appVeilBackground !== 'none') failures.push(`${prefix}: legacy blue shell veil remains above the parchment`);
    if (surface.workspaceBackground !== 'rgba(0, 0, 0, 0)' || surface.workspaceImage !== 'none') failures.push(`${prefix}: workspace paints a white frame`);
    if (surface.mainBackground !== 'rgba(0, 0, 0, 0)' || surface.mainImage !== 'none') failures.push(`${prefix}: main canvas paints a white frame`);
    if (!surface.contentBackground.includes('arena-parchment.jpg')) failures.push(`${prefix}: content parchment does not cover the locked route`);
    await page.screenshot({ path: `${OUT}/library-guest-${device}.png`, fullPage: true });
    const violationCount = await auditAccessibility(page, prefix);
    console.log(`✓ ${prefix} continuous parchment + axe (${violationCount} violations)`);
  } catch (error) {
    failures.push(`/library [${device} guest]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Public auth keeps one material owner across login, registration and reset.
for (const [device, viewport] of [
  ['desktop', { width: 1280, height: 800, deviceScaleFactor: 1 }],
  ['mobile', { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]) {
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewport(viewport);
  await mockApplicationApi(page, { authenticated: false });
  try {
    await page.goto(`${BASE}/?login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.login-card', { visible: true, timeout: 20_000 });
    await page.waitForSelector('.login-provider-grid', { visible: true, timeout: 10_000 });
    const loginState = await page.evaluate(() => {
      const card = document.querySelector('.login-card');
      const emblem = document.querySelector('.login-card__emblem');
      const input = document.querySelector('.login-field input');
      const actionable = [...document.querySelectorAll('.login-card :is(button, a)')];
      const socialProviders = [...document.querySelectorAll('.login-provider')];
      const cardStyle = getComputedStyle(card);
      const inputStyle = getComputedStyle(input);
      return {
        stylesheetLoaded: [...document.styleSheets].some(sheet => sheet.href?.includes('/assets/LoginPanel-')),
        borderImage: cardStyle.borderImageSource,
        background: cardStyle.backgroundColor,
        emblemBackground: getComputedStyle(emblem).backgroundImage,
        inputRadius: inputStyle.borderRadius,
        inputHeight: input.getBoundingClientRect().height,
        smallestAction: Math.min(...actionable.map(element => element.getBoundingClientRect().height)),
        inlineOwners: document.querySelectorAll('.login-page [style]').length,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        labelledFields: [...document.querySelectorAll('.login-field')].every(label => Boolean(label.querySelector(':scope > span'))),
        socialProviderCount: socialProviders.length,
        socialProvidersSquare: socialProviders.every(provider => {
          const { width, height } = provider.getBoundingClientRect();
          return width >= 44 && Math.abs(width - height) < 1;
        }),
        socialIconsLoaded: socialProviders.every(provider => {
          const icon = provider.querySelector('img');
          return icon?.complete && icon.naturalWidth > 0;
        }),
      };
    });
    if (!loginState.stylesheetLoaded
      || !loginState.borderImage.includes('main-page-rail-border.png')
      || loginState.background !== 'rgba(248, 231, 191, 0.72)'
      || !loginState.emblemBackground.includes('arena-rail-red.jpg')
      || loginState.inputRadius !== '2px'
      || loginState.inputHeight < 44
      || loginState.smallestAction < 44
      || loginState.inlineOwners !== 0
      || loginState.horizontalOverflow
      || !loginState.labelledFields
      || loginState.socialProviderCount !== 4
      || !loginState.socialProvidersSquare
      || !loginState.socialIconsLoaded) {
      failures.push(`public auth [${device}]: material or geometry changed (${JSON.stringify(loginState)})`);
    }

    await page.evaluate(() => [...document.querySelectorAll('.login-mode-tab')]
      .find(button => button.textContent?.includes('Регистрация'))?.click());
    await page.waitForSelector('.login-consent');
    const registrationState = await page.evaluate(() => ({
      name: Boolean(document.querySelector('input[autocomplete="name"]')),
      country: Boolean(document.querySelector('.login-field select')),
      consentHeight: document.querySelector('.login-consent')?.getBoundingClientRect().height || 0,
      activeMode: document.querySelector('.login-mode-tab[aria-pressed="true"]')?.textContent?.trim() || '',
    }));
    if (!registrationState.name || !registrationState.country || registrationState.consentHeight < 44 || registrationState.activeMode !== 'Регистрация') {
      failures.push(`public auth [${device}]: registration fields are incomplete (${JSON.stringify(registrationState)})`);
    }

    await page.evaluate(() => [...document.querySelectorAll('.login-mode-tab')]
      .find(button => button.textContent?.trim() === 'Вход')?.click());
    await page.click('.login-link-button--footer');
    await page.waitForFunction(() => document.querySelector('#login-card-title')?.textContent?.includes('Восстановление'));
    const resetState = await page.evaluate(() => ({
      title: document.querySelector('#login-card-title')?.textContent?.trim() || '',
      emailLabel: document.querySelector('.login-field > span')?.textContent?.trim() || '',
      returnTarget: document.querySelector('.login-link-button--footer')?.getBoundingClientRect().height || 0,
    }));
    if (!resetState.title.includes('Восстановление') || resetState.emailLabel !== 'Email' || resetState.returnTarget < 44) {
      failures.push(`public auth [${device}]: reset mode changed (${JSON.stringify(resetState)})`);
    }

    await page.click('.login-link-button--footer');
    await page.type('.login-field input[type="email"]', 'qa@example.test');
    await page.type('.login-password-field input', 'qa-password');
    await page.click('.login-submit');
    await page.waitForFunction(() => document.querySelector('.login-message--err')?.textContent?.includes('Контрольная ошибка входа'));
    const messageState = await page.$eval('.login-message--err', element => ({
      role: element.getAttribute('role'),
      radius: getComputedStyle(element).borderRadius,
      color: getComputedStyle(element).color,
    }));
    if (messageState.role !== 'alert' || messageState.radius !== '2px' || messageState.color !== 'rgb(125, 34, 39)') {
      failures.push(`public auth [${device}]: error feedback changed (${JSON.stringify(messageState)})`);
    }
    const violationCount = await auditAccessibility(page, `public auth [${device}]`, '.login-page');
    if (runtimeErrors.length) failures.push(`public auth [${device}]: ${runtimeErrors.join(' | ')}`);
    await page.screenshot({ path: `${OUT}/public-auth-${device}.png`, fullPage: false });
    console.log(`✓ public auth login/register/reset [${device}] + axe (${violationCount} violations)`);
  } catch (error) {
    failures.push(`public auth [${device}]: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Below-fold home chunks and the delayed prompt must remain independently usable.
{
  const page = await createQaPage();
  const runtimeErrors = collectRuntimeErrors(page);
  await page.setViewport({ width: 1440, height: 900 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('.home-latest-articles');
    await page.waitForSelector('.home-bg-directory');
    await page.waitForSelector('.home-arena-directory');
    await page.waitForSelector('.home-faq-zone');
    await page.waitForSelector('#faq-heading');
    await page.waitForSelector('.arena-footer__link');
    const homeLandmarks = await page.evaluate(() => ({
      stage: Boolean(document.querySelector('.home-stage')),
      character: Boolean(document.querySelector('.home-stage__character img')),
      articles: Boolean(document.querySelector('.home-latest-articles')),
      battlegrounds: Boolean(document.querySelector('.home-bg-directory')),
      arena: Boolean(document.querySelector('.home-arena-directory')),
      community: Boolean(document.querySelector('.home-community')),
      faq: Boolean(document.querySelector('#faq-heading')),
      faqIndexHref: document.querySelector('.home-page-index a[href="#faq-heading"]')?.getAttribute('href') || '',
    }));
    if (Object.entries(homeLandmarks).some(([, value]) => value === false) || homeLandmarks.faqIndexHref !== '#faq-heading') {
      failures.push(`home landmarks: one or more primary elements disappeared (${JSON.stringify(homeLandmarks)})`);
    }
    const homeCssState = await page.evaluate(() => {
      const hrefs = [...document.styleSheets].map(sheet => sheet.href || '');
      return {
        routeCssLoaded: hrefs.some(href => href.includes('/assets/route-parchment-')),
        deferredRoutesCssLoaded: hrefs.some(href => href.includes('/assets/DeferredRoutes-') && href.endsWith('.css')),
        arenaCss: hrefs.some(href => href.includes('/assets/HomeArenaDirectory-')),
        battlegroundsCss: hrefs.some(href => href.includes('/assets/HomeBattlegrounds-')),
        articlesCss: hrefs.some(href => href.includes('/assets/HomeLatestArticles-')),
        faqCss: hrefs.some(href => href.includes('/assets/FAQSection-')),
        supportCss: hrefs.some(href => href.includes('/assets/SupportPrompt-')),
        footerCss: hrefs.some(href => href.includes('/assets/SiteFooter-')),
        footerMarkup: Boolean(document.querySelector('.arena-footer')),
        footerLinks: [...document.querySelectorAll('.arena-footer__link[href^="/"]')].map(link => link.getAttribute('href')),
      };
    });
    if (homeCssState.routeCssLoaded) failures.push('home lazy sections: route-only parchment CSS leaked into the initial home route');
    if (homeCssState.deferredRoutesCssLoaded) failures.push('home lazy sections: deferred route-owner CSS leaked into the initial home route');
    if (!homeCssState.arenaCss || !homeCssState.battlegroundsCss || !homeCssState.articlesCss) failures.push('home lazy sections: one or more owner CSS chunks did not load');
    if (!homeCssState.faqCss) failures.push('home lazy sections: FAQ owner CSS did not load');
    if (!homeCssState.supportCss) failures.push('home lazy sections: support-prompt owner CSS did not load');
    if (!homeCssState.footerCss || !homeCssState.footerMarkup) failures.push('home lazy sections: site-footer owner or markup did not load');
    const expectedFooterLinks = [
      '/',
      '/classes',
      '/tierlist',
      '/legendaries',
      '/articles',
      '/gallery',
      '/developers/api/',
      '/api/v1/openapi.json',
    ];
    if (JSON.stringify(homeCssState.footerLinks) !== JSON.stringify(expectedFooterLinks)) {
      failures.push(`home lazy sections: canonical footer links are incomplete (${homeCssState.footerLinks.join(', ')})`);
    }
    const initiallyVisibleHomeSections = await page.$$eval(
      '.home-latest-articles, .home-bg-directory, .home-arena-directory, .home-community, .home-faq-zone',
      elements => elements.map(element => ({
        classes: element.className,
        opacity: Number(getComputedStyle(element).opacity),
        visibility: getComputedStyle(element).visibility,
      })),
    );
    const hiddenHomeSection = initiallyVisibleHomeSections.find(section => section.opacity < 0.99 || section.visibility !== 'visible');
    if (hiddenHomeSection) {
      failures.push(`home sections: content is hidden before scrolling (${JSON.stringify(hiddenHomeSection)})`);
    }
    const desktopContentCanvas = await page.$eval('.arena-content-open', element => {
      const styles = getComputedStyle(element);
      return {
        maxWidth: styles.maxWidth,
        padding: styles.padding,
        border: styles.borderTopWidth,
        radius: styles.borderRadius,
        color: styles.color,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        shadow: styles.boxShadow,
        filter: styles.filter,
        backdrop: styles.backdropFilter,
      };
    });
    if (desktopContentCanvas.maxWidth !== '1480px'
      || desktopContentCanvas.padding !== '34.56px 38.88px 48px'
      || desktopContentCanvas.border !== '0px'
      || desktopContentCanvas.radius !== '0px'
      || desktopContentCanvas.color !== 'rgb(48, 37, 28)'
      || desktopContentCanvas.backgroundColor !== 'rgba(0, 0, 0, 0)'
      || desktopContentCanvas.backgroundImage !== 'none'
      || desktopContentCanvas.shadow !== 'none'
      || desktopContentCanvas.filter !== 'none'
      || desktopContentCanvas.backdrop !== 'none') {
      failures.push(`home content canvas: desktop contract changed (${JSON.stringify(desktopContentCanvas)})`);
    }
    const desktopHeading = await page.$eval('.home-latest-articles .home-section-heading', element => {
      const label = element.querySelector(':scope > div > span');
      const heading = element.querySelector('h2');
      const summary = element.querySelector(':scope > p');
      return {
        marginBottom: getComputedStyle(element).marginBottom,
        labelColor: label ? getComputedStyle(label).color : '',
        headingColor: heading ? getComputedStyle(heading).color : '',
        summaryColor: summary ? getComputedStyle(summary).color : '',
      };
    });
    if (desktopHeading.marginBottom !== '21.6px'
      || desktopHeading.labelColor !== 'rgb(123, 21, 27)'
      || desktopHeading.headingColor !== 'rgb(59, 42, 31)'
      || desktopHeading.summaryColor !== 'rgb(120, 101, 79)') {
      failures.push(`home headings: desktop parchment typography changed (${JSON.stringify(desktopHeading)})`);
    }
    const desktopArenaDirectory = await page.$eval('.home-arena-directory', element => {
      const headingRow = element.querySelector('.home-section-heading');
      const signLabel = element.querySelector('.home-arena-directory__sign > span');
      const signHeading = element.querySelector('.home-arena-directory__sign h2');
      const summary = element.querySelector('.home-section-heading > p');
      const links = element.querySelector('.home-arena-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      return {
        headingMargin: headingRow ? getComputedStyle(headingRow).marginBottom : '',
        labelColor: signLabel ? getComputedStyle(signLabel).color : '',
        labelSize: signLabel ? getComputedStyle(signLabel).fontSize : '',
        headingColor: signHeading ? getComputedStyle(signHeading).color : '',
        headingSize: signHeading ? getComputedStyle(signHeading).fontSize : '',
        summaryColor: summary ? getComputedStyle(summary).color : '',
        summaryMargin: summary ? getComputedStyle(summary).margin : '',
        gridGap: linkStyles?.gap || '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridBackground: linkStyles?.backgroundColor || '',
      };
    });
    if (desktopArenaDirectory.headingMargin !== '16px'
      || desktopArenaDirectory.labelColor !== 'rgb(239, 197, 104)'
      || desktopArenaDirectory.labelSize !== '9.92px'
      || desktopArenaDirectory.headingColor !== 'rgb(255, 240, 200)'
      || desktopArenaDirectory.headingSize !== '29.6px'
      || desktopArenaDirectory.summaryColor !== 'rgb(111, 89, 67)'
      || desktopArenaDirectory.summaryMargin !== '0px'
      || desktopArenaDirectory.gridGap !== '8.8px'
      || desktopArenaDirectory.gridPadding !== '11.2px'
      || desktopArenaDirectory.gridBorder !== '66px'
      || desktopArenaDirectory.gridBackground !== 'rgb(195, 167, 126)') {
      failures.push(`home Arena directory: desktop frame changed (${JSON.stringify(desktopArenaDirectory)})`);
    }
    const desktopBgDirectory = await page.$eval('.home-bg-directory', element => {
      const rootStyles = getComputedStyle(element);
      const headingRow = element.querySelector('.home-section-heading');
      const signLabel = element.querySelector('.home-bg-directory__sign > span');
      const signHeading = element.querySelector('.home-bg-directory__sign h2');
      const summary = element.querySelector('.home-section-heading > p');
      const links = element.querySelector('.home-bg-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      const featured = element.querySelector('.home-bg-directory__link[data-featured="true"]');
      const featuredStyles = featured ? getComputedStyle(featured) : null;
      const featuredLabel = featured?.querySelector('small');
      return {
        overflow: rootStyles.overflow,
        border: rootStyles.borderTopWidth,
        radius: rootStyles.borderRadius,
        color: rootStyles.color,
        backgroundImage: rootStyles.backgroundImage,
        shadow: rootStyles.boxShadow,
        headingMargin: headingRow ? getComputedStyle(headingRow).marginBottom : '',
        labelColor: signLabel ? getComputedStyle(signLabel).color : '',
        labelSize: signLabel ? getComputedStyle(signLabel).fontSize : '',
        headingColor: signHeading ? getComputedStyle(signHeading).color : '',
        headingSize: signHeading ? getComputedStyle(signHeading).fontSize : '',
        summaryColor: summary ? getComputedStyle(summary).color : '',
        gridGap: linkStyles?.gap || '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridBackground: linkStyles?.backgroundColor || '',
        featuredHeight: featuredStyles?.minHeight || '',
        featuredRadius: featuredStyles?.borderRadius || '',
        featuredColor: featuredStyles?.color || '',
        featuredBackground: featuredStyles?.backgroundColor || '',
        featuredLabel: featuredLabel ? getComputedStyle(featuredLabel).color : '',
      };
    });
    if (desktopBgDirectory.overflow !== 'visible'
      || desktopBgDirectory.border !== '0px'
      || desktopBgDirectory.radius !== '0px'
      || desktopBgDirectory.color !== 'rgb(48, 37, 28)'
      || desktopBgDirectory.backgroundImage !== 'none'
      || desktopBgDirectory.shadow !== 'none'
      || desktopBgDirectory.headingMargin !== '12.8px'
      || desktopBgDirectory.labelColor !== 'rgb(217, 185, 130)'
      || desktopBgDirectory.labelSize !== '9.28px'
      || desktopBgDirectory.headingColor !== 'rgb(255, 240, 200)'
      || desktopBgDirectory.headingSize !== '29.6px'
      || desktopBgDirectory.summaryColor !== 'rgb(111, 89, 67)'
      || desktopBgDirectory.gridGap !== '8.8px'
      || desktopBgDirectory.gridPadding !== '11.2px'
      || desktopBgDirectory.gridBorder !== '66px'
      || desktopBgDirectory.gridBackground !== 'rgb(195, 167, 126)'
      || desktopBgDirectory.featuredHeight !== '164px'
      || desktopBgDirectory.featuredRadius !== '0px'
      || desktopBgDirectory.featuredColor !== 'rgb(62, 47, 35)'
      || desktopBgDirectory.featuredBackground !== 'rgba(255, 245, 218, 0.52)'
      || desktopBgDirectory.featuredLabel !== 'rgb(125, 64, 91)') {
      failures.push(`home Battlegrounds directory: desktop frame changed (${JSON.stringify(desktopBgDirectory)})`);
    }
    await page.evaluate(() => {
      const board = document.querySelector('.home-draft-orbit__board');
      if (!document.querySelector('.home-orbit-class__copy')) {
        const fixture = document.createElement('div');
        fixture.dataset.qaHomeOrbitFixture = 'true';
        fixture.className = 'home-orbit-class';
        fixture.setAttribute('aria-hidden', 'true');
        fixture.style.visibility = 'hidden';
        fixture.innerHTML = `
          <span class="home-orbit-class__icon"><img alt="" width="44" height="44"></span>
          <span class="home-orbit-class__copy"><small>Class</small><strong>Name</strong><b>50%</b></span>`;
        board?.append(fixture);
      }
      if (!document.querySelector('.home-orbit-empty')) {
        const emptyFixture = document.createElement('div');
        emptyFixture.dataset.qaHomeOrbitEmptyFixture = 'true';
        emptyFixture.className = 'home-orbit-empty';
        emptyFixture.setAttribute('aria-hidden', 'true');
        emptyFixture.style.visibility = 'hidden';
        board?.append(emptyFixture);
      }
    });
    const desktopShell = await page.$eval('.home-workbench', element => {
      const stage = element.querySelector('.home-stage');
      const stageLabelDot = element.querySelector('.home-stage__label > span');
      const stageHeading = element.querySelector('.home-stage h1');
      const action = element.querySelector('.home-action');
      const orbit = element.querySelector('.home-draft-orbit');
      const orbitCaption = element.querySelector('.home-draft-orbit__caption');
      const orbitClass = element.querySelector('[data-qa-home-orbit-fixture]') || element.querySelector('.home-orbit-class');
      const orbitIcon = element.querySelector('.home-orbit-class__icon');
      const orbitSmall = element.querySelector('.home-orbit-class__copy small');
      const orbitStrong = element.querySelector('.home-orbit-class__copy strong');
      const orbitValue = element.querySelector('.home-orbit-class__copy b');
      const firstSection = element.querySelector('.home-latest-articles');
      const stageStyles = stage ? getComputedStyle(stage) : null;
      const labelDotStyles = stageLabelDot ? getComputedStyle(stageLabelDot) : null;
      const actionStyles = action ? getComputedStyle(action) : null;
      const orbitStyles = orbit ? getComputedStyle(orbit) : null;
      const orbitClassStyles = orbitClass ? getComputedStyle(orbitClass) : null;
      const orbitIconStyles = orbitIcon ? getComputedStyle(orbitIcon) : null;
      return {
        gap: Number.parseFloat(getComputedStyle(element).gap),
        color: getComputedStyle(element).color,
        stageRadius: stageStyles?.borderRadius || '',
        stageAfterDisplay: stage ? getComputedStyle(stage, '::after').display : '',
        labelDotWidth: labelDotStyles?.width || '',
        labelDotHeight: labelDotStyles?.height || '',
        labelDotBorder: labelDotStyles?.borderTopWidth || '',
        headingWeight: stageHeading ? getComputedStyle(stageHeading).fontWeight : '',
        actionMinHeight: actionStyles?.minHeight || '',
        actionRadius: actionStyles?.borderRadius || '',
        actionFontSize: actionStyles?.fontSize || '',
        actionShadow: actionStyles?.boxShadow || '',
        orbitRadius: orbitStyles?.borderRadius || '',
        orbitAfterDisplay: orbit ? getComputedStyle(orbit, '::after').display : '',
        orbitCaptionSpacing: orbitCaption ? Number.parseFloat(getComputedStyle(orbitCaption).letterSpacing) : Number.NaN,
        orbitBorderColor: orbitClassStyles?.borderTopColor || '',
        orbitClassRadius: orbitClassStyles?.borderRadius || '',
        orbitClassColor: orbitClassStyles?.color || '',
        orbitClassBackground: orbitClassStyles?.backgroundColor || '',
        orbitClassShadow: orbitClassStyles?.boxShadow || '',
        orbitIconBorderColor: orbitIconStyles?.borderTopColor || '',
        orbitIconBackground: orbitIconStyles?.backgroundColor || '',
        orbitSmallColor: orbitSmall ? getComputedStyle(orbitSmall).color : '',
        orbitStrongColor: orbitStrong ? getComputedStyle(orbitStrong).color : '',
        orbitValueColor: orbitValue ? getComputedStyle(orbitValue).color : '',
        sectionPaddingTop: firstSection ? Number.parseFloat(getComputedStyle(firstSection).paddingTop) : Number.NaN,
      };
    });
    const desktopStageLayout = await page.$eval('.home-stage', element => {
      const stageStyles = getComputedStyle(element);
      const copy = element.querySelector('.home-stage__copy');
      const label = element.querySelector('.home-stage__label');
      const labelDot = element.querySelector('.home-stage__label > span');
      const heading = element.querySelector('h1');
      const headingAccent = heading?.querySelector('span');
      const summary = element.querySelector('.home-stage__copy > p');
      const actions = element.querySelector('.home-stage__actions');
      const primary = element.querySelector('.home-action--primary');
      const secondary = element.querySelector('.home-action--secondary');
      const orbit = element.querySelector('.home-draft-orbit');
      const caption = element.querySelector('.home-draft-orbit__caption');
      const board = element.querySelector('.home-draft-orbit__board');
      const orbitClass = element.querySelector('[data-qa-home-orbit-fixture]') || element.querySelector('.home-orbit-class');
      const orbitIcon = orbitClass?.querySelector('.home-orbit-class__icon');
      const orbitImage = orbitIcon?.querySelector('img');
      const orbitAction = element.querySelector('.home-orbit-action');
      const orbitEmpty = element.querySelector('[data-qa-home-orbit-empty-fixture]') || element.querySelector('.home-orbit-empty');
      const pageIndex = element.parentElement?.querySelector('.home-page-index');
      const copyStyles = copy ? getComputedStyle(copy) : null;
      const headingStyles = heading ? getComputedStyle(heading) : null;
      const summaryStyles = summary ? getComputedStyle(summary) : null;
      const primaryStyles = primary ? getComputedStyle(primary) : null;
      const secondaryStyles = secondary ? getComputedStyle(secondary) : null;
      const orbitStyles = orbit ? getComputedStyle(orbit) : null;
      const boardStyles = board ? getComputedStyle(board) : null;
      const orbitClassStyles = orbitClass ? getComputedStyle(orbitClass) : null;
      return {
        gridColumns: stageStyles.gridTemplateColumns,
        gap: Number.parseFloat(stageStyles.gap),
        minHeight: stageStyles.minHeight,
        overflow: stageStyles.overflow,
        padding: stageStyles.padding,
        borderWidth: stageStyles.borderTopWidth,
        borderImageSource: stageStyles.borderImageSource,
        color: stageStyles.color,
        backgroundImage: stageStyles.backgroundImage,
        shadow: stageStyles.boxShadow,
        copyMaxWidth: copyStyles?.maxWidth || '',
        labelColor: label ? getComputedStyle(label).color : '',
        labelDotBackground: labelDot ? getComputedStyle(labelDot).backgroundColor : '',
        labelDotShadow: labelDot ? getComputedStyle(labelDot).boxShadow : '',
        headingMaxWidth: headingStyles?.maxWidth || '',
        headingMarginTop: headingStyles?.marginTop || '',
        headingColor: headingStyles?.color || '',
        headingSize: headingStyles?.fontSize || '',
        headingLineHeight: headingStyles?.lineHeight || '',
        headingShadow: headingStyles?.textShadow || '',
        headingAccent: headingAccent ? getComputedStyle(headingAccent).color : '',
        summaryMarginTop: summaryStyles?.marginTop || '',
        summaryColor: summaryStyles?.color || '',
        summarySize: summaryStyles?.fontSize || '',
        actionsMarginTop: actions ? getComputedStyle(actions).marginTop : '',
        primaryBorder: primaryStyles?.borderTopColor || '',
        primaryColor: primaryStyles?.color || '',
        primaryBackground: primaryStyles?.backgroundImage || '',
        secondaryBorder: secondaryStyles?.borderTopColor || '',
        secondaryColor: secondaryStyles?.color || '',
        secondaryBackground: secondaryStyles?.backgroundColor || '',
        orbitWidth: orbit?.getBoundingClientRect().width || 0,
        orbitMinHeight: orbitStyles?.minHeight || '',
        orbitAlignSelf: orbitStyles?.alignSelf || '',
        orbitPadding: orbitStyles?.padding || '',
        orbitBorder: orbitStyles?.borderTopWidth || '',
        orbitColor: orbitStyles?.color || '',
        orbitBackground: orbitStyles?.backgroundImage || '',
        orbitShadow: orbitStyles?.boxShadow || '',
        captionPosition: caption ? getComputedStyle(caption).position : '',
        captionColor: caption ? getComputedStyle(caption).color : '',
        captionTransform: caption ? getComputedStyle(caption).transform : '',
        boardPosition: boardStyles?.position || '',
        boardWidth: board?.getBoundingClientRect().width || 0,
        boardMinHeight: boardStyles?.minHeight || '',
        boardMargin: boardStyles?.margin || '',
        orbitClassPosition: orbitClassStyles?.position || '',
        orbitClassMinHeight: orbitClassStyles?.minHeight || '',
        orbitClassColumns: orbitClassStyles?.gridTemplateColumns || '',
        orbitClassPadding: orbitClassStyles?.padding || '',
        orbitClassTransform: orbitClassStyles?.transform || '',
        orbitIconSize: orbitIcon ? getComputedStyle(orbitIcon).width : '',
        orbitImageSize: orbitImage ? getComputedStyle(orbitImage).width : '',
        orbitActionPosition: orbitAction ? getComputedStyle(orbitAction).position : '',
        orbitEmptyPosition: orbitEmpty ? getComputedStyle(orbitEmpty).position : '',
        orbitEmptyWidth: orbitEmpty?.getBoundingClientRect().width || 0,
        pageIndexMarginTop: pageIndex ? getComputedStyle(pageIndex).marginTop : '',
      };
    });
    await page.evaluate(() => {
      document.querySelector('[data-qa-home-orbit-fixture]')?.remove();
      document.querySelector('[data-qa-home-orbit-empty-fixture]')?.remove();
    });
    if (Math.abs(desktopShell.gap - 74.88) > 0.1
      || desktopShell.color !== 'rgb(48, 37, 28)'
      || desktopShell.stageRadius !== '0px'
      || desktopShell.stageAfterDisplay !== 'none'
      || desktopShell.labelDotWidth !== '7px'
      || desktopShell.labelDotHeight !== '7px'
      || desktopShell.labelDotBorder !== '0px'
      || desktopShell.headingWeight !== '800'
      || desktopShell.actionMinHeight !== '44px'
      || desktopShell.actionRadius !== '3px'
      || desktopShell.actionFontSize !== '12.48px'
      || desktopShell.actionShadow !== 'none'
      || desktopShell.orbitRadius !== '2px'
      || desktopShell.orbitAfterDisplay !== 'none'
      || Math.abs(desktopShell.orbitCaptionSpacing - 1.3056) > 0.02
      || desktopShell.orbitBorderColor !== 'rgba(237, 199, 111, 0.32)'
      || desktopShell.orbitClassRadius !== '3px'
      || desktopShell.orbitClassColor !== 'rgb(255, 240, 202)'
      || desktopShell.orbitClassBackground !== 'rgba(47, 4, 7, 0.72)'
      || desktopShell.orbitClassShadow === 'none'
      || desktopShell.orbitIconBorderColor !== 'rgba(232, 191, 94, 0.31)'
      || desktopShell.orbitIconBackground !== 'rgba(236, 195, 102, 0.09)'
      || desktopShell.orbitSmallColor !== 'rgb(212, 174, 99)'
      || desktopShell.orbitStrongColor !== 'rgb(255, 243, 211)'
      || desktopShell.orbitValueColor !== 'rgb(229, 190, 96)'
      || Math.abs(desktopShell.sectionPaddingTop - 56) > 0.1) {
      failures.push(`home shell: desktop stage and live-orbit theme changed (${JSON.stringify(desktopShell)})`);
    }
    if (desktopStageLayout.gridColumns.split(/\s+/).length !== 2
      || Math.abs(desktopStageLayout.gap - 34.56) > 0.1
      || desktopStageLayout.minHeight !== '0px'
      || desktopStageLayout.overflow !== 'hidden'
      || desktopStageLayout.padding !== '32px'
      || desktopStageLayout.borderWidth !== '12px'
      || !desktopStageLayout.borderImageSource.includes('main-page-rail-border.png')
      || desktopStageLayout.color !== 'rgb(255, 240, 200)'
      || !desktopStageLayout.backgroundImage.includes('arena-rail-red.jpg')
      || desktopStageLayout.shadow === 'none'
      || desktopStageLayout.copyMaxWidth !== '610px'
      || desktopStageLayout.labelColor !== 'rgb(232, 190, 98)'
      || desktopStageLayout.labelDotBackground !== 'rgb(116, 183, 120)'
      || desktopStageLayout.labelDotShadow === 'none'
      || desktopStageLayout.headingMaxWidth !== 'none'
      || desktopStageLayout.headingMarginTop !== '8.8px'
      || desktopStageLayout.headingColor !== 'rgb(255, 240, 200)'
      || desktopStageLayout.headingSize !== '58.4px'
      || desktopStageLayout.headingLineHeight !== '58.4px'
      || desktopStageLayout.headingShadow === 'none'
      || desktopStageLayout.headingAccent !== 'rgb(226, 184, 88)'
      || desktopStageLayout.summaryMarginTop !== '12.8px'
      || desktopStageLayout.summaryColor !== 'rgb(222, 202, 160)'
      || desktopStageLayout.summarySize !== '14.56px'
      || desktopStageLayout.actionsMarginTop !== '17.6px'
      || desktopStageLayout.primaryBorder !== 'rgba(238, 196, 102, 0.72)'
      || desktopStageLayout.primaryColor !== 'rgb(59, 33, 18)'
      || desktopStageLayout.primaryBackground === 'none'
      || desktopStageLayout.secondaryBorder !== 'rgba(239, 203, 121, 0.34)'
      || desktopStageLayout.secondaryColor !== 'rgb(247, 228, 183)'
      || desktopStageLayout.secondaryBackground !== 'rgba(34, 4, 8, 0.28)'
      || desktopStageLayout.orbitWidth <= 0
      || desktopStageLayout.orbitMinHeight !== '0px'
      || desktopStageLayout.orbitAlignSelf !== 'stretch'
      || desktopStageLayout.orbitPadding !== '8.8px'
      || desktopStageLayout.orbitBorder !== '1px'
      || desktopStageLayout.orbitColor !== 'rgb(251, 233, 189)'
      || desktopStageLayout.orbitBackground === 'none'
      || desktopStageLayout.orbitShadow !== 'none'
      || desktopStageLayout.captionPosition !== 'static'
      || desktopStageLayout.captionColor !== 'rgb(217, 171, 73)'
      || desktopStageLayout.captionTransform !== 'none'
      || desktopStageLayout.boardPosition !== 'static'
      || desktopStageLayout.boardWidth <= 0
      || desktopStageLayout.boardMinHeight !== '0px'
      || desktopStageLayout.boardMargin !== '0px'
      || desktopStageLayout.orbitClassPosition !== 'static'
      || desktopStageLayout.orbitClassMinHeight !== '62px'
      || !desktopStageLayout.orbitClassColumns.startsWith('48px ')
      || desktopStageLayout.orbitClassPadding !== '7.2px 9.6px'
      || desktopStageLayout.orbitClassTransform !== 'none'
      || desktopStageLayout.orbitIconSize !== '46px'
      || desktopStageLayout.orbitImageSize !== '44px'
      || desktopStageLayout.orbitActionPosition !== 'static'
      || desktopStageLayout.orbitEmptyPosition !== 'static'
      || desktopStageLayout.orbitEmptyWidth <= 0
      || desktopStageLayout.pageIndexMarginTop !== '-24px') {
      failures.push(`home stage: desktop layout changed (${JSON.stringify(desktopStageLayout)})`);
    }
    const desktopCommunity = await page.$eval('.home-community', element => {
      const rootStyles = getComputedStyle(element);
      const lead = element.querySelector('.home-community__lead');
      const firstLink = element.querySelector(':scope > a');
      const small = lead?.querySelector('small');
      const strong = lead?.querySelector('strong');
      const leadStyles = lead ? getComputedStyle(lead) : null;
      const linkStyles = firstLink ? getComputedStyle(firstLink) : null;
      return {
        display: rootStyles.display,
        overflow: rootStyles.overflow,
        padding: rootStyles.padding,
        border: rootStyles.borderTopWidth,
        radius: rootStyles.borderRadius,
        color: rootStyles.color,
        backgroundImage: rootStyles.backgroundImage,
        shadow: rootStyles.boxShadow,
        beforeDisplay: getComputedStyle(element, '::before').display,
        leadMinHeight: leadStyles?.minHeight || '',
        leadPadding: leadStyles?.padding || '',
        leadColor: leadStyles?.color || '',
        leadBackground: leadStyles?.backgroundImage || '',
        linkBorderLeftWidth: linkStyles?.borderLeftWidth || '',
        linkBorderLeftColor: linkStyles?.borderLeftColor || '',
        smallColor: small ? getComputedStyle(small).color : '',
        strongColor: strong ? getComputedStyle(strong).color : '',
      };
    });
    if (desktopCommunity.display !== 'grid'
      || desktopCommunity.overflow !== 'hidden'
      || desktopCommunity.padding !== '5px 0px 0px'
      || desktopCommunity.border !== '0px'
      || desktopCommunity.radius !== '0px'
      || desktopCommunity.color !== 'rgb(247, 232, 195)'
      || desktopCommunity.backgroundImage === 'none'
      || desktopCommunity.shadow !== 'none'
      || desktopCommunity.beforeDisplay !== 'none'
      || desktopCommunity.leadMinHeight !== '105px'
      || desktopCommunity.leadPadding !== '19.2px'
      || desktopCommunity.leadColor !== 'rgb(247, 232, 195)'
      || !desktopCommunity.leadBackground.includes('arena-rail-red.jpg')
      || desktopCommunity.linkBorderLeftWidth !== '1px'
      || desktopCommunity.linkBorderLeftColor !== 'rgba(239, 202, 119, 0.23)'
      || desktopCommunity.smallColor !== 'rgb(212, 183, 123)'
      || desktopCommunity.strongColor !== 'rgb(255, 242, 205)') {
      failures.push(`home community: desktop tavern strip changed (${JSON.stringify(desktopCommunity)})`);
    }
    await page.$eval('.home-action', element => element.focus());
    const focusedAction = await page.$eval('.home-action', element => ({
      outlineWidth: getComputedStyle(element).outlineWidth,
      outlineColor: getComputedStyle(element).outlineColor,
      outlineOffset: getComputedStyle(element).outlineOffset,
    }));
    if (focusedAction.outlineWidth !== '3px'
      || focusedAction.outlineColor !== 'rgba(123, 21, 27, 0.72)'
      || focusedAction.outlineOffset !== '3px') {
      failures.push(`home shell: keyboard focus treatment changed (${JSON.stringify(focusedAction)})`);
    }
    await page.$eval('.home-action', element => element.blur());
    await page.hover('.home-action');
    await new Promise(resolve => setTimeout(resolve, 250));
    const hoveredAction = await page.$eval('.home-action', element => ({
      transform: getComputedStyle(element).transform,
      shadow: getComputedStyle(element).boxShadow,
    }));
    if (hoveredAction.transform !== 'matrix(1, 0, 0, 1, 0, -2)' || hoveredAction.shadow === 'none') {
      failures.push(`home shell: CTA hover treatment changed (${JSON.stringify(hoveredAction)})`);
    }
    await page.mouse.move(0, 0);
    await page.hover('.home-community > a');
    await new Promise(resolve => setTimeout(resolve, 220));
    const hoveredCommunityLink = await page.$eval('.home-community > a', element => getComputedStyle(element).backgroundColor);
    if (hoveredCommunityLink !== 'rgba(44, 3, 6, 0.25)') {
      failures.push(`home community: link hover treatment changed (${hoveredCommunityLink})`);
    }
    await page.mouse.move(0, 0);
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const mobileContentCanvas = await page.$eval('.arena-content-open', element => {
      const styles = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        viewportWidth: document.documentElement.clientWidth,
        maxWidth: styles.maxWidth,
        padding: styles.padding,
        border: styles.borderTopWidth,
        radius: styles.borderRadius,
        backgroundColor: styles.backgroundColor,
        backgroundImage: styles.backgroundImage,
        shadow: styles.boxShadow,
      };
    });
    if (Math.abs(mobileContentCanvas.width - mobileContentCanvas.viewportWidth) > 0.1
      || mobileContentCanvas.maxWidth !== '100%'
      || mobileContentCanvas.padding !== '0px 16px 32px'
      || mobileContentCanvas.border !== '0px'
      || mobileContentCanvas.radius !== '0px'
      || mobileContentCanvas.backgroundColor !== 'rgba(0, 0, 0, 0)'
      || mobileContentCanvas.backgroundImage !== 'none'
      || mobileContentCanvas.shadow !== 'none') {
      failures.push(`home content canvas: mobile contract changed (${JSON.stringify(mobileContentCanvas)})`);
    }
    const mobileHeading = await page.$eval('.home-latest-articles .home-section-heading', element => {
      const heading = element.querySelector('h2');
      const summary = element.querySelector(':scope > p');
      return {
        alignItems: getComputedStyle(element).alignItems,
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        summaryDisplay: summary ? getComputedStyle(summary).display : '',
        sectionPaddingTop: Number.parseFloat(getComputedStyle(element.closest('.home-latest-articles')).paddingTop),
      };
    });
    if (mobileHeading.alignItems !== 'flex-start'
      || mobileHeading.headingSize !== '32px'
      || mobileHeading.summaryDisplay !== 'none'
      || Math.abs(mobileHeading.sectionPaddingTop - 35.2) > 0.1) {
      failures.push(`home headings: mobile parchment typography changed (${JSON.stringify(mobileHeading)})`);
    }
    const mobileArenaDirectory = await page.$eval('.home-arena-directory', element => {
      const heading = element.querySelector('.home-arena-directory__sign h2');
      const links = element.querySelector('.home-arena-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      return {
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridWidth: links?.getBoundingClientRect().width || 0,
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    if (mobileArenaDirectory.headingSize !== '20.8px'
      || mobileArenaDirectory.gridPadding !== '0px'
      || mobileArenaDirectory.gridBorder !== '30px'
      || mobileArenaDirectory.gridWidth > mobileArenaDirectory.viewportWidth) {
      failures.push(`home Arena directory: mobile frame changed (${JSON.stringify(mobileArenaDirectory)})`);
    }
    const mobileBgDirectory = await page.$eval('.home-bg-directory', element => {
      const heading = element.querySelector('.home-bg-directory__sign h2');
      const links = element.querySelector('.home-bg-directory__links');
      const linkStyles = links ? getComputedStyle(links) : null;
      const featured = element.querySelector('.home-bg-directory__link[data-featured="true"]');
      const featuredStyles = featured ? getComputedStyle(featured) : null;
      return {
        headingSize: heading ? getComputedStyle(heading).fontSize : '',
        gridPadding: linkStyles?.padding || '',
        gridBorder: linkStyles?.borderTopWidth || '',
        gridWidth: links?.getBoundingClientRect().width || 0,
        featuredHeight: featuredStyles?.minHeight || '',
        featuredPadding: featuredStyles?.padding || '',
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    if (mobileBgDirectory.headingSize !== '20.8px'
      || mobileBgDirectory.gridPadding !== '0px'
      || mobileBgDirectory.gridBorder !== '30px'
      || mobileBgDirectory.featuredHeight !== '124px'
      || mobileBgDirectory.featuredPadding !== '12.48px'
      || mobileBgDirectory.gridWidth > mobileBgDirectory.viewportWidth) {
      failures.push(`home Battlegrounds directory: mobile frame changed (${JSON.stringify(mobileBgDirectory)})`);
    }
    const mobileShell = await page.$eval('.home-workbench', element => {
      const actions = element.querySelector('.home-stage__actions');
      const actionLinks = Array.from(actions?.querySelectorAll('.home-action') || []);
      const firstActionRect = actionLinks[0]?.getBoundingClientRect();
      const secondActionRect = actionLinks[1]?.getBoundingClientRect();
      const actionsRect = actions?.getBoundingClientRect();
      const community = element.querySelector('.home-community');
      const communityLead = community?.querySelector('.home-community__lead');
      const communityLink = community?.querySelector(':scope > a');
      const communityStyles = community ? getComputedStyle(community) : null;
      const communityLinkStyles = communityLink ? getComputedStyle(communityLink) : null;
      return {
        workbenchGap: getComputedStyle(element).gap,
        actionsDisplay: actions ? getComputedStyle(actions).display : '',
        actionColumns: actions ? getComputedStyle(actions).gridTemplateColumns : '',
        actionWidth: firstActionRect?.width || 0,
        actionsWidth: actionsRect?.width || 0,
        actionsStacked: Boolean(firstActionRect && secondActionRect && secondActionRect.top >= firstActionRect.bottom),
        communityDisplay: communityStyles?.display || '',
        communityColumns: communityStyles?.gridTemplateColumns || '',
        communityWidth: community?.getBoundingClientRect().width || 0,
        viewportWidth: document.documentElement.clientWidth,
        communityLeadMinHeight: communityLead ? getComputedStyle(communityLead).minHeight : '',
        communityLinkBorderLeft: communityLinkStyles?.borderLeftWidth || '',
        communityLinkBorderTop: communityLinkStyles?.borderTopWidth || '',
        communityLinkBorderTopColor: communityLinkStyles?.borderTopColor || '',
      };
    });
    if (mobileShell.workbenchGap !== '51.2px'
      || mobileShell.actionsDisplay !== 'grid'
      || mobileShell.actionColumns.split(/\s+/).length !== 1
      || Math.abs(mobileShell.actionWidth - mobileShell.actionsWidth) > 0.5
      || !mobileShell.actionsStacked
      || mobileShell.communityDisplay !== 'grid'
      || mobileShell.communityColumns.split(/\s+/).length !== 1
      || mobileShell.communityWidth > mobileShell.viewportWidth
      || mobileShell.communityLeadMinHeight !== '84px'
      || mobileShell.communityLinkBorderLeft !== '0px'
      || mobileShell.communityLinkBorderTop !== '1px'
      || mobileShell.communityLinkBorderTopColor !== 'rgba(239, 202, 119, 0.23)') {
      failures.push(`home shell: mobile CTA/community layout changed (${JSON.stringify(mobileShell)})`);
    }
    const mobileStageLayout = await page.$eval('.home-stage', element => {
      const stageStyles = getComputedStyle(element);
      const heading = element.querySelector('h1');
      const summary = element.querySelector('.home-stage__copy > p');
      const character = element.querySelector('.home-stage__character');
      const characterImage = character?.querySelector('img');
      const orbit = element.querySelector('.home-draft-orbit');
      const board = element.querySelector('.home-draft-orbit__board');
      const pageIndex = element.parentElement?.querySelector('.home-page-index');
      const headingStyles = heading ? getComputedStyle(heading) : null;
      const characterStyles = character ? getComputedStyle(character) : null;
      const characterImageStyles = characterImage ? getComputedStyle(characterImage) : null;
      const orbitStyles = orbit ? getComputedStyle(orbit) : null;
      const boardStyles = board ? getComputedStyle(board) : null;
      return {
        gridColumns: stageStyles.gridTemplateColumns,
        stageWidth: element.getBoundingClientRect().width,
        gap: stageStyles.gap,
        padding: stageStyles.padding,
        borderWidth: stageStyles.borderTopWidth,
        borderImageWidth: stageStyles.borderImageWidth,
        headingMaxWidth: headingStyles?.maxWidth || '',
        headingSize: headingStyles?.fontSize || '',
        headingLineHeight: headingStyles?.lineHeight || '',
        summarySize: summary ? getComputedStyle(summary).fontSize : '',
        characterPosition: characterStyles?.position || '',
        characterWidth: character?.getBoundingClientRect().width || 0,
        characterHeight: character?.getBoundingClientRect().height || 0,
        characterMargin: characterStyles?.margin || '',
        characterBorderWidth: characterStyles?.borderTopWidth || '',
        characterImagePosition: characterImageStyles?.objectPosition || '',
        characterImageTransform: characterImageStyles?.transform || '',
        orbitWidth: orbit?.getBoundingClientRect().width || 0,
        orbitMinHeight: orbitStyles?.minHeight || '',
        boardWidth: board?.getBoundingClientRect().width || 0,
        boardTransform: boardStyles?.transform || '',
        pageIndexMarginTop: pageIndex ? getComputedStyle(pageIndex).marginTop : '',
        viewportWidth: document.documentElement.clientWidth,
      };
    });
    if (mobileStageLayout.gridColumns.split(/\s+/).length !== 1
      || mobileStageLayout.stageWidth > mobileStageLayout.viewportWidth
      || mobileStageLayout.gap !== '16px'
      || mobileStageLayout.padding !== '12.8px'
      || mobileStageLayout.borderWidth !== '9px'
      || mobileStageLayout.borderImageWidth !== '9px'
      || mobileStageLayout.headingMaxWidth !== 'none'
      || mobileStageLayout.headingSize !== '39px'
      || mobileStageLayout.headingLineHeight !== '39px'
      || mobileStageLayout.summarySize !== '12.8px'
      || mobileStageLayout.characterPosition !== 'relative'
      || mobileStageLayout.characterWidth <= 0
      || Math.abs(mobileStageLayout.characterHeight - 171.6) > 0.2
      || mobileStageLayout.characterMargin !== '0px -8.8px'
      || mobileStageLayout.characterBorderWidth !== '4px'
      || mobileStageLayout.characterImagePosition !== '55% 32%'
      || mobileStageLayout.characterImageTransform !== 'none'
      || mobileStageLayout.orbitWidth <= 0
      || mobileStageLayout.orbitMinHeight !== '0px'
      || mobileStageLayout.boardWidth <= 0
      || Math.abs(mobileStageLayout.boardWidth - mobileStageLayout.orbitWidth + 19.6) > 0.5
      || mobileStageLayout.boardTransform !== 'none'
      || mobileStageLayout.pageIndexMarginTop !== '-22.4px') {
      failures.push(`home stage: mobile responsive layout changed (${JSON.stringify(mobileStageLayout)})`);
    }
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    const faqTrigger = await page.$('.home-faq-zone .faq-card__trigger');
    if (!faqTrigger) {
      failures.push('home lazy sections: FAQ trigger is missing');
    } else {
      const initialFaqState = await faqTrigger.evaluate(element => element.getAttribute('aria-expanded'));
      if (initialFaqState !== 'false') failures.push(`home lazy sections: FAQ must start collapsed, got ${initialFaqState}`);
      await faqTrigger.click();
      const expandedFaqState = await faqTrigger.evaluate(element => ({
        expanded: element.getAttribute('aria-expanded'),
        panelHidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
      }));
      if (expandedFaqState.expanded !== 'true' || expandedFaqState.panelHidden !== false) {
        failures.push('home lazy sections: FAQ trigger did not expose its controlled panel');
      }
      await faqTrigger.click();
    }
    const seoRegistryLoadedInitially = await page.evaluate(() => performance.getEntriesByType('resource')
      .some(entry => entry.name.includes('/assets/registry-')));
    if (seoRegistryLoadedInitially) failures.push('home lazy sections: SEO registry loaded before client navigation');
    await page.evaluate(() => window.scrollTo(0, 900));
    await page.waitForSelector('.support-prompt--collapsed', { visible: true, timeout: 5_000 });
    await page.click('.support-prompt__trigger');
    await page.waitForSelector('.support-prompt--expanded', { visible: true });
    await auditAccessibility(page, 'home lazy sections and support prompt');
    if (runtimeErrors.length) failures.push(`home lazy sections: ${runtimeErrors.join(' | ')}`);
    await page.click('.support-prompt__close');
    await page.click('.arena-sidebar a[href="/classes"]');
    await page.waitForFunction(() => document.title.startsWith('Винрейт классов'), { timeout: 5_000 });
    const seoRegistryState = await page.evaluate(() => ({
      path: location.pathname,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content') || '',
      chunkLoaded: performance.getEntriesByType('resource').some(entry => entry.name.includes('/assets/registry-')),
    }));
    if (seoRegistryState.path !== '/classes' || !seoRegistryState.description.includes('винрейты всех 11 классов') || !seoRegistryState.chunkLoaded) {
      failures.push(`home lazy sections: client route metadata did not update (${JSON.stringify(seoRegistryState)})`);
    }
    console.log('✓ home lazy sections and delayed support prompt');
  } catch (error) {
    failures.push(`home lazy sections: ${error.message}`);
  } finally {
    await page.close();
  }
}

// A failed below-fold chunk must not remove the rest of Home. The section
// degrades inside its own frame and offers an explicit page refresh.
{
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await mockApplicationApi(page, {
    authenticated: true,
    adminState: { homeArticlesChunkFailure: true },
  });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('[data-home-error]', { visible: true, timeout: 15_000 });
    await page.waitForSelector('.home-bg-directory', { visible: true });
    await page.waitForSelector('.home-arena-directory', { visible: true });
    await page.waitForSelector('.home-community', { visible: true });
    await page.waitForSelector('.home-faq-zone', { visible: true });
    const recoveryState = await page.$eval('[data-home-error]', element => {
      const button = element.querySelector('button');
      const styles = getComputedStyle(element);
      const buttonStyles = button ? getComputedStyle(button) : null;
      return {
        text: element.textContent || '',
        role: element.getAttribute('role'),
        minHeight: styles.minHeight,
        buttonHeight: button?.getBoundingClientRect().height || 0,
        buttonCursor: buttonStyles?.cursor || '',
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    if (!recoveryState.text.includes('Последние статьи')
      || recoveryState.role !== 'alert'
      || recoveryState.minHeight !== '288px'
      || recoveryState.buttonHeight < 44
      || recoveryState.buttonCursor !== 'pointer'
      || recoveryState.horizontalOverflow) {
      failures.push(`home chunk recovery: contract changed (${JSON.stringify(recoveryState)})`);
    }
    console.log('✓ home chunk failure remains local and recoverable');
  } catch (error) {
    failures.push(`home chunk recovery: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Keyboard entry: the skip link must be the first application control, become
// visible on focus and move focus to the main landmark without a pointer.
{
  const page = await createQaPage();
  await page.setViewport({ width: 1440, height: 900 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForAuthenticatedShell(page);
    await page.keyboard.press('Tab');
    await page.waitForFunction(
      () => document.activeElement?.classList.contains('arena-skip-link'),
      { timeout: 5_000 },
    );
    const skipState = await page.evaluate(() => {
      const element = document.activeElement;
      const rect = element?.getBoundingClientRect();
      return {
        className: element?.className || '',
        firstAppChild: document.querySelector('#root > .arena-app-shell')?.firstElementChild?.matches('.arena-skip-link') || false,
        width: rect?.width || 0,
        height: rect?.height || 0,
        top: rect?.top || 0,
      };
    });
    if (!String(skipState.className).includes('arena-skip-link') || !skipState.firstAppChild) failures.push('keyboard: skip link is not the first application control');
    if (skipState.height < 44 || skipState.width < 44 || skipState.top < 0) failures.push(`keyboard: skip link is not visibly actionable (${skipState.width}×${skipState.height}, top ${skipState.top})`);
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => location.hash === '#main-content' && document.activeElement?.id === 'main-content',
      { timeout: 5_000 },
    );
    console.log('✓ keyboard skip link and main landmark focus');
  } catch (error) {
    failures.push(`keyboard skip link: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Desktop sidebar: stable tavern frame, active/hover navigation and expandable groups.
{
  const page = await createQaPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/classes`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Паладин');
    await page.waitForSelector('.arena-sidebar', { visible: true });
    const sidebarState = await page.evaluate(() => {
      const sidebar = document.querySelector('.arena-sidebar');
      const brand = sidebar?.querySelector('.arena-sidebar-brand');
      const brandName = brand?.querySelector('strong');
      const nav = sidebar?.querySelector('.arena-sidebar-nav');
      const section = sidebar?.querySelector('.arena-sidebar-section');
      const inactiveLink = sidebar?.querySelector('a.arena-sidebar-link:not(.arena-sidebar-link-active)');
      const activeLink = sidebar?.querySelector('.arena-sidebar-link-active');
      const inactiveIcon = inactiveLink?.querySelector('.arena-sidebar-link-icon');
      const status = sidebar?.querySelector('.arena-sidebar-status');
      const statusLabel = status?.querySelector('span');
      const statusValue = status?.querySelector('strong');
      const profile = sidebar?.querySelector('.arena-sidebar-profile');
      let profileIcon = profile?.querySelector('.arena-sidebar-profile-icon');
      let profileIconFixture = null;
      if (!profileIcon && profile) {
        profileIconFixture = document.createElement('span');
        profileIconFixture.className = 'arena-sidebar-profile-icon';
        profileIconFixture.setAttribute('aria-hidden', 'true');
        profileIconFixture.style.visibility = 'hidden';
        profile.append(profileIconFixture);
        profileIcon = profileIconFixture;
      }
      const profileLabel = profile?.querySelector('.arena-sidebar-profile-label');
      const profileHint = profile?.querySelector('.arena-sidebar-profile-hint');
      const workspace = document.querySelector('.arena-workspace');
      const shell = document.querySelector('.bg-wood');
      const main = document.querySelector('.arena-main');
      const sidebarStyles = sidebar ? getComputedStyle(sidebar) : null;
      const brandStyles = brand ? getComputedStyle(brand) : null;
      const navStyles = nav ? getComputedStyle(nav) : null;
      const sectionStyles = section ? getComputedStyle(section) : null;
      const inactiveStyles = inactiveLink ? getComputedStyle(inactiveLink) : null;
      const inactiveIconStyles = inactiveIcon ? getComputedStyle(inactiveIcon) : null;
      const activeStyles = activeLink ? getComputedStyle(activeLink) : null;
      const statusStyles = status ? getComputedStyle(status) : null;
      const profileStyles = profile ? getComputedStyle(profile) : null;
      const profileIconStyles = profileIcon ? getComputedStyle(profileIcon) : null;
      const shellStyles = shell ? getComputedStyle(shell) : null;
      const workspaceStyles = workspace ? getComputedStyle(workspace) : null;
      const mainStyles = main ? getComputedStyle(main) : null;
      const profileIconContract = {
        border: profileIconStyles?.borderTopColor || '',
        color: profileIconStyles?.color || '',
        background: profileIconStyles?.backgroundColor || '',
      };
      profileIconFixture?.remove();
      const rect = sidebar?.getBoundingClientRect();
      return {
        width: rect?.width || 0,
        height: rect?.height || 0,
        viewportHeight: innerHeight,
        padding: sidebarStyles?.padding || '',
        borderRight: sidebarStyles?.borderRightWidth || '',
        borderImage: sidebarStyles?.borderImageSource || '',
        borderImageWidth: sidebarStyles?.borderImageWidth || '',
        color: sidebarStyles?.color || '',
        background: sidebarStyles?.backgroundImage || '',
        shadow: sidebarStyles?.boxShadow || '',
        beforeDisplay: sidebar ? getComputedStyle(sidebar, '::before').display : '',
        brandMinHeight: brandStyles?.minHeight || '',
        brandPadding: brandStyles?.padding || '',
        brandColor: brandName ? getComputedStyle(brandName).color : '',
        brandSize: brandName ? getComputedStyle(brandName).fontSize : '',
        brandLineHeight: brandName ? getComputedStyle(brandName).lineHeight : '',
        brandShadow: brandName ? getComputedStyle(brandName).textShadow : '',
        navGap: navStyles?.gap || '',
        navMarginTop: navStyles?.marginTop || '',
        navPadding: navStyles?.padding || '',
        navBorderColor: navStyles?.borderTopColor || '',
        sectionText: section?.textContent?.trim() || '',
        sectionMargin: sectionStyles?.margin || '',
        sectionColor: sectionStyles?.color || '',
        sectionSize: sectionStyles?.fontSize || '',
        sectionWeight: sectionStyles?.fontWeight || '',
        linkMinHeight: inactiveStyles?.minHeight || '',
        linkGap: inactiveStyles?.gap || '',
        linkPadding: inactiveStyles?.padding || '',
        linkBorderTop: inactiveStyles?.borderTopWidth || '',
        linkBorderLeft: inactiveStyles?.borderLeftWidth || '',
        linkRadius: inactiveStyles?.borderRadius || '',
        linkColor: inactiveStyles?.color || '',
        linkBackground: inactiveStyles?.backgroundColor || '',
        linkSize: inactiveStyles?.fontSize || '',
        linkWeight: inactiveStyles?.fontWeight || '',
        linkShadow: inactiveStyles?.textShadow || '',
        linkBoxShadow: inactiveStyles?.boxShadow || '',
        iconWidth: inactiveIconStyles?.width || '',
        iconHeight: inactiveIconStyles?.height || '',
        iconFlexBasis: inactiveIconStyles?.flexBasis || '',
        iconBorder: inactiveIconStyles?.borderTopWidth || '',
        iconRadius: inactiveIconStyles?.borderRadius || '',
        iconColor: inactiveIconStyles?.color || '',
        iconBackground: inactiveIconStyles?.backgroundColor || '',
        activeBorder: activeStyles?.borderLeftColor || '',
        activeColor: activeStyles?.color || '',
        activeBackground: activeStyles?.backgroundImage || '',
        activeShadow: activeStyles?.boxShadow || '',
        activeBeforeDisplay: activeLink ? getComputedStyle(activeLink, '::before').display : '',
        statusPadding: statusStyles?.padding || '',
        statusBorderColor: statusStyles?.borderTopColor || '',
        statusDotBackground: status ? getComputedStyle(status, '::before').backgroundColor : '',
        statusDotShadow: status ? getComputedStyle(status, '::before').boxShadow : '',
        statusLabelColor: statusLabel ? getComputedStyle(statusLabel).color : '',
        statusValueColor: statusValue ? getComputedStyle(statusValue).color : '',
        profilePosition: profileStyles?.position || '',
        profileMinHeight: profileStyles?.minHeight || '',
        profilePadding: profileStyles?.padding || '',
        profileOverflow: profileStyles?.overflow || '',
        profileBorder: profileStyles?.borderTopWidth || '',
        profileRadius: profileStyles?.borderRadius || '',
        profileColor: profileStyles?.color || '',
        profileBackground: profileStyles?.backgroundColor || '',
        profileShadow: profileStyles?.boxShadow || '',
        profileAfterContent: profile ? getComputedStyle(profile, '::after').content : '',
        profileAfterInset: profile ? getComputedStyle(profile, '::after').top : '',
        profileAfterBackground: profile ? getComputedStyle(profile, '::after').backgroundImage : '',
        profileIconBorder: profileIconContract.border,
        profileIconColor: profileIconContract.color,
        profileIconBackground: profileIconContract.background,
        profileLabelColor: profileLabel ? getComputedStyle(profileLabel).color : '',
        profileLabelSize: profileLabel ? getComputedStyle(profileLabel).fontSize : '',
        profileLabelShadow: profileLabel ? getComputedStyle(profileLabel).textShadow : '',
        profileHintColor: profileHint ? getComputedStyle(profileHint).color : '',
        profileHintSize: profileHint ? getComputedStyle(profileHint).fontSize : '',
        workspaceMarginLeft: workspace ? getComputedStyle(workspace).marginLeft : '',
        workspaceLeft: workspace?.getBoundingClientRect().left || 0,
        shellBackgroundColor: shellStyles?.backgroundColor || '',
        shellBackgroundImage: shellStyles?.backgroundImage || '',
        shellBackgroundRepeat: shellStyles?.backgroundRepeat || '',
        shellBackgroundSize: shellStyles?.backgroundSize || '',
        shellAfterContent: shell ? getComputedStyle(shell, '::after').content : '',
        shellAfterDisplay: shell ? getComputedStyle(shell, '::after').display : '',
        shellAfterBackground: shell ? getComputedStyle(shell, '::after').backgroundImage : '',
        workspaceBackground: workspaceStyles?.backgroundImage || '',
        mainBackground: mainStyles?.backgroundImage || '',
        mainPaddingTop: mainStyles?.paddingTop || '',
      };
    });
    if (sidebarState.sectionText !== 'Традиционный режим') failures.push(`desktop sidebar: unexpected first section label ${sidebarState.sectionText}`);
    if (Math.abs(sidebarState.width - 258) > 0.1
      || sidebarState.height < sidebarState.viewportHeight
      || sidebarState.padding !== '14.4px 11.52px'
      || sidebarState.borderRight !== '14px'
      || !sidebarState.borderImage.includes('main-page-rail-border.png')
      || sidebarState.borderImageWidth !== '0 14px 0 0'
      || sidebarState.color !== 'rgb(234, 210, 161)'
      || !sidebarState.background.includes('arena-rail-red.jpg')
      || sidebarState.shadow === 'none'
      || sidebarState.beforeDisplay !== 'none'
      || sidebarState.brandMinHeight !== '64px'
      || sidebarState.brandPadding !== '10.4px 8.8px 12.8px'
      || sidebarState.brandColor !== 'rgb(255, 241, 200)'
      || sidebarState.brandSize !== '20px'
      || sidebarState.brandLineHeight !== '21px'
      || sidebarState.brandShadow === 'none'
      || sidebarState.navGap !== '2.08px'
      || sidebarState.navMarginTop !== '7.2px'
      || sidebarState.navPadding !== '7.2px 0px'
      || sidebarState.navBorderColor !== 'rgba(232, 192, 103, 0.2)'
      || sidebarState.sectionMargin !== '11.52px 8.8px 4px'
      || sidebarState.sectionColor !== 'rgb(220, 175, 85)'
      || sidebarState.sectionSize !== '9.76px'
      || sidebarState.sectionWeight !== '850'
      || sidebarState.linkMinHeight !== '40px'
      || sidebarState.linkGap !== '9.92px'
      || sidebarState.linkPadding !== '8.32px 9.92px'
      || sidebarState.linkBorderTop !== '0px'
      || sidebarState.linkBorderLeft !== '3px'
      || sidebarState.linkRadius !== '2px'
      || sidebarState.linkColor !== 'rgb(247, 223, 176)'
      || sidebarState.linkBackground !== 'rgba(0, 0, 0, 0)'
      || sidebarState.linkSize !== '13.44px'
      || sidebarState.linkWeight !== '700'
      || sidebarState.linkShadow === 'none'
      || sidebarState.linkBoxShadow !== 'none'
      || sidebarState.iconWidth !== '28px'
      || sidebarState.iconHeight !== '28px'
      || sidebarState.iconFlexBasis !== '28px'
      || sidebarState.iconBorder !== '1px'
      || sidebarState.iconRadius !== '4px'
      || sidebarState.iconColor !== 'rgb(232, 184, 77)'
      || sidebarState.iconBackground !== 'rgba(43, 4, 8, 0.24)'
      || sidebarState.activeBorder !== 'rgb(242, 200, 93)'
      || sidebarState.activeColor !== 'rgb(255, 247, 223)'
      || sidebarState.activeBackground === 'none'
      || sidebarState.activeShadow === 'none'
      || sidebarState.activeBeforeDisplay !== 'none'
      || sidebarState.statusPadding !== '10.4px 7.2px 5.6px'
      || sidebarState.statusBorderColor !== 'rgba(232, 192, 103, 0.23)'
      || sidebarState.statusDotBackground !== 'rgb(114, 188, 117)'
      || sidebarState.statusDotShadow === 'none'
      || sidebarState.statusLabelColor !== 'rgb(197, 168, 115)'
      || sidebarState.statusValueColor !== 'rgb(255, 240, 199)'
      || sidebarState.profilePosition !== 'relative'
      || sidebarState.profileMinHeight !== '74px'
      || sidebarState.profilePadding !== '12.48px 16px'
      || sidebarState.profileOverflow !== 'visible'
      || sidebarState.profileBorder !== '0px'
      || sidebarState.profileRadius !== '0px'
      || sidebarState.profileColor !== 'rgb(243, 210, 122)'
      || sidebarState.profileBackground !== 'rgba(38, 3, 6, 0.4)'
      || sidebarState.profileShadow === 'none'
      || sidebarState.profileAfterContent !== '""'
      || sidebarState.profileAfterInset !== '-5px'
      || !sidebarState.profileAfterBackground.includes('deck-border.png')
      || sidebarState.profileIconBorder !== 'rgba(237, 196, 105, 0.32)'
      || sidebarState.profileIconColor !== 'rgb(231, 185, 78)'
      || sidebarState.profileIconBackground !== 'rgba(48, 4, 7, 0.31)'
      || sidebarState.profileLabelColor !== 'rgb(255, 244, 211)'
      || sidebarState.profileLabelSize !== '16.48px'
      || sidebarState.profileLabelShadow === 'none'
      || sidebarState.profileHintColor !== 'rgb(210, 183, 127)'
      || sidebarState.profileHintSize !== '11.36px'
      || sidebarState.workspaceMarginLeft !== '258px'
      || Math.abs(sidebarState.workspaceLeft - 258) > 0.1
      || sidebarState.shellBackgroundColor !== 'rgb(234, 214, 167)'
      || !sidebarState.shellBackgroundImage.includes('arena-parchment.jpg')
      || sidebarState.shellBackgroundRepeat !== 'repeat, repeat'
      || sidebarState.shellBackgroundSize !== 'auto, 865px 878px'
      || sidebarState.shellAfterContent !== 'none'
      || sidebarState.shellAfterDisplay !== 'none'
      || sidebarState.shellAfterBackground !== 'none'
      || !sidebarState.workspaceBackground.includes('arena-parchment.jpg')
      || !sidebarState.mainBackground.includes('arena-parchment.jpg')
      || sidebarState.mainPaddingTop !== '16px') {
      failures.push(`desktop sidebar: parchment frame changed (${JSON.stringify(sidebarState)})`);
    }
    const hoverTarget = '.arena-sidebar a.arena-sidebar-link:not(.arena-sidebar-link-active)';
    await page.hover(hoverTarget);
    await new Promise(resolve => setTimeout(resolve, 220));
    const hoveredLink = await page.$eval(hoverTarget, element => ({
      transform: getComputedStyle(element).transform,
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    if (hoveredLink.transform !== 'matrix(1, 0, 0, 1, 2, 0)'
      || hoveredLink.color !== 'rgb(255, 244, 212)'
      || hoveredLink.background !== 'rgba(50, 4, 7, 0.22)') {
      failures.push(`desktop sidebar: hover treatment changed (${JSON.stringify(hoveredLink)})`);
    }
    const constructorsTrigger = '[aria-controls="arena-sidebar-constructors"]';
    await page.hover(constructorsTrigger);
    await new Promise(resolve => setTimeout(resolve, 220));
    const hoverGroup = await page.$eval(constructorsTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (hoverGroup.expanded !== 'false' || hoverGroup.hidden !== true) failures.push('desktop sidebar: constructors group expanded on hover instead of click');
    await page.click(constructorsTrigger);
    const expandedGroup = await page.$eval(constructorsTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (expandedGroup.expanded !== 'true' || expandedGroup.hidden !== false) failures.push('desktop sidebar: constructors group did not expand');
    await page.$eval(hoverTarget, element => element.focus());
    const persistedGroup = await page.$eval(constructorsTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (persistedGroup.expanded !== 'true' || persistedGroup.hidden !== false) failures.push('desktop sidebar: constructors group closed without a click');
    await page.click(constructorsTrigger);
    const collapsedGroup = await page.$eval(constructorsTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (collapsedGroup.expanded !== 'false' || collapsedGroup.hidden !== true) failures.push('desktop sidebar: constructors group did not collapse on the second click');
    const miscTrigger = '[aria-controls="arena-sidebar-misc"]';
    await page.focus(miscTrigger);
    await page.keyboard.press('Enter');
    const keyboardGroup = await page.$eval(miscTrigger, element => ({
      expanded: element.getAttribute('aria-expanded'),
      hidden: document.getElementById(element.getAttribute('aria-controls') || '')?.hidden,
    }));
    if (keyboardGroup.expanded !== 'true' || keyboardGroup.hidden !== false) failures.push('desktop sidebar: misc group did not expand from the keyboard');
    await page.keyboard.press('Enter');
    await auditAccessibility(page, 'desktop sidebar');
    await page.screenshot({ path: `${OUT}/desktop-sidebar.png`, fullPage: false });
    console.log('✓ desktop sidebar frame, click-only expandable navigation');
  } catch (error) {
    failures.push(`desktop sidebar: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Mobile drawer: visible controls, grouped navigation and background scroll lock.
{
  const page = await createQaPage();
  let stage = 'load';
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForAuthenticatedShell(page);
    stage = 'open';
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForSelector('.arena-mobile-menu', { visible: true });
    stage = 'initial focus';
    await page.waitForFunction(() => document.querySelector('#arena-mobile-menu')?.contains(document.activeElement), { timeout: 5_000 });
    await page.waitForFunction(() => (
      document.querySelector('.auth-avatar > span')?.textContent === 'QS'
      && getComputedStyle(document.querySelector('.auth-avatar img')).display === 'none'
    ), { timeout: 5_000 }).catch(() => {});
    const openState = await page.evaluate(() => {
      const topbar = document.querySelector('.arena-mobile-topbar');
      const brand = document.querySelector('.arena-mobile-brand');
      const toggle = document.querySelector('.arena-mobile-nav-toggle');
      const menu = document.querySelector('.arena-mobile-menu');
      const profile = document.querySelector('.arena-mobile-menu-profile');
      const inactiveLink = menu?.querySelector('.arena-mobile-menu-link:not(.arena-mobile-menu-link-active)');
      let activeLink = menu?.querySelector('.arena-mobile-menu-link-active');
      let activeFixture = null;
      if (!activeLink && menu) {
        activeFixture = document.createElement('a');
        activeFixture.className = 'arena-mobile-menu-link arena-mobile-menu-link-active';
        activeFixture.setAttribute('aria-hidden', 'true');
        activeFixture.style.visibility = 'hidden';
        menu.append(activeFixture);
        activeLink = activeFixture;
      }
      const section = menu?.querySelector('.arena-mobile-menu-section');
      const rect = profile?.getBoundingClientRect();
      const topbarStyles = topbar ? getComputedStyle(topbar) : null;
      const toggleStyles = toggle ? getComputedStyle(toggle) : null;
      const menuStyles = menu ? getComputedStyle(menu) : null;
      const inactiveLinkStyles = inactiveLink ? getComputedStyle(inactiveLink) : null;
      const activeLinkStyles = activeLink ? getComputedStyle(activeLink) : null;
      const profileStyles = profile ? getComputedStyle(profile) : null;
      const activeContract = {
        borderColor: activeLinkStyles?.borderLeftColor || '',
        color: activeLinkStyles?.color || '',
        background: activeLinkStyles?.backgroundColor || '',
        beforeDisplay: activeLink ? getComputedStyle(activeLink, '::before').display : '',
      };
      activeFixture?.remove();
      return {
        bodyPosition: getComputedStyle(document.body).position,
        htmlOverflow: getComputedStyle(document.documentElement).overflow,
        profileWidth: rect?.width || 0,
        profileRight: rect?.right || 0,
        viewportWidth: innerWidth,
        constructors: Boolean(document.querySelector('[aria-controls="arena-mobile-constructors"]')),
        misc: Boolean(document.querySelector('[aria-controls="arena-mobile-misc"]')),
        avatarFallback: document.querySelector('.auth-avatar > span')?.textContent || '',
        avatarImageHidden: getComputedStyle(document.querySelector('.auth-avatar img')).display === 'none',
        avatarFrame: getComputedStyle(document.querySelector('.auth-avatar')).backgroundImage,
        avatarSurface: getComputedStyle(document.querySelector('.auth-avatar > span')).backgroundImage,
        missingRoutes: [
          '/articles', '/standard/matchups', '/classes', '/tierlist', '/legendaries',
          '/heroes', '/library', '/battlegrounds/tier-list', '/battlegrounds/strategies',
          '/battlegrounds/tier-builder', '/gallery', '/guides-archive', '/contests',
        ].filter(path => !document.querySelector(`#arena-mobile-menu a[href="${path}"]`)),
        toggleSize: (() => {
          const toggleRect = toggle?.getBoundingClientRect();
          return { width: toggleRect?.width || 0, height: toggleRect?.height || 0 };
        })(),
        topbarMinHeight: topbarStyles?.minHeight || '',
        topbarBorder: topbarStyles?.borderBottomWidth || '',
        topbarBorderImage: topbarStyles?.borderImageSource || '',
        topbarBorderImageWidth: topbarStyles?.borderImageWidth || '',
        topbarColor: topbarStyles?.color || '',
        topbarBackground: topbarStyles?.backgroundImage || '',
        topbarShadow: topbarStyles?.boxShadow || '',
        topbarBackdrop: topbarStyles?.backdropFilter || '',
        brandColor: brand ? getComputedStyle(brand).color : '',
        brandSize: brand ? getComputedStyle(brand).fontSize : '',
        toggleBorder: toggleStyles?.borderTopColor || '',
        toggleRadius: toggleStyles?.borderRadius || '',
        toggleColor: toggleStyles?.color || '',
        toggleBackground: toggleStyles?.backgroundColor || '',
        toggleShadow: toggleStyles?.boxShadow || '',
        menuTop: menuStyles?.top || '',
        menuGap: menuStyles?.gap || '',
        menuPadding: menuStyles?.padding || '',
        menuBorder: menuStyles?.borderTopWidth || '',
        menuBorderImage: menuStyles?.borderImageSource || '',
        menuBorderImageWidth: menuStyles?.borderImageWidth || '',
        menuRadius: menuStyles?.borderRadius || '',
        menuBackground: menuStyles?.backgroundImage || '',
        menuShadow: menuStyles?.boxShadow || '',
        menuBackdrop: menuStyles?.backdropFilter || '',
        linkMinHeight: inactiveLinkStyles?.minHeight || '',
        linkPadding: inactiveLinkStyles?.padding || '',
        linkBorderTop: inactiveLinkStyles?.borderTopWidth || '',
        linkBorderLeft: inactiveLinkStyles?.borderLeftWidth || '',
        linkRadius: inactiveLinkStyles?.borderRadius || '',
        linkColor: inactiveLinkStyles?.color || '',
        linkBackground: inactiveLinkStyles?.backgroundColor || '',
        linkSize: inactiveLinkStyles?.fontSize || '',
        linkWeight: inactiveLinkStyles?.fontWeight || '',
        linkShadow: inactiveLinkStyles?.textShadow || '',
        activeBorderColor: activeContract.borderColor,
        activeColor: activeContract.color,
        activeBackground: activeContract.background,
        activeBeforeDisplay: activeContract.beforeDisplay,
        sectionText: section?.textContent?.trim() || '',
        sectionMarginTop: section ? getComputedStyle(section).marginTop : '',
        sectionColor: section ? getComputedStyle(section).color : '',
        sectionSize: section ? getComputedStyle(section).fontSize : '',
        profilePosition: profileStyles?.position || '',
        profileMinHeight: profileStyles?.minHeight || '',
        profilePadding: profileStyles?.padding || '',
        profileOverflow: profileStyles?.overflow || '',
        profileBorder: profileStyles?.borderTopWidth || '',
        profileRadius: profileStyles?.borderRadius || '',
        profileColor: profileStyles?.color || '',
        profileBackground: profileStyles?.backgroundImage || '',
        profileShadow: profileStyles?.boxShadow || '',
        profileAfterDisplay: profile ? getComputedStyle(profile, '::after').display : '',
        undersizedControls: [...document.querySelectorAll('#arena-mobile-menu a[href], #arena-mobile-menu button:not([disabled])')]
          .filter(element => !element.closest('[hidden]'))
          .map(element => element.getBoundingClientRect())
          .filter(rect => rect.width < 44 || rect.height < 44)
          .length,
      };
    });
    if (openState.bodyPosition !== 'fixed' || openState.htmlOverflow !== 'hidden') failures.push('mobile menu: background is not scroll-locked');
    if (openState.sectionText !== 'Традиционный режим') failures.push(`mobile menu: unexpected first section label ${openState.sectionText}`);
    if (!openState.profileWidth || openState.profileRight > openState.viewportWidth + 1) failures.push('mobile menu: profile control frame overflows');
    if (!openState.constructors || !openState.misc) failures.push('mobile menu: grouped navigation controls are missing');
    if (openState.missingRoutes.length) failures.push(`mobile menu: missing routes ${openState.missingRoutes.join(', ')}`);
    if (openState.avatarFallback !== 'QS' || !openState.avatarImageHidden) failures.push('mobile menu: broken avatar did not fall back to user initials');
    if (!openState.avatarFrame.includes('conic-gradient') || !openState.avatarSurface.includes('radial-gradient')) failures.push('mobile menu: branded avatar frame or personalized surface is missing');
    if (openState.toggleSize.width < 44 || openState.toggleSize.height < 44) failures.push(`mobile menu: toggle target is ${openState.toggleSize.width}×${openState.toggleSize.height}`);
    if (openState.undersizedControls) failures.push(`mobile menu: ${openState.undersizedControls} visible controls are smaller than 44×44`);
    if (openState.topbarMinHeight !== '61px'
      || openState.topbarBorder !== '10px'
      || !openState.topbarBorderImage.includes('main-page-rail-border.png')
      || openState.topbarBorderImageWidth !== '0 0 10px'
      || openState.topbarColor !== 'rgb(255, 241, 202)'
      || !openState.topbarBackground.includes('arena-rail-red.jpg')
      || openState.topbarShadow === 'none'
      || openState.topbarBackdrop !== 'none'
      || openState.brandColor !== 'rgb(255, 240, 196)'
      || openState.brandSize !== '18.88px'
      || openState.toggleBorder !== 'rgb(241, 210, 126)'
      || openState.toggleRadius !== '4px'
      || openState.toggleColor !== 'rgb(255, 239, 199)'
      || openState.toggleBackground !== 'rgba(45, 4, 7, 0.62)'
      || openState.toggleShadow === 'none'
      || openState.menuTop !== '70px'
      || openState.menuGap !== '3.2px'
      || openState.menuPadding !== '12px 12.8px'
      || openState.menuBorder !== '7px'
      || !openState.menuBorderImage.includes('main-page-rail-border.png')
      || openState.menuBorderImageWidth !== '7px'
      || openState.menuRadius !== '2px'
      || !openState.menuBackground.includes('arena-rail-red.jpg')
      || openState.menuShadow === 'none'
      || openState.menuBackdrop !== 'none'
      || openState.linkMinHeight !== '44px'
      || openState.linkPadding !== '9.28px 10.88px'
      || openState.linkBorderTop !== '0px'
      || openState.linkBorderLeft !== '3px'
      || openState.linkRadius !== '2px'
      || openState.linkColor !== 'rgb(248, 223, 173)'
      || openState.linkBackground !== 'rgba(0, 0, 0, 0)'
      || openState.linkSize !== '15.04px'
      || openState.linkWeight !== '700'
      || openState.linkShadow === 'none'
      || openState.activeBorderColor !== 'rgb(217, 171, 73)'
      || openState.activeColor !== 'rgb(255, 246, 220)'
      || openState.activeBackground !== 'rgba(48, 4, 7, 0.42)'
      || openState.activeBeforeDisplay !== 'none'
      || openState.sectionMarginTop !== '10.4px'
      || openState.sectionColor !== 'rgb(223, 182, 95)'
      || openState.sectionSize !== '10.08px'
      || openState.profilePosition !== 'relative'
      || openState.profileMinHeight !== '50px'
      || openState.profilePadding !== '10.88px 12.8px'
      || openState.profileOverflow !== 'hidden'
      || openState.profileBorder !== '1px'
      || openState.profileRadius !== '2px'
      || openState.profileColor !== 'rgb(255, 240, 200)'
      || openState.profileBackground === 'none'
      || openState.profileShadow === 'none'
      || openState.profileAfterDisplay !== 'none') {
      failures.push(`mobile menu: parchment visual contract changed (${JSON.stringify(openState)})`);
    }
    await auditAccessibility(page, 'mobile menu open');
    await page.screenshot({ path: `${OUT}/mobile-menu-open.png`, fullPage: false });

    stage = 'forward focus trap';
    await page.evaluate(() => {
      const menu = document.querySelector('#arena-mobile-menu');
      const visible = [...menu.querySelectorAll('a[href], button:not([disabled])')]
        .filter(element => !element.closest('[hidden]'));
      visible.at(-1)?.focus();
    });
    await page.keyboard.press('Tab');
    const cycledToFirst = await page.evaluate(() => document.activeElement === document.querySelector('#arena-mobile-menu a[href], #arena-mobile-menu button:not([disabled])'));
    if (!cycledToFirst) failures.push('mobile menu: Tab escaped instead of cycling to the first control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('Tab');
    await page.keyboard.up('Shift');
    const cycledToLast = await page.evaluate(() => {
      const visible = [...document.querySelectorAll('#arena-mobile-menu a[href], #arena-mobile-menu button:not([disabled])')]
        .filter(element => !element.closest('[hidden]'));
      return document.activeElement === visible.at(-1);
    });
    if (!cycledToLast) failures.push('mobile menu: Shift+Tab escaped instead of cycling to the last control');
    stage = 'escape close and restore';
    await page.keyboard.press('Escape');
    await page.waitForSelector('.arena-mobile-menu', { hidden: true });
    await page.waitForFunction(() => document.activeElement?.classList.contains('arena-mobile-nav-toggle'), { timeout: 5_000 });

    stage = 'backdrop close';
    await page.click('.arena-mobile-nav-toggle');
    await page.waitForSelector('.arena-mobile-menu', { visible: true });
    await page.click('.arena-mobile-drawer-backdrop');
    await page.waitForSelector('.arena-mobile-menu', { hidden: true });
    const closedPosition = await page.evaluate(() => getComputedStyle(document.body).position);
    if (closedPosition === 'fixed') failures.push('mobile menu: scroll lock was not released');
    await page.screenshot({ path: `${OUT}/mobile-menu-closed.png`, fullPage: false });
    console.log('✓ mobile menu interaction and scroll lock');
  } catch (error) {
    const active = await page.evaluate(() => ({
      tag: document.activeElement?.tagName || '',
      className: document.activeElement?.className || '',
      label: document.activeElement?.getAttribute('aria-label') || '',
    })).catch(() => ({}));
    failures.push(`mobile menu [${stage}]: ${error.message}; active=${JSON.stringify(active)}`);
  } finally {
    await page.close();
  }
}

async function assertCardLightboxPresentation(page, label, expectedColumns) {
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.card-modal-lightbox')).opacity === '1');
  const material = await page.evaluate(() => {
    const element = selector => document.querySelector(selector);
    const style = selector => getComputedStyle(element(selector));
    const rect = selector => {
      const bounds = element(selector).getBoundingClientRect();
      return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
    };
    const backdrop = style('.card-modal-backdrop');
    const shell = style('.card-modal-shell');
    const stats = style('.card-modal-stats');
    const close = style('.card-modal-close');
    const inlineOwners = [
      '.card-modal-lightbox',
      '.card-modal-backdrop',
      '.card-modal-shell',
      '.card-modal-image',
      '.card-modal-close',
    ].filter(selector => element(selector)?.hasAttribute('style'));
    return {
      backdropImage: backdrop.backgroundImage,
      shellImage: shell.backgroundImage,
      shellBorderImage: shell.borderImageSource,
      shellBorderWidth: Number.parseFloat(shell.borderTopWidth),
      shellColumnCount: shell.gridTemplateColumns.split(' ').filter(Boolean).length,
      statsBackground: stats.backgroundColor,
      closeBackground: close.backgroundImage,
      closeSize: [close.width, close.height],
      shellRect: rect('.card-modal-shell'),
      imageRect: rect('.card-modal-image'),
      statsRect: rect('.card-modal-stats'),
      viewport: { width: innerWidth, height: innerHeight },
      inlineOwners,
    };
  });
  const prefix = `lightbox ${label}`;
  if (!material.backdropImage.includes('arena-rail-red.jpg')) failures.push(`${prefix}: canonical red backdrop texture is missing`);
  if (!material.shellImage.includes('arena-rail-red.jpg')) failures.push(`${prefix}: canonical red panel texture is missing`);
  if (!material.shellBorderImage.includes('main-page-rail-border.png') || material.shellBorderWidth < 9) failures.push(`${prefix}: wooden panel frame is missing`);
  if (material.shellColumnCount !== expectedColumns) failures.push(`${prefix}: expected ${expectedColumns} grid columns, received ${material.shellColumnCount}`);
  if (material.statsBackground !== 'rgba(45, 3, 7, 0.56)') failures.push(`${prefix}: unexpected stats material ${material.statsBackground}`);
  if (!material.closeBackground.includes('linear-gradient')) failures.push(`${prefix}: shared close-button material is missing`);
  if (material.closeSize[0] !== '44px' || material.closeSize[1] !== '44px') failures.push(`${prefix}: close target is ${material.closeSize.join(' × ')}`);
  if (material.inlineOwners.length) failures.push(`${prefix}: presentation leaked back into inline styles (${material.inlineOwners.join(', ')})`);
  for (const [name, bounds] of [['shell', material.shellRect], ['image', material.imageRect], ['stats', material.statsRect]]) {
    if (bounds.width <= 0 || bounds.height <= 0) failures.push(`${prefix}: ${name} has no rendered area`);
    if (bounds.left < -1 || bounds.top < -1 || bounds.right > material.viewport.width + 1 || bounds.bottom > material.viewport.height + 1) {
      failures.push(`${prefix}: ${name} escapes the viewport (${JSON.stringify(bounds)})`);
    }
  }
}

async function assertCardTooltipPresentation(page, label) {
  await page.hover('.hs-tier-card');
  await page.waitForSelector('.card-stats-tooltip--parchment', { visible: true });
  const material = await page.evaluate(() => {
    const tooltip = document.querySelector('.card-stats-tooltip--parchment');
    const header = tooltip.querySelector('.card-stats-tooltip-header');
    const row = tooltip.querySelector('.card-stats-tooltip-row');
    const bounds = tooltip.getBoundingClientRect();
    const tooltipStyle = getComputedStyle(tooltip);
    const headerStyle = getComputedStyle(header);
    const rowStyle = getComputedStyle(row);
    return {
      borderImage: tooltipStyle.borderImageSource,
      borderWidth: Number.parseFloat(tooltipStyle.borderTopWidth),
      background: tooltipStyle.backgroundImage,
      headerBackground: headerStyle.backgroundImage,
      rowBackground: rowStyle.backgroundColor,
      rowRadius: rowStyle.borderRadius,
      rect: { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height },
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const prefix = `card tooltip ${label}`;
  if (!material.borderImage.includes('main-page-rail-border.png') || material.borderWidth < 8) failures.push(`${prefix}: wooden frame is missing`);
  if (!material.background.includes('arena-parchment.jpg')) failures.push(`${prefix}: parchment surface is missing`);
  if (!material.headerBackground.includes('arena-rail-red.jpg')) failures.push(`${prefix}: red header texture is missing`);
  if (material.rowBackground !== 'rgba(255, 244, 216, 0.28)' || material.rowRadius !== '0px') failures.push(`${prefix}: row material changed`);
  if (material.rect.width <= 0 || material.rect.height <= 0) failures.push(`${prefix}: preview has no rendered area`);
  if (material.rect.left < -1 || material.rect.top < -1 || material.rect.right > material.viewport.width + 1 || material.rect.bottom > material.viewport.height + 1) {
    failures.push(`${prefix}: preview escapes the viewport (${JSON.stringify(material.rect)})`);
  }
}

for (const [label, viewport] of [
  ['desktop', { width: 1280, height: 720 }],
  ['compact desktop', { width: 1024, height: 640 }],
]) {
  const page = await createQaPage();
  await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/tierlist`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Тир-лист');
    await page.waitForSelector('.hs-tier-card');
    await assertCardTooltipPresentation(page, label);
    await page.$eval('.hs-tier-card', element => element.click());
    await page.waitForSelector('.card-modal-lightbox', { visible: true });
    await assertCardLightboxPresentation(page, label, 2);
    await page.click('.card-modal-lightbox [aria-label="Закрыть"]');
    await page.waitForSelector('.card-modal-lightbox', { hidden: true });
    console.log(`✓ ${label} lightbox material and geometry`);
  } catch (error) {
    failures.push(`${label} lightbox: ${error.message}`);
  } finally {
    await page.close();
  }
}

// Card lightbox: opening it must freeze the underlying mobile document and
// closing it must restore both the scroll position and inline styles.
{
  const page = await createQaPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await mockApplicationApi(page, { authenticated: true });
  try {
    await page.goto(`${BASE}/tierlist`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForMeaningfulPage(page, 'Тир-лист');
    await page.waitForSelector('.hs-tier-card');
    await page.evaluate(() => window.scrollTo(0, 650));
    await new Promise(resolve => setTimeout(resolve, 150));
    await page.$eval('.hs-tier-card', element => element.click());
    await page.waitForSelector('.card-modal-lightbox', { visible: true });
    await auditAccessibility(page, 'mobile lightbox open', '.card-modal-lightbox');
    await assertCardLightboxPresentation(page, 'mobile', 1);
    const locked = await page.evaluate(() => ({
      bodyPosition: getComputedStyle(document.body).position,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
      bodyTop: document.body.style.top,
      scrollY: window.scrollY,
    }));
    await page.evaluate(() => window.scrollBy(0, 500));
    const afterAttempt = await page.evaluate(() => ({ bodyTop: document.body.style.top, scrollY: window.scrollY }));
    if (locked.bodyPosition !== 'fixed' || locked.htmlOverflow !== 'hidden') failures.push('lightbox: background is not scroll-locked');
    if (afterAttempt.bodyTop !== locked.bodyTop || afterAttempt.scrollY !== locked.scrollY) failures.push('lightbox: background moved while open');
    await page.click('.card-modal-lightbox [aria-label="Закрыть"]');
    await page.waitForSelector('.card-modal-lightbox', { hidden: true });
    const restored = await page.evaluate(() => ({ position: getComputedStyle(document.body).position, scrollY: window.scrollY }));
    if (restored.position === 'fixed') failures.push('lightbox: body remained fixed after close');
    if (restored.scrollY < 500) failures.push(`lightbox: scroll position was not restored (${restored.scrollY})`);
    console.log('✓ mobile lightbox scroll lock and restore');
  } catch (error) {
    const diagnostic = await page.evaluate(() => document.body?.innerText.slice(0, 240).replace(/\s+/g, ' ') || 'empty body').catch(() => 'unavailable body');
    failures.push(`mobile lightbox: ${error.message}; page: ${diagnostic}`);
  } finally {
    await page.close();
  }
}

await browser.close();

if (failures.length) {
  console.error('\nE2E QA FAILURES:');
  failures.forEach(failure => console.error(`  ✗ ${failure}`));
  process.exit(1);
}

console.log(`\nAll authenticated/mobile E2E checks passed. Screenshots: ${OUT}`);

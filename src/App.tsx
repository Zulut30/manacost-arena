/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { X, Menu, ChevronDown, Grid3X3, LogIn, UserCircle, Gift } from 'lucide-react';
import { getCanonicalRedirectUrl } from './config/domain';
import { usePageScrollLock } from './hooks/usePageScrollLock';
import AuthAvatar from './components/AuthAvatar';
import {
  ADMIN_ONLY_TAB_IDS,
  ADMIN_TABS,
  applyPageMeta,
  ARENA_TABS,
  BG_BUILDER_TABS,
  BG_PRIMARY_TABS,
  BG_TAB_IDS,
  MISC_TABS,
  PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS,
  STANDARD_TABS,
  tabFromPath,
  TABS,
  TOP_LEVEL_TABS,
  type TabId,
} from './routes';
import {
  clientRouteView,
  historyRouteKnowledge,
  initialClientRouteResolution,
  normalizeClientRoutePath,
  settledClientRouteResolution,
  shouldPreserveInitialServerMeta,
  withHistoryRouteKnowledge,
} from './routing/clientRouteResolution';
import { publicProfileIdFromPath } from './profileRoutes';
// Preserve authoritative entity metadata/404 context through the first client
// pass. The marker belongs only to the URL that bootstrapped this document.
const BOOTSTRAP_ROUTE_ROOT = globalThis.document?.getElementById('root');
const INITIAL_SERVER_ROUTE_STATUS = BOOTSTRAP_ROUTE_ROOT?.dataset.routeStatus;
const INITIAL_SERVER_META_HINT = INITIAL_SERVER_ROUTE_STATUS
  ? normalizeClientRoutePath(location.pathname)
  : null;
delete BOOTSTRAP_ROUTE_ROOT?.dataset.routeStatus;

// ─── Types ────────────────────────────────────────────────────────────────────
interface ClassData {
  id: string;
  name: string;
  winrate: number;
  color: string;
  textDark?: boolean;
  games?: number;
}

type TierlistSource = 'hsreplay' | 'heartharena' | 'firestone';
type LegendarySource = 'hsreplay' | 'firestone';
const TIERLIST_SOURCES: readonly TierlistSource[] = ['hsreplay', 'heartharena', 'firestone'];

/** Per-card enrichment data (images, stats) stored globally in tierlist.json */
interface CardLookup {
  cost?: number;
  attack?: number;
  health?: number;
  type?: string;
  imageHa: string;       // HearthArena CDN — Russian
  imageRu: string | null; // Blizzard API    — Russian (premium)
  // Authoritative rarity from cards_ru.json (optional, overrides TierCard.rarity when present)
  rarityDb?: string;
}

/** Minimal card entry inside a tier */
interface TierCard {
  name:     string;
  score:    number;
  rarity:   string;
  cardId:   string;
  classKey: string;   // 'any' = neutral, else class-specific
  source?:  TierlistSource;
  statsContext?: 'tierlist' | 'legendary';
  winrate?: number;   // HSReplay deck winrate (%)
  deckWinrate?: number | null;
  pickRate?: number | null;
  playedWinrate?: number | null;
  inDecks?: number | null;
  totalGames?: number | null;
  arenaScore?: number | null;
  offerRate?: number | null;
  discardRate?: number | null;
  drawnWinrate?: number | null;
  mulliganWinrate?: number | null;
  keptRate?: number | null;
  avgCopies?: number | null;
}

/** One tier inside a class section */
interface TierSection {
  tier:        string;  // S/A/B/C/D/E/F
  label:       string;  // Отлично/Хорошо/…
  description: string;
  cards:       TierCard[];
}

/** One class section (12 total: dk, dh, druid, … neutral) */
interface ClassSection {
  id:         string;
  name:       string;
  color:      string;
  textDark:   boolean;
  classPosition?: string;
  tiers:      TierSection[];
  totalCards: number;
}

interface LegendaryCard {
  cardId: string;
  name: string;
  cost?: number;
  type?: string;
  rarity?: string;
  classKey?: string;
  source?: TierlistSource;
  statsContext?: 'tierlist' | 'legendary';
  winrate?: number;
  deckWinrate?: number | null;
  pickRate?: number | null;
  playedWinrate?: number | null;
  inDecks?: number | null;
  arenaScore?: number | null;
  offerRate?: number | null;
  discardRate?: number | null;
  drawnWinrate?: number | null;
  mulliganWinrate?: number | null;
  keptRate?: number | null;
  avgCopies?: number | null;
  totalGames?: number | null;
  count?: number;
  imageHa?: string;
  imageRu?: string | null;
}
interface LegendaryGroup {
  keyCard: LegendaryCard;
  cards: LegendaryCard[];
  winRate: number | null;
  pickRate?: number | null;
  offerRate?: number | null;
  score?: number | null;
  byClass?: Record<string, {
    winRate: number | null;
    pickRate: number | null;
    offerRate: number | null;
    score: number | null;
  }>;
  classKey: string;
}
interface LegendariesData {
  groups: LegendaryGroup[];
  updatedAt: string | null;
  source: string;
  warning?: string;
}

interface WinratesData {
  classes: ClassData[];
  updatedAt: string | null;
  source: string;
}

interface TierlistData {
  sections:  ClassSection[];
  cards:     Record<string, CardLookup>;
  classPositions?: Record<string, string>;
  updatedAt: string | null;
  source:    string;
  warning?: string;
  data_phase?: string;
  provisional?: boolean;
  accepted_rows?: number;
  baseline_rows?: number;
  coverage_ratio?: number;
  minimum_sample?: number;
  patch_window?: string | Record<string, unknown>;
}

interface HomeSummaryCard {
  cardId: string;
  name: string;
  score?: number;
  rarity?: string;
  tier?: string;
  classKey?: string;
  cost?: number;
  imageRu?: string | null;
  imageHa?: string;
}

interface HomeSummaryLegendary {
  cardId: string;
  name: string;
  cost?: number;
  imageRu?: string | null;
  imageHa?: string;
  winRate: number | null;
  classKey: string;
}

interface HomeBattlegroundSpotlight {
  dbfId: number;
  name: string;
  image: string;
  tier: string;
  avgPlacement: number;
  pickRate: number | null;
  placementDistribution: number[];
  heroPower?: {
    name?: string;
    text?: string;
    image?: string;
  };
  updatedAt?: string | null;
  source?: string;
}

interface HomeSummaryData {
  topClasses: ClassData[];
  topCards: HomeSummaryCard[];
  topLegendaries: HomeSummaryLegendary[];
  battlegroundSpotlight?: HomeBattlegroundSpotlight | null;
  updatedAt: {
    winrates: string | null;
    tierlist: string | null;
    legendaries: string | null;
    battlegrounds?: string | null;
  };
  sources?: Record<string, string>;
  warning?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function latestHomeSummaryUpdatedAt(summary: HomeSummaryData | null): string | null {
  const updatedAt = summary?.updatedAt;
  if (!updatedAt) return null;
  return [updatedAt.winrates, updatedAt.tierlist, updatedAt.legendaries]
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function currentAppAssetPath(): string | null {
  if (typeof document === 'undefined') return null;
  const script = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]'))
    .find(el => /\/assets\/index-[^/]+\.js(?:\?|$)/.test(el.src));
  if (!script) return null;
  try {
    return new URL(script.src, window.location.href).pathname;
  } catch {
    return script.getAttribute('src');
  }
}

function appAssetPathFromHtml(html: string): string | null {
  return html.match(/\/assets\/index-[^"']+\.js/)?.[0] ?? null;
}

async function resolveReferralTarget(slug: string, landingPath: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(`/api/referrals/track/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ landingPath }),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  return (response.ok && data.targetUrl) || '/';
}

async function fetchLatestAppAsset(pathname: string, signal: AbortSignal): Promise<string | null> {
  const response = await fetch(`${pathname}?build-check=${Date.now()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
  });
  return response.ok ? appAssetPathFromHtml(await response.text()) : null;
}

// ─── Fallback data ────────────────────────────────────────────────────────────
const FALLBACK_CLASSES: ClassData[] = [
  { id: 'dk',      name: 'Рыцарь смерти',     winrate: 56.2, color: '#1f252d' },
  { id: 'paladin', name: 'Паладин',            winrate: 54.8, color: '#a88a45' },
  { id: 'shaman',  name: 'Шаман',              winrate: 53.1, color: '#2a2e6b' },
  { id: 'hunter',  name: 'Охотник',            winrate: 51.5, color: '#1d5921' },
  { id: 'mage',    name: 'Маг',                winrate: 50.2, color: '#2b5c85' },
  { id: 'rogue',   name: 'Разбойник',          winrate: 49.8, color: '#333333' },
  { id: 'warlock', name: 'Чернокнижник',       winrate: 48.5, color: '#5c265c' },
  { id: 'druid',   name: 'Друид',              winrate: 47.2, color: '#704a16' },
  { id: 'warrior', name: 'Воин',               winrate: 46.1, color: '#7a1e1e' },
  { id: 'priest',  name: 'Жрец',               winrate: 44.5, color: '#d1d1d1', textDark: true },
  { id: 'dh',      name: 'Охотник на демонов', winrate: 43.2, color: '#224722' },
];
type AuthUser = {
  id?: string;
  profileId?: string;
  publicProfileId?: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | string;
  country?: string;
  newsletterOptIn?: boolean;
  avatarInitials?: string;
  telegramUsername?: string;
  photoUrl?: string;
  contactVkUrl?: string;
  contactTelegram?: string;
  contactEmail?: string;
  adminAllowed?: boolean;
  contestAdminAllowed?: boolean;
};

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function fetchCurrentAuthUser(signal: AbortSignal): Promise<AuthUser | null> {
  let lastError: unknown = new Error('Не удалось проверить текущую сессию');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось проверить текущую сессию');
      if (!data.user) return null;
      return {
        ...data.user,
        adminAllowed: Boolean(data.user.adminAllowed ?? data.adminAllowed),
        contestAdminAllowed: Boolean(data.user.contestAdminAllowed ?? data.contestAdminAllowed),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error;
      if (attempt < 2) await abortableDelay(350 * (attempt + 1), signal);
    }
  }
  throw lastError;
}

type SubscriptionStatus = {
  hasAccess: boolean;
  source: string;
  checkedAt: string | null;
  stale: boolean;
  message: string;
  entitlements?: {
    arena?: boolean;
    battlegrounds?: boolean;
    standard?: boolean;
    contests?: boolean;
    guidesArchive?: boolean;
    arenaArticles?: boolean;
    battlegroundsArticles?: boolean;
  };
  boosty: {
    checked?: boolean;
    found?: boolean;
    hasAccess?: boolean;
    email?: string;
    price?: number;
    levelName?: string;
    message?: string;
  };
  telegram: {
    checked?: boolean;
    hasAccess?: boolean;
    username?: string;
    message?: string;
    chats?: Array<{ chatId: string; ok: boolean; status?: string; isMember?: boolean; error?: string }>;
  };
  patreon: { configured?: boolean; connected?: boolean; checked?: boolean; hasAccess?: boolean; tierTitles?: string[]; highestTierAmountCents?: number; message?: string };
};
type SubscriptionEntitlementKey = keyof NonNullable<SubscriptionStatus['entitlements']>;

function hasSubscriptionEntitlement(
  subscription: SubscriptionStatus | null | undefined,
  entitlement: SubscriptionEntitlementKey | null,
): boolean {
  if (!subscription) return false;
  if (!entitlement) return Boolean(subscription.hasAccess);
  return Boolean(subscription.entitlements?.[entitlement]);
}

type TelegramAuthPayload = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number | string;
  hash: string;
};

declare global {
  interface Window {
    onHsArenaTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

const LEGACY_AUTH_TOKEN_KEY = 'hs_arena_auth_token';
const AUTH_SESSION_HINT_KEY = 'hs_arena_auth_cookie_hint';

function hasAuthSessionHint(): boolean {
  try {
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    return localStorage.getItem(AUTH_SESSION_HINT_KEY) === '1';
  } catch { return false; }
}

function markAuthSessionHint(): void {
  try {
    localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}

function clearAuthSessionHint(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    sessionStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
  } catch { /* storage may be disabled */ }
}



function HeaderProfileButton({ user, checking = false }: { user: AuthUser | null; checking?: boolean }) {
  const label = user || checking ? 'Профиль' : 'Войти';
  const hint = checking && !user
    ? 'Проверяем доступ'
    : user
      ? (user.name && user.name !== 'Пользователь Манакост' ? user.name : 'Личный кабинет')
      : 'Личный кабинет';

  if (checking && !user) {
    return (
      <span className="arena-sidebar-profile-content">
        <span className="arena-sidebar-profile-icon">
          <UserCircle size={18} className="opacity-85" />
        </span>
        <span className="arena-sidebar-profile-copy">
          <span className="arena-sidebar-profile-label">{label}</span>
          <span className="arena-sidebar-profile-hint">{hint}</span>
        </span>
      </span>
    );
  }

  if (!user) {
    return (
      <span className="arena-sidebar-profile-content">
        <span className="arena-sidebar-profile-icon">
          <LogIn size={18} className="opacity-85" />
        </span>
        <span className="arena-sidebar-profile-copy">
          <span className="arena-sidebar-profile-label">{label}</span>
          <span className="arena-sidebar-profile-hint">{hint}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="arena-sidebar-profile-content">
      <span className="arena-sidebar-profile-avatar">
        <AuthAvatar user={user} size={34} />
      </span>
      <span className="arena-sidebar-profile-copy">
        <span className="arena-sidebar-profile-label">{label}</span>
        <span className="arena-sidebar-profile-hint">{hint}</span>
      </span>
    </span>
  );
}



// ─── FAQ ──────────────────────────────────────────────────────────────────────

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────


// ─── InternalLinks ────────────────────────────────────────────────────────────


// ─── SectionBanner ────────────────────────────────────────────────────────────


// ─── ArticlesTab ──────────────────────────────────────────────────────────────

interface Article {
  id: string;
  title: string;
  date: string;
  image: string;
  excerpt: string;
  tag?: string;
  mode?: 'arena' | 'battlegrounds' | 'standard' | 'wild' | 'general' | string;
  url: string;
}
interface ArticlesData {
  articles: Article[];
  updatedAt: string | null;
}

interface GalleryItem {
  id: string;
  title: string;
  description?: string;
  tag?: string;
  source?: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  previewUrl: string;
  thumbUrl: string;
  imageUrl: string;
  downloadUrl: string;
  createdAt: string;
  updatedAt?: string;
}

interface GalleryData {
  items: GalleryItem[];
  updatedAt: string | null;
}

// ─── Tab transition wrapper ────────────────────────────────────────────────────
type NavigationRoute = (typeof TABS)[number];

function NavigationRouteLinks({
  routes,
  activeTab,
  variant,
  sublink = false,
  onNavigate,
  onWarm,
}: {
  routes: readonly NavigationRoute[];
  activeTab: TabId;
  variant: 'mobile' | 'sidebar';
  sublink?: boolean;
  onNavigate: (tab: TabId) => void;
  onWarm: (tab: TabId) => void;
}) {
  const classPrefix = variant === 'mobile' ? 'arena-mobile-menu' : 'arena-sidebar';
  const iconSize = sublink ? 17 : variant === 'mobile' ? 18 : 19;

  return routes.map(tab => {
    const Icon = tab.icon;
    const active = activeTab === tab.id;
    return (
      <a
        key={tab.id}
        href={tab.slug}
        onPointerEnter={() => onWarm(tab.id)}
        onPointerDown={() => onWarm(tab.id)}
        onFocus={() => onWarm(tab.id)}
        onClick={(event) => {
          event.preventDefault();
          onNavigate(tab.id);
        }}
        aria-current={active ? 'page' : undefined}
        className={`${classPrefix}-link ${sublink ? `${classPrefix}-sublink ` : ''}${active ? `${classPrefix}-link-active` : ''}`}
        style={variant === 'sidebar' ? { textDecoration: 'none' } : undefined}
      >
        <span className={`${classPrefix}-link-icon flex-shrink-0`} aria-hidden="true">
          <Icon size={iconSize} strokeWidth={1.8} />
        </span>
        <span>{tab.label}</span>
      </a>
    );
  });
}
const loadDeferredRoutesModule = () => import('./features/DeferredRoutes');
const loadHomeModule = () => import('./features/Home');
const loadFAQPageModule = () => import('./features/FAQPage');
const loadDeveloperApiModule = () => import('./modules/developerApi/public');
const loadBgLibraryModule = () => import('./features/BgLibrary');
const loadGuidesArchiveModule = () => import('./features/GuidesArchive');
const loadCosmeticsModule = () => import('./features/Cosmetics');
const loadGalleryModule = () => import('./features/GalleryTab');
const loadStandardMatchupsModule = () => import('./features/StandardMatchups');
const loadStandardMetaModule = () => import('./features/StandardMeta');
const loadConstructedArchetypesModule = () => import('./features/ConstructedArchetypes');
const loadViciousSyndicateGoldModule = () => import('./features/ViciousSyndicateGold');
const loadStandardCardsModule = () => import('./features/StandardCards');
const loadFunDecksModule = () => import('./features/FunDecksPage');
const loadContestsModule = () => import('./features/Contests');
const loadBattlegroundsModule = () => import('./features/Battlegrounds');
const LazyPaywallGate = React.lazy(() => import('./components/PaywallGate'));
const LazyGlobalUtilityHeader = React.lazy(() => import('./components/GlobalUtilityHeader'));
const LazyFAQSection = React.lazy(() => import('./components/FAQSection'));
const LazySupportPrompt = React.lazy(() => import('./components/SupportPrompt'));
const LazySiteFooter = React.lazy(() => import('./components/SiteFooter'));
const LazyHomeTab = React.lazy(loadHomeModule);
const LazyFAQPage = React.lazy(loadFAQPageModule);
const LazyDeveloperApiPage = React.lazy(() => loadDeveloperApiModule().then(module => ({ default: module.DeveloperApiPage })));
const LazyAccountRoute = React.lazy(() => import('./modules/accountRoute/public'));
const LazyNotFoundPage = React.lazy(() => import('./features/NotFoundPageRoute'));
const LazyWinrates = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.Winrates })));
const LazyTierList = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.TierList })));
const LazyLegendaries = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.Legendaries })));
const LazyArticlesTab = React.lazy(() => loadDeferredRoutesModule().then(module => ({ default: module.ArticlesTab })));
const LazyGalleryTab = React.lazy(loadGalleryModule);
const LazyBgLibrary = React.lazy(loadBgLibraryModule);
const LazyGuidesArchive = React.lazy(loadGuidesArchiveModule);
const LazyCosmetics = React.lazy(loadCosmeticsModule);
const LazyStandardMatchupsPage = React.lazy(loadStandardMatchupsModule);
const LazyStandardMetaPage = React.lazy(loadStandardMetaModule);
const LazyConstructedArchetypesPage = React.lazy(loadConstructedArchetypesModule);
const LazyViciousSyndicateGoldPage = React.lazy(loadViciousSyndicateGoldModule);
const LazyStandardCardsPage = React.lazy(loadStandardCardsModule);
const LazyFunDecksPage = React.lazy(loadFunDecksModule);
const LazyContestsPage = React.lazy(() => loadContestsModule().then(module => ({ default: module.ContestsPage })));
const LazyContestAdminPanel = React.lazy(() => loadContestsModule().then(module => ({ default: module.ContestAdminPanel })));
const loadDeckBuilderModule = () => import('./features/DeckBuilder');
const LazyDeckBuilder = React.lazy(loadDeckBuilderModule);
const loadArchetypesModule = () => import('./features/Archetypes');
const LazyArchetypes = React.lazy(loadArchetypesModule);
const LazyBattlegroundHeroesRoute = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundHeroesRoute })));
const LazyBattlegroundTierList = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundTierList })));
const LazyBattlegroundStrategyBuilderEmbed = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundStrategyBuilderEmbed })));
const LazyBattlegroundTierBuilderEmbed = React.lazy(() => loadBattlegroundsModule().then(module => ({ default: module.BattlegroundTierBuilderEmbed })));
const STANDARD_SOFT_PAYWALL_TABS = new Set<TabId>(['standard-meta', 'constructed-archetypes', 'fun-decks']);
const ROUTE_PRELOADERS: Partial<Record<TabId | 'login', () => Promise<unknown>>> = {
  winrates: loadDeferredRoutesModule,
  tierlist: loadDeferredRoutesModule,
  legendaries: loadDeferredRoutesModule,
  articles: loadDeferredRoutesModule,
  faq: loadFAQPageModule,
  'developer-api': loadDeveloperApiModule,
  gallery: loadGalleryModule,
  login: loadDeferredRoutesModule,
  'admin-panel': loadContestsModule,
  contests: loadContestsModule,
  'deck-builder': loadDeckBuilderModule,
  archetypes: loadArchetypesModule,
  'standard-matchups': loadStandardMatchupsModule,
  'standard-meta': loadStandardMetaModule,
  'constructed-archetypes': loadConstructedArchetypesModule,
  'standard-vicious-gold': loadViciousSyndicateGoldModule,
  'standard-cards': loadStandardCardsModule,
  'fun-decks': loadFunDecksModule,
  'bg-strategies': loadBattlegroundsModule,
  'bg-heroes': loadBattlegroundsModule,
  'bg-tier-list': loadBattlegroundsModule,
  'bg-tier-builder': loadBattlegroundsModule,
  'bg-library': loadBgLibraryModule,
  'guides-archive': loadGuidesArchiveModule,
  cosmetics: loadCosmeticsModule,
};

function preloadRouteModule(route: TabId | 'login'): void {
  void ROUTE_PRELOADERS[route]?.().catch(() => {});
}

function RouteFallback({ minHeight = 520 }: { minHeight?: number }) {
  return (
    <div
      className="route-fallback"
      aria-busy="true"
      aria-label="Загрузка раздела"
      style={{
        minHeight,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#8b6c42',
        fontFamily: 'var(--font-display)',
      }}
    >
      Загрузка...
    </div>
  );
}

// ─── Persistent cache with TTL (survives tab close, expires with data) ────────
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 h — matches server scrape interval
const TIERLIST_CACHE_TTL_MS = 60 * 1000;
const WINRATES_CACHE_KEY: Record<'hsreplay' | 'firestone', string> = {
  hsreplay: 'wr_hsreplay_arena_v2',
  firestone: 'wr_firestone',
};

function cacheGet<T>(key: string, maxAgeMs: number = CACHE_TTL_MS): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw) as { data: T; ts: number };
    if (Date.now() - ts > maxAgeMs) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
}

function cacheSet(key: string, data: unknown): void {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* quota exceeded — ignore */ }
}

function scheduleIdleTask(task: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') return () => {};
  const ric = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout: number }) => number);
  const cic = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
  if (ric && cic) {
    const id = ric(() => task(), { timeout });
    return () => cic(id);
  }
  const id = window.setTimeout(task, Math.min(timeout, 450));
  return () => window.clearTimeout(id);
}

// ─── Conditional fetch with ETag (skips body if data unchanged) ───────────────
async function fetchWithETag(url: string, cacheKey: string): Promise<{ data: any; fresh: boolean } | null> {
	  const etag = localStorage.getItem(`etag_${cacheKey}`);
	  try {
	    const res = await fetch(url, etag ? { cache: 'no-cache', headers: { 'If-None-Match': etag } } : { cache: 'no-cache' });
	    if (res.status === 304) {
        const cached = cacheGet(cacheKey);
        if (cached !== null) return { data: cached, fresh: false };
        localStorage.removeItem(`etag_${cacheKey}`);
        const retry = await fetch(url, { cache: 'no-store' });
        if (!retry.ok) return null;
        const data = await retry.json();
        const retryEtag = retry.headers.get('ETag');
        if (retryEtag) localStorage.setItem(`etag_${cacheKey}`, retryEtag);
        cacheSet(cacheKey, data);
        return { data, fresh: true };
      }
	    if (!res.ok) return null;
    const data = await res.json();
    const newEtag = res.headers.get('ETag');
    if (newEtag) localStorage.setItem(`etag_${cacheKey}`, newEtag);
    cacheSet(cacheKey, data);
    return { data, fresh: true };
  } catch { return null; }
}

function tierlistCacheKey(src: TierlistSource): string {
  return `tl_ru_cards_v3_${src}`;
}

function tierlistBaseUrl(src: TierlistSource): string {
  return `/api/tierlist?source=${src}&v=ru_cards_v3`;
}

async function fetchTierlistSnapshot(src: TierlistSource, bust = false): Promise<TierlistData | null> {
  const cacheKey = tierlistCacheKey(src);
  const baseUrl = tierlistBaseUrl(src);
  const url = bust ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}t=${Date.now()}` : baseUrl;

  if (bust) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json() as TierlistData;
    cacheSet(cacheKey, data);
    const etag = res.headers.get('ETag');
    if (etag) localStorage.setItem(`etag_${cacheKey}`, etag);
    else localStorage.removeItem(`etag_${cacheKey}`);
    return data;
  }

  const result = await fetchWithETag(url, cacheKey);
  return result?.data ?? null;
}

export default function App() {
  const redirectToWwwUrl = getCanonicalRedirectUrl(window.location);
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromPath(window.location.pathname));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileNavGroup, setMobileNavGroup] = useState<'constructors' | 'misc' | null>(null);
  const [sidebarNavGroup, setSidebarNavGroup] = useState<'constructors' | 'misc' | null>(null);
  const mobileMenuRef = useRef<HTMLElement>(null);
  const mobileMenuToggleRef = useRef<HTMLButtonElement>(null);

  const [locationSearch, setLocationSearch] = useState(() => window.location.search);
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [routeResolution, setRouteResolution] = useState(() => initialClientRouteResolution(
    window.location.pathname,
    INITIAL_SERVER_ROUTE_STATUS === '404' ? INITIAL_SERVER_META_HINT : null,
  ));
  const routeView = clientRouteView(routeResolution, currentPath);
  const locationParams = new URLSearchParams(locationSearch);
  const initialMetaPassRef = useRef(true);

  useEffect(() => {
    const known = routeView === 'known' ? true : routeView === 'not-found' ? false : null;
    if (known === null || historyRouteKnowledge(window.history.state) === known) return;
    window.history.replaceState(withHistoryRouteKnowledge(window.history.state, known), '');
  }, [routeView]);

  useEffect(() => {
    let active = true;
    const preserveInitialServerMeta = shouldPreserveInitialServerMeta(
      currentPath,
      INITIAL_SERVER_META_HINT,
      initialMetaPassRef.current,
    );
    const isInitialPlainHome = initialMetaPassRef.current
      && activeTab === 'home'
      && currentPath === '/'
      && locationSearch === '';
    initialMetaPassRef.current = false;
    if (isInitialPlainHome || preserveInitialServerMeta) return undefined;
    void applyPageMeta(activeTab, currentPath, locationSearch)
      .then(policy => {
        if (!active) return;
        // pushState is synchronous, while route metadata resolves asynchronously.
        // Ignore a policy that belongs to the page we just left even when its
        // effect cleanup has not run yet (for example during a startTransition).
        // Otherwise the stale result briefly makes the new route "pending",
        // unmounting it and discarding local filters before the next policy wins.
        if (normalizeClientRoutePath(window.location.pathname) !== policy.normalizedPathname) return;
        setRouteResolution(settledClientRouteResolution(policy.normalizedPathname, policy.known));
      })
      .catch(() => {
        if (active) {
          setRouteResolution(previous => clientRouteView(previous, currentPath) === 'not-found'
            ? previous
            : { pathname: normalizeClientRoutePath(currentPath), status: 'unavailable' });
        }
      });
    return () => { active = false; };
  }, [activeTab, currentPath, locationSearch]);

  useEffect(() => {
    if (redirectToWwwUrl) {
      window.location.replace(redirectToWwwUrl);
    }
  }, [redirectToWwwUrl]);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/r\/([^/]+)\/?$/);
    if (!match) return;
    const slug = decodeURIComponent(match[1] || '');
    const controller = new AbortController();
    const signal = controller.signal;
    const landingPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    void resolveReferralTarget(slug, landingPath, signal)
      .then(targetUrl => {
        if (!signal.aborted) window.location.replace(targetUrl);
      })
      .catch(() => {
        if (!signal.aborted) window.location.replace('/');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    localStorage.removeItem('wr_hsreplay');
    localStorage.removeItem('etag_wr_hsreplay');
  }, []);

  /** Navigate to a tab: update state + browser URL */
  const navigate = useCallback((tab: TabId) => {
    const slug = TABS.find(t => t.id === tab)!.slug;
    preloadRouteModule(tab);
    if (window.location.pathname !== slug || window.location.search || window.location.hash) {
      window.history.pushState({ tab, routeKnown: true }, '', slug);
    }
    React.startTransition(() => {
      setRouteResolution(settledClientRouteResolution(slug, true));
      setLocationSearch('');
      setCurrentPath(slug);
      setActiveTab(tab);
      setMobileMenuOpen(false);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigatePath = useCallback((path: string) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const tab = tabFromPath(normalizedPath);
    preloadRouteModule(tab);
    if (window.location.pathname !== normalizedPath || window.location.search || window.location.hash) {
      window.history.pushState({ tab, routeKnown: true }, '', normalizedPath);
    }
    React.startTransition(() => {
      setRouteResolution(settledClientRouteResolution(normalizedPath, true));
      setLocationSearch('');
      setCurrentPath(normalizedPath);
      setActiveTab(tab);
      setMobileMenuOpen(false);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  const navigateLogin = useCallback(() => {
    preloadRouteModule('login');
    const path = '/';
    const search = '?login';
    if (window.location.pathname !== path || window.location.search !== search || window.location.hash) {
      window.history.pushState({ tab: activeTab, login: true, routeKnown: true }, '', `${path}${search}`);
    }
    React.startTransition(() => {
      setRouteResolution(settledClientRouteResolution(path, true));
      setLocationSearch(search);
      setCurrentPath(path);
      setMobileMenuOpen(false);
    });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeTab]);

  /** Handle browser back / forward */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const tab = e.state?.tab ?? tabFromPath(window.location.pathname);
      const known = historyRouteKnowledge(e.state);
      React.startTransition(() => {
        if (known !== null) {
          setRouteResolution(settledClientRouteResolution(window.location.pathname, known));
        }
        setLocationSearch(window.location.search);
        setCurrentPath(window.location.pathname);
        setActiveTab(tab);
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const loadedAsset = currentAppAssetPath();
    if (!loadedAsset) return;

    let checking = false;
    let activeController: AbortController | undefined;
    const checkForNewBuild = async () => {
      if (checking || document.visibilityState === 'hidden') return;
      checking = true;
      const controller = new AbortController();
      const signal = controller.signal;
      activeController = controller;
      try {
        const latestAsset = await fetchLatestAppAsset(window.location.pathname, signal);
        if (!signal.aborted && latestAsset && latestAsset !== loadedAsset) {
          window.location.reload();
        }
      } catch {
        // Ignore transient network errors; the next focus/interval will retry.
      } finally {
        checking = false;
      }
    };

    const interval = window.setInterval(checkForNewBuild, 5 * 60 * 1000);
    window.addEventListener('focus', checkForNewBuild);
    document.addEventListener('visibilitychange', checkForNewBuild);
    return () => {
      activeController?.abort();
      window.clearInterval(interval);
      window.removeEventListener('focus', checkForNewBuild);
      document.removeEventListener('visibilitychange', checkForNewBuild);
    };
  }, []);

  // Admin panel: ?admin in URL; access is checked by authenticated user ID.
  const wantsAdmin = locationParams.has('admin');
  const wantsLogin = locationParams.has('login');
  const publicProfileId = publicProfileIdFromPath(currentPath);
  const routeSurfaceAvailable = routeView === 'known';
  const isApplicationConnectPage = normalizeClientRoutePath(currentPath) === '/connect';
  const isAccountRoute = routeSurfaceAvailable && (isApplicationConnectPage || Boolean(publicProfileId) || wantsLogin);
  const isAdminMode = routeSurfaceAvailable && (wantsAdmin || activeTab === 'admin-panel');
  const [appAuthUser, setAppAuthUser] = useState<AuthUser | null>(null);
  const [appAuthChecking, setAppAuthChecking] = useState(true);
  const [appHasAuthHint, setAppHasAuthHint] = useState(() => hasAuthSessionHint());
  const [appSubscription, setAppSubscription] = useState<SubscriptionStatus | null>(null);
  const [appSubscriptionLoading, setAppSubscriptionLoading] = useState(false);
  const appIsContestAdmin = Boolean(appAuthUser && (
    appAuthUser.contestAdminAllowed
    || appAuthUser.adminAllowed
    || appAuthUser.id === 'user_42368c85b8de'
    || appAuthUser.profileId === 'user_42368c85b8de'
  ));
  const appIsAdmin = Boolean(appAuthUser && (
    appAuthUser.adminAllowed
    || appAuthUser.role === 'admin'
    || appAuthUser.id === 'user_42368c85b8de'
    || appAuthUser.profileId === 'user_42368c85b8de'
  ));
  const visibleStandardTabs = STANDARD_TABS;
  const visibleArenaTabs = useMemo(() => ARENA_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || appIsAdmin), [appIsAdmin]);
  const visibleMiscTabs = useMemo(
    () => MISC_TABS.filter(tab => !ADMIN_ONLY_TAB_IDS.has(tab.id) || appIsAdmin),
    [appIsAdmin],
  );

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    let retryTimer: number | null = null;

    const verifySession = () => {
      retryTimer = null;
      setAppAuthChecking(true);
      void fetchCurrentAuthUser(signal).then(user => {
        if (signal.aborted) return;
        if (!user) {
          clearAuthSessionHint();
          setAppHasAuthHint(false);
          setAppAuthUser(null);
          setAppSubscription(null);
          return;
        }
        markAuthSessionHint();
        setAppHasAuthHint(true);
        setAppAuthUser(user);
      })
      .catch(() => {
        if (signal.aborted) return;
        if (hasAuthSessionHint()) {
          // A deploy or a brief upstream failure is not a logout. Keep the
          // profile state pending and retry until the server answers
          // authoritatively with either a user or a guest response.
          setAppHasAuthHint(true);
          retryTimer = window.setTimeout(verifySession, 5_000);
          return;
        }
        clearAuthSessionHint();
        setAppHasAuthHint(false);
        setAppAuthUser(null);
        setAppSubscription(null);
      })
      .finally(() => {
        if (!signal.aborted && retryTimer === null) setAppAuthChecking(false);
      });
    };

    verifySession();
    return () => {
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, []);

  const handleAppAuthChange = useCallback((user: AuthUser | null) => {
    setAppAuthUser(user);
    if (user) markAuthSessionHint();
    else clearAuthSessionHint();
    setAppHasAuthHint(Boolean(user));
    if (!user) setAppSubscription(null);
  }, []);

  const fetchAppSubscription = useCallback(async (force = false) => {
    if (!appAuthUser) {
      setAppSubscription(null);
      return null;
    }
    setAppSubscriptionLoading(true);
    try {
      const res = await fetch(force ? '/api/subscription/refresh' : '/api/subscription/status', {
        method: force ? 'POST' : 'GET',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Request': '1' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw 0;
      setAppSubscription(data);
      return data as SubscriptionStatus;
    } catch {
      setAppSubscription(null);
      return null;
    } finally {
      setAppSubscriptionLoading(false);
    }
  }, [appAuthUser]);

  const activeTabLabel = TABS.find(tab => tab.id === activeTab)?.label || 'Раздел';
  const activeTabEntitlement = PRIVATE_SUBSCRIPTION_TAB_ENTITLEMENTS[activeTab] ?? null;
  const privateRouteActive = Boolean(activeTabEntitlement) && !appIsAdmin;
  const privateRouteChecking = privateRouteActive && (appAuthChecking || (Boolean(appAuthUser) && appSubscriptionLoading && !appSubscription));
  const privateRouteLocked = privateRouteActive
    && !privateRouteChecking
    && !hasSubscriptionEntitlement(appSubscription, activeTabEntitlement);

  const renderPrivateRoute = useCallback((children: React.ReactNode, minHeight = 760) => {
    if (privateRouteChecking) return <RouteFallback minHeight={minHeight} />;
    if (privateRouteLocked) {
      return (
        <React.Suspense fallback={<RouteFallback minHeight={minHeight} />}>
          <LazyPaywallGate
            active
            title={activeTabEntitlement === 'standard'
              ? `${activeTabLabel} доступны с тарифом «Алмаз»`
              : `${activeTabLabel} доступны подписчикам`}
            variant={activeTabEntitlement === 'standard' ? 'standard' : 'default'}
            authUser={appAuthUser}
            subscriptionStatus={appSubscription}
            subscriptionLoading={appSubscriptionLoading}
            onRefreshSubscription={() => fetchAppSubscription(true)}
            previewTitle={activeTabLabel}
          />
        </React.Suspense>
      );
    }
    return children;
  }, [activeTabEntitlement, activeTabLabel, appAuthUser, appSubscription, appSubscriptionLoading, fetchAppSubscription, privateRouteChecking, privateRouteLocked]);

  useEffect(() => {
    if (!appAuthUser) {
      setAppSubscription(null);
      return;
    }
    void fetchAppSubscription(false);
  }, [appAuthUser, fetchAppSubscription]);

  const [winrateSource, setWinrateSource] = useState<'hsreplay' | 'firestone'>('hsreplay');
  const winrateSourceRef = useRef<'hsreplay' | 'firestone'>('hsreplay');
  const [tierlistSource, setTierlistSource] = useState<TierlistSource>('hsreplay');
  const tierlistSourceRef = useRef<TierlistSource>('hsreplay');
  const [switchingTierlistSource, setSwitchingTierlistSource] = useState(false);
  const [legendarySource, setLegendarySource] = useState<LegendarySource>('hsreplay');
  const [switchingLegendarySource, setSwitchingLegendarySource] = useState(false);
  const [winratesData, setWinratesData] = useState<WinratesData>({
    classes: FALLBACK_CLASSES, updatedAt: null, source: 'initial',
  });
  const [tierlistData, setTierlistData] = useState<TierlistData>({
    sections: [], cards: {}, updatedAt: null, source: 'initial',
  });
  const [legendariesData, setLegendariesData] = useState<LegendariesData>({
    groups: [], updatedAt: null, source: 'initial',
  });
  const [homeSummaryData, setHomeSummaryData] = useState<HomeSummaryData | null>(null);
  const [articlesData, setArticlesData] = useState<ArticlesData>({ articles: [], updatedAt: null });
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [galleryData, setGalleryData] = useState<GalleryData>({ items: [], updatedAt: null });
  const [loadingGallery, setLoadingGallery] = useState(false);

  const [loadingWinrates,    setLoadingWinrates]    = useState(false); // false = show fallback immediately
  const [loadingTierlist,    setLoadingTierlist]    = useState(true);
  const [loadingLegendaries, setLoadingLegendaries] = useState(true);
  const [loadingHomeSummary, setLoadingHomeSummary] = useState(true);
  const [errorWinrates,      setErrorWinrates]      = useState(false);
  const [errorTierlist,      setErrorTierlist]      = useState(false);
  const [errorLegendaries,   setErrorLegendaries]   = useState(false);
  const [switchingSource,    setSwitchingSource]    = useState(false);

  // Generation counters prevent race conditions when two fetches run simultaneously
  const wrGenRef = useRef(0);
  const tlGenRef = useRef(0);
  const lgGenRef = useRef(0);
  const homeSummaryGenRef = useRef(0);
  const homeSummaryRequestedRef = useRef(false);
  const articlesRequestedRef = useRef(false);
  const galleryRequestedRef = useRef(false);
  const tierlistRequestedRef = useRef(false);
  const legendariesRequestedRef = useRef(false);
  const warmedTierlistSourcesRef = useRef<Set<TierlistSource>>(new Set());
  const warmedRoutesRef = useRef<Set<TabId | 'login'>>(new Set());

  const fetchHomeSummary = useCallback(async () => {
    const gen = ++homeSummaryGenRef.current;
    const cacheKey = 'home_summary_v2';
    try {
      const cached = cacheGet<HomeSummaryData>(cacheKey, 5 * 60 * 1000);
      if (cached && gen === homeSummaryGenRef.current) {
        setHomeSummaryData(cached);
        setLoadingHomeSummary(false);
      } else if (gen === homeSummaryGenRef.current) {
        setLoadingHomeSummary(true);
      }

      const result = await fetchWithETag('/api/home/summary', cacheKey);
      if (!result?.data) throw new Error('fetch failed');
      if (gen !== homeSummaryGenRef.current) return;
      setHomeSummaryData(result.data);
    } catch {
      // Keep the static winrate fallback; cards/legendaries stay as skeleton-free empty strips.
    } finally {
      if (gen === homeSummaryGenRef.current) setLoadingHomeSummary(false);
    }
  }, []);

  const fetchWinrates = useCallback(async (src: 'hsreplay' | 'firestone' = 'hsreplay') => {
    const gen = ++wrGenRef.current;
    const cacheKey = WINRATES_CACHE_KEY[src];
    try {
      // Show persisted cache instantly (survives tab close)
      const cached = cacheGet<any>(cacheKey);
      if (cached && gen === wrGenRef.current) setWinratesData(cached);
      // Fetch fresh — ETag skips body if unchanged
      const result = await fetchWithETag(`/api/winrates?source=${src}`, cacheKey);
      if (!result || gen !== wrGenRef.current) return;
      setWinratesData(result.data);
      setErrorWinrates(false);
    } catch { if (gen === wrGenRef.current) setErrorWinrates(true); }
    finally  { if (gen === wrGenRef.current) { setLoadingWinrates(false); setSwitchingSource(false); } }
	  }, []);

  const fetchTierlist = useCallback(async (src: TierlistSource = 'hsreplay', bust = false) => {
    const gen = ++tlGenRef.current;
    const cacheKey = tierlistCacheKey(src);
    try {
      // Show persisted cache instantly
      const cached = bust ? null : cacheGet<TierlistData>(cacheKey, TIERLIST_CACHE_TTL_MS);
      if (cached && gen === tlGenRef.current) { setTierlistData(cached); setLoadingTierlist(false); }
      // ETag: only re-download if data actually changed
      const data = await fetchTierlistSnapshot(src, bust);
      if (!data || gen !== tlGenRef.current) return;
      setTierlistData(data);
      setErrorTierlist(false);
    } catch { if (gen === tlGenRef.current) setErrorTierlist(true); }
    finally  { if (gen === tlGenRef.current) { setLoadingTierlist(false); setSwitchingTierlistSource(false); } }
  }, []);

  const warmTierlistSource = useCallback(async (src: TierlistSource) => {
    if (warmedTierlistSourcesRef.current.has(src)) return;
    const cached = cacheGet<TierlistData>(tierlistCacheKey(src), TIERLIST_CACHE_TTL_MS);
    if (cached) {
      warmedTierlistSourcesRef.current.add(src);
      return;
    }

    warmedTierlistSourcesRef.current.add(src);
    try {
      const data = await fetchTierlistSnapshot(src);
      if (!data) warmedTierlistSourcesRef.current.delete(src);
    } catch {
      warmedTierlistSourcesRef.current.delete(src);
    }
  }, []);

  const fetchLegendaries = useCallback(async (src: LegendarySource = 'hsreplay') => {
    const gen = ++lgGenRef.current;
    const cacheKey = `leg_ru_cards_v4_${src}`;
    const baseUrl = `/api/legendaries?source=${src}&v=ru_cards_v4`;
    try {
      const cached = cacheGet<any>(cacheKey);
      if (cached && gen === lgGenRef.current) { setLegendariesData(cached); setLoadingLegendaries(false); }
      const result = await fetchWithETag(baseUrl, cacheKey);
      if (!result) throw new Error('fetch failed');
      if (gen !== lgGenRef.current) return;
      setLegendariesData(result.data);
      setErrorLegendaries(false);
    } catch { if (gen === lgGenRef.current) setErrorLegendaries(true); }
    finally  { if (gen === lgGenRef.current) { setLoadingLegendaries(false); setSwitchingLegendarySource(false); } }
  }, []);

  const fetchArticles = useCallback(async (options: { bust?: boolean; silent?: boolean } = {}) => {
    const { bust = false, silent = false } = options;
    const cacheKey = 'articles_v2';
    if (!silent) setLoadingArticles(true);
    try {
      const cached = bust ? null : cacheGet<ArticlesData>(cacheKey);
      if (cached) {
        setArticlesData(cached);
        if (!silent) setLoadingArticles(false);
      }

      if (bust) {
        const res = await fetch(`/api/articles?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not ok');
        const data = await res.json();
        cacheSet(cacheKey, data);
        localStorage.removeItem(`etag_${cacheKey}`);
        setArticlesData(data);
      } else {
        const result = await fetchWithETag('/api/articles', cacheKey);
        if (!result?.data) throw new Error('not ok');
        setArticlesData(result.data);
      }
      articlesRequestedRef.current = true;
    } catch {
      // keep empty
    } finally { setLoadingArticles(false); }
  }, []);

  const fetchGallery = useCallback(async (options: { bust?: boolean; silent?: boolean } = {}) => {
    const { bust = false, silent = false } = options;
    const cacheKey = 'gallery_v1';
    if (!silent) setLoadingGallery(true);
    try {
      const cached = bust ? null : cacheGet<GalleryData>(cacheKey);
      if (cached) {
        setGalleryData(cached);
        if (!silent) setLoadingGallery(false);
      }

      if (bust) {
        const res = await fetch(`/api/gallery?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('not ok');
        const data = await res.json();
        cacheSet(cacheKey, data);
        localStorage.removeItem(`etag_${cacheKey}`);
        setGalleryData(data);
      } else {
        const result = await fetchWithETag('/api/gallery', cacheKey);
        if (!result?.data) throw new Error('not ok');
        setGalleryData(result.data);
      }
      galleryRequestedRef.current = true;
    } catch {
      // keep empty
    } finally { setLoadingGallery(false); }
  }, []);

  const warmRoute = useCallback((route: TabId | 'login') => {
    if (warmedRoutesRef.current.has(route)) return;
    warmedRoutesRef.current.add(route);
    preloadRouteModule(route);

    if (route === 'standard-cards') void loadStandardCardsModule().then(module => (
      module.prefetchInitialConstructedCardCatalog(
        'standard', appIsAdmin || hasSubscriptionEntitlement(appSubscription, 'standard'),
      )
    )).catch(() => {});

    if (route === 'articles' && !articlesRequestedRef.current) {
      void fetchArticles({ silent: true });
    }
    if (route === 'gallery' && !galleryRequestedRef.current) {
      void fetchGallery({ silent: true });
    }
  }, [appIsAdmin, appSubscription, fetchArticles, fetchGallery]);

  const globalUpdatedAt = useMemo(
    () => latestHomeSummaryUpdatedAt(homeSummaryData)
      || winratesData.updatedAt
      || tierlistData.updatedAt
      || legendariesData.updatedAt
      || null,
    [homeSummaryData, legendariesData.updatedAt, tierlistData.updatedAt, winratesData.updatedAt],
  );

  useEffect(() => {
    if (activeTab !== 'winrates' || privateRouteChecking || privateRouteLocked) return;
    void fetchWinrates();
  }, [activeTab, fetchWinrates, privateRouteChecking, privateRouteLocked]);

  useEffect(() => {
    if (homeSummaryRequestedRef.current) return;
    homeSummaryRequestedRef.current = true;
    void fetchHomeSummary();
  }, [fetchHomeSummary]);

  useEffect(() => {
    if (tierlistRequestedRef.current) return;

    const loadTierlist = () => {
      tierlistRequestedRef.current = true;
      void fetchTierlist();
    };

    if ((activeTab === 'tierlist' && !privateRouteChecking && !privateRouteLocked) || wantsAdmin) {
      loadTierlist();
      return;
    }
  }, [activeTab, fetchTierlist, privateRouteChecking, privateRouteLocked, wantsAdmin]);

  useEffect(() => {
    if (legendariesRequestedRef.current) return;

    const loadLegendaries = () => {
      legendariesRequestedRef.current = true;
      void fetchLegendaries();
    };

    if (activeTab === 'legendaries' && !privateRouteChecking && !privateRouteLocked) {
      loadLegendaries();
      return;
    }
  }, [activeTab, fetchLegendaries, privateRouteChecking, privateRouteLocked]);

  useEffect(() => {
    if (activeTab !== 'tierlist' || !tierlistRequestedRef.current || privateRouteChecking || privateRouteLocked) return;

    let cancelIdle = () => {};
    const timer = window.setTimeout(() => {
      cancelIdle = scheduleIdleTask(() => {
        TIERLIST_SOURCES.forEach(src => {
          if (src !== tierlistSourceRef.current) void warmTierlistSource(src);
        });
      }, 1400);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      cancelIdle();
    };
  }, [activeTab, privateRouteChecking, privateRouteLocked, tierlistData.updatedAt, warmTierlistSource]);

	  useEffect(() => {
	    const needsArticles = activeTab === 'home' || activeTab === 'articles' || wantsAdmin;
	    if (activeTab === 'articles' && (privateRouteChecking || privateRouteLocked)) return;
	    if (!needsArticles || articlesRequestedRef.current) return;
	    void fetchArticles();
	  }, [activeTab, privateRouteChecking, privateRouteLocked, wantsAdmin, fetchArticles]);
	  useEffect(() => {
	    if (activeTab !== 'gallery' || galleryRequestedRef.current) return;
	    void fetchGallery();
	  }, [activeTab, fetchGallery]);
  // Set of cardIds that are companion cards in legendary groups (not the key legendary itself)
  const companionIds = useMemo(() => {
    const keyIds = new Set(legendariesData.groups.map(g => g.keyCard.cardId));
    const ids = new Set<string>();
    legendariesData.groups.forEach(g =>
      g.cards.forEach(c => { if (!keyIds.has(c.cardId)) ids.add(c.cardId); })
    );
    return ids;
  }, [legendariesData]);
  const isFullWidthBuilder = routeSurfaceAvailable && (activeTab === 'standard-matchups' || activeTab === 'standard-meta' || activeTab === 'fun-decks' || activeTab === 'constructed-archetypes' || activeTab === 'standard-vicious-gold' || activeTab === 'standard-cards' || activeTab === 'bg-heroes' || activeTab === 'bg-library' || activeTab === 'bg-tier-list' || activeTab === 'bg-strategies' || activeTab === 'bg-tier-builder' || activeTab === 'admin-panel' || activeTab === 'guides-archive' || activeTab === 'deck-builder' || activeTab === 'archetypes');
  // Login is its own visual route. Do not inherit the surface class of the
  // page that happened to be open before the profile was requested.
  const isEditorialSurfacePage = routeSurfaceAvailable && !isAdminMode && !wantsLogin && ['articles', 'faq', 'developer-api', 'gallery', 'guides-archive', 'contests'].includes(activeTab);
  const isGameDataSurfacePage = routeSurfaceAvailable && !isAdminMode && !wantsLogin && ['winrates', 'standard-matchups', 'standard-meta', 'fun-decks', 'constructed-archetypes', 'standard-vicious-gold', 'standard-cards', 'tierlist', 'legendaries', 'archetypes', 'cosmetics'].includes(activeTab);
  const isBattlegroundsSurfacePage = routeSurfaceAvailable && !isAdminMode && !wantsLogin && BG_TAB_IDS.has(activeTab);
  const isOpenSurfacePage = !isAdminMode && (!routeSurfaceAvailable || activeTab === 'home' || isEditorialSurfacePage || isGameDataSurfacePage || isBattlegroundsSurfacePage);
  const standardAccessGranted = appIsAdmin || hasSubscriptionEntitlement(appSubscription, 'standard');
  const standardPaywallAccess = useMemo(() => ({
    authUser: appAuthUser,
    subscriptionStatus: appSubscription,
    subscriptionLoading: appSubscriptionLoading,
    onRefreshSubscription: () => fetchAppSubscription(true),
  }), [appAuthUser, appSubscription, appSubscriptionLoading, fetchAppSubscription]);
  const standardPage = activeTab === 'fun-decks'
    ? <LazyFunDecksPage hasFullAccess={standardAccessGranted} paywall={standardPaywallAccess} />
    : activeTab === 'standard-meta'
      ? <LazyStandardMetaPage hasFullAccess={standardAccessGranted} paywall={standardPaywallAccess} />
      : activeTab === 'constructed-archetypes'
      ? (
        <LazyConstructedArchetypesPage
          currentPath={currentPath}
          navigatePath={navigatePath}
          hasFullAccess={standardAccessGranted}
          paywall={standardPaywallAccess}
        />
      )
      : activeTab === 'standard-vicious-gold'
      ? <LazyViciousSyndicateGoldPage />
      : <LazyStandardCardsPage
          currentPath={currentPath}
          navigatePath={navigatePath}
          statsAccess={appIsAdmin || hasSubscriptionEntitlement(appSubscription, 'standard')}
          statsAccessLoading={appAuthChecking || (Boolean(appAuthUser) && appSubscriptionLoading && !appSubscription)}
          authUser={appAuthUser}
          onRefreshSubscription={() => fetchAppSubscription(true)}
        />;
  usePageScrollLock(!isAdminMode && mobileMenuOpen);
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const menu = mobileMenuRef.current;
    if (!menu) return undefined;
    const focusable: HTMLElement[] = Array.from(menu.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        mobileMenuToggleRef.current?.focus();
        setMobileMenuOpen(false);
      }
      if (event.key !== 'Tab' || !first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

		  return (
    <div className={`min-h-screen bg-wood text-[#3d2a1e] font-body arena-app-shell ${routeView === 'not-found' ? 'arena-app-not-found' : ''} ${activeTab === 'home' && !isAdminMode && routeSurfaceAvailable && !isAccountRoute ? 'arena-app-home' : ''} ${isAccountRoute && !isAdminMode ? 'arena-app-profile' : ''} ${activeTab === 'deck-builder' && routeSurfaceAvailable ? 'arena-app-deck-builder' : ''} ${isEditorialSurfacePage ? `arena-app-editorial arena-app-${activeTab}` : ''} ${isGameDataSurfacePage ? `arena-app-game-data arena-app-${activeTab}` : ''} ${isBattlegroundsSurfacePage ? `arena-app-battlegrounds arena-app-${activeTab}` : ''}`}>
      <a
        className="arena-skip-link"
        href="#main-content"
        onClick={() => document.getElementById('main-content')?.focus()}
      >
        К основному содержимому
      </a>
      {!isAdminMode && <header className="arena-mobile-topbar lg:hidden">
        <a
          href="/"
          onClick={(e) => { e.preventDefault(); navigate('home'); }}
          className="arena-mobile-brand"
          aria-label="Manacost Stats — на главную"
        >
          <span>Manacost Stats</span>
        </a>
        <button
          ref={mobileMenuToggleRef}
          type="button"
          onClick={() => {
            if (mobileMenuOpen) setMobileNavGroup(null);
            setMobileMenuOpen(!mobileMenuOpen);
          }}
          className="arena-mobile-nav-toggle"
          aria-expanded={mobileMenuOpen}
          aria-controls="arena-mobile-menu"
          aria-label={mobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
        >
          {mobileMenuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>}

      {!isAdminMode && mobileMenuOpen && (
        <>
          <button
            type="button"
            className="arena-mobile-drawer-backdrop lg:hidden"
            aria-label="Закрыть меню"
            onClick={() => { setMobileMenuOpen(false); setMobileNavGroup(null); }}
          />
          <nav ref={mobileMenuRef} id="arena-mobile-menu" className="arena-mobile-menu lg:hidden" aria-label="Мобильная навигация">
            <NavigationRouteLinks routes={TOP_LEVEL_TABS} activeTab={activeTab} variant="mobile" onNavigate={navigate} onWarm={warmRoute} />
            {appIsContestAdmin && <NavigationRouteLinks routes={ADMIN_TABS} activeTab={activeTab} variant="mobile" onNavigate={navigate} onWarm={warmRoute} />}
            <div className="arena-mobile-menu-section" aria-label="Раздел Традиционный режим">
              Традиционный режим
            </div>
            <NavigationRouteLinks routes={visibleStandardTabs} activeTab={activeTab} variant="mobile" onNavigate={navigate} onWarm={warmRoute} />
            <div className="arena-mobile-menu-section" aria-label="Раздел Арена">
              Арена
            </div>
            <NavigationRouteLinks routes={visibleArenaTabs} activeTab={activeTab} variant="mobile" onNavigate={navigate} onWarm={warmRoute} />
            <div className="arena-mobile-menu-section" aria-label="Раздел Поля Сражений">
              Поля Сражений
            </div>
            <NavigationRouteLinks routes={BG_PRIMARY_TABS} activeTab={activeTab} variant="mobile" onNavigate={navigate} onWarm={warmRoute} />
            <div className="arena-mobile-menu-group">
              <button
                type="button"
                className={`arena-mobile-menu-link arena-mobile-menu-group-trigger ${BG_BUILDER_TABS.some(tab => tab.id === activeTab) ? 'arena-mobile-menu-link-active' : ''}`}
                aria-expanded={mobileNavGroup === 'constructors'}
                aria-controls="arena-mobile-constructors"
                onClick={() => setMobileNavGroup(group => group === 'constructors' ? null : 'constructors')}
              >
                <span className="arena-mobile-menu-link-icon flex-shrink-0" aria-hidden="true"><Grid3X3 size={18} strokeWidth={1.8} /></span>
                <span>Конструкторы</span>
                <ChevronDown size={16} className="arena-nav-group-chevron" />
              </button>
              <div id="arena-mobile-constructors" className="arena-mobile-menu-group-items" hidden={mobileNavGroup !== 'constructors'}>
                <NavigationRouteLinks
                  routes={BG_BUILDER_TABS}
                  activeTab={activeTab}
                  variant="mobile"
                  sublink
                  onNavigate={tab => { navigate(tab); setMobileNavGroup(null); }}
                  onWarm={warmRoute}
                />
              </div>
            </div>
            <div className="arena-mobile-menu-group arena-mobile-menu-group--misc">
              <button
                type="button"
                className={`arena-mobile-menu-link arena-mobile-menu-group-trigger ${visibleMiscTabs.some(tab => tab.id === activeTab) ? 'arena-mobile-menu-link-active' : ''}`}
                aria-expanded={mobileNavGroup === 'misc'}
                aria-controls="arena-mobile-misc"
                onClick={() => setMobileNavGroup(group => group === 'misc' ? null : 'misc')}
              >
                <span className="arena-mobile-menu-link-icon flex-shrink-0" aria-hidden="true"><Gift size={18} strokeWidth={1.8} /></span>
                <span>Разное</span>
                <ChevronDown size={16} className="arena-nav-group-chevron" />
              </button>
              <div id="arena-mobile-misc" className="arena-mobile-menu-group-items" hidden={mobileNavGroup !== 'misc'}>
                <NavigationRouteLinks
                  routes={visibleMiscTabs}
                  activeTab={activeTab}
                  variant="mobile"
                  sublink
                  onNavigate={tab => { navigate(tab); setMobileNavGroup(null); }}
                  onWarm={warmRoute}
                />
              </div>
            </div>
            <a
              href="/?login"
              onPointerEnter={() => warmRoute('login')}
              onFocus={() => warmRoute('login')}
              onClick={(e) => { e.preventDefault(); navigateLogin(); }}
              className={`arena-mobile-menu-link arena-mobile-menu-profile ${wantsLogin ? 'arena-mobile-menu-link-active' : ''}`}
            >
              {appAuthUser ? (
                <AuthAvatar user={appAuthUser} size={28} />
              ) : appAuthChecking && appHasAuthHint ? (
                <UserCircle size={18} className="flex-shrink-0" />
              ) : (
                <LogIn size={18} className="flex-shrink-0" />
              )}
              <span>{appAuthUser || (appAuthChecking && appHasAuthHint) ? 'Профиль' : 'Войти'}</span>
            </a>
          </nav>
        </>
      )}

      <div className="arena-layout-shell">
        {!isAdminMode && (
          <aside className="arena-sidebar" aria-label="Основная навигация">
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); navigate('home'); }}
              className="arena-sidebar-brand"
              aria-label="Manacost Stats — на главную"
            >
              <span className="arena-sidebar-brand-copy">
                <strong>Manacost Stats</strong>
              </span>
            </a>

            <nav className="arena-sidebar-nav" aria-label="Разделы сайта">
              <NavigationRouteLinks routes={TOP_LEVEL_TABS} activeTab={activeTab} variant="sidebar" onNavigate={navigate} onWarm={warmRoute} />
              {appIsContestAdmin && <NavigationRouteLinks routes={ADMIN_TABS} activeTab={activeTab} variant="sidebar" onNavigate={navigate} onWarm={warmRoute} />}
              <div className="arena-sidebar-section" aria-label="Раздел Традиционный режим">
                Традиционный режим
              </div>
              <NavigationRouteLinks routes={visibleStandardTabs} activeTab={activeTab} variant="sidebar" onNavigate={navigate} onWarm={warmRoute} />
              <div className="arena-sidebar-section" aria-label="Раздел Арена">
                Арена
              </div>
              <NavigationRouteLinks routes={visibleArenaTabs} activeTab={activeTab} variant="sidebar" onNavigate={navigate} onWarm={warmRoute} />
              <div className="arena-sidebar-section" aria-label="Раздел Поля Сражений">
                Поля Сражений
              </div>
              <NavigationRouteLinks routes={BG_PRIMARY_TABS} activeTab={activeTab} variant="sidebar" onNavigate={navigate} onWarm={warmRoute} />
              <div className="arena-sidebar-nav-group">
                <button
                  type="button"
                  className={`arena-sidebar-link arena-sidebar-nav-group-trigger ${BG_BUILDER_TABS.some(tab => tab.id === activeTab) ? 'arena-sidebar-link-active' : ''}`}
                  aria-expanded={sidebarNavGroup === 'constructors'}
                  aria-controls="arena-sidebar-constructors"
                  onClick={() => setSidebarNavGroup(group => group === 'constructors' ? null : 'constructors')}
                >
                  <span className="arena-sidebar-link-icon flex-shrink-0" aria-hidden="true"><Grid3X3 size={19} strokeWidth={1.8} /></span>
                  <span>Конструкторы</span>
                  <ChevronDown size={15} className="arena-nav-group-chevron" />
                </button>
                <div id="arena-sidebar-constructors" className="arena-sidebar-nav-group-items" hidden={sidebarNavGroup !== 'constructors'}>
                  <NavigationRouteLinks
                    routes={BG_BUILDER_TABS}
                    activeTab={activeTab}
                    variant="sidebar"
                    sublink
                    onNavigate={tab => { navigate(tab); setSidebarNavGroup(null); }}
                    onWarm={warmRoute}
                  />
                </div>
              </div>
              <div className="arena-sidebar-nav-group arena-sidebar-nav-group--misc">
                <button
                  type="button"
                  className={`arena-sidebar-link arena-sidebar-nav-group-trigger ${visibleMiscTabs.some(tab => tab.id === activeTab) ? 'arena-sidebar-link-active' : ''}`}
                  aria-expanded={sidebarNavGroup === 'misc'}
                  aria-controls="arena-sidebar-misc"
                  onClick={() => setSidebarNavGroup(group => group === 'misc' ? null : 'misc')}
                >
                  <span className="arena-sidebar-link-icon flex-shrink-0" aria-hidden="true"><Gift size={19} strokeWidth={1.8} /></span>
                  <span>Разное</span>
                  <ChevronDown size={15} className="arena-nav-group-chevron" />
                </button>
                <div id="arena-sidebar-misc" className="arena-sidebar-nav-group-items" hidden={sidebarNavGroup !== 'misc'}>
                  <NavigationRouteLinks
                    routes={visibleMiscTabs}
                    activeTab={activeTab}
                    variant="sidebar"
                    sublink
                    onNavigate={tab => { navigate(tab); setSidebarNavGroup(null); }}
                    onWarm={warmRoute}
                  />
                </div>
              </div>
            </nav>

            <div className="arena-sidebar-status" aria-label="Дата обновления данных">
              <span>Обновлено</span>
              <strong>{globalUpdatedAt ? formatDate(globalUpdatedAt) : 'Нет данных'}</strong>
            </div>

            <a
              href="/?login"
              onPointerEnter={() => warmRoute('login')}
              onFocus={() => warmRoute('login')}
              onClick={(e) => { e.preventDefault(); navigateLogin(); }}
              className={`arena-sidebar-profile ${wantsLogin ? 'arena-sidebar-profile-active' : ''}`}
              aria-label={appAuthUser || (appAuthChecking && appHasAuthHint) ? 'Открыть профиль' : 'Войти в профиль'}
              style={{ textDecoration: 'none' }}
            >
              <HeaderProfileButton user={appAuthUser} checking={appAuthChecking && appHasAuthHint} />
            </a>
          </aside>
        )}

	        <div className={`arena-workspace ${!isAdminMode ? 'arena-workspace-with-tools' : ''} ${isFullWidthBuilder ? 'arena-workspace-wide' : ''} ${isAdminMode ? 'arena-workspace-admin' : ''}`}>
	          {!isAdminMode && (
	            <React.Suspense fallback={null}>
	              <LazyGlobalUtilityHeader
	                accessStatus={appIsAdmin || appSubscription}
	                onNavigate={navigatePath}
	                pagePath={wantsLogin ? '/profile' : currentPath}
	                auth={Boolean(appAuthUser)}
	              />
	            </React.Suspense>
	          )}
	          <main id="main-content" tabIndex={-1} className={`arena-main relative flex flex-col items-center ${isFullWidthBuilder ? 'arena-main-wide' : ''} ${isAdminMode ? 'arena-main-admin' : ''}`}>
        {/* Parchment container */}
	        <div className={`arena-content w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0 ${isFullWidthBuilder ? 'arena-content-wide' : ''} ${isAdminMode ? 'arena-content-admin' : ''} ${isOpenSurfacePage ? 'arena-content-open' : ''}`}>
          {!isAdminMode && !isOpenSurfacePage && <>
            <div className="absolute top-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-l-2 sm:border-l-4 border-gold rounded-tl-xl opacity-50" />
            <div className="absolute top-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-r-2 sm:border-r-4 border-gold rounded-tr-xl opacity-50" />
            <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-l-2 sm:border-l-4 border-gold rounded-bl-xl opacity-50" />
            <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-r-2 sm:border-r-4 border-gold rounded-br-xl opacity-50" />
          </>}

          {routeView === 'pending' ? (
            <RouteFallback />
          ) : routeView === 'not-found' || routeView === 'unavailable' ? (
            <React.Suspense fallback={<RouteFallback />}>
              <LazyNotFoundPage state={routeView} navigatePath={navigatePath} />
            </React.Suspense>
          ) : isAccountRoute ? (
            <React.Suspense fallback={<RouteFallback minHeight={620} />}>
              <LazyAccountRoute
                connect={isApplicationConnectPage}
                profileId={publicProfileId}
                user={appAuthUser}
                checking={appAuthChecking}
                onChange={handleAppAuthChange}
              />
            </React.Suspense>
          ) : isAdminMode ? (
            <>
	            <React.Suspense fallback={<RouteFallback minHeight={620} />}><LazyContestAdminPanel authUser={appAuthUser} authChecking={appAuthChecking} /></React.Suspense>
            </>
          ) : (
            <>
                {activeTab === 'home' && !publicProfileId && (
                  <React.Suspense fallback={<RouteFallback minHeight={720} />}>
                    <LazyHomeTab
                      homeSummaryData={homeSummaryData}
                      loadingHomeSummary={loadingHomeSummary}
                      articles={articlesData.articles}
                      loadingArticles={loadingArticles}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      faq={<React.Suspense fallback={null}><LazyFAQSection /></React.Suspense>}
                    />
                  </React.Suspense>
                )}
                {activeTab === 'standard-matchups' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={720} />}><LazyStandardMatchupsPage /></React.Suspense>,
                    720,
                  )
                )}
                {(activeTab === 'standard-meta' || activeTab === 'constructed-archetypes' || activeTab === 'fun-decks' || activeTab === 'standard-vicious-gold' || activeTab === 'standard-cards') && (
                  activeTab === 'standard-cards'
                    ? <React.Suspense fallback={<RouteFallback minHeight={720} />}>{standardPage}</React.Suspense>
                    : STANDARD_SOFT_PAYWALL_TABS.has(activeTab)
                      ? (
                        privateRouteChecking
                          ? <RouteFallback minHeight={720} />
                          : <React.Suspense fallback={<RouteFallback minHeight={720} />}>{standardPage}</React.Suspense>
                      )
                      : renderPrivateRoute(
                        <React.Suspense fallback={<RouteFallback minHeight={720} />}>{standardPage}</React.Suspense>,
                        720,
                      )
                )}
	                {activeTab === 'winrates' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={720} />}>
	                    <LazyWinrates classes={winratesData.classes} loading={loadingWinrates} error={errorWinrates}
	                      updatedAt={winratesData.updatedAt}
	                      winrateSource={winrateSource}
	                      switching={switchingSource}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                      onRefreshSubscription={() => fetchAppSubscription(true)}
                      onSourceChange={async (src) => {
                        setWinrateSource(src);
                        winrateSourceRef.current = src;
                        setSwitchingSource(true);
                        await fetchWinrates(src);
                      }} />
                    </React.Suspense>
                    ,
                    720,
                  )
                )}
	                {activeTab === 'tierlist' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={820} />}>
	                    <LazyTierList data={tierlistData} loading={loadingTierlist} error={errorTierlist}
	                      companionIds={companionIds}
	                      tierlistSource={tierlistSource}
                      switchingTierlistSource={switchingTierlistSource}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                      onRefreshSubscription={() => fetchAppSubscription(true)}
                      onTierlistSourceChange={async (src) => {
                        setTierlistSource(src);
                        tierlistSourceRef.current = src;
                        setLoadingTierlist(false); // keep showing current data while switching
                        const cached = cacheGet<TierlistData>(tierlistCacheKey(src), TIERLIST_CACHE_TTL_MS);
                        if (cached) {
                          setTierlistData(cached);
                          setErrorTierlist(false);
                          setSwitchingTierlistSource(false);
                          void fetchTierlist(src);
                        } else {
                          setSwitchingTierlistSource(true);
                          await fetchTierlist(src);
                        }
                      }} />
                    </React.Suspense>
                    ,
                    820,
                  )
                )}
                {activeTab === 'legendaries' && (
                  renderPrivateRoute(
                  <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                    <LazyLegendaries
                      data={legendariesData}
                      loading={loadingLegendaries}
                      error={errorLegendaries}
                      legendarySource={legendarySource}
                      switchingLegendarySource={switchingLegendarySource}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                      onRefreshSubscription={() => fetchAppSubscription(true)}
                      onLegendarySourceChange={async (src) => {
                        setLegendarySource(src);
                        setSwitchingLegendarySource(true);
                        setLoadingLegendaries(false);
                        await fetchLegendaries(src);
                      }}
                    />
                  </React.Suspense>
                    ,
                    760,
                  )
                )}
                {activeTab === 'bg-strategies' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundStrategyBuilderEmbed /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-heroes' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundHeroesRoute path={currentPath} onNavigate={navigatePath} /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-library' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                      <LazyBgLibrary currentPath={currentPath} navigatePath={navigatePath} />
                    </React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'bg-tier-list' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={1100} />}><LazyBattlegroundTierList /></React.Suspense>,
                    1100,
                  )
                )}
                {activeTab === 'bg-tier-builder' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyBattlegroundTierBuilderEmbed /></React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'articles' && (
                  <React.Suspense fallback={<RouteFallback minHeight={640} />}>
                    <LazyArticlesTab
                      data={articlesData}
                      loading={loadingArticles}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                      authUser={appAuthUser}
                      subscriptionStatus={appSubscription}
                      subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                    />
                  </React.Suspense>
                )}
                {activeTab === 'faq' && (
                  <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                    <LazyFAQPage navigatePath={navigatePath} />
                  </React.Suspense>
                )}
                {activeTab === 'developer-api' && (
                  <React.Suspense fallback={<RouteFallback minHeight={760} />}><LazyDeveloperApiPage /></React.Suspense>
                )}
                {activeTab === 'gallery' && (
                  <React.Suspense fallback={<RouteFallback minHeight={640} />}>
                    <LazyGalleryTab
                      data={galleryData}
                      loading={loadingGallery}
                      onNavigate={(tab: string) => navigate(tab as TabId)}
                    />
                  </React.Suspense>
                )}
                {activeTab === 'guides-archive' && (
                  renderPrivateRoute(
                    <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                      <LazyGuidesArchive currentPath={currentPath} navigatePath={navigatePath} />
                    </React.Suspense>,
                    760,
                  )
                )}
                {activeTab === 'cosmetics' && (
                  <React.Suspense fallback={<RouteFallback minHeight={760} />}>
                    <LazyCosmetics currentPath={currentPath} navigatePath={navigatePath} />
                  </React.Suspense>
                )}
                {activeTab === 'contests' && (
                  <React.Suspense fallback={<RouteFallback minHeight={620} />}><LazyContestsPage
                    authUser={appAuthUser}
                    subscriptionStatus={appSubscription}
                    subscriptionLoading={appAuthChecking || appSubscriptionLoading}
                    onRefreshSubscription={() => fetchAppSubscription(true)}
                  /></React.Suspense>
                )}
                {activeTab === 'deck-builder' && (
                  <React.Suspense fallback={<RouteFallback minHeight={720} />}>
                    <LazyDeckBuilder isAdmin={appIsAdmin} authChecking={appAuthChecking} />
                  </React.Suspense>
                )}
                {activeTab === 'archetypes' && (
                  <React.Suspense fallback={<RouteFallback minHeight={720} />}>
                    <LazyArchetypes isAdmin={appIsAdmin} authChecking={appAuthChecking} />
                  </React.Suspense>
                )}
                {activeTab === 'admin-panel' && (
	                  <React.Suspense fallback={<RouteFallback minHeight={620} />}><LazyContestAdminPanel authUser={appAuthUser} authChecking={appAuthChecking} /></React.Suspense>
                )}
            </>
          )}
          </div>
	        </main>
		        {!isAdminMode && <React.Suspense fallback={null}><LazySiteFooter onNavigate={(tab: string) => navigate(tab as TabId)} /></React.Suspense>}
	        {!isAdminMode && <React.Suspense fallback={null}><LazySupportPrompt /></React.Suspense>}
        </div>
      </div>
    </div>
  );
}

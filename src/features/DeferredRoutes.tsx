/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import '../route-parchment.css';
import './DeferredRoutes.css';
import { Trophy, Scroll, RefreshCw, AlertTriangle, X, Search, Star, Home, BookOpen, Menu, ChevronLeft, ChevronRight, Grid3X3, List, LogIn, Eye, EyeOff, UserCircle, ThumbsUp, ThumbsDown, ShieldCheck, Image as ImageIcon, ArrowDown, ArrowUp, ChevronDown, Copy, ExternalLink } from 'lucide-react';
import { getCanonicalRedirectUrl } from '../config/domain';
import { publicProfilePath } from '../publicProfilePath';
import { usePageScrollLock } from '../hooks/usePageScrollLock';
import SubscriptionPurchaseButtons from '../components/SubscriptionPurchaseButtons';
import PaywallGate from '../components/PaywallGate';
import ProfileIdentityHero from '../components/ProfileIdentityHero';
import FAQSection from '../components/FAQSection';
import TierlistEarlyStatsNotice from './TierlistEarlyStatsNotice';
import { Breadcrumbs, SectionBanner } from './EditorialRouteChrome';
import { ArenaTierListSearchIntro } from '../modules/searchLanding/arena';
const SocialLoginLinks = React.lazy(() => import('./SocialLoginLinks'));

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassData {
  id: string;
  name: string;
  winrate: number;
  color: string;
  textDark?: boolean;
  games?: number;
}

interface ClassMatchup {
  classAId: string;
  classBId: string;
  winrate: number;
  classA?: string;
  classB?: string;
}

interface ClassMatchupsData {
  matchups: ClassMatchup[];
  updatedAt: string | null;
  source: string;
  warning?: string;
}

type TierlistSource = 'hsreplay' | 'heartharena' | 'firestone';
type LegendarySource = 'hsreplay' | 'firestone';
type TierlistViewMode = 'gallery' | 'table';
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

/** Merged card for display: TierCard + CardLookup */
interface CardData extends TierCard, Partial<CardLookup> {}

// ─── Class icons (from /public/class_icon/) ───────────────────────────────────

/** Maps tier-list section IDs → icon path */
const CLASS_ICON: Record<string, string> = {
  '__all__':      '/class_icon/all1.png',
  'death-knight': '/class_icon/deathknight.png',
  'demon-hunter': '/class_icon/demonhunter.png',
  druid:          '/class_icon/druid.png',
  hunter:         '/class_icon/hunter.png',
  mage:           '/class_icon/mage.png',
  paladin:        '/class_icon/paladin.png',
  priest:         '/class_icon/priest.png',
  rogue:          '/class_icon/rogue.png',
  shaman:         '/class_icon/shaman.png',
  warlock:        '/class_icon/warlock.png',
  warrior:        '/class_icon/warrior.png',
  any:            '/class_icon/neutral.webp',
};

/** Maps winrate class IDs → icon path (supports both short 'dk' and full 'death-knight' forms) */
const CLASS_ICON_BY_ID: Record<string, string> = {
  dk:             '/class_icon/deathknight.png',
  'death-knight': '/class_icon/deathknight.png',
  dh:             '/class_icon/demonhunter.png',
  'demon-hunter': '/class_icon/demonhunter.png',
  druid:          '/class_icon/druid.png',
  hunter:         '/class_icon/hunter.png',
  mage:           '/class_icon/mage.png',
  paladin:        '/class_icon/paladin.png',
  priest:         '/class_icon/priest.png',
  rogue:          '/class_icon/rogue.png',
  shaman:         '/class_icon/shaman.png',
  warlock:        '/class_icon/warlock.png',
  warrior:        '/class_icon/warrior.png',
};

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

type LegendarySortKey = 'winRate' | 'pickRate' | 'offerRate' | 'score';
const LEGENDARY_SORT_OPTIONS: Array<{ id: LegendarySortKey; label: string }> = [
  { id: 'winRate', label: 'Винрейт' },
  { id: 'pickRate', label: 'Частота выбора' },
  { id: 'offerRate', label: 'Частота предложения' },
  { id: 'score', label: 'Очки ArenaSmith' },
];
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

interface ArenaDeckCard {
  cardId: string;
  name: string;
  cost?: number;
  count: number;
  image: string;
  sourceImage?: string;
}

interface ArenaDeckClass {
  name: string;
  icon: string;
}

interface ArenaDeck {
  id: string;
  rank: number;
  classes: ArenaDeckClass[];
  classNames: string;
  wins: number | null;
  losses: number | null;
  score: string | null;
  player: string;
  cardCount: number;
  sourceUrl: string;
  generateUrl: string;
  finalCards: ArenaDeckCard[];
  legendaryCards: ArenaDeckCard[];
  removedCards: ArenaDeckCard[];
  addedCards: ArenaDeckCard[];
}

interface ArenaDecksData {
  decks: ArenaDeck[];
  totalDecks: number | null;
  filteredDecks?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  activeClass?: string;
  classOptions?: ArenaDeckClass[];
  updatedAt: string | null;
  source: string;
  sourceUrl: string;
  warning?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatPct(value: number | null | undefined, digits = 1): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}%` : '—';
}

function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ru-RU') : '—';
}

function mergeCard(tc: TierCard, lookup: Record<string, CardLookup>): CardData {
  const lu = lookup[tc.cardId] as any ?? {};
  // rarity in lookup (cards_ru.json) overrides DOM-scraped rarity from HearthArena
  const rarity: string = lu.rarity ?? tc.rarity;
  return { ...tc, ...lu, rarity };
}

// ─── Card image helpers ───────────────────────────────────────────────────────

const CARD_IMAGE_PROXY_VERSION = 'card_img_v5_retina';
const CARD_JSON_IMAGE_VERSION = 'card_art_tooltip_v1';
const hsImgUrl = (cardId: string, size: '256x' | '512x' = '256x', locale: 'ruRU' | 'enUS' = 'ruRU') => {
  if (locale === 'ruRU') {
    const variant = size === '512x' ? 'full' : 'thumb';
    return `/api/card-image/${encodeURIComponent(cardId)}/${variant}.webp?v=${CARD_IMAGE_PROXY_VERSION}`;
  }
  return `/api/public-resource/hsjson/v1/render/latest/enUS/${size}/${cardId}.png`;
};
const hsJsonRenderUrl = (cardId: string, size: '256x' | '512x' = '256x', locale: 'ruRU' | 'enUS' = 'ruRU') =>
  `/api/public-resource/hsjson/v1/render/latest/${locale}/${size}/${cardId}.png?v=${CARD_JSON_IMAGE_VERSION}`;
const hsJsonTileUrl = (cardId: string, ext: 'webp' | 'jpg' | 'png' = 'webp') =>
  `/api/public-resource/hsjson/v1/tiles/${cardId}.${ext}?v=${CARD_JSON_IMAGE_VERSION}`;
const hsJsonArtUrl = (cardId: string, size: '256x' | '512x' = '256x', ext: 'webp' | 'jpg' = 'webp') =>
  `/api/public-resource/hsjson/v1/${size}/${cardId}.${ext}?v=${CARD_JSON_IMAGE_VERSION}`;

function uniqueSources(sources: Array<string | null | undefined>): string[] {
  return [...new Set(sources.filter(Boolean) as string[])];
}

const warmedCardImages = new Set<string>();
function preloadImage(url: string | null | undefined): void {
  const source = String(url ?? '').trim();
  if (!source || typeof Image === 'undefined' || warmedCardImages.has(source)) return;
  warmedCardImages.add(source);
  const image = new Image();
  image.decoding = 'async';
  image.onerror = () => warmedCardImages.delete(source);
  image.src = source;
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

// ─── Local assets ─────────────────────────────────────────────────────────────
const RARITY_ICON: Record<string, string> = {
  common:    '/assets/common.png',
  rare:      '/assets/rare.png',
  epic:      '/assets/epic.png',
  legendary: '/assets/legendary.png',
};
const MANA_ICON    = '/assets/mana.png';
const ARENA_ICON   = '/assets/arena_icon.webp';

const TIER_COLORS: Record<string, string> = {
  S: 'bg-gradient-to-br from-[#e63946] to-[#780000] text-[#fff0f0] border-[#ff9999]',
  A: 'bg-gradient-to-br from-[#f4a261] to-[#b34700] text-[#fff9f0] border-[#ffd699]',
  B: 'bg-gradient-to-br from-[#9b5de5] to-[#4a0080] text-[#f4f0ff] border-[#d9b3ff]',
  C: 'bg-gradient-to-br from-[#2a9d8f] to-[#004d40] text-[#e0f2f1] border-[#80cbc4]',
  D: 'bg-gradient-to-br from-[#457b9d] to-[#1d3557] text-[#e0f0ff] border-[#90c0e0]',
  E: 'bg-gradient-to-br from-[#92400e] to-[#451a03] text-[#fef3c7] border-[#d97706]',
  F: 'bg-gradient-to-br from-[#6b6b6b] to-[#2c2c2c] text-[#e0e0e0] border-[#aaaaaa]',
  U: 'bg-gradient-to-br from-[#8b7355] to-[#4a3724] text-[#fff4d6] border-[#c4a46a]',
};

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

// ─── Fullscreen card modal ────────────────────────────────────────────────────

const RARITY_LABEL: Record<string, string> = {
  common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная', free: 'Базовая',
};
const TYPE_LABEL: Record<string, string> = {
  minion: 'Существо', spell: 'Заклинание', weapon: 'Оружие', hero: 'Герой', location: 'Локация',
};
const TIERLIST_SOURCE_LABEL: Record<TierlistSource, string> = {
  hsreplay: 'HSReplay',
  heartharena: 'HearthArena',
  firestone: 'Firestone',
};
const LEGENDARY_SOURCE_LABEL: Record<LegendarySource, string> = {
  hsreplay: 'HSReplay',
  firestone: 'Firestone',
};
const SOURCE_LOGO: Record<TierlistSource, string> = {
  hsreplay: '/source-logos/hsreplay.png?v=source_logos_v2',
  heartharena: '/source-logos/heartharena.webp?v=keeper_v2',
  firestone: '/source-logos/firestone.png?v=source_logos_v2',
};

const SourceToggleButton: React.FC<{
  source: TierlistSource;
  label: string;
  active: boolean;
  busy: boolean;
  onClick: () => void;
}> = ({ source, label, active, busy, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy && !active}
      title={label}
      aria-pressed={active}
      data-active={active ? 'true' : 'false'}
      className="source-toggle-button min-h-[34px] px-2.5 py-1.5 rounded-lg text-xs font-hs transition-all flex items-center justify-center gap-1.5"
      style={active ? {
        background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
        color: '#fcd34d',
        boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
      } : {
        color: busy ? '#b8a080' : '#6b4c2a',
        cursor: busy ? 'wait' : 'pointer',
      }}
    >
      {active && busy && (
        <RefreshCw size={10} style={{ animation: 'spin 0.8s linear infinite' }} />
      )}
      <span
        className="flex items-center justify-center rounded-md overflow-hidden"
        style={{
          width: 22,
          height: 22,
          background: 'rgba(255,255,255,0.14)',
          border: '1px solid rgba(255,255,255,0.16)',
        }}
      >
        <img
          src={SOURCE_LOGO[source]}
          alt=""
          aria-hidden="true"
          className="max-w-full max-h-full object-contain"
          draggable={false}
          style={{
            filter: active
              ? 'drop-shadow(0 0 4px rgba(252,211,77,0.35))'
              : 'saturate(0.85) brightness(0.92)',
          }}
        />
      </span>
      <span className="source-toggle-label">{label}</span>
    </button>
);

const ProgressiveArenaCardImage: React.FC<{
  fullSrc: string;
  previewSrc: string | null;
  alt: string;
  onError: () => void;
}> = ({ fullSrc, previewSrc, alt, onError }) => {
  const [ready, setReady] = useState(false);
  const hasPreview = Boolean(previewSrc && previewSrc !== fullSrc);
  return (
    <>
      <img src={ready || !hasPreview ? fullSrc : previewSrc!} alt={alt}
        onError={() => {
          if (hasPreview && !ready) setReady(true);
          else onError();
        }}
        width={360}
        height={548}
        decoding="async"
        className="card-modal-image"
        draggable={false} />
      {hasPreview && !ready && (
        <img src={fullSrc} alt="" aria-hidden="true" hidden onError={onError}
          onLoad={() => setReady(true)} />
      )}
    </>
  );
};

const CardModal: React.FC<{ card: CardData; tier: string; onClose: () => void }> = ({ card, tier, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [srcIdx, setSrcIdx] = useState(0);
  // Track touch start position to distinguish tap vs scroll
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  const modalSources = useMemo(() => uniqueSources([
    card.cardId ? hsImgUrl(card.cardId, '512x') : null,
    card.imageRu,
    card.imageHa,
    card.cardId ? hsImgUrl(card.cardId, '512x', 'enUS') : null,
  ]), [card.cardId, card.imageHa, card.imageRu]);
  const bigSrc = modalSources[srcIdx] ?? null;
  const previewSrc = uniqueSources([
    card.imageRu,
    card.imageHa,
    card.cardId ? hsImgUrl(card.cardId) : null,
  ])[0] ?? null;
  usePageScrollLock(true);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const sourceLabel = card.source ? TIERLIST_SOURCE_LABEL[card.source] : 'Manacost';
  const deckWinrate = card.deckWinrate ?? card.winrate;
  const primaryWinrateLabel = card.statsContext === 'legendary' ? 'Винрейт группы' : 'Винрейт колоды';
  const statRows = [
    { label: primaryWinrateLabel, value: formatPct(deckWinrate), raw: deckWinrate, type: 'pct' as const },
    { label: 'При взятии', value: formatPct(card.drawnWinrate), raw: card.drawnWinrate, type: 'pct' as const },
    { label: 'При розыгрыше', value: formatPct(card.playedWinrate), raw: card.playedWinrate, type: 'pct' as const },
    { label: 'В % заходов', value: formatPct(card.inDecks), raw: card.inDecks, type: 'pct' as const },
    { label: 'Копий в колоде', value: typeof card.avgCopies === 'number' ? card.avgCopies.toFixed(card.avgCopies % 1 === 0 ? 0 : 1) : '—', raw: card.avgCopies, type: 'score' as const },
    { label: 'Партии', value: formatCount(card.totalGames), raw: null, type: 'score' as const },
    { label: 'ArenaSmith', value: typeof card.arenaScore === 'number' ? card.arenaScore.toFixed(0) : '—', raw: card.arenaScore, type: 'score' as const },
    { label: 'Pick Rate', value: formatPct(card.pickRate), raw: card.pickRate, type: 'pct' as const },
    { label: 'Частота выбора', value: formatPct(card.offerRate), raw: card.offerRate, type: 'pct' as const },
  ].filter(row => row.value !== '—');
  const hasStats = statRows.length > 0;

  // Rendered via portal — completely outside app stacking context
  return createPortal(
    <div
      className={`card-modal-lightbox${visible ? ' is-visible' : ''}`}
      /* Desktop: click backdrop → close */
      onClick={onClose}
      /* Mobile: record touch start, close only if finger barely moved (tap, not scroll) */
      onTouchStart={e => {
        const t = e.touches[0];
        touchOrigin.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={e => {
        if (!touchOrigin.current) return;
        const t = e.changedTouches[0];
        const moved = Math.hypot(
          t.clientX - touchOrigin.current.x,
          t.clientY - touchOrigin.current.y,
        );
        touchOrigin.current = null;
        if (moved < 12) { e.preventDefault(); onClose(); }
      }}
    >
      {/* Backdrop */}
      <div className="card-modal-backdrop card-modal-backdrop--parchment" />

      {/* Card container — stops propagation so tapping/scrolling card doesn't close modal */}
      <div
        className={`card-modal-shell card-modal-shell--parchment${visible ? ' is-visible' : ''}`}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {bigSrc ? (
          <ProgressiveArenaCardImage
            key={bigSrc}
            fullSrc={bigSrc}
            previewSrc={previewSrc}
            alt={card.name}
            onError={() => setSrcIdx(i => i + 1)}
          />
        ) : (
          <div className="card-modal-image-fallback" role="img" aria-label={card.name}>
            <span>{card.name}</span>
          </div>
        )}

        <aside className="card-modal-stats card-modal-stats--parchment" aria-label={`Статистика карты ${card.name}`}>
          <div className="card-modal-header flex items-start justify-between gap-3 border-b border-[#d8b75e]/25 pb-3">
            <div className="min-w-0">
              <p className="card-modal-source text-[10px] font-black uppercase tracking-wide text-[#c4a46a]">{sourceLabel}</p>
              <h2 className="card-modal-title mt-1 font-hs text-xl leading-tight text-[#fcd34d]">{card.name}</h2>
            </div>
            <div className={`card-modal-tier flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border-2 font-hs text-xl shadow-lg ${TIER_COLORS[tier] || TIER_COLORS.C}`}>
              {tier}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {card.rarity && RARITY_ICON[card.rarity] && (
              <span className="card-modal-chip">
                <img src={RARITY_ICON[card.rarity]} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {RARITY_LABEL[card.rarity] || card.rarity}
              </span>
            )}
            {card.type && (
              <span className="card-modal-chip">{TYPE_LABEL[card.type] || card.type}</span>
            )}
            {card.cost !== undefined && (
              <span className="card-modal-chip card-modal-chip--mana">
                <img src={MANA_ICON} alt="" aria-hidden="true" className="h-5 w-5 object-contain" />
                {card.cost}
              </span>
            )}
          </div>

          {hasStats ? (
            <dl className="mt-4 grid grid-cols-1 gap-2">
              {statRows.map(row => (
                <div key={row.label} className="card-modal-stat-row">
                  <dt className="text-[11px] font-bold uppercase leading-tight text-[#d9c08a]">{row.label}</dt>
                  <dd className={`text-right text-sm font-black leading-none ${row.raw === null ? 'text-[#fff3cf]' : metricTone(row.raw, row.type)}`}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="mt-4 rounded-xl border border-[#c4a46a]/30 bg-[#2c1e16]/70 px-3 py-3 text-sm text-[#d9c08a]">
              Подробная статистика для этой карты пока недоступна.
            </div>
          )}
        </aside>
      </div>

      {/* Close button */}
      <button
        className="card-modal-close card-modal-close--parchment"
        onClick={e => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  );
};

// ─── HSCard ───────────────────────────────────────────────────────────────────

type CardTooltipPosition = {
  left: number;
  top: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
};

const CARD_TOOLTIP_WIDTH = 340;
const CARD_TOOLTIP_ESTIMATED_HEIGHT = 220;

function getCardStatsTooltipPosition(el: HTMLElement): CardTooltipPosition {
  const rect = el.getBoundingClientRect();
  const edge = 12;
  const gap = 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const width = Math.min(CARD_TOOLTIP_WIDTH, viewportWidth - edge * 2);
  const height = Math.min(CARD_TOOLTIP_ESTIMATED_HEIGHT, viewportHeight - edge * 2);
  const sideTop = clampNumber(rect.top + rect.height / 2 - height / 2, edge, viewportHeight - height - edge);

  if (rect.right + gap + width <= viewportWidth - edge) {
    return { left: rect.right + gap, top: sideTop, placement: 'right' };
  }

  if (rect.left - gap - width >= edge) {
    return { left: rect.left - gap - width, top: sideTop, placement: 'left' };
  }

  const halfWidth = width / 2;
  const left = Math.min(viewportWidth - halfWidth - edge, Math.max(halfWidth + edge, rect.left + rect.width / 2));
  const hasRoomBelow = rect.bottom + gap + height < viewportHeight - edge;

  return {
    left,
    top: hasRoomBelow ? rect.bottom + gap : rect.top - gap,
    placement: hasRoomBelow ? 'bottom' : 'top',
  };
}

const CardStatsTooltip: React.FC<{ card: CardData; position: CardTooltipPosition }> = ({ card, position }) => {
  const rows = [
    ['Винрейт колоды с этой картой', formatPct(card.deckWinrate ?? card.winrate)],
    ['Взятие', formatPct(card.pickRate)],
    ['Винрейт при разыгрывании', formatPct(card.playedWinrate)],
    ['В % колод', formatPct(card.inDecks)],
    ['Всего партий', formatCount(card.totalGames)],
    ['ArenaSmith очко', typeof card.arenaScore === 'number' ? card.arenaScore.toFixed(0) : '—'],
    ['Частота выбора', formatPct(card.offerRate)],
  ];

  return createPortal(
    <div
      className="card-stats-tooltip card-stats-tooltip--parchment pointer-events-none"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: CARD_TOOLTIP_WIDTH,
        maxWidth: 'calc(100vw - 24px)',
        transform: position.placement === 'top'
          ? 'translate(-50%, -100%)'
          : position.placement === 'bottom'
            ? 'translate(-50%, 0)'
            : 'none',
        zIndex: 2147483000,
      }}
    >
      <div className="card-stats-tooltip-header">
        <span className="card-stats-tooltip-title font-hs">{card.name}</span>
        {card.source && <span className="card-stats-tooltip-source">{TIERLIST_SOURCE_LABEL[card.source]}</span>}
      </div>
      <div className="card-stats-tooltip-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="card-stats-tooltip-row">
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
};

type HSCardProps = {
  card: CardData;
  onClick: () => void;
  previewEnabled?: boolean;
  onPreviewStart?: (card: CardData, anchor: HTMLElement) => void;
  onPreviewEnd?: () => void;
};

const HSCard: React.FC<HSCardProps> = memo(({ card, onClick, previewEnabled = false, onPreviewStart, onPreviewEnd }) => {
  const localImageSrc = card.cardId ? hsImgUrl(card.cardId) : null;
  // Multi-step fallback: responsive Russian proxy first, then source images and English render.
  const sources = useMemo(() => uniqueSources([
    localImageSrc,
    card.imageRu  || null,
    card.imageHa  || null,
    card.cardId   ? hsImgUrl(card.cardId, '256x', 'enUS') : null,
  ]), [card.cardId, card.imageHa, card.imageRu, localImageSrc]);

  const [srcIdx, setSrcIdx] = useState(0);
  const cardRef = useRef<HTMLButtonElement | null>(null);
  const thumbSrc = sources[srcIdx] ?? null;
  const responsiveSrcSet = thumbSrc === localImageSrc && card.cardId
    ? `${hsImgUrl(card.cardId)} 360w, ${hsImgUrl(card.cardId, '512x')} 512w`
    : undefined;
  const handleErr = useCallback(() => setSrcIdx(i => i + 1), []);
  const showPreview = useCallback(() => {
    if (!previewEnabled) return;
    const el = cardRef.current;
    if (!el) return;
    onPreviewStart?.(card, el);
  }, [card, onPreviewStart, previewEnabled]);
  const hidePreview = useCallback(() => onPreviewEnd?.(), [onPreviewEnd]);
  const handleClick = useCallback(() => {
    hidePreview();
    onClick();
  }, [hidePreview, onClick]);

  useEffect(() => setSrcIdx(0), [sources]);

  if (thumbSrc) {
    return (
      <button
        type="button"
        ref={cardRef}
        className="hs-tier-card relative z-0 flex-shrink-0 group cursor-pointer hover:z-[9999] focus-within:z-[9999] appearance-none border-0 bg-transparent p-0 text-left"
        data-rarity={String(card.rarity || 'common').toLowerCase()}
        onClick={handleClick}
        onMouseEnter={showPreview}
        onMouseMove={showPreview}
        onMouseLeave={hidePreview}
        onFocus={showPreview}
        onBlur={hidePreview}
        aria-label={`Открыть карту ${card.name}`}
      >
        <div className="hs-tier-card-inner transform transition-all duration-200 group-hover:scale-110 group-hover:z-10">
          <img src={thumbSrc} srcSet={responsiveSrcSet} sizes="(max-width: 640px) 46vw, 230px"
            alt={card.name} loading="lazy" decoding="async" width={230} height={349}
            onError={handleErr} />
        </div>
      </button>
    );
  }

  // Fallback styled card
  const rarityIconSrc = RARITY_ICON[card.rarity] ?? null;
  return (
    <button
      type="button"
      ref={cardRef}
      className="hs-tier-card relative z-0 flex-shrink-0 group cursor-pointer hover:z-[9999] focus-within:z-[9999] appearance-none border-0 bg-transparent p-0 text-left"
      data-rarity={String(card.rarity || 'common').toLowerCase()}
      onClick={handleClick}
      onMouseEnter={showPreview}
      onMouseMove={showPreview}
      onMouseLeave={hidePreview}
      onFocus={showPreview}
      onBlur={hidePreview}
      aria-label={`Открыть карту ${card.name}`}
    >
      <div className="hs-tier-card-inner hs-tier-card-inner--fallback relative rounded-xl flex flex-col items-center justify-center text-center transform transition-transform group-hover:scale-105 group-hover:z-10 overflow-hidden border-2 border-[#1a110a] bg-[#2c1e16]">
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/90" />
        {/* Mana cost */}
        {card.cost !== undefined && (
          <div className="absolute top-1.5 left-1.5 z-20" style={{ width: '22px', height: '22px', position: 'relative' }}>
            <img src={MANA_ICON} alt="мана" className="w-full h-full object-contain" />
            <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,1)]">{card.cost}</span>
          </div>
        )}
        {/* Rarity gem */}
        {rarityIconSrc && (
          <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <img src={rarityIconSrc} alt={card.rarity} className="w-5 h-5 sm:w-6 sm:h-6 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]" />
          </div>
        )}
        <div className="z-10 mt-auto mb-2 w-[112%] -ml-[6%] bg-gradient-to-b from-[#4a3018] to-[#2c1e16] border-y-2 border-[#a88a45] py-1 px-1">
          <span className="font-hs text-[#fcd34d] text-[9px] sm:text-[11px] leading-tight block text-center truncate">{card.name}</span>
        </div>
      </div>
    </button>
  );
}) as React.FC<HSCardProps>;

// ─── Skeleton / misc ──────────────────────────────────────────────────────────

const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} />
);

const UpdateBadge: React.FC<{ updatedAt: string | null }> =
  ({ updatedAt }) => {
    // Warn when data hasn't been updated in >24 hours
    const isStale = updatedAt
      ? (Date.now() - new Date(updatedAt).getTime()) > 24 * 60 * 60 * 1000
      : false;

    return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Staleness warning */}
      {isStale && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
          style={{
            background: 'linear-gradient(135deg,#7a1e1e,#4a0a0a)',
            border: '1.5px solid #dc2626',
            color: '#fca5a5',
            boxShadow: '0 2px 6px rgba(220,38,38,0.3)',
          }}>
          <AlertTriangle size={11} />
          <span>Данные устарели</span>
        </div>
      )}
      {/* Timestamp pill */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
        style={{
          background: 'linear-gradient(135deg,#3a2210,#2c1e16)',
          border: `1.5px solid ${isStale ? '#dc2626' : '#6b4c2a'}`,
          color: '#e8d5a5',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}>
        <RefreshCw size={11} className="text-[#a88a45]" />
        <span className="font-medium">
          {updatedAt ? formatDate(updatedAt) : 'Загружается…'}
        </span>
      </div>
	    </div>
	  );
};

// ─── Winrates tab ─────────────────────────────────────────────────────────────


export function Winrates({ classes, loading, switching, error, updatedAt, winrateSource, onSourceChange, onNavigate, authUser, subscriptionStatus, subscriptionLoading, onRefreshSubscription }: {
  classes: ClassData[]; loading: boolean; switching: boolean; error: boolean;
  updatedAt: string | null;
  winrateSource: 'hsreplay' | 'firestone';
  onSourceChange: (src: 'hsreplay' | 'firestone') => void;
  onNavigate: (tab: string) => void;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  // Trigger bar fill animation after mount
  const [barsVisible, setBarsVisible] = useState(false);
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setBarsVisible(true), 80);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const maxWinrate = useMemo(() => Math.max(...classes.map(c => c.winrate), 1), [classes]);
  const paywallActive = !subscriptionLoading && !hasSubscriptionEntitlement(subscriptionStatus, 'arena');

  return (
    <div className="arena-classes-page">
      <SectionBanner title="Классы" subtitle="Статистика побед на Арене — текущий патч" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Классы', href: '/classes' },
      ]} />
      <section aria-label="Описание раздела">
        <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
          style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
          Винрейт классов на Арене Hearthstone показывает процент побед каждого из 11 классов.
          Данные основаны на миллионах реальных партий и обновляются автоматически каждые 6 часов.
          Рейтинг помогает выбрать лучший класс для драфта на текущем патче.
        </p>
      </section>
      <PaywallGate
        active={paywallActive}
        title="Подтвердите подписку Манакоста для доступа к классам"
        authUser={authUser}
        subscriptionStatus={subscriptionStatus}
        subscriptionLoading={subscriptionLoading}
        onRefreshSubscription={onRefreshSubscription}
      >
      {/* UpdateBadge row */}
      <div
        className="arena-classes-update flex items-center justify-end mb-6 -mt-2"
        data-tour-id="arena-classes-source"
      >
        <UpdateBadge updatedAt={updatedAt} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Нет соединения — показаны кэшированные данные</span>
        </div>
      )}

      <div
        className="arena-classes-board space-y-2.5 sm:space-y-3 relative"
      >
        <div className="arena-source-loading-overlay absolute inset-0 z-10 flex items-center justify-center rounded-2xl pointer-events-none"
          style={{
            background: 'transparent',
            backdropFilter: 'none',
            opacity: switching && !loading ? 1 : 0,
            visibility: switching && !loading ? 'visible' : 'hidden',
            transition: 'opacity 0.25s ease',
          }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-hs text-sm"
            style={{ background: 'linear-gradient(135deg,#5a3000,#3d1e00)', color: '#fcd34d',
              transform: switching && !loading ? 'scale(1)' : 'scale(0.9)',
              transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
            }}>
            <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
            Загрузка HSReplay…
          </div>
        </div>
        {loading
          ? Array.from({ length: 11 }).map((_, i) => (
              <div key={i} className="skeleton h-16 sm:h-[72px] w-full" style={{ animationDelay: `${i * 0.06}s` }} />
            ))
          : classes.map((cls, index) => {
              const icon    = CLASS_ICON_BY_ID[cls.id];
              const barPct  = barsVisible ? Math.max((cls.winrate / maxWinrate) * 100, 6) : 0;
              const delay   = `${0.05 + index * 0.06}s`;
              const barDelay = `${0.2 + index * 0.06}s`;

              return (
                <div
                  key={cls.id}
                  data-rank={index + 1}
                  data-tour-id={index === 0 ? 'arena-classes-ranking' : undefined}
                  className="arena-class-row anim-fade-up row-hover group relative grid items-center gap-2.5 rounded-2xl overflow-hidden cursor-default sm:flex sm:gap-4"
                  style={{
                    animationDelay: delay,
                    background: 'linear-gradient(135deg, #ede0c0 0%, #e2cfa0 50%, #d8c090 100%)',
                    border: '1.5px solid #c9a86c',
                    padding: '10px 14px',
                    gridTemplateColumns: '28px 36px minmax(82px,96px) minmax(0,1fr)',
                  }}
                >
                  <span className="arena-class-rank" aria-label={`Место ${index + 1}`}>{index + 1}</span>
                  {/* Class icon */}
                  {icon && (
                    <img src={icon} alt={cls.name}
                      className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                      draggable={false}
                    />
                  )}

                  {/* Class name */}
                  <div className="min-w-0 sm:flex-shrink-0 sm:w-40">
                    <span className="font-hs text-sm sm:text-base text-[#3d2208] tracking-wide leading-tight">
                      {cls.name}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div
                    className="arena-class-meter relative h-7 sm:h-8 rounded-full overflow-hidden sm:flex-grow"
                    data-tour-id={index === 0 ? 'arena-classes-details' : undefined}
                    style={{
                      minWidth: 118,
                      background: 'linear-gradient(180deg,#1a0e06 0%,#2c1a0e 100%)',
                      boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(255,255,255,0.05)',
                      border: '1.5px solid #0a0502',
                    }}>
                    {/* Fill */}
                    <div className="arena-class-meter-fill absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-full"
                      style={{
                        width:      `${barPct}%`,
                        transition: `width 1.1s cubic-bezier(0.4, 0, 0.2, 1) ${barDelay}`,
                        backgroundImage: `linear-gradient(180deg, ${cls.color}ff 0%, ${cls.color}cc 100%)`,
                        boxShadow: `inset 0 2px 5px rgba(255,255,255,0.25), inset 0 -2px 5px rgba(0,0,0,0.35), 0 0 12px ${cls.color}66`,
                      }}>
                      {/* Shine stripe */}
                      <div className="absolute inset-x-0 top-0 h-[40%] rounded-t-full"
                        style={{ background: 'linear-gradient(180deg,rgba(255,255,255,0.3),transparent)' }} />
                      {/* Winrate label inside bar */}
                      <span className="relative z-10 pl-3 font-bold text-xs sm:text-sm tracking-wide"
                        style={{
                          color: cls.textDark ? 'rgba(0,0,0,0.85)' : '#fff',
                          textShadow: cls.textDark ? 'none' : '0 1px 4px rgba(0,0,0,0.9)',
                          opacity: barsVisible ? 1 : 0,
                          transition: `opacity 0.3s ease ${parseFloat(barDelay) + 0.6}s`,
                        }}>
                        {cls.winrate.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Games count */}
                  {(cls.games ?? 0) > 0 && (
                    <div className="flex-shrink-0 hidden lg:block text-right min-w-[88px]">
                      <span className="text-xs text-[#8b6c42] font-medium">
                        {cls.games!.toLocaleString('ru-RU')} игр
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
      </div>

      <InternalLinks links={[
        { label: 'Тир-лист карт →', href: '/tierlist', onClick: () => onNavigate('tierlist') },
        { label: 'Легендарки →', href: '/legendaries', onClick: () => onNavigate('legendaries') },
        { label: 'Статьи о Арене →', href: '/articles', onClick: () => onNavigate('articles') },
      ]} />
      </PaywallGate>
      <FAQSection />
    </div>
  );
}

// ─── Class tabs ───────────────────────────────────────────────────────────────

const ClassTabs: React.FC<{
  sections: ClassSection[];
  activeId: string;
  onChange: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}> = memo(({ sections, activeId, onChange, searchQuery, onSearchChange }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-id="${activeId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  return (
    <div
      className="tierlist-class-tabs flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
      style={{
        background: 'linear-gradient(135deg,#f4e8cc,#ede0c0)',
        border: '1.5px solid #c4a46a',
        boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.15), 0 2px 6px rgba(0,0,0,0.12)',
      }}
    >
      {/* Icon buttons */}
      <div ref={scrollRef} className="tierlist-class-scroll flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* "All cards" virtual tab */}
        {(() => {
          const isActive = activeId === ALL_CARDS_ID;
          return (
            <button
              type="button"
              key={ALL_CARDS_ID}
              data-id={ALL_CARDS_ID}
              aria-pressed={isActive}
              onClick={() => onChange(ALL_CARDS_ID)}
              title="Все карты"
              className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center relative transition-all duration-200"
              style={{
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                filter: isActive ? 'none' : 'grayscale(0.2) brightness(0.85)',
              }}
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full overflow-hidden flex items-center justify-center"
                style={{
                  boxShadow: isActive
                    ? '0 0 0 2.5px #fcd34d, 0 3px 10px rgba(0,0,0,0.5)'
                    : '0 2px 6px rgba(0,0,0,0.35)',
                  border: '2px solid rgba(0,0,0,0.25)',
                }}
              >
                <img src="/class_icon/all1.png" alt="Все карты" className="w-7 h-7 sm:w-8 sm:h-8 object-contain" draggable={false} />
              </div>
              {isActive && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#fcd34d]" />
              )}
            </button>
          );
        })()}
        {sections.map(sec => {
          const isActive = sec.id === activeId;
          const iconSrc  = CLASS_ICON[sec.id];

          return (
            <button
              type="button"
              key={sec.id}
              data-id={sec.id}
              aria-pressed={isActive}
              onClick={() => onChange(sec.id)}
              title={sec.name}
              className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center relative transition-all duration-200"
              style={{
                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                filter: isActive ? 'none' : 'grayscale(0.2) brightness(0.85)',
              }}
            >
              <div
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: `radial-gradient(circle at 35% 35%, ${sec.color}ff, ${sec.color}aa)`,
                  boxShadow: isActive
                    ? `0 0 0 2.5px #fcd34d, 0 0 10px rgba(252,211,77,0.55), 0 3px 8px rgba(0,0,0,0.45)`
                    : `0 0 0 1.5px rgba(0,0,0,0.35), 0 2px 5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.2)`,
                }}
              >
                {iconSrc ? (
                  <img
                    src={iconSrc}
                    alt={sec.name}
                    className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                    draggable={false}
                  />
                ) : (
                  <span className="text-white/80 text-sm font-hs">⚔</span>
                )}
              </div>
              {isActive && (
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#fcd34d]"
                  style={{ boxShadow: '0 0 4px rgba(252,211,77,0.8)' }}
                />
              )}
              {sec.classPosition && (
                <div
                  className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none"
                  style={{
                    background: 'linear-gradient(135deg,#6b4c2a,#3a2210)',
                    color: '#fcd34d',
                    border: '1px solid rgba(252,211,77,0.5)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                  }}
                >
                  {sec.classPosition}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="tierlist-class-divider w-px h-7 flex-shrink-0 bg-[#c4a46a]/50 mx-1" />

      {/* Search */}
      <div className="tierlist-class-search relative flex-grow min-w-[140px]">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b4513]/50 pointer-events-none" />
        <input
          type="text"
          placeholder="Поиск: Йогг-Сарон, Рагнарос..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-transparent pl-8 pr-11 py-1.5 text-sm text-[#3d2a1e] placeholder-[#8b6c42]/60 outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => onSearchChange('')}
            className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-[#8b4513]/50 hover:text-[#8b4513] transition-colors"
          >
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}) as React.FC<{ sections: ClassSection[]; activeId: string; onChange: (id: string) => void; searchQuery: string; onSearchChange: (q: string) => void }>;

// ─── TierList tab ─────────────────────────────────────────────────────────────

// Kept outside the function — these never change and would be recreated every render
const TIER_LABEL_FULL: Record<string, string> = {
  S: 'Отлично',
  A: 'Хорошо',
  B: 'Выше среднего',
  C: 'Средне',
  D: 'Ниже среднего',
  E: 'Плохо',
  F: 'Ужасно',
  U: 'Без тира',
};

const TIER_DESC_MAP: Record<string, string> = {
  S: 'Авто-пик — доминирующие карты текущего метагейма.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Ниже среднего — берите только если нет лучших карт.',
  E: 'Плохие карты — последний выбор.',
  F: 'Ужасные карты — никогда не стоит брать.',
  U: 'Карты без Arenasmith Score в текущем срезе HSReplay.',
};

const RARITY_OPTIONS = [
  { id: 'all',       name: 'Все',        icon: null },
  { id: 'common',    name: 'Обычная',    icon: '/assets/common.png' },
  { id: 'rare',      name: 'Редкая',     icon: '/assets/rare.png' },
  { id: 'epic',      name: 'Эпическая',  icon: '/assets/epic.png' },
  { id: 'legendary', name: 'Легендарная',icon: '/assets/legendary.png' },
];

type ManaFilterValue = 'all' | number;

const MANA_FILTER_OPTIONS: Array<{ id: ManaFilterValue; name: string; label: string }> = [
  { id: 'all', name: 'Все стоимости', label: 'Все' },
  ...Array.from({ length: 11 }, (_, cost) => ({
    id: cost,
    name: cost === 10 ? '10+ маны' : `${cost} маны`,
    label: cost === 10 ? '10+' : String(cost),
  })),
];

const ALL_CARDS_ID = '__all__';
const INITIAL_TIERLIST_CARDS_MOBILE = 36;
const INITIAL_TIERLIST_CARDS_DESKTOP = 180;
const TIERLIST_CARDS_STEP_MOBILE = 36;
const TIERLIST_CARDS_STEP_DESKTOP = 180;

const TABLE_METRIC_COLUMNS = [
  { key: 'deckWinrate', label: 'Винрейт колоды', hint: 'Winrate of decks including the card.' },
  { key: 'drawnWinrate', label: 'При взятии', hint: 'Winrate when the card was drawn.' },
  { key: 'playedWinrate', label: 'При розыгрыше', hint: 'Winrate when the card was played.' },
  { key: 'inDecks', label: 'В % заходов', hint: 'Percentage of runs/decks including the card.' },
  { key: 'avgCopies', label: 'Копий', hint: 'Average copies in deck.' },
  { key: 'totalGames', label: 'Партий', hint: 'Total games with this card.' },
  { key: 'arenaScore', label: 'ArenaSmith', hint: 'Static card power score.' },
  { key: 'pickRate', label: 'Pick Rate', hint: 'How often the card is picked.' },
  { key: 'offerRate', label: 'Частота выбора', hint: 'How often the card is offered/selected.' },
] as const;

function metricTone(value: number | null | undefined, type: 'pct' | 'score' = 'pct'): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'text-[#8b6c42]';
  if (type === 'score') {
    if (value >= 80) return 'text-emerald-700';
    if (value >= 50) return 'text-lime-700';
    if (value >= 30) return 'text-amber-700';
    return 'text-orange-700';
  }
  if (value >= 57) return 'text-emerald-700';
  if (value >= 52) return 'text-green-700';
  if (value >= 49) return 'text-amber-700';
  return 'text-orange-700';
}

function tableMetricValue(card: CardData, key: typeof TABLE_METRIC_COLUMNS[number]['key']): string {
  if (key === 'deckWinrate') return formatPct(card.deckWinrate ?? card.winrate);
  if (key === 'totalGames') return formatCount(card.totalGames);
  if (key === 'arenaScore') return typeof card.arenaScore === 'number' ? card.arenaScore.toFixed(0) : '—';
  if (key === 'avgCopies') return typeof card.avgCopies === 'number' ? card.avgCopies.toFixed(card.avgCopies % 1 === 0 ? 0 : 1) : '—';
  return formatPct(card[key]);
}

const MOBILE_TABLE_METRIC_KEYS: Array<typeof TABLE_METRIC_COLUMNS[number]['key']> = [
  'deckWinrate',
  'drawnWinrate',
  'playedWinrate',
  'inDecks',
  'avgCopies',
  'totalGames',
  'arenaScore',
  'pickRate',
  'offerRate',
];

function useSmallViewport(): boolean {
  const [small, setSmall] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 639px)').matches
      : false
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setSmall(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return small;
}

function useFineHoverPointer(): boolean {
  const getFineHover = () => {
    if (typeof window === 'undefined') return false;
    const mediaMatches = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    return mediaMatches || navigator.maxTouchPoints === 0;
  };

  const [fineHover, setFineHover] = useState(() => (
    getFineHover()
  ));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setFineHover(getFineHover());
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return fineHover;
}

type CardRenderTooltipPosition = {
  left: number;
  top: number;
};

const CARD_RENDER_TOOLTIP_WIDTH = 224;
const CARD_RENDER_TOOLTIP_HEIGHT = 336;

function clampNumber(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function getCardRenderTooltipPosition(el: HTMLElement): CardRenderTooltipPosition {
  const rect = el.getBoundingClientRect();
  const edge = 10;
  const gap = 12;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const width = Math.min(CARD_RENDER_TOOLTIP_WIDTH, viewportWidth - edge * 2);
  const height = Math.min(CARD_RENDER_TOOLTIP_HEIGHT, viewportHeight - edge * 2);
  const centeredTop = clampNumber(rect.top + rect.height / 2 - height / 2, edge, viewportHeight - height - edge);

  if (rect.right + gap + width <= viewportWidth - edge) {
    return { left: rect.right + gap, top: centeredTop };
  }

  if (rect.left - gap - width >= edge) {
    return { left: rect.left - gap - width, top: centeredTop };
  }

  const centeredLeft = clampNumber(rect.left + rect.width / 2 - width / 2, edge, viewportWidth - width - edge);
  const belowTop = rect.bottom + gap;
  const aboveTop = rect.top - gap - height;

  return {
    left: centeredLeft,
    top: belowTop + height <= viewportHeight - edge ? belowTop : clampNumber(aboveTop, edge, viewportHeight - height - edge),
  };
}

const CardRenderTooltip: React.FC<{ card: CardData; position: CardRenderTooltipPosition }> = ({ card, position }) => {
  const sources = useMemo(() => uniqueSources([
    card.cardId ? hsJsonRenderUrl(card.cardId, '256x', 'ruRU') : null,
    card.cardId ? hsImgUrl(card.cardId, '512x') : null,
    card.cardId ? hsJsonRenderUrl(card.cardId, '256x', 'enUS') : null,
    card.imageRu || null,
    card.imageHa || null,
  ]), [card.cardId, card.imageHa, card.imageRu]);
  const [srcIdx, setSrcIdx] = useState(0);
  const src = sources[srcIdx] ?? null;

  useEffect(() => setSrcIdx(0), [card.cardId]);

  if (!src) return null;

  return createPortal(
    <div
      className="pointer-events-none rounded-xl"
      style={{
        position: 'fixed',
        left: position.left,
        top: position.top,
        width: CARD_RENDER_TOOLTIP_WIDTH,
        maxWidth: 'calc(100vw - 20px)',
        zIndex: 2147483000,
        filter: 'drop-shadow(0 18px 38px rgba(0,0,0,0.78))',
      }}
    >
      <img
        src={src}
        alt={card.name}
        width={224}
        height={336}
        decoding="async"
        loading="eager"
        onError={() => setSrcIdx(i => i + 1)}
        className="h-auto w-full rounded-xl"
        style={{
          border: '1px solid rgba(252,211,77,0.35)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.55)',
        }}
        draggable={false}
      />
    </div>,
    document.body,
  );
};

const HSREPLAY_TILE_RARITIES = new Set(['free', 'common', 'rare', 'epic', 'legendary']);

function normalizeHsReplayTileRarity(rarity?: string): string {
  const normalized = String(rarity || 'common').toLowerCase();
  return HSREPLAY_TILE_RARITIES.has(normalized) ? normalized : 'common';
}

function formatHsReplayTileCost(cost?: number): string {
  if (typeof cost !== 'number' || !Number.isFinite(cost)) return '0';
  return String(Math.max(0, Math.min(10, Math.trunc(cost))));
}

const HSTableCardThumb: React.FC<{
  card: CardData;
  onClick: () => void;
  onPreviewStart: (card: CardData, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
}> = memo(({ card, onClick, onPreviewStart, onPreviewEnd }) => {
  const sources = useMemo(() => uniqueSources([
    card.cardId ? hsJsonTileUrl(card.cardId) : null,
    card.cardId ? hsJsonTileUrl(card.cardId, 'jpg') : null,
    card.cardId ? hsJsonArtUrl(card.cardId) : null,
    card.imageRu || null,
    card.imageHa || null,
  ]), [card.cardId, card.imageHa, card.imageRu]);
  const [srcIdx, setSrcIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const src = sources[srcIdx] ?? null;
  const rarity = normalizeHsReplayTileRarity(card.rarity);
  const isLegendary = rarity === 'legendary';
  const showPreview = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    onPreviewStart(card, el);
  }, [card, onPreviewStart]);
  const handleClick = useCallback(() => {
    onPreviewEnd();
    onClick();
  }, [onClick, onPreviewEnd]);

  useEffect(() => setSrcIdx(0), [sources]);

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={handleClick}
      onMouseEnter={showPreview}
      onMouseMove={showPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={showPreview}
      onBlur={onPreviewEnd}
      className="hsrdv hsrdv-table-card group text-left"
      aria-label={`Открыть карту ${card.name}`}
      title={card.name}
    >
      <div className="hsrdv-card-tile" data-card-id={card.cardId}>
        <div className={`hsrdv-card-gem hsrdv-rarity-${rarity}`}>
          <span className="hsrdv-card-cost">{formatHsReplayTileCost(card.cost)}</span>
        </div>
        <div className={`hsrdv-card-frame ${isLegendary ? 'hsrdv-card-frame--with-count' : 'hsrdv-card-frame--without-count'}`}>
          {src ? (
            <img
              src={src}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setSrcIdx(i => i + 1)}
              className="hsrdv-card-art"
            />
          ) : (
            <span className="hsrdv-card-art hsrdv-card-art--fallback">HS</span>
          )}
          {isLegendary && (
            <div className="hsrdv-card-countbox" aria-hidden="true">
              <span className="hsrdv-card-count">★</span>
            </div>
          )}
          <span className="hsrdv-card-fade" aria-hidden="true" />
          <span className="hsrdv-card-name">{card.name}</span>
        </div>
      </div>
    </button>
  );
}) as React.FC<{
  card: CardData;
  onClick: () => void;
  onPreviewStart: (card: CardData, anchor: HTMLElement) => void;
  onPreviewEnd: () => void;
}>;

function HSReplayCardsTable({ tiers, onCardOpen, previewSuppressed = false }: {
  tiers: Array<TierSection & { cards: CardData[] }>;
  onCardOpen: (card: CardData, tier: string) => void;
  previewSuppressed?: boolean;
}) {
  const canHoverPreview = useFineHoverPointer();
  const rows = useMemo(
    () => tiers.flatMap(tier => tier.cards.map(card => ({ tier: tier.tier, card }))),
    [tiers],
  );
  const [preview, setPreview] = useState<{ card: CardData; position: CardRenderTooltipPosition } | null>(null);
  const suppressPreviewRef = useRef(false);
  const hidePreview = useCallback(() => setPreview(null), []);
  const allowPreview = useCallback(() => {
    suppressPreviewRef.current = false;
  }, []);
  const hidePreviewAfterViewportShift = useCallback(() => {
    suppressPreviewRef.current = true;
    setPreview(null);
  }, []);
  const showPreview = useCallback((card: CardData, anchor: HTMLElement) => {
    if (previewSuppressed) return;
    if (!canHoverPreview) return;
    if (suppressPreviewRef.current) return;
    setPreview(current => (
      current?.card.cardId === card.cardId
        ? current
        : { card, position: getCardRenderTooltipPosition(anchor) }
    ));
  }, [canHoverPreview, previewSuppressed]);

  useEffect(() => {
    if (!preview) return;
    window.addEventListener('scroll', hidePreviewAfterViewportShift, true);
    window.addEventListener('resize', hidePreviewAfterViewportShift);
    return () => {
      window.removeEventListener('scroll', hidePreviewAfterViewportShift, true);
      window.removeEventListener('resize', hidePreviewAfterViewportShift);
    };
  }, [preview, hidePreviewAfterViewportShift]);

  useEffect(() => {
    if (!canHoverPreview) setPreview(null);
  }, [canHoverPreview]);

  useEffect(() => {
    if (previewSuppressed) setPreview(null);
  }, [previewSuppressed]);

  if (!rows.length) {
    return (
      <div className="text-center py-14 rounded-2xl"
        style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
        <div className="text-4xl mb-3">🃏</div>
        <p className="text-xl font-hs text-[#8b4513] tracking-wide">Карты не найдены</p>
        <p className="text-[#8b6c42] mt-2 text-sm">Попробуйте изменить фильтры.</p>
      </div>
    );
  }

  return (
    <>
      {!previewSuppressed && preview && <CardRenderTooltip card={preview.card} position={preview.position} />}

      <div
        className="tierlist-table-mobile hsreplay-mobile-table sm:hidden flex flex-col gap-3"
        onMouseMoveCapture={allowPreview}
        onMouseLeave={hidePreview}
      >
        {rows.map(({ tier, card }, idx) => (
          <article
            key={`${tier}-${card.cardId}-${idx}-mobile`}
            className="tierlist-table-card rounded-xl border border-[#c4a46a]/70 bg-[#fff4d4]/85 p-2.5 shadow-[0_8px_22px_rgba(72,43,12,0.14)]"
          >
            <div className="flex items-center gap-2">
              <span className={`inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs font-hs shadow ${TIER_COLORS[tier] || TIER_COLORS.C}`}>
                {tier}
              </span>
              <div className="min-w-0 flex-1">
                <HSTableCardThumb
                  card={card}
                  onClick={() => onCardOpen(card, tier)}
                  onPreviewStart={showPreview}
                  onPreviewEnd={hidePreview}
                />
              </div>
            </div>

            <dl className="mt-2 grid grid-cols-2 gap-1.5">
              {MOBILE_TABLE_METRIC_KEYS.map(key => {
                const col = TABLE_METRIC_COLUMNS.find(item => item.key === key);
                if (!col) return null;
                const raw = key === 'deckWinrate' ? (card.deckWinrate ?? card.winrate) : card[key];
                const tone = key === 'arenaScore' ? metricTone(raw, 'score') : metricTone(raw, 'pct');
                return (
                  <div key={key} className="rounded-lg border border-[#c4a46a]/35 bg-[#f5e2b8]/70 px-2 py-1">
                    <dt className="text-[10px] font-bold uppercase leading-tight text-[#8b6c42]">{col.label}</dt>
                    <dd className={`mt-0.5 text-sm font-black leading-none ${tone}`}>{tableMetricValue(card, key)}</dd>
                  </div>
                );
              })}
            </dl>
          </article>
        ))}
      </div>

      <div
        className="tierlist-table-desktop hidden overflow-x-auto rounded-2xl border border-[#c4a46a]/70 bg-[#f5e2b8]/70 shadow-[0_10px_32px_rgba(72,43,12,0.18)] sm:block"
        onMouseMoveCapture={allowPreview}
        onMouseLeave={hidePreview}
        onScroll={hidePreviewAfterViewportShift}
      >
        <table className="min-w-[1060px] w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-gradient-to-r from-[#7a4a16] via-[#5a3000] to-[#7a4a16] text-[#ffe7a8]">
            <th className="sticky left-0 z-20 w-[340px] bg-[#6b3b0b] px-2.5 py-1.5 text-left font-hs text-xs tracking-wide">Карта</th>
            <th className="w-14 px-2 py-1.5 text-center font-hs text-xs tracking-wide">Tier</th>
            {TABLE_METRIC_COLUMNS.map(col => (
              <th key={col.key} className="px-2 py-1.5 text-right text-[10px] font-bold uppercase tracking-wide" title={col.hint}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tier, card }, idx) => (
            <tr
              key={`${tier}-${card.cardId}-${idx}`}
              className="border-b border-[#c4a46a]/30 transition-colors odd:bg-[#fff6df]/80 even:bg-[#f3dfb5]/80 hover:bg-[#fff1c8]"
            >
              <td className="sticky left-0 z-10 bg-inherit px-2.5 py-1">
                <HSTableCardThumb
                  card={card}
                  onClick={() => onCardOpen(card, tier)}
                  onPreviewStart={showPreview}
                  onPreviewEnd={hidePreview}
                />
              </td>
              <td className="px-2 py-1 text-center">
                <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-hs shadow ${TIER_COLORS[tier] || TIER_COLORS.C}`}>
                  {tier}
                </span>
              </td>
              {TABLE_METRIC_COLUMNS.map(col => {
                const raw = col.key === 'deckWinrate' ? (card.deckWinrate ?? card.winrate) : card[col.key];
                const tone = col.key === 'arenaScore' ? metricTone(raw, 'score') : metricTone(raw, 'pct');
                return (
                  <td key={col.key} className={`px-2 py-1 text-right font-bold ${tone}`}>
                    {tableMetricValue(card, col.key)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </>
  );
}

export function TierList({ data, loading, error, companionIds, tierlistSource, onTierlistSourceChange, switchingTierlistSource, onNavigate, authUser, subscriptionStatus, subscriptionLoading, onRefreshSubscription }: {
  data: TierlistData; loading: boolean; error: boolean;
  companionIds: Set<string>;
  tierlistSource: TierlistSource;
  onTierlistSourceChange: (src: TierlistSource) => void;
  switchingTierlistSource: boolean;
  onNavigate: (tab: string) => void;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  const [activeClassId, setActiveClassId] = useState<string>(ALL_CARDS_ID);
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [selectedManaCost, setSelectedManaCost] = useState<ManaFilterValue>('all');
  const [viewMode, setViewMode] = useState<TierlistViewMode>('gallery');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);
  const isSmallViewport = useSmallViewport();
  const canHoverPreview = useFineHoverPointer();
  const [galleryPreview, setGalleryPreview] = useState<{ card: CardData; position: CardTooltipPosition } | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedSearchQuery = useMemo(
    () => deferredSearchQuery.trim().toLowerCase(),
    [deferredSearchQuery],
  );
  const cardPageSize = isSmallViewport ? INITIAL_TIERLIST_CARDS_MOBILE : INITIAL_TIERLIST_CARDS_DESKTOP;
  const cardPageStep = isSmallViewport ? TIERLIST_CARDS_STEP_MOBILE : TIERLIST_CARDS_STEP_DESKTOP;
  const [visibleCardLimit, setVisibleCardLimit] = useState(INITIAL_TIERLIST_CARDS_DESKTOP);

  const sections = data.sections;
  const cards    = data.cards;

  // Virtual "all cards" section — best tier per unique cardId across all sections
  const allCardsSection = useMemo<ClassSection>(() => {
    const TIER_RANK: Record<string, number> = { S:6, A:5, B:4, C:3, D:2, E:1, F:0, U:-1 };
    const best = new Map<string, { card: TierCard; tier: string }>();
    const shouldHideCompanions = tierlistSource !== 'hsreplay';
    for (const sec of sections) {
      for (const tierGroup of sec.tiers) {
        for (const card of tierGroup.cards) {
          if (shouldHideCompanions && companionIds.has(card.cardId)) continue;
          const prev = best.get(card.cardId);
          if (!prev || (TIER_RANK[tierGroup.tier] ?? 0) > (TIER_RANK[prev.tier] ?? 0)) {
            best.set(card.cardId, { card, tier: tierGroup.tier });
          }
        }
      }
    }
    // Group deduplicated cards by tier
    const tierMap = new Map<string, TierCard[]>();
    for (const { card, tier } of best.values()) {
      if (!tierMap.has(tier)) tierMap.set(tier, []);
      tierMap.get(tier)!.push(card);
    }
    const tierOrder = ['S','A','B','C','D','E','F','U'];
    return {
      id: ALL_CARDS_ID, name: 'Все карты', color: '#5a3000',
      textDark: false,
      totalCards: best.size,
      tiers: tierOrder
        .filter(t => tierMap.has(t))
        .map(t => ({
          tier: t, label: TIER_LABEL_FULL[t] ?? t,
          description: TIER_DESC_MAP[t] ?? '',
          cards: tierMap.get(t)!,
        })),
    };
  }, [sections, companionIds, tierlistSource]);

  // Find active section (virtual "all" or real class)
  const activeSection = activeClassId === ALL_CARDS_ID
    ? allCardsSection
    : (sections.find(s => s.id === activeClassId) ?? sections[0]);

  // When class changes, reset filters
  const handleClassChange = (id: string) => {
    setActiveClassId(id);
    setSearchQuery('');
    setSelectedRarity('all');
    setSelectedManaCost('all');
  };

  const isNeutralTab    = activeClassId === 'any';
  const isAllCardsTab   = activeClassId === ALL_CARDS_ID;
  const canUseTableView = tierlistSource === 'hsreplay';
  const hideGalleryPreview = useCallback(() => setGalleryPreview(null), []);
  const showGalleryPreview = useCallback((card: CardData, anchor: HTMLElement) => {
    if (!canHoverPreview) return;
    setGalleryPreview(current => (
      current?.card.cardId === card.cardId
        ? current
        : { card, position: getCardStatsTooltipPosition(anchor) }
    ));
  }, [canHoverPreview]);

  useEffect(() => {
    if (!canUseTableView && viewMode === 'table') setViewMode('gallery');
  }, [canUseTableView, viewMode]);

  useEffect(() => {
    if (!galleryPreview) return;
    window.addEventListener('scroll', hideGalleryPreview, true);
    window.addEventListener('resize', hideGalleryPreview);
    return () => {
      window.removeEventListener('scroll', hideGalleryPreview, true);
      window.removeEventListener('resize', hideGalleryPreview);
    };
  }, [galleryPreview, hideGalleryPreview]);

  useEffect(() => {
    if (!canHoverPreview) setGalleryPreview(null);
  }, [canHoverPreview]);

  useEffect(() => {
    if (modalCard) setGalleryPreview(null);
  }, [modalCard]);

  useEffect(() => {
    setGalleryPreview(null);
  }, [viewMode, tierlistSource, activeClassId, selectedRarity, selectedManaCost, normalizedSearchQuery]);

  useEffect(() => {
    setVisibleCardLimit(cardPageSize);
  }, [cardPageSize, activeClassId, selectedRarity, selectedManaCost, normalizedSearchQuery, tierlistSource, viewMode]);

  const filteredTiers = useMemo(() =>
    (activeSection?.tiers ?? []).map(t => ({
      ...t,
      cards: t.cards
        .map(tc => mergeCard(tc, cards))
        .filter(c => {
          const matchSearch = !normalizedSearchQuery || c.name.toLowerCase().includes(normalizedSearchQuery);
          const matchRarity = selectedRarity === 'all' || c.rarity === selectedRarity;
          const matchMana = selectedManaCost === 'all'
            || (typeof c.cost === 'number' && (selectedManaCost === 10 ? c.cost >= 10 : c.cost === selectedManaCost));
          const matchClass  = isNeutralTab ? true : isAllCardsTab ? true : c.classKey !== 'any';
          const isLegendaryCompanion = tierlistSource !== 'hsreplay' && c.rarity === 'legendary' && companionIds.has(c.cardId);
          return matchSearch && matchRarity && matchMana && matchClass && !isLegendaryCompanion;
        })
    })).filter(t => t.cards.length > 0),
  [activeSection, normalizedSearchQuery, selectedRarity, selectedManaCost, isNeutralTab, isAllCardsTab, companionIds, cards, tierlistSource]);

  const totalFilteredCards = useMemo(
    () => filteredTiers.reduce((sum, tier) => sum + tier.cards.length, 0),
    [filteredTiers],
  );

  const visibleTiers = useMemo(() => {
    let remaining = visibleCardLimit;
    return filteredTiers
      .map(tier => {
        const visibleCards = remaining > 0 ? tier.cards.slice(0, remaining) : [];
        remaining -= visibleCards.length;
        return {
          ...tier,
          cards: visibleCards,
          totalCardsInTier: tier.cards.length,
        };
      })
      .filter(tier => tier.cards.length > 0);
  }, [filteredTiers, visibleCardLimit]);

  const visibleCardCount = useMemo(
    () => visibleTiers.reduce((sum, tier) => sum + tier.cards.length, 0),
    [visibleTiers],
  );
  const hiddenCardCount = Math.max(0, totalFilteredCards - visibleCardCount);
  const paywallActive = !subscriptionLoading && !hasSubscriptionEntitlement(subscriptionStatus, 'arena');

  return (
    <div className="arena-tierlist-page">
      <SectionBanner title="Тир-лист карт Арены Hearthstone" subtitle="Оценки карт для каждого класса — текущий патч" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Тир-лист', href: '/tierlist' },
      ]} />
      <ArenaTierListSearchIntro />
      <PaywallGate
        active={paywallActive}
        title="Подтвердите подписку Манакоста для доступа к тир-листу"
        authUser={authUser}
        subscriptionStatus={subscriptionStatus}
        subscriptionLoading={subscriptionLoading}
        onRefreshSubscription={onRefreshSubscription}
      >
      {/* Source toggle + UpdateBadge row */}
      <div
        className="tierlist-source-row flex items-center justify-between mb-4 -mt-2 flex-wrap gap-2"
        data-tour-id="arena-tier-source"
      >
        {/* Source switcher */}
        <div className="tierlist-source-toggle flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
          {TIERLIST_SOURCES.map(src => {
            const active = tierlistSource === src;
            return (
              <SourceToggleButton
                key={src}
                source={src}
                label={TIERLIST_SOURCE_LABEL[src]}
                active={active}
                busy={switchingTierlistSource}
                onClick={() => { if (!active && !switchingTierlistSource) onTierlistSourceChange(src); }}
              />
            );
          })}
        </div>
        <UpdateBadge updatedAt={data.updatedAt} />
      </div>

      {!loading && <TierlistEarlyStatsNotice provisional={data.provisional} />}

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-4 opacity-70">
          <AlertTriangle size={13} /><span>Сервер недоступен — показаны кэшированные данные</span>
        </div>
      )}

      {/* External dataset warning */}
      {data.warning && !loading && (
        <div className="flex items-center gap-3 mb-5 px-4 py-3 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#1a2a3a,#0f1e2d)', border: '1.5px solid rgba(96,165,250,0.35)' }}>
          <AlertTriangle size={15} style={{ color: '#93c5fd', flexShrink: 0 }} />
          <span style={{ color: '#bfdbfe', fontSize: '13px' }}>
            Внешний источник временно недоступен — показан последний сохраненный срез
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-20 gap-5">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[#a88a45]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-t-[#fcd34d] border-r-transparent border-b-transparent border-l-transparent"
              style={{ animation: 'spin 1s linear infinite' }} />
            <div className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-[#a88a45]/60 border-b-transparent border-l-transparent"
              style={{ animation: 'spin 0.7s linear infinite reverse' }} />
          </div>
          <p className="font-hs text-[#6b4c2a] text-xl tracking-wide">Загрузка тир-листа…</p>
          <p className="text-[#8b6c42] text-sm">Получаем данные из API статистики</p>
        </div>
      ) : (
        <>
          {/* Nav bar: class icons + search */}
          <div className="tierlist-class-nav mb-5" data-tour-id="arena-tier-class">
            <ClassTabs
              sections={sections}
              activeId={activeClassId}
              onChange={handleClassChange}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Active class header + rarity filter */}
          <div
            className="tierlist-active-header flex items-center justify-between gap-3 mb-5 flex-wrap"
            data-tour-id="arena-tier-filters"
          >
            {activeSection && (
              <div className="flex items-center gap-3">
                {CLASS_ICON[activeSection.id] ? (
                  <img src={CLASS_ICON[activeSection.id]} alt={activeSection.name}
                    className="w-9 h-9 object-contain drop-shadow-md" />
                ) : (
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg"
                    style={{ background: activeSection.color }}>⚔</div>
                )}
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-hs text-lg sm:text-xl text-[#4a3018] leading-tight">{activeSection.name}</h3>
                    {activeSection.classPosition && (
                      <span
                        className="text-[11px] sm:text-xs px-2 py-0.5 rounded-full"
                        style={{
                          background: 'linear-gradient(135deg,#6b4c2a,#3a2210)',
                          color: '#fcd34d',
                          border: '1px solid rgba(252,211,77,0.35)',
                        }}
                      >
                        Позиция: {activeSection.classPosition}
                      </span>
                    )}
                  </div>
                  <span className="text-[#8b6c42] text-xs">
                    {isAllCardsTab
                      ? `${allCardsSection.totalCards} уникальных карт`
                      : isNeutralTab
                        ? `${activeSection.totalCards} нейтральных карт`
                        : `${activeSection.tiers.flatMap(t => t.cards).filter(c => c.classKey !== 'any').length} карт класса`}
                  </span>
                </div>
              </div>
            )}
            <div className="tierlist-control-panel flex items-center gap-2 flex-wrap justify-end">
              {canUseTableView && (
                <div
                  className="tierlist-view-toggle flex items-center gap-1 p-1 rounded-xl flex-shrink-0"
                  data-tour-id="arena-tier-view"
                  style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
                  {([
                    { id: 'gallery' as const, label: 'Галерея', icon: Grid3X3 },
                    { id: 'table' as const, label: 'Таблица', icon: List },
                  ]).map(item => {
                    const active = viewMode === item.id;
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setViewMode(item.id)}
                        data-active={active ? 'true' : 'false'}
                        className="flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-hs transition-all"
                        style={active ? {
                          background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
                          color: '#fcd34d',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                        } : { color: '#6b4c2a' }}
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {/* Rarity filter — icon buttons */}
              <div className="tierlist-rarity-filter flex items-center gap-1 p-1 rounded-xl flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
                {RARITY_OPTIONS.map(r => {
                  const active = selectedRarity === r.id;
                  return (
                    <button
                      type="button"
                      key={r.id}
                      onClick={() => setSelectedRarity(r.id)}
                      title={r.name}
                      aria-pressed={active}
                      data-active={active ? 'true' : 'false'}
                      className="tierlist-icon-filter-button flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-all"
                      style={{
                        padding: r.icon ? '4px' : '4px 10px',
                        background: active ? 'rgba(30,64,102,0.12)' : 'transparent',
                        boxShadow: active ? 'inset 0 0 0 1px rgba(96,165,250,0.35)' : 'none',
                      }}
                    >
                      {r.icon
                        ? <img src={r.icon} alt={r.name} className="w-6 h-6 object-contain"
                            style={{ filter: active ? 'drop-shadow(0 2px 4px rgba(15,23,42,0.25))' : 'none', transition: 'filter 0.2s' }} />
                        : <span className="tierlist-filter-label font-hs text-xs">Все</span>
                      }
                    </button>
                  );
                })}
              </div>
              <div
                className="tierlist-mana-filter flex max-w-full items-center gap-1 overflow-x-auto p-1 rounded-xl flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}
                aria-label="Фильтр по мане"
              >
                {MANA_FILTER_OPTIONS.map(mana => {
                  const active = selectedManaCost === mana.id;
                  const isAll = mana.id === 'all';
                  return (
                    <button
                      key={String(mana.id)}
                      type="button"
                      onClick={() => setSelectedManaCost(mana.id)}
                      title={mana.name}
                      aria-pressed={active}
                      data-active={active ? 'true' : 'false'}
                      className={`tierlist-icon-filter-button relative flex h-11 w-11 items-center justify-center rounded-lg transition-all ${isAll ? 'px-2' : 'flex-shrink-0'}`}
                      style={{
                        background: active ? 'rgba(30,64,102,0.12)' : 'transparent',
                        boxShadow: active ? 'inset 0 0 0 1px rgba(96,165,250,0.35)' : 'none',
                      }}
                    >
                      {isAll ? (
                        <span className="tierlist-filter-label font-hs text-xs leading-none">
                          Все
                        </span>
                      ) : (
                        <>
                          <img
                            src={MANA_ICON}
                            alt=""
                            aria-hidden="true"
                            className="absolute inset-0 m-auto h-8 w-8 object-contain"
                            style={{
                              filter: active
                                ? 'drop-shadow(0 2px 4px rgba(15,23,42,0.25))'
                                : 'none',
                              transition: 'filter 0.2s',
                            }}
                          />
                          <span className={`relative font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${mana.id === 10 ? 'text-[8px]' : 'text-[11px]'}`}>
                            {mana.label}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tiers */}
          {canUseTableView && viewMode === 'table' ? (
            <HSReplayCardsTable
              tiers={visibleTiers}
              onCardOpen={(card, tier) => setModalCard({ card, tier })}
              previewSuppressed={Boolean(modalCard)}
            />
          ) : (
          <div className="tierlist-groups space-y-10">
            {visibleTiers.length > 0 ? visibleTiers.map((tierGroup, tierIdx) => {
              const tierTotal = tierGroup.totalCardsInTier ?? tierGroup.cards.length;
              return (
              <div key={tierGroup.tier} className="tierlist-group anim-fade-up"
                style={{
                  animationDelay: `${tierIdx * 0.07}s`,
                }}>
                {/* Tier header */}
                <div className="tierlist-group-heading flex items-center gap-4 mb-5">
                  <div className={`tier-rank-badge w-12 h-12 md:w-14 md:h-14 flex-shrink-0 flex items-center justify-center text-2xl md:text-3xl font-hs rounded-full border-[3px] shadow-[0_4px_14px_rgba(0,0,0,0.7),inset_0_4px_6px_rgba(255,255,255,0.35),inset_0_-4px_6px_rgba(0,0,0,0.45)] ${TIER_COLORS[tierGroup.tier] || TIER_COLORS['C']}`}>
                    <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{tierGroup.tier}</span>
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-xl md:text-2xl font-hs text-[#3d2208] tracking-wide">{TIER_LABEL_FULL[tierGroup.tier] ?? tierGroup.label}</h3>
                      <span className="text-xs font-medium text-[#8b6c42] bg-[#8b6c42]/10 px-2 py-0.5 rounded-full border border-[#8b6c42]/20">
                        {tierGroup.cards.length === tierTotal
                          ? `${tierGroup.cards.length} карт`
                          : `${tierGroup.cards.length} из ${tierTotal} карт`}
                      </span>
                    </div>
                    <p className="text-sm text-[#6b4c2a] mt-0.5">{tierGroup.description}</p>
                  </div>
                </div>

                {/* Cards grid — cards are already merged in filteredTiers useMemo */}
                <div className="tierlist-card-grid">
                  {tierGroup.cards.map((card, idx) => (
                    <div
                      key={`${card.cardId}-${idx}`}
                      className="anim-scale-in"
                      data-tour-id={tierIdx === 0 && idx === 0 ? 'arena-tier-results' : undefined}
                      style={{
                        // Cap animation delay: past 20 cards the stagger is imperceptible
                        animationDelay: idx < 20 ? `${tierIdx * 0.05 + idx * 0.015}s` : '0s',
                      }}
                    >
                      <HSCard
                        card={card}
                        onClick={() => setModalCard({ card, tier: tierGroup.tier })}
                        previewEnabled={canHoverPreview && viewMode === 'gallery'}
                        onPreviewStart={showGalleryPreview}
                        onPreviewEnd={hideGalleryPreview}
                      />
                    </div>
                  ))}
                </div>
              </div>
              );
            }) : (
              <div className="text-center py-14 rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
                <div className="text-4xl mb-3">🃏</div>
                <p className="text-xl font-hs text-[#8b4513] tracking-wide">Карты не найдены</p>
                <p className="text-[#8b6c42] mt-2 text-sm">Попробуйте изменить фильтры.</p>
              </div>
            )}
          </div>
          )}

          {hiddenCardCount > 0 && (
            <div className="tierlist-load-more mt-6 flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => setVisibleCardLimit(limit => limit + cardPageStep)}
                className="rounded-xl px-5 py-2.5 font-hs text-sm transition-all"
                style={{
                  background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
                  color: '#fcd34d',
                  border: '1.5px solid #b8904a',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.28)',
                }}
              >
                Показать ещё {Math.min(cardPageStep, hiddenCardCount)}
              </button>
              <span className="text-xs text-[#8b6c42]">
                Показано {visibleCardCount} из {totalFilteredCards}
              </span>
            </div>
          )}
        </>
      )}

      {!modalCard && galleryPreview && <CardStatsTooltip card={galleryPreview.card} position={galleryPreview.position} />}

      {modalCard && (
        <CardModal card={modalCard.card} tier={modalCard.tier} onClose={() => setModalCard(null)} />
      )}

      <InternalLinks links={[
        { label: 'Винрейт классов →', href: '/classes', onClick: () => onNavigate('winrates') },
        { label: 'Легендарки →', href: '/legendaries', onClick: () => onNavigate('legendaries') },
        { label: 'Статьи о Арене →', href: '/articles', onClick: () => onNavigate('articles') },
      ]} />
      </PaywallGate>
      <FAQSection />
    </div>
  );
}

// ─── Legendaries tab ──────────────────────────────────────────────────────────

function winRateBadgeColor(wr: number | null | undefined): string {
  if (!wr) return '#6b7280';
  if (wr >= 60) return '#166534';
  if (wr >= 50) return '#2563eb';
  return '#991b1b';
}

const LegendaryCardThumb: React.FC<{
  card: LegendaryCard;
  size: 'lg' | 'sm';
  onClick: () => void;
}> = memo(({ card, size, onClick }) => {
  // Fallback chain: Russian render first, then source image, then English as last resort.
  const sources = uniqueSources([
    card.imageRu || null,
    card.imageHa || null,
    card.cardId  ? hsImgUrl(card.cardId) : null,
    card.cardId  ? hsImgUrl(card.cardId, '256x', 'enUS') : null,
  ]);

  const [srcIdx, setSrcIdx] = useState(0);
  const src = sources[srcIdx] ?? null;
  const fullSrc = card.cardId ? hsImgUrl(card.cardId, '512x') : (card.imageRu || card.imageHa || null);
  const wClass = size === 'lg' ? 'w-36' : 'w-20';

  if (src) {
    return (
      <button
        type="button"
        className={`legendary-card-button ${wClass} flex-shrink-0 cursor-pointer group appearance-none border-0 bg-transparent p-0 text-left`}
        onClick={onClick}
        onPointerEnter={() => preloadImage(fullSrc)}
        onPointerDown={() => preloadImage(fullSrc)}
        onFocus={() => preloadImage(fullSrc)}
        title={card.name}
        aria-label={`Открыть карту ${card.name}`}
      >
        <div className="legendary-card-thumb transform transition-all duration-200 group-hover:scale-110">
          <img
            src={src}
            alt={card.name}
            loading="lazy"
            decoding="async"
            width={size === 'lg' ? 180 : 120}
            height={size === 'lg' ? 274 : 183}
            onError={() => setSrcIdx(i => i + 1)}
            className="w-full h-auto"
          />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`legendary-card-button ${wClass} flex-shrink-0 cursor-pointer appearance-none rounded-xl bg-[#2c1e16] border-2 border-[#a88a45] flex items-center justify-center p-2 text-center`}
      style={{ minHeight: size === 'lg' ? '120px' : '72px' }}
      onClick={onClick}
      title={card.name}
      aria-label={`Открыть карту ${card.name}`}
    >
      <span className="font-hs text-[#fcd34d] text-[10px] leading-tight">{card.name}</span>
    </button>
  );
}) as React.FC<{ card: LegendaryCard; size: 'lg' | 'sm'; onClick: () => void }>;

// HSReplay-style class tabs: picking a class shows class cards + neutrals.
const LEGEND_CLASSES: Array<{ id: string; name: string; color: string }> = [
  { id: 'all',           name: 'Все',               color: '#4a4a4a' },
  { id: 'death-knight',  name: 'Рыцарь смерти',     color: '#1f252d' },
  { id: 'demon-hunter',  name: 'Охотник на демонов', color: '#224722' },
  { id: 'druid',         name: 'Друид',              color: '#704a16' },
  { id: 'hunter',        name: 'Охотник',            color: '#1d5921' },
  { id: 'mage',          name: 'Маг',                color: '#2b5c85' },
  { id: 'paladin',       name: 'Паладин',            color: '#a88a45' },
  { id: 'priest',        name: 'Жрец',               color: '#888888' },
  { id: 'rogue',         name: 'Разбойник',          color: '#333333' },
  { id: 'shaman',        name: 'Шаман',              color: '#2a2e6b' },
  { id: 'warlock',       name: 'Чернокнижник',       color: '#5c265c' },
  { id: 'warrior',       name: 'Воин',               color: '#7a1e1e' },
];

function legendaryGroupStats(group: LegendaryGroup, activeClass = 'all') {
  const classStats =
    activeClass !== 'all'
      ? group.byClass?.[activeClass]
      : (group.byClass?.all ?? null);
  return {
    winRate: classStats?.winRate ?? group.winRate,
    pickRate: classStats?.pickRate ?? group.pickRate ?? group.keyCard.pickRate ?? null,
    offerRate: classStats?.offerRate ?? group.offerRate ?? group.keyCard.offerRate ?? null,
    score: classStats?.score ?? group.score ?? group.keyCard.arenaScore ?? null,
  };
}

function formatLegendaryStat(value: number | null | undefined, kind: 'pct' | 'score'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  if (kind === 'score') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${value.toFixed(1)}%`;
}

function legendarySortValue(group: LegendaryGroup, key: LegendarySortKey, activeClass = 'all'): number {
  const stats = legendaryGroupStats(group, activeClass);
  const raw =
    key === 'winRate' ? stats.winRate
    : key === 'pickRate' ? stats.pickRate
    : key === 'offerRate' ? stats.offerRate
    : stats.score;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : Number.NEGATIVE_INFINITY;
}

export function Legendaries({ data, loading, error, legendarySource, onLegendarySourceChange, switchingLegendarySource, onNavigate, authUser, subscriptionStatus, subscriptionLoading, onRefreshSubscription }: {
  data: LegendariesData; loading: boolean; error: boolean;
  legendarySource: LegendarySource;
  onLegendarySourceChange: (src: LegendarySource) => void;
  switchingLegendarySource: boolean;
  onNavigate: (tab: string) => void;
  authUser: AuthUser | null;
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionLoading: boolean;
  onRefreshSubscription: () => Promise<SubscriptionStatus | null>;
}) {
  const [activeClass, setActiveClass] = useState<string>('all');
  const [sortBy, setSortBy] = useState<LegendarySortKey>('winRate');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);
  const classScrollRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDocClick = (event: MouseEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [sortMenuOpen]);

  const filtered = useMemo(() => {
    const groups = data.groups ?? [];
    const q = searchQuery.trim().toLowerCase();
    const base = groups.filter(g => {
      const classOk =
        activeClass === 'all'
          ? true
          : g.classKey === activeClass || g.classKey === 'any';
      if (!classOk) return false;
      if (!q) return true;
      const hay = [
        g.keyCard.name,
        ...g.cards.map(c => c.name),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
    const dir = sortDir === 'desc' ? -1 : 1;
    return [...base].sort((a, b) => {
      const av = legendarySortValue(a, sortBy, activeClass);
      const bv = legendarySortValue(b, sortBy, activeClass);
      if (av === bv) {
        const aw = legendaryGroupStats(a, activeClass).winRate ?? 0;
        const bw = legendaryGroupStats(b, activeClass).winRate ?? 0;
        return bw - aw;
      }
      if (av === Number.NEGATIVE_INFINITY) return 1;
      if (bv === Number.NEGATIVE_INFINITY) return -1;
      return av > bv ? dir : -dir;
    });
  }, [data.groups, activeClass, sortBy, sortDir, searchQuery]);

  const toLegendaryCardData = useCallback((lc: LegendaryCard): CardData => ({
    name:     lc.name,
    score:    0,
    rarity:   lc.rarity ?? 'legendary',
    cardId:   lc.cardId,
    classKey: lc.classKey ?? 'any',
    source:   lc.source,
    statsContext: lc.statsContext,
    type:     lc.type,
    winrate:  lc.winrate,
    deckWinrate: lc.deckWinrate,
    pickRate: lc.pickRate,
    playedWinrate: lc.playedWinrate,
    inDecks: lc.inDecks,
    arenaScore: lc.arenaScore,
    offerRate: lc.offerRate,
    discardRate: lc.discardRate,
    drawnWinrate: lc.drawnWinrate,
    mulliganWinrate: lc.mulliganWinrate,
    keptRate: lc.keptRate,
    avgCopies: lc.avgCopies,
    totalGames: lc.totalGames,
    cost:     lc.cost,
    imageHa:  lc.imageHa,
    imageRu:  lc.imageRu ?? null,
  }), []);
  const paywallActive = !subscriptionLoading && !hasSubscriptionEntitlement(subscriptionStatus, 'arena');

  return (
    <div className="arena-legendaries-page">
      <SectionBanner title="Легендарки" subtitle="Наборы карт для выбора первой легендарки на Арене" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Легендарки', href: '/legendaries' },
      ]} />
      <section aria-label="Описание раздела">
        <p className="text-[#6b4c2a] text-sm leading-relaxed mb-5 px-1"
          style={{ borderLeft: '3px solid #c4a46a', paddingLeft: '12px' }}>
          На Арене Hearthstone легендарная карта предлагается в качестве первого выбора.
          На этой странице собраны все группы первого выбора с винрейтом и метриками ArenaSmith.
          Фильтр класса показывает классовые легендарки вместе с нейтральными.
        </p>
      </section>
      <div className="legendary-access-shell" style={{ position: 'relative' }}>
        <div className="legendary-access-content" style={{
          filter: paywallActive ? 'blur(7px)' : 'none',
          pointerEvents: paywallActive ? 'none' : 'auto',
          userSelect: paywallActive ? 'none' : 'auto',
          transition: 'filter 180ms ease',
        }}>
      {/* Source toggle + count row */}
      <div
        className="legendary-toolbar flex items-center justify-between mb-4 -mt-2 flex-wrap gap-2"
        data-tour-id="arena-legendaries-source"
      >
        <div className="legendary-source-toggle flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
          {(['hsreplay', 'firestone'] as const).map(src => {
            const active = legendarySource === src;
            return (
              <SourceToggleButton
                key={src}
                source={src}
                label={LEGENDARY_SOURCE_LABEL[src]}
                active={active}
                busy={switchingLegendarySource}
                onClick={() => { if (!active && !switchingLegendarySource) onLegendarySourceChange(src); }}
              />
            );
          })}
        </div>
        <div className="legendary-count-pill text-sm font-bold px-3 py-1.5 rounded-full flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }}>
          {filtered.length} групп
        </div>
      </div>

      <div className="legendary-sort-bar mb-4 flex flex-wrap items-center gap-2" data-tour-id="arena-legendaries-sort">
        <span className="text-sm font-semibold text-[#6b4c2a]">Сортировка:</span>
        <div className="relative" ref={sortMenuRef}>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#3d2208]"
            style={{ background: 'linear-gradient(135deg,#f7e8bf,#ead6a7)', border: '1.5px solid #b8904a' }}
            onClick={() => setSortMenuOpen(open => !open)}
            aria-expanded={sortMenuOpen}
          >
            {LEGENDARY_SORT_OPTIONS.find(opt => opt.id === sortBy)?.label ?? 'Винрейт'}
            <ChevronDown size={14} />
          </button>
          {sortMenuOpen && (
            <div
              className="absolute left-0 z-20 mt-1 min-w-[230px] overflow-hidden rounded-xl shadow-lg"
              style={{ background: '#f7e8bf', border: '1.5px solid #b8904a' }}
            >
              {LEGENDARY_SORT_OPTIONS.map(opt => {
                const active = opt.id === sortBy;
                return (
                  <button
                    type="button"
                    key={opt.id}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${active ? 'font-bold text-[#5d0d13]' : 'text-[#3d2208] hover:bg-[#ead6a7]'}`}
                    style={active ? { background: 'rgba(141,23,29,0.12)' } : undefined}
                    onClick={() => { setSortBy(opt.id); setSortMenuOpen(false); }}
                  >
                    <span>{opt.label}</span>
                    <span
                      className="h-3.5 w-3.5 rounded-full border"
                      style={{
                        borderColor: active ? '#8d171d' : '#a88a45',
                        background: active ? '#8d171d' : 'transparent',
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="inline-flex overflow-hidden rounded-lg" style={{ border: '1.5px solid #b8904a' }}>
          <button
            type="button"
            title="По убыванию"
            aria-pressed={sortDir === 'desc'}
            className="px-2.5 py-1.5"
            style={{
              background: sortDir === 'desc' ? '#8d171d' : '#f7e8bf',
              color: sortDir === 'desc' ? '#fff0c8' : '#3d2208',
            }}
            onClick={() => setSortDir('desc')}
          >
            <ArrowDown size={14} />
          </button>
          <button
            type="button"
            title="По возрастанию"
            aria-pressed={sortDir === 'asc'}
            className="px-2.5 py-1.5"
            style={{
              background: sortDir === 'asc' ? '#8d171d' : '#f7e8bf',
              color: sortDir === 'asc' ? '#fff0c8' : '#3d2208',
            }}
            onClick={() => setSortDir('asc')}
          >
            <ArrowUp size={14} />
          </button>
        </div>
        <div className="relative min-w-[220px] flex-1">
          <label className="sr-only" htmlFor="legendary-search">Поиск легендарок</label>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b6c42]" />
          <input
            id="legendary-search"
            type="search"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Поиск: Йогг-Сарон, Фиракк…"
            className="w-full rounded-lg py-2 pl-9 pr-3 text-sm text-[#3d2208] outline-none"
            style={{ background: '#f7e8bf', border: '1.5px solid #b8904a' }}
          />
        </div>
      </div>

      {/* Class filter nav */}
      <div className="legendary-class-nav mb-5" data-tour-id="arena-legendaries-class">
        <div
          ref={classScrollRef}
          className="legendary-class-tabs flex items-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
          style={{
            background: 'linear-gradient(135deg,#f4e8cc,#ede0c0)',
            border: '1.5px solid #c4a46a',
            boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.15), 0 2px 6px rgba(0,0,0,0.12)',
          }}
        >
          {LEGEND_CLASSES.map(cls => {
            const isActive = cls.id === activeClass;
            const iconSrc = cls.id !== 'all' && cls.id !== 'any' ? CLASS_ICON[cls.id] : null;
            return (
              <button
                type="button"
                key={cls.id}
                onClick={() => setActiveClass(cls.id)}
                title={cls.name}
                aria-pressed={isActive}
                className="flex min-h-11 min-w-11 flex-shrink-0 items-center justify-center relative transition-all duration-200"
                style={{ transform: isActive ? 'scale(1.15)' : 'scale(1)', filter: isActive ? 'none' : 'grayscale(0.2) brightness(0.85)' }}
              >
                <div
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden"
                  style={{
                    background: `radial-gradient(circle at 35% 35%, ${cls.color}ff, ${cls.color}aa)`,
                    boxShadow: isActive
                      ? `0 0 0 2.5px #fcd34d, 0 0 10px rgba(252,211,77,0.55), 0 3px 8px rgba(0,0,0,0.45)`
                      : `0 0 0 1.5px rgba(0,0,0,0.35), 0 2px 5px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.2)`,
                  }}
                >
                  {cls.id === 'all' ? (
                    <Star size={16} className="text-[#fcd34d]" />
                  ) : iconSrc ? (
                    <img src={iconSrc} alt={cls.name} className="w-6 h-6 sm:w-7 sm:h-7 object-contain" draggable={false} />
                  ) : (
                    <span className="text-white/80 text-sm font-hs">⚔</span>
                  )}
                </div>
                {isActive && (
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#fcd34d]"
                    style={{ boxShadow: '0 0 4px rgba(252,211,77,0.8)' }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Нет данных — возможно, scraper ещё не запущен</span>
        </div>
      )}

      {data.warning && !loading && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#1a2a3a]/10 border border-[#60a5fa]/20">
          <AlertTriangle size={13} /><span>Внешний источник временно недоступен — показан последний сохраненный срез</span>
        </div>
      )}

      {loading ? (
        <div className="legendary-groups-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-64 w-full rounded-2xl" style={{ animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="legendary-empty text-center py-14 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
          <div className="text-4xl mb-3">⭐</div>
          <p className="text-xl font-hs text-[#8b4513] tracking-wide">Нет данных</p>
          <p className="text-[#8b6c42] mt-2 text-sm">Запустите npm run scrape для загрузки легендарных групп.</p>
        </div>
      ) : (
        <div className="legendary-groups-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group, idx) => {
            const stats = legendaryGroupStats(group, activeClass);
            const footer = [
              { label: 'Винрейт', value: formatLegendaryStat(stats.winRate, 'pct'), tone: metricTone(stats.winRate, 'pct') },
              { label: 'Частота выбора', value: formatLegendaryStat(stats.pickRate, 'pct'), tone: metricTone(stats.pickRate, 'pct') },
              { label: 'Частота предложения', value: formatLegendaryStat(stats.offerRate, 'pct'), tone: metricTone(stats.offerRate, 'pct') },
              { label: 'Очки ArenaSmith', value: formatLegendaryStat(stats.score, 'score'), tone: metricTone(stats.score, 'score') },
            ];
            return (
            <div
              key={`${group.keyCard.cardId}-${idx}`}
              data-rank={idx + 1}
              data-tour-id={idx === 0 ? 'arena-legendaries-results' : undefined}
              className="legendary-group-card anim-scale-in card-hover rounded-2xl flex flex-col items-center p-4 gap-3 cursor-default"
              style={{
                animationDelay: `${Math.min(idx, 20) * 0.04}s`,
                background: 'linear-gradient(145deg,#ede0c0,#e0cc9e)',
                border: '1.5px solid #c4a46a',
              }}
            >
              <span className="legendary-group-rank" aria-label={`Место ${idx + 1}`}>{idx + 1}</span>
              <LegendaryCardThumb
                card={group.keyCard}
                size="lg"
                onClick={() => setModalCard({ card: toLegendaryCardData(group.keyCard), tier: 'S' })}
              />

              <div className="flex flex-col items-center gap-1 w-full">
                <span className="font-hs text-[#3d2208] text-base text-center leading-tight">{group.keyCard.name}</span>
                <span
                  className="legendary-winrate-badge px-3 py-1 rounded-full text-white text-xs font-bold shadow-md"
                  style={{ background: winRateBadgeColor(stats.winRate) }}
                >
                  {stats.winRate != null ? `${stats.winRate.toFixed(1)}%` : '—'} винрейт
                </span>
              </div>

              {group.cards.length > 0 && (
                <>
                  <div className="legendary-group-divider w-full h-px" />
                  <div className="flex gap-2 justify-center flex-wrap">
                    {group.cards.map((pc, ci) => (
                      <div key={`${pc.cardId}-${ci}`} className="flex flex-col items-center gap-0.5">
                        <LegendaryCardThumb
                          card={pc}
                          size="sm"
                          onClick={() => setModalCard({ card: toLegendaryCardData(pc), tier: 'C' })}
                        />
                        <span className="text-[9px] text-[#6b4c2a] text-center leading-tight max-w-[80px]">{pc.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="legendary-stats-footer w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 pt-1">
                {footer.map(stat => (
                  <div
                    key={stat.label}
                    className="min-w-0 rounded px-1.5 py-1.5 text-center"
                    style={{
                      background: 'rgba(247, 232, 191, 0.55)',
                      border: '1px solid rgba(97, 56, 24, 0.22)',
                    }}
                  >
                    <div className="truncate text-[10px] leading-tight text-[#735e49]">{stat.label}</div>
                    <div className={`text-sm font-black leading-tight ${stat.tone}`}>{stat.value}</div>
                  </div>
                ))}
              </div>
            </div>
            );
          })}
        </div>
      )}

      {modalCard && (
        <CardModal card={modalCard.card} tier={modalCard.tier} onClose={() => setModalCard(null)} />
      )}

      <InternalLinks links={[
        { label: 'Тир-лист карт →', href: '/tierlist', onClick: () => onNavigate('tierlist') },
        { label: 'Винрейт классов →', href: '/classes', onClick: () => onNavigate('winrates') },
        { label: 'Статьи о Арене →', href: '/articles', onClick: () => onNavigate('articles') },
      ]} />
        </div>
        {paywallActive && (
          <div style={{
            position: 'absolute',
            inset: 0,
            minHeight: 420,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 84,
            background: 'linear-gradient(180deg, rgba(238,243,255,0.10), rgba(238,243,255,0.62) 42%, rgba(238,243,255,0.86))',
            borderRadius: '14px',
          }}>
            <div style={{
              width: 'min(680px, 94%)',
              borderRadius: '14px',
              border: '1.5px solid #8fa7c8',
              background: 'linear-gradient(180deg, #f8faff, #e9f0fb)',
              boxShadow: '0 20px 46px rgba(15,23,42,0.24)',
              padding: '20px',
              textAlign: 'center',
            }}>
              <p style={{ margin: '0 0 6px', color: '#45617f', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Раздел для подписчиков
              </p>
              <h3 style={{ margin: '0 0 10px', color: '#142238', fontFamily: 'var(--font-display)', fontSize: '1.25rem' }}>
                Подтвердите подписку Манакоста
              </h3>
              <p style={{ margin: '0 0 14px', color: '#42566f', fontSize: '13px', lineHeight: 1.55 }}>
                Подписка открывает закрытые инструменты Арены и помогает Манакосту держать данные свежими.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                gap: '10px',
                margin: '0 0 14px',
                textAlign: 'left',
              }}>
                <div style={{
                  padding: '12px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(239,246,255,0.92), rgba(219,234,254,0.72))',
                  border: '1px solid rgba(96,165,250,0.34)',
                }}>
                  <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>
                    Платная статистика HSReplay
                  </strong>
                  <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                    Удобный доступ к платным данным по Арене: тир-листы, винрейты и быстрые срезы по текущему патчу.
                  </span>
                </div>
                <div style={{
                  padding: '12px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, rgba(255,247,237,0.94), rgba(254,243,199,0.62))',
                  border: '1px solid rgba(249,115,22,0.28)',
                }}>
                  <strong style={{ display: 'block', color: '#142238', fontSize: '13px', marginBottom: '5px' }}>
                    Авторские мета-отчёты
                  </strong>
                  <span style={{ color: '#4b5f78', fontSize: '12px', lineHeight: 1.45 }}>
                    Разборы от топ-игрока и стримера Арены: что брать, чем играть и где сейчас преимущество.
                  </span>
                </div>
              </div>
              <p style={{ margin: '0 0 16px', color: '#42566f', fontSize: '12px', lineHeight: 1.5 }}>
                Доступ откроется через Boosty уровня Любитель Арены и выше или через участие в VIP Telegram-канале.
              </p>
              <SubscriptionPurchaseButtons />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {!authUser ? (
                  <a href="/?login" style={{
                    ...ADMIN_SECONDARY_BUTTON,
                    textDecoration: 'none',
                    background: 'linear-gradient(135deg,#12365d,#0a1c32)',
                    color: '#e5f2ff',
                    borderColor: '#60a5fa',
                  }}>
                    Войти в профиль
                  </a>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => { void onRefreshSubscription(); }}
                      disabled={subscriptionLoading}
                      style={{
                        ...ADMIN_SECONDARY_BUTTON,
                        background: 'linear-gradient(135deg,#12365d,#0a1c32)',
                        color: '#e5f2ff',
                        borderColor: '#60a5fa',
                        cursor: subscriptionLoading ? 'wait' : 'pointer',
                      }}
                    >
                      {subscriptionLoading ? 'Проверяем...' : 'Обновить подписку'}
                    </button>
                    <a href="/?login" style={{ ...ADMIN_SECONDARY_BUTTON, textDecoration: 'none', background: '#f8faff', color: '#1f3b63', borderColor: '#9db4d5' }}>
                      Открыть профиль
                    </a>
                  </>
                )}
              </div>
              {subscriptionStatus?.message && (
                <p style={{ margin: '12px 0 0', color: '#64748b', fontSize: '12px', lineHeight: 1.4 }}>
                  {subscriptionStatus.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
type AdminMessage = { type: 'ok' | 'err'; text: string };
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

type ContestHistoryItem = {
  id: string;
  contestId: string;
  title: string;
  prize: string;
  imageUrl: string;
  status: string;
  entryStatus: string;
  joinedAt: string;
  startsAt: string;
  endsAt: string;
  isWinner: boolean;
};

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

function subscriptionEntitlementLabels(subscription: { hasAccess?: boolean; entitlements?: SubscriptionStatus['entitlements'] } | null | undefined): string[] {
  if (!subscription?.entitlements) return subscription?.hasAccess ? ['Все разделы'] : [];
  const labels: Array<[SubscriptionEntitlementKey, string]> = [
    ['arena', 'Арена'],
    ['battlegrounds', 'Поля Сражений'],
    ['standard', 'Стандарт'],
    ['contests', 'Конкурсы'],
    ['guidesArchive', 'Архив гайдов'],
    ['arenaArticles', 'Статьи Арены'],
    ['battlegroundsArticles', 'Статьи Полей'],
  ];
  return labels.filter(([key]) => subscription.entitlements?.[key]).map(([, label]) => label);
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

type TelegramAuthMode = 'legacy-widget' | 'oidc' | 'disabled';
declare global {
  interface Window {
    onHsArenaTelegramAuth?: (user: TelegramAuthPayload) => void;
  }
}

const ADMIN_SECONDARY_BUTTON: React.CSSProperties = {
  background: 'rgba(37,99,235,0.08)',
  color: '#1f3b63',
  border: '1px solid #9db4d5',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '13px',
  cursor: 'pointer',
};

const LEGACY_AUTH_TOKEN_KEY = 'hs_arena_auth_token';
const AUTH_EMAIL_KEY = 'hs_arena_auth_email';
const AUTH_SESSION_HINT_KEY = 'hs_arena_auth_cookie_hint';
const ARTICLE_COVER_PROXY_HOSTS = new Set([
  'hs-manacost.ru',
  'www.hs-manacost.ru',
  'kolodahearthstone.com',
  'www.kolodahearthstone.com',
  'kolodahearthstone.ru',
  'www.kolodahearthstone.ru',
]);

function authUrlWithReturnTo(rawUrl: string, returnTo: string): string {
  try {
    const url = new URL(rawUrl || '/api/auth/telegram/start', window.location.origin);
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  } catch {
    return rawUrl || '/api/auth/telegram/start';
  }
}

function TelegramLoginWidget({
  botUsername,
  authUrl,
  label = 'Войти через Telegram',
}: {
  botUsername: string;
  authUrl: string;
  label?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !botUsername || !authUrl) return;
    container.innerHTML = '';
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botUsername);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '10');
    script.setAttribute('data-auth-url', authUrl);
    script.setAttribute('data-request-access', 'write');
    container.appendChild(script);
    return () => { container.innerHTML = ''; };
  }, [authUrl, botUsername]);

  return (
    <div
      aria-label={label}
      ref={containerRef}
      style={{
        minHeight: 44,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    />
  );
}

function articleImageSrc(value?: string): string {
  const raw = String(value ?? '').trim();
  if (!raw || raw.startsWith('/')) return raw;
  try {
    const url = new URL(raw);
    if (ARTICLE_COVER_PROXY_HOSTS.has(url.hostname.toLowerCase())) {
      return `/api/article-cover?url=${encodeURIComponent(url.href)}`;
    }
  } catch {
    return raw;
  }
  return raw;
}

function isKolodaArticleUrl(value?: string): boolean {
  const raw = String(value ?? '').trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'kolodahearthstone.com'
      || host === 'www.kolodahearthstone.com'
      || host === 'kolodahearthstone.ru'
      || host === 'www.kolodahearthstone.ru';
  } catch {
    return false;
  }
}

function formatArticleDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return value;
  return new Date(parsed).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isRealAuthEmail(email?: string): boolean {
  return Boolean(email && email.includes('@') && !email.endsWith('@telegram.local') && !email.endsWith('.local'));
}

function formatSubscriptionDate(value: string | null): string {
  if (!value) return 'Еще не проверяли';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
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

const COUNTRY_OPTIONS = [
  'Россия',
  'Беларусь',
  'Казахстан',
  'Украина',
  'Польша',
  'Германия',
  'США',
  'Другая страна',
];

const PROFILE_CONTEST_STATUS_TEXT: Record<string, string> = {
  active: 'Идет',
  planned: 'Скоро',
  completed: 'Завершен',
  cancelled: 'Отменен',
  draft: 'Черновик',
};

function PasswordInput({
  value,
  onChange,
  placeholder = 'Пароль',
  autoComplete = 'current-password',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: 'current-password' | 'new-password';
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="login-field login-password-field">
      <span>{placeholder}</span>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        title={visible ? 'Скрыть пароль' : 'Показать пароль'}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </label>
  );
}

function AuthCheckingCard({ delayMs = 180 }: { delayMs?: number }) {
  const [visible, setVisible] = useState(delayMs <= 0);

  useEffect(() => {
    if (delayMs <= 0) {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  return (
    <div style={{
      minHeight: 220,
      padding: '18px 0',
      opacity: visible ? 1 : 0,
      transition: 'opacity 180ms ease',
    }}>
      <div style={{
        maxWidth: 460,
        margin: '0 auto',
        borderRadius: '16px',
        border: '1px solid rgba(148,163,184,0.42)',
        background: 'linear-gradient(180deg, rgba(248,250,255,0.98), rgba(235,241,252,0.94))',
        boxShadow: '0 24px 54px rgba(4,10,20,0.24), inset 0 1px 0 rgba(255,255,255,0.75)',
        padding: '28px 24px',
        textAlign: 'center',
      }}>
        <div style={{
          width: 58,
          height: 58,
          margin: '0 auto 14px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg,#12233f,#081020)',
          color: '#93c5fd',
          border: '2px solid rgba(56,189,248,0.45)',
          boxShadow: '0 12px 26px rgba(15,23,42,0.22)',
        }}>
          <RefreshCw size={28} className="animate-spin" />
        </div>
        <strong style={{ display: 'block', color: '#1e293b', fontFamily: 'var(--font-display)', fontSize: '1.15rem' }}>
          Проверяем профиль
        </strong>
        <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '13px', lineHeight: 1.45 }}>
          Подключаем сессию Экосистемы Манакоста.
        </p>
      </div>
    </div>
  );
}

let loginPresentationStyles: Promise<unknown> | null = null;

function loadLoginPresentationStyles() {
  loginPresentationStyles ??= import('./LoginPanel.css').catch(error => {
    loginPresentationStyles = null;
    throw error;
  });
  return loginPresentationStyles;
}

export function LoginPanel({
  onAuthChange,
  initialAuthUser = null,
  parentAuthChecking = false,
}: {
  onAuthChange?: (user: AuthUser | null) => void;
  initialAuthUser?: AuthUser | null;
  parentAuthChecking?: boolean;
}) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => initialAuthUser);
  const [authChecking, setAuthChecking] = useState(parentAuthChecking);
  const [loginStylesReady, setLoginStylesReady] = useState(false);
  const [authStep, setAuthStep] = useState<'password' | 'code'>('password');
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState(() => sessionStorage.getItem(AUTH_EMAIL_KEY) || '');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<AdminMessage | null>(null);
  const [telegramAuthUrl, setTelegramAuthUrl] = useState('');
  const [telegramCallbackUrl, setTelegramCallbackUrl] = useState('');
  const [telegramBotUsername, setTelegramBotUsername] = useState('');
  const [telegramMode, setTelegramMode] = useState<TelegramAuthMode>('disabled');
  const [telegramEnabled, setTelegramEnabled] = useState(false); const [socialLoginProviders, setSocialLoginProviders] = useState<unknown>([]);
  const [telegramLinkCode, setTelegramLinkCode] = useState('');
  const [telegramLinkExpiresAt, setTelegramLinkExpiresAt] = useState('');
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionStatus | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [boostyEmail, setBoostyEmail] = useState('');
  const [boostyCode, setBoostyCode] = useState('');
  const [boostyStep, setBoostyStep] = useState<'email' | 'code'>('email');
  const [profileCountry, setProfileCountry] = useState('');
  const [profileNewsletter, setProfileNewsletter] = useState(false);
  const [profileVkUrl, setProfileVkUrl] = useState('');
  const [profileTelegram, setProfileTelegram] = useState('');
  const [profileContactEmail, setProfileContactEmail] = useState('');
  const [contestHistory, setContestHistory] = useState<ContestHistoryItem[]>([]);
  const [contestHistoryLoading, setContestHistoryLoading] = useState(false);
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);
  const authHeaders = useCallback((extra: Record<string, string> = {}) => ({
    ...extra,
    'X-CSRF-Request': '1',
  }), []);
  useEffect(() => {
    fetch('/api/auth/telegram/config')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        setSocialLoginProviders(data.socialProviders);
        if (!res.ok || !data.enabled || !data.authUrl) return;
        setTelegramAuthUrl(String(data.authUrl || '/api/auth/telegram/start'));
        setTelegramCallbackUrl(String(data.callbackUrl || data.authUrl || '/api/auth/telegram/callback'));
        setTelegramBotUsername(String(data.botUsername || ''));
        setTelegramMode(data.mode === 'legacy-widget' ? 'legacy-widget' : data.mode === 'oidc' ? 'oidc' : 'disabled');
        setTelegramEnabled(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (authUser) return;
    let active = true;
    void loadLoginPresentationStyles().then(
      () => { if (active) setLoginStylesReady(true); },
      () => { if (active) setLoginStylesReady(true); },
    );
    return () => { active = false; };
  }, [authUser]);

  useEffect(() => {
    if (parentAuthChecking) {
      setAuthChecking(true);
      return;
    }

    setAuthChecking(false);
    setAuthUser(initialAuthUser);
    if (initialAuthUser) {
      setBoostyEmail(isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : '');
      setProfileCountry(initialAuthUser.country || '');
      setProfileNewsletter(Boolean(initialAuthUser.newsletterOptIn));
      setProfileVkUrl(initialAuthUser.contactVkUrl || '');
      setProfileTelegram(initialAuthUser.contactTelegram || initialAuthUser.telegramUsername || '');
      setProfileContactEmail(initialAuthUser.contactEmail || (isRealAuthEmail(initialAuthUser.email) ? initialAuthUser.email : ''));
      setTelegramLinkCode('');
      setTelegramLinkExpiresAt('');
      return;
    }

    setAuthStep('password');
  }, [initialAuthUser, parentAuthChecking]);

  const fetchSubscription = useCallback(async (force = false) => {
    setSubscriptionLoading(true);
    try {
      const res = await fetch(force ? '/api/subscription/refresh' : '/api/subscription/status', {
        method: force ? 'POST' : 'GET',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось проверить подписку');
      setSubscription(data);
      return data as SubscriptionStatus;
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
      return null;
    } finally {
      setSubscriptionChecked(true);
      setSubscriptionLoading(false);
    }
  }, [authHeaders]);

  const fetchContestHistory = useCallback(async () => {
    setContestHistoryLoading(true);
    try {
      const res = await fetch('/api/profile/contest-history', {
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось загрузить историю конкурсов');
      setContestHistory(Array.isArray(data.entries) ? data.entries : []);
    } catch {
      setContestHistory([]);
    } finally {
      setContestHistoryLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (!authUser) {
      setSubscription(null);
      setSubscriptionChecked(false);
      setContestHistory([]);
      return;
    }
    setSubscriptionChecked(false);
    void fetchSubscription(false);
    void fetchContestHistory();
  }, [authUser, fetchSubscription, fetchContestHistory]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      if (data.user) {
        markAuthSessionHint();
        setAuthUser(data.user);
        setProfileCountry(data.user?.country || '');
        setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
        setProfileVkUrl(data.user?.contactVkUrl || '');
        setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
        setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
        onAuthChange?.(data.user);
        setPassword('');
        setMsg(null);
        return;
      }
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, country, newsletterOptIn, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: 'Аккаунт создан. Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить код');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      setAuthStep('code');
      setPassword('');
      setMsg({ type: 'ok', text: data.message || 'Код отправлен на почту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Не удалось обновить пароль');
      setAuthMode('login');
      setAuthStep('password');
      setCode('');
      setPassword('');
      setMsg({ type: 'ok', text: 'Пароль обновлен. Теперь можно войти.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Неверный код');
      sessionStorage.setItem(AUTH_EMAIL_KEY, email);
      markAuthSessionHint();
      setAuthUser(data.user);
      setProfileCountry(data.user?.country || '');
      setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setCode('');
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBoostyEmailRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscriptionLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription/email/request', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: boostyEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось отправить код');
      setBoostyStep('code');
      setMsg({ type: 'ok', text: 'Код отправлен на почту Boosty.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleBoostyEmailConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubscriptionLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/subscription/email/confirm', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: boostyEmail, code: boostyCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось подтвердить почту');
      setAuthUser(data.user);
      setProfileCountry(data.user?.country || '');
      setProfileNewsletter(Boolean(data.user?.newsletterOptIn));
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setSubscription(data.subscription);
      setSubscriptionChecked(true);
      setBoostyCode('');
      setBoostyStep('email');
      setMsg({ type: 'ok', text: 'Почта привязана, подписка обновлена.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          country: profileCountry,
          newsletterOptIn: profileNewsletter,
          contactVkUrl: profileVkUrl,
          contactTelegram: profileTelegram,
          contactEmail: profileContactEmail,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить профиль');
      setAuthUser(data.user);
      setProfileVkUrl(data.user?.contactVkUrl || '');
      setProfileTelegram(data.user?.contactTelegram || data.user?.telegramUsername || '');
      setProfileContactEmail(data.user?.contactEmail || (isRealAuthEmail(data.user?.email) ? data.user.email : ''));
      onAuthChange?.(data.user);
      setMsg({ type: 'ok', text: 'Профиль обновлен.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }).catch(() => {});
    clearAuthSessionHint();
    setAuthUser(null);
    setSubscription(null);
    setSubscriptionChecked(false);
    setContestHistory([]);
    setTelegramLinkCode('');
    setTelegramLinkExpiresAt('');
    onAuthChange?.(null);
    setAuthStep('password');
    setPassword('');
    setCode('');
    setMsg(null);
    setAuthChecking(false);
  };

  const telegramLoginUrl = authUrlWithReturnTo(
    telegramMode === 'legacy-widget' ? telegramCallbackUrl : telegramAuthUrl,
    '/?login&telegram=ok',
  );
  const telegramLinkUrl = authUrlWithReturnTo(
    telegramMode === 'legacy-widget' ? telegramCallbackUrl : telegramAuthUrl,
    '/?login&telegram=linked',
  );
  const patreonLinkUrl = authUrlWithReturnTo('/api/auth/patreon/start', '/?login&patreon=linked');

  const handleTelegramLinkCodeRequest = async () => {
    setTelegramLinkLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/auth/telegram/link-code', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось создать Telegram ID-код');
      setTelegramLinkCode(String(data.code || ''));
      setTelegramLinkExpiresAt(String(data.expiresAt || ''));
      if (data.botUsername) setTelegramBotUsername(String(data.botUsername));
      setMsg({ type: 'ok', text: 'ID-код создан. Отправьте его Telegram-боту.' });
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setTelegramLinkLoading(false);
    }
  };

  if (authChecking && !authUser) {
    return <AuthCheckingCard />;
  }

  if (!authUser && !loginStylesReady) {
    return <AuthCheckingCard delayMs={0} />;
  }

  if (authUser) {
    const profileName = authUser.name?.trim() === 'Пользователь Манакост'
      ? 'Пользователь Манакоста'
      : (authUser.name?.trim() || 'Пользователь Манакоста');
    const profileContact = authUser.contactEmail
      || (isRealAuthEmail(authUser.email) ? authUser.email : '')
      || (authUser.contactTelegram || authUser.telegramUsername ? `@${authUser.contactTelegram || authUser.telegramUsername}` : '')
      || authUser.email;
    const subscriptionPending = subscriptionLoading || !subscriptionChecked;
    const profileRoleLabel = authUser.role === 'admin'
      ? 'Администратор'
      : subscription?.hasAccess
        ? 'Платный подписчик'
        : 'Участник';
    const subscriptionLabel = subscriptionPending
      ? 'Проверяем подписку'
      : subscription?.hasAccess
        ? 'Подписка активна'
        : 'Подписка не подтверждена';
    const subscriptionAccessLabels = subscriptionEntitlementLabels(subscription);
    const identityLabel = authUser.telegramUsername
      ? 'Telegram привязан'
      : isRealAuthEmail(authUser.email)
        ? 'Email привязан'
        : 'Профиль без email';
    const telegramLinkBotUrl = telegramBotUsername && telegramLinkCode
      ? `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(telegramLinkCode)}`
      : '';
    const telegramLinkExpiresLabel = telegramLinkExpiresAt ? formatSubscriptionDate(telegramLinkExpiresAt) : '';
    const wonContestCount = contestHistory.filter(item => item.isWinner).length;
    const profileId = authUser.publicProfileId || '—';
    const profileIdDisplay = profileId;
    const publicProfileHref = authUser.publicProfileId
      ? publicProfilePath(authUser.publicProfileId)
      : '';
    const copyPublicProfileLink = async () => {
      if (!publicProfileHref) return;
      await navigator.clipboard.writeText(new URL(publicProfileHref, window.location.origin).href);
      setPublicLinkCopied(true);
      window.setTimeout(() => setPublicLinkCopied(false), 2_000);
    };
    return (
      <div className="profile-page profile-workspace">
        <div className="profile-card">
          <ProfileIdentityHero
            eyebrow="Личный кабинет"
            name={profileName}
            publicProfileId={profileIdDisplay}
            avatarInitials={authUser.avatarInitials}
            photoUrl={authUser.photoUrl}
            contact={profileContact}
            tourId="profile-summary"
            actions={publicProfileHref ? (
              <div className="profile-public-link">
                <a href={publicProfileHref}>
                  Публичный профиль
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
                <button type="button" onClick={() => { void copyPublicProfileLink(); }}>
                  <Copy size={14} aria-hidden="true" />
                  {publicLinkCopied ? 'Скопировано' : 'Скопировать ссылку'}
                </button>
              </div>
            ) : undefined}
            badges={[
              { label: profileRoleLabel, icon: <UserCircle size={14} aria-hidden="true" /> },
              { label: subscriptionLabel, icon: <Star size={14} aria-hidden="true" /> },
              { label: identityLabel, icon: <LogIn size={14} aria-hidden="true" /> },
            ]}
          />
          {msg && (
            <div className={`profile-message profile-message--${msg.type}`} role={msg.type === 'err' ? 'alert' : 'status'} aria-live="polite">
              {msg.text}
            </div>
          )}
          <section className="profile-contact-section">
            <form
              className="profile-settings-form"
              onSubmit={handleProfileSave}
            >
              <div className="profile-section-heading" data-tour-id="profile-contacts">
                <strong>Настройки и каналы связи</strong>
                <span>
                  Укажите удобные контакты. Они будут использоваться для конкурсов, призов и важных уведомлений.
                </span>
              </div>
              <label>
                Страна
                <select value={profileCountry} onChange={e => setProfileCountry(e.target.value)}>
                  <option value="">Не указана</option>
                  {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>
                Telegram
                <input value={profileTelegram} onChange={e => setProfileTelegram(e.target.value)} placeholder="@username" />
              </label>
              <label>
                VK
                <input value={profileVkUrl} onChange={e => setProfileVkUrl(e.target.value)} placeholder="https://vk.com/username" />
              </label>
              <label>
                Почта для связи
                <input type="email" value={profileContactEmail} onChange={e => setProfileContactEmail(e.target.value)} placeholder="mail@example.com" />
              </label>
              <label className="profile-checkbox-row">
                <input
                  className="profile-checkbox"
                  type="checkbox"
                  checked={profileNewsletter}
                  onChange={e => setProfileNewsletter(e.target.checked)}
                />
                <span>Получать рассылку Манакоста</span>
              </label>
              <button type="submit" disabled={loading}>
                Сохранить профиль
              </button>
            </form>
          </section>
          <section className={`profile-subscription-panel ${subscription?.hasAccess ? 'profile-subscription-panel--active' : ''}`}>
            <div className="profile-subscription-header" data-tour-id="profile-access-status">
              <div>
                <p className="profile-subscription-kicker">
                  Доступ к закрытым разделам
                </p>
                <strong className="profile-subscription-state">
                  {subscriptionPending
                    ? 'Проверяем...'
                    : subscription?.hasAccess
                      ? 'Активна'
                      : 'Не подтверждена'}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => { void fetchSubscription(true); }}
                disabled={subscriptionLoading}
              >
                {subscriptionLoading ? 'Проверяем...' : 'Обновить'}
              </button>
            </div>
            <p className="profile-subscription-copy">
              {subscription?.message || 'Подтвердите подписку через Boosty, Patreon или Telegram VIP-канал.'}
            </p>
            {subscriptionAccessLabels.length > 0 && (
              <div className="profile-access-list">
                {subscriptionAccessLabels.map(label => (
                  <span key={label} className="profile-access-item">
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div className="profile-subscription-sources">
              <div className="profile-subscription-source">
                <img src="/ad/boosty.png" alt="" />
                <div>
                <strong>Boosty</strong>
                <p>
                  {subscription?.boosty?.hasAccess
                    ? `${subscription.boosty.levelName || 'Уровень'} · ${subscription.boosty.price || 0} RUB`
                    : subscription?.boosty?.message || 'Почта еще не проверена.'}
                </p>
                </div>
              </div>
              <div className="profile-subscription-source profile-subscription-source--telegram" data-tour-id="profile-telegram-access">
                <img src="/ad/telegram.png" alt="" />
                <div>
                <strong>Telegram</strong>
                <p>
                  {subscription?.telegram?.hasAccess
                    ? 'Найден в VIP-канале'
                    : subscription?.telegram?.message || 'Войдите через Telegram для проверки каналов.'}
                </p>
                <div className="profile-subscription-source__actions">
                  <button
                    type="button"
                    onClick={() => { void handleTelegramLinkCodeRequest(); }}
                    disabled={telegramLinkLoading || !telegramBotUsername}
                  >
                    {telegramLinkLoading ? 'Создаем...' : 'ID-код для бота'}
                  </button>
                  {telegramLinkCode && (
                    <code>
                      {telegramLinkCode}
                    </code>
                  )}
                  {telegramLinkBotUrl && (
                    <a
                      href={telegramLinkBotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="profile-subscription-source__link"
                    >
                      Открыть @{telegramBotUsername}
                    </a>
                  )}
                  {telegramLinkExpiresLabel && (
                    <span className="profile-subscription-source__expiry">до {telegramLinkExpiresLabel}</span>
                  )}
                </div>
                <p className="profile-subscription-source__tip">
                  Для Boosty-почты в боте: /email name@example.com.
                </p>
                </div>
              </div>
              <div className="profile-subscription-source profile-subscription-source--patreon">
                <span className="profile-subscription-source__brand profile-subscription-source__brand--patreon" aria-hidden="true">P</span>
                <div>
                  <strong>Patreon</strong>
                  <p>{subscription?.patreon?.hasAccess ? `${subscription.patreon.tierTitles?.join(' · ') || 'Алмаз'} · полный доступ` : subscription?.patreon?.message || 'Привяжите Patreon для проверки подписки.'}</p>
                  {subscription?.patreon?.configured ? (
                    <div className="profile-subscription-source__actions"><a href={patreonLinkUrl} className="profile-subscription-source__link profile-subscription-source__link--button">{subscription.patreon.connected ? 'Обновить Patreon' : 'Привязать Patreon'}</a></div>
                  ) : null}
                </div>
              </div>
            </div>
            <p className="profile-subscription-checked">
              Последняя проверка: {formatSubscriptionDate(subscription?.checkedAt ?? null)}
            </p>
            <form
              className="profile-boosty-form"
              data-tour-id="profile-boosty-access"
              onSubmit={boostyStep === 'email' ? handleBoostyEmailRequest : handleBoostyEmailConfirm}
            >
              <p>
                Для Boosty подтвердите почту, которая указана в вашем Boosty-профиле. Это отдельная проверка от Telegram.
              </p>
              <input
                type="email"
                value={boostyEmail}
                onChange={e => setBoostyEmail(e.target.value)}
                placeholder="Email из Boosty"
              />
              {boostyStep === 'code' && (
                <input
                  type="text"
                  inputMode="numeric"
                  value={boostyCode}
                  onChange={e => setBoostyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-значный код"
                  className="profile-boosty-code"
                />
              )}
              <button type="submit" disabled={subscriptionLoading}>
                {subscriptionLoading
                  ? 'Проверяем...'
                  : boostyStep === 'email'
                    ? 'Подтвердить Boosty-почту'
                    : 'Подтвердить код Boosty'}
              </button>
            </form>
            {telegramEnabled && !authUser.telegramUsername && (
              <div className="profile-telegram-link">
                <p>
                  Для Telegram-подписки нужно привязать сам Telegram-аккаунт. Поле @username в контактах не подходит для проверки VIP-канала.
                </p>
                {telegramMode === 'legacy-widget' && telegramBotUsername ? (
                  <TelegramLoginWidget
                    botUsername={telegramBotUsername}
                    authUrl={telegramLinkUrl}
                    label="Привязать Telegram"
                  />
                ) : (
                  <a href={telegramLinkUrl}>
                    Привязать Telegram
                  </a>
                )}
              </div>
            )}
          </section>
          <section className="profile-contests">
            <div className="profile-contests__heading" data-tour-id="profile-contests">
              <div>
                <strong>История участия в конкурсах</strong>
                <span>
                  Здесь отображаются конкурсы, куда вы подали заявку через профиль Манакоста.
                </span>
              </div>
              <span className="profile-contests__count">
                <Trophy size={14} />
                {contestHistory.length} участий · {wonContestCount} побед
              </span>
            </div>
            {contestHistoryLoading ? (
              <div className="profile-contests__state">Загружаем историю...</div>
            ) : contestHistory.length === 0 ? (
              <div className="profile-contests__state profile-contests__state--empty">
                Вы пока не участвовали в конкурсах. Когда нажмете “Участвовать” на странице конкурса, заявка появится здесь.
              </div>
            ) : (
              <div className="profile-contest-list">
                {contestHistory.map(item => (
                  <article key={item.id || item.contestId} className={`profile-contest-entry ${item.imageUrl ? 'profile-contest-entry--with-image' : ''} ${item.isWinner ? 'profile-contest-entry--winner' : ''}`}>
                    {item.imageUrl && (
                      <img src={item.imageUrl} alt="" loading="lazy" decoding="async" />
                    )}
                    <div className="profile-contest-entry__body">
                      <div className="profile-contest-entry__badges">
                        <span className={`profile-contest-badge profile-contest-badge--${item.status === 'completed' ? 'completed' : 'active'}`}>
                          {PROFILE_CONTEST_STATUS_TEXT[item.status] || item.status}
                        </span>
                        <span className="profile-contest-badge profile-contest-badge--entry">
                          {item.entryStatus === 'approved' ? 'Участие одобрено' : item.entryStatus || 'Заявка'}
                        </span>
                        {item.isWinner && (
                          <span className="profile-contest-badge profile-contest-badge--winner">
                            Победитель
                          </span>
                        )}
                      </div>
                      <strong className="profile-contest-entry__title">{item.title}</strong>
                      {item.prize && <p className="profile-contest-entry__prize">Приз: {item.prize}</p>}
                      <p className="profile-contest-entry__date">
                        Заявка: {item.joinedAt ? new Date(item.joinedAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'дата не указана'}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <div className="profile-account-actions" data-tour-id="profile-account-actions">
            {(authUser.adminAllowed || authUser.role === 'admin') && (
              <>
                <a href="/standard/meta" data-profile-admin-destination="standard-meta">
                  Открыть мету Standard · Beta
                </a>
                <a href={'/?admin&section=list'} data-profile-admin-destination="articles">
                  Настроить статьи
                </a>
              </>
            )}
            <button type="button" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-card-title">
        <div className="login-card__emblem" aria-hidden="true">
          <UserCircle size={30} />
        </div>
        <h2 id="login-card-title" className="login-card__title">
          {authMode === 'register' ? 'Регистрация' : authMode === 'reset' ? 'Восстановление пароля' : 'Войти в экосистему Манакост'}
        </h2>
        <p className="login-card__intro">
          {authMode === 'register'
            ? 'Укажите данные профиля, затем подтвердите почту кодом.'
            : authMode === 'reset'
              ? 'Укажите почту, получите код и задайте новый пароль.'
              : 'Войдите по почте, паролю и коду подтверждения.'}
        </p>
        {msg && (
          <div
            className={`login-message login-message--${msg.type}`}
            role={msg.type === 'err' ? 'alert' : 'status'}
            aria-live={msg.type === 'err' ? 'assertive' : 'polite'}
          >
            {msg.text}
          </div>
        )}
        {authStep === 'password' && (
          <div className="login-mode-tabs" aria-label="Режим авторизации">
            {(['login', 'register'] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => { setAuthMode(mode); setMsg(null); setAuthStep('password'); }}
                className={`login-mode-tab${authMode === mode ? ' login-mode-tab-active' : ''}`}
                aria-pressed={authMode === mode}
              >
                {mode === 'login' ? 'Вход' : 'Регистрация'}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={authStep === 'password'
            ? (authMode === 'login' ? handleLogin : authMode === 'register' ? handleRegister : handleResetRequest)
            : (authMode === 'reset' ? handleResetConfirm : handleVerify)}
          className="login-form"
        >
          {authStep === 'password' ? (
            <>
              {authMode === 'register' && (
                <>
                  <label className="login-field">
                    <span>Имя</span>
                    <input
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Имя"
                      autoComplete="name"
                    />
                  </label>
                  <label className="login-field">
                    <span>Страна</span>
                    <select value={country} onChange={e => setCountry(e.target.value)} required>
                      <option value="">Выберите страну</option>
                      {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                </>
              )}
              <label className="login-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </label>
              {authMode !== 'reset' && (
                <PasswordInput
                  value={password}
                  onChange={setPassword}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                />
              )}
              {authMode === 'register' && (
                <label className="login-consent">
                  <input
                    type="checkbox"
                    checked={newsletterOptIn}
                    onChange={e => setNewsletterOptIn(e.target.checked)}
                    required
                  />
                  <span>Подтверждаю согласие получать рассылку HS-Arena с новостями, гайдами и обновлениями.</span>
                </label>
              )}
            </>
          ) : (
            <>
              <p className="login-code-sent">
                Код отправлен на <b>{email}</b>
              </p>
              <label className="login-field login-code-field">
                <span>Код подтверждения</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-значный код"
                  autoComplete="one-time-code"
                  autoFocus
                />
              </label>
              <button
                type="button"
                onClick={() => { setAuthStep('password'); setCode(''); setMsg(null); }}
                className="login-link-button"
              >
                Изменить email или пароль
              </button>
              {authMode === 'reset' && (
                <PasswordInput value={password} onChange={setPassword} placeholder="Новый пароль" autoComplete="new-password" />
              )}
            </>
          )}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? 'Проверяем...' : authStep === 'password' ? 'Получить код' : authMode === 'reset' ? 'Сменить пароль' : 'Войти'}
          </button>
        </form>
        {authStep === 'password' && authMode === 'login' && telegramEnabled && telegramMode === 'legacy-widget' && (
          <div className="login-telegram">
            <div className="login-divider">
              <span className="login-divider__line" />
              <span>или</span>
              <span className="login-divider__line" />
            </div>
            {telegramBotUsername ? (
              <TelegramLoginWidget
                botUsername={telegramBotUsername}
                authUrl={telegramLoginUrl}
                label="Войти через Telegram"
              />
            ) : null}
          </div>
        )}
        {authStep === 'password' && authMode === 'login' && <React.Suspense fallback={null}><SocialLoginLinks disabled={loading} providers={socialLoginProviders} telegramAuthUrl={telegramEnabled && telegramMode !== 'legacy-widget' ? telegramLoginUrl || '/api/auth/telegram/start' : ''} withDivider={telegramMode !== 'legacy-widget'} /></React.Suspense>}
        {authStep === 'password' && authMode === 'login' && (
          <button
            type="button"
            onClick={() => { setAuthMode('reset'); setMsg(null); }}
            className="login-link-button login-link-button--footer"
          >
            Забыли пароль?
          </button>
        )}
        {authStep === 'password' && authMode === 'reset' && (
          <button
            type="button"
            onClick={() => { setAuthMode('login'); setMsg(null); }}
            className="login-link-button login-link-button--footer"
          >
            Вернуться ко входу
          </button>
        )}
      </section>
    </div>
  );
}

// ─── InternalLinks ────────────────────────────────────────────────────────────

function InternalLinks({ links }: { links: { label: string; href: string; onClick?: () => void }[] }) {
  return (
    <section aria-label="Смотри также" className="mt-8 pt-4" style={{ borderTop: '1px solid #c4a46a55' }}>
      <p className="text-[#8b6c42] text-xs mb-2 uppercase tracking-wide font-hs">Смотри также</p>
      <div className="flex flex-wrap gap-2">
        {links.map((link, i) => (
          <a
            key={i}
            href={link.href}
            onClick={link.onClick ? (e: React.MouseEvent) => { e.preventDefault(); link.onClick!(); } : undefined}
            className="inline-flex min-h-11 items-center px-4 py-2 rounded-lg text-sm font-hs transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)',
              border: '1.5px solid #c4a46a',
              color: '#4a3018',
              textDecoration: 'none',
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </section>
  );
}

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
  likes?: number;
  dislikes?: number;
  userVote?: 'like' | 'dislike' | null;
}
interface ArticlesData {
  articles: Article[];
  updatedAt: string | null;
}

function articleEntitlement(article: Article): SubscriptionEntitlementKey | null {
  const explicitMode = String(article.mode || '').toLowerCase();
  if (explicitMode === 'battlegrounds') return 'battlegroundsArticles';
  if (explicitMode === 'arena') return 'arenaArticles';
  if (explicitMode === 'standard' || explicitMode === 'wild') return 'standard';
  if (explicitMode === 'general') return null;
  const haystack = [article.tag, article.title, article.excerpt, article.url]
    .map(value => String(value || '').toLowerCase().replace(/ё/g, 'е'))
    .join(' ');
  if (/(поля сражений|полей сражений|battleground|battle grounds|tavern|таверна|боб|bob|бг)/.test(haystack)) return 'battlegroundsArticles';
  if (/(арена|arena)/.test(haystack)) return 'arenaArticles';
  return null;
}

function canAccessArticle(article: Article, subscription: SubscriptionStatus | null | undefined, authUser?: AuthUser | null): boolean {
  if (authUser?.role === 'admin') return true;
  return hasSubscriptionEntitlement(subscription, articleEntitlement(article));
}

function ArticleCard({
  article,
  idx,
  authUser,
  subscriptionStatus,
  subscriptionLoading = false,
  onVote,
  voting = false,
}: {
  article: Article;
  idx: number;
  authUser?: AuthUser | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionLoading?: boolean;
  onVote: (article: Article, vote: 'like' | 'dislike') => void;
  voting?: boolean;
}) {
  const [imgErr, setImgErr] = useState(false);
  const [opening, setOpening] = useState(false);
  const isFeatured = idx === 0;
  const canRequestVipLink = Boolean(authUser && isKolodaArticleUrl(article.url));
  const isVipArticle = isKolodaArticleUrl(article.url);
  const hasArticleAccess = canAccessArticle(article, subscriptionStatus, authUser);
  const readLabel = opening
    ? 'Открываю…'
    : canRequestVipLink && hasArticleAccess
      ? 'Читать VIP →'
      : canRequestVipLink && subscriptionLoading
        ? 'Проверяем →'
        : 'Читать →';

  const openArticle = async () => {
    if (!article.url || article.url === '#') return;
    if (!isVipArticle) {
      window.open(article.url, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!authUser) {
      window.location.href = '/?login';
      return;
    }
    if (subscriptionLoading) return;
    if (!hasArticleAccess) {
      window.alert('Для VIP-статьи нужна подписка подходящего режима.');
      return;
    }

    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const response = await fetch('/api/articles/access-link', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: article.url, title: article.title }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось открыть статью');
      const nextUrl = String(data.url || article.url);
      if (tab) tab.location.href = nextUrl;
      else window.open(nextUrl, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      if (tab) tab.close();
      window.alert(err?.message || 'Не удалось открыть разблокированную статью.');
    } finally {
      setOpening(false);
    }
  };

  return (
    <article
      className={`article-card-modern anim-scale-in rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-200 ${isFeatured ? 'article-card-featured' : ''}`}
      style={{
        animationDelay: `${idx * 0.06}s`,
      }}
      onClick={openArticle}
    >
      {/* Image */}
      <div className="article-image-shell relative w-full overflow-hidden flex-shrink-0">
        {!imgErr ? (
          <img src={articleImageSrc(article.image)} alt={article.title} loading="lazy"
            onError={() => setImgErr(true)}
            className="w-full h-full object-contain" />
        ) : (
          <div className="article-image-fallback w-full h-full flex items-center justify-center">
            <BookOpen size={36} aria-hidden="true" />
          </div>
        )}
        {article.tag && (
          <span className="article-tag absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold">
            {article.tag}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="article-body-modern p-4 flex flex-col flex-grow gap-3">
        <h3 className="font-hs text-base leading-snug">
          {article.title}
        </h3>
        <div className="article-meta-modern flex items-center justify-between mt-auto pt-2">
          <span className="text-xs">
            {formatArticleDate(article.date)}
          </span>
          <span className="article-read-link text-xs font-bold">{readLabel}</span>
        </div>
        <div className="article-vote-row flex items-center gap-2 pt-1" onClick={event => event.stopPropagation()}>
          <button
            type="button"
            className={`article-vote-button ${article.userVote === 'like' ? 'is-active' : ''}`}
            disabled={voting}
            onClick={() => onVote(article, 'like')}
            aria-label="Поставить лайк статье"
          >
            <ThumbsUp size={15} />
            <span>{article.likes ?? 0}</span>
          </button>
          <button
            type="button"
            className={`article-vote-button ${article.userVote === 'dislike' ? 'is-active' : ''}`}
            disabled={voting}
            onClick={() => onVote(article, 'dislike')}
            aria-label="Поставить дизлайк статье"
          >
            <ThumbsDown size={15} />
            <span>{article.dislikes ?? 0}</span>
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Decks Tab ────────────────────────────────────────────────────────────────

const ALL_DECK_CLASSES = '__all__';
const DECKS_PAGE_SIZE = 10;

const ProgressiveDeckCardImage: React.FC<{
  fullSrc: string;
  previewSrc: string | null;
  alt: string;
  onError: () => void;
}> = ({ fullSrc, previewSrc, alt, onError }) => {
  const [ready, setReady] = useState(false);
  const hasPreview = Boolean(previewSrc && previewSrc !== fullSrc);
  return (
    <>
      <img
        src={ready || !hasPreview ? fullSrc : previewSrc!}
        alt={alt}
        width={360}
        height={548}
        decoding="async"
        onError={() => {
          if (hasPreview && !ready) setReady(true);
          else onError();
        }}
        draggable={false}
        style={{ width: '100%', maxWidth: '300px', height: 'auto', filter: 'drop-shadow(0 24px 60px rgba(0,0,0,0.95))' }}
      />
      {hasPreview && !ready && (
        <img src={fullSrc} alt="" aria-hidden="true" hidden onError={onError}
          onLoad={() => setReady(true)} />
      )}
    </>
  );
};

const DeckCardLightbox: React.FC<{ card: ArenaDeckCard; onClose: () => void }> = ({ card, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [srcIdx, setSrcIdx] = useState(0);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const sources = useMemo(() => uniqueSources([
    card.cardId ? hsImgUrl(card.cardId, '512x') : null,
    card.image,
    card.cardId ? hsImgUrl(card.cardId, '512x', 'enUS') : null,
  ]), [card.cardId, card.image]);
  const bigSrc = sources[srcIdx] ?? null;
  usePageScrollLock(true);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="deck-card-lightbox"
      style={{
        position: 'fixed', inset: 0,
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.2s ease',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onClick={onClose}
      onTouchStart={e => {
        const t = e.touches[0];
        touchOrigin.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={e => {
        if (!touchOrigin.current) return;
        const t = e.changedTouches[0];
        const moved = Math.hypot(t.clientX - touchOrigin.current.x, t.clientY - touchOrigin.current.y);
        touchOrigin.current = null;
        if (moved < 12) { e.preventDefault(); onClose(); }
      }}
    >
      <div className="deck-card-lightbox-backdrop" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.87)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }} />
      <div
        className="deck-card-lightbox-panel flex flex-col items-center gap-3"
        style={{
          position: 'relative',
          zIndex: 1,
          width: 'min(92vw, 340px)',
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.75) translateY(36px)',
          transition: 'transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {bigSrc ? (
          <ProgressiveDeckCardImage
            key={bigSrc}
            fullSrc={bigSrc}
            previewSrc={card.image}
            alt={card.name}
            onError={() => setSrcIdx(i => i + 1)}
          />
        ) : (
          <div className="w-64 h-96 rounded-2xl flex items-center justify-center text-center px-5"
            style={{ background: '#2c1e16', border: '2px solid #a88a45', color: '#fcd34d', fontFamily: 'var(--font-hs)' }}>
            {card.name}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="px-4 py-1.5 rounded-full text-sm font-bold"
            style={{ background: 'rgba(26,17,10,0.86)', border: '1px solid rgba(168,138,69,0.5)', color: '#fcd34d' }}>
            {card.name}
          </span>
          {typeof card.cost === 'number' && (
            <span className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
              style={{ background: 'rgba(20,40,100,0.85)', border: '1px solid rgba(96,165,250,0.4)', color: '#bfdbfe' }}>
              <img src={MANA_ICON} alt="" width={16} height={16} className="w-4 h-4" /> {card.cost}
            </span>
          )}
          {card.count > 1 && (
            <span className="px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(122,30,30,0.9)', border: '1px solid rgba(252,165,165,0.5)', color: '#fff' }}>
              x{card.count}
            </span>
          )}
        </div>
      </div>
      <button
        className="hs-lightbox-close"
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 2,
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.78)', cursor: 'pointer',
        }}
        onClick={e => { e.stopPropagation(); onClose(); }}
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>
    </div>,
    document.body,
  );
};

const DeckCardThumb: React.FC<{ card: ArenaDeckCard; compact?: boolean; onOpen?: (card: ArenaDeckCard) => void }> = ({ card, compact = false, onOpen }) => (
  <figure className={`relative flex-shrink-0 ${compact ? 'w-16 sm:w-[4.5rem]' : 'w-[4.6rem] sm:w-20 md:w-[5.25rem]'}`} title={card.name}>
    <button
      type="button"
      onClick={() => onOpen?.(card)}
      onPointerEnter={() => preloadImage(card.cardId ? hsImgUrl(card.cardId, '512x') : card.image)}
      onPointerDown={() => preloadImage(card.cardId ? hsImgUrl(card.cardId, '512x') : card.image)}
      onFocus={() => preloadImage(card.cardId ? hsImgUrl(card.cardId, '512x') : card.image)}
      className="relative block w-full p-0 border-0 bg-transparent cursor-zoom-in transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fcd34d] focus-visible:ring-offset-2 focus-visible:ring-offset-[#4a3018]"
      aria-label={`Открыть карту ${card.name}`}
      style={{ borderRadius: 8 }}
    >
      <img
        src={card.image}
        alt={card.name}
        loading="lazy"
        decoding="async"
        width={compact ? 120 : 180}
        height={compact ? 183 : 274}
        className="w-full h-auto"
        style={{ filter: 'drop-shadow(0 5px 12px rgba(0,0,0,0.62))' }}
      />
      {card.count > 1 && (
        <span
          className="absolute right-0.5 bottom-1 min-w-6 h-6 px-1.5 flex items-center justify-center rounded-full text-xs font-black text-white"
          style={{
            background: 'linear-gradient(135deg,#7a1e1e,#dc2626)',
            border: '1.5px solid #fca5a5',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)',
          }}
        >
          x{card.count}
        </span>
      )}
    </button>
  </figure>
);


function buildDeckPageItems(page: number, pageCount: number): Array<number | 'gap'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const items: Array<number | 'gap'> = [];
  let prev = 0;
  Array.from(pages)
    .filter(p => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b)
    .forEach(p => {
      if (prev && p - prev > 1) items.push('gap');
      items.push(p);
      prev = p;
    });
  return items;
}


export function ArticlesTab({
  data,
  loading,
  onNavigate,
  authUser,
  subscriptionStatus,
  subscriptionLoading,
}: {
  data: ArticlesData;
  loading: boolean;
  onNavigate: (tab: string) => void;
  authUser?: AuthUser | null;
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionLoading?: boolean;
}) {
  const [articleSearch, setArticleSearch] = useState('');
  const deferredArticleSearch = useDeferredValue(articleSearch);
  const [articleTag, setArticleTag] = useState('__all__');
  const [articleVotes, setArticleVotes] = useState<Record<string, Pick<Article, 'likes' | 'dislikes' | 'userVote'>>>({});
  const [votingArticleId, setVotingArticleId] = useState('');

  useEffect(() => {
    setArticleVotes(Object.fromEntries(data.articles.map(article => [
      article.id,
      {
        likes: article.likes ?? 0,
        dislikes: article.dislikes ?? 0,
        userVote: article.userVote ?? null,
      },
    ])));
  }, [data.articles]);

  const articleTags = useMemo(() => {
    const tags = new Set<string>();
    data.articles.forEach(article => {
      const tag = article.tag?.trim();
      if (tag) tags.add(tag);
    });
    return Array.from(tags).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [data.articles]);

  const visibleArticles = useMemo(() => {
    const query = deferredArticleSearch.trim().toLowerCase();
    return data.articles
      .map(article => ({ ...article, ...(articleVotes[article.id] ?? {}) }))
      .filter(article => {
        if (articleTag !== '__all__' && (article.tag?.trim() || '') !== articleTag) return false;
        if (!query) return true;
        return [article.title, article.tag, article.date]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const left = Date.parse(a.date || '');
        const right = Date.parse(b.date || '');
        return (Number.isFinite(right) ? right : 0) - (Number.isFinite(left) ? left : 0);
      });
  }, [articleTag, articleVotes, data.articles, deferredArticleSearch]);

  const handleArticleVote = useCallback(async (article: Article, vote: 'like' | 'dislike') => {
    if (!authUser) {
      window.location.href = '/?login';
      return;
    }
    if (subscriptionLoading) return;
    if (!canAccessArticle(article, subscriptionStatus, authUser)) {
      window.alert('Голосовать за эту статью могут только подписчики подходящего режима.');
      return;
    }
    setVotingArticleId(article.id);
    try {
      const response = await fetch(`/api/articles/${encodeURIComponent(article.id)}/vote`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Не удалось сохранить голос');
      setArticleVotes(previous => ({
        ...previous,
        [article.id]: {
          likes: Number(result.likes || 0),
          dislikes: Number(result.dislikes || 0),
          userVote: result.userVote ?? null,
        },
      }));
    } catch (err: any) {
      window.alert(err?.message || 'Не удалось сохранить голос.');
    } finally {
      setVotingArticleId('');
    }
  }, [authUser, subscriptionLoading, subscriptionStatus]);

  return (
    <div className="articles-page">
      <SectionBanner title="Статьи" subtitle="Гайды, разборы мета и советы по режиму Арена" />
      <Breadcrumbs items={[
        { name: 'Главная', href: '/', onClick: () => onNavigate('home') },
        { name: 'Статьи', href: '/articles' },
      ]} />

      <div className="articles-toolbar-modern mb-5">
        <label className="articles-search-modern">
          <Search size={17} aria-hidden="true" />
          <input
            name="article-search" value={articleSearch}
            onChange={event => setArticleSearch(event.target.value)}
            placeholder="Поиск по статьям"
            aria-label="Поиск по статьям"
          />
        </label>
        <div className="articles-tag-filter" aria-label="Фильтр по тегам">
          <button type="button" className={articleTag === '__all__' ? 'is-active' : ''} onClick={() => setArticleTag('__all__')}>
            Все
          </button>
          {articleTags.map(tag => (
            <button key={tag} type="button" className={articleTag === tag ? 'is-active' : ''} onClick={() => setArticleTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="articles-grid-modern grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="skeleton h-72 rounded-2xl" />)}
        </div>
      ) : visibleArticles.length === 0 ? (
        <div className="articles-empty-modern text-center py-16">
          <BookOpen size={42} aria-hidden="true" className="mx-auto mb-3" />
          <p className="font-hs text-xl">{data.articles.length ? 'Статьи не найдены' : 'Статьи скоро появятся'}</p>
        </div>
      ) : (
        <div className="articles-grid-modern grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleArticles.map((a, i) => (
            <React.Fragment key={a.id}>
              <ArticleCard
                article={a}
                idx={i}
                authUser={authUser}
                subscriptionStatus={subscriptionStatus}
                subscriptionLoading={subscriptionLoading}
                onVote={handleArticleVote}
                voting={votingArticleId === a.id}
              />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'home',        label: 'Главная',    icon: Home,     slug: '/'           },
  { id: 'articles',    label: 'Статьи',     icon: BookOpen, slug: '/articles'   },
  { id: 'gallery',     label: 'Галерея',    icon: ImageIcon, slug: '/gallery'   },
  { id: 'winrates',    label: 'Классы',     icon: Trophy,   slug: '/classes'    },
  { id: 'tierlist',    label: 'Тир-лист',   icon: Scroll,   slug: '/tierlist'   },
  { id: 'legendaries', label: 'Легендарки', icon: Star,      slug: '/legendaries'},
] as const;

const NETWORK_SITES = [
  {
    id: 'koloda',
    label: 'Koloda',
    href: 'https://kolodahearthstone.com/',
    icon: '/site-icons/koloda.ico',
    tone: 'neutral',
    current: false,
  },
  {
    id: 'manacost',
    label: 'HS-Manacost',
    href: 'https://hs-manacost.ru/',
    icon: '/site-icons/hs-manacost.png',
    tone: 'stats',
    current: false,
  },
  {
    id: 'arena',
    label: 'HS-Arena',
    href: '/',
    icon: '/arena-logo-icon.webp?v=mana-swirl-20260624',
    tone: 'arena',
    current: true,
  },
] as const;

type TabId = (typeof TABS)[number]['id'];

function isRemovedPagePath(path: string): boolean {
  return path === '/decks' || path.startsWith('/decks/') || path.startsWith('/jobs');
}

/** Resolve tab from current pathname */
function tabFromPath(path: string): TabId {
  if (isRemovedPagePath(path)) return 'home';
  const found = TABS.find(t => t.slug !== '/' && path.startsWith(t.slug));
  return (found?.id ?? 'home') as TabId;
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

function scheduleDelayedIdleTask(task: () => void, delay = 900, idleTimeout = 1200): () => void {
  if (typeof window === 'undefined') return () => {};
  let cancelIdle = () => {};
  const timer = window.setTimeout(() => {
    cancelIdle = scheduleIdleTask(task, idleTimeout);
  }, delay);
  return () => {
    window.clearTimeout(timer);
    cancelIdle();
  };
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
    localStorage.removeItem(`etag_${cacheKey}`);
    return data;
  }

  const result = await fetchWithETag(url, cacheKey);
  return result?.data ?? null;
}

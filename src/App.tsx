/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { Trophy, Scroll, RefreshCw, AlertTriangle, X, Search, Star, Home, BookOpen, Menu } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassData {
  id: string;
  name: string;
  winrate: number;
  color: string;
  textDark?: boolean;
  games?: number;
}

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
  classKey: string;  // 'any' = neutral, else class-specific
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
  tiers:      TierSection[];
  totalCards: number;
}

/** Merged card for display: TierCard + CardLookup */
interface CardData extends TierCard, Partial<CardLookup> {}

// ─── Class icons (from /public/class_icon/) ───────────────────────────────────

/** Maps tier-list section IDs → icon path */
const CLASS_ICON: Record<string, string> = {
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
  imageHa?: string;
  imageRu?: string | null;
}
interface LegendaryGroup {
  keyCard: LegendaryCard;
  cards: LegendaryCard[];
  winRate: number | null;
  classKey: string;
}
interface LegendariesData {
  groups: LegendaryGroup[];
  updatedAt: string | null;
  source: string;
}

interface WinratesData {
  classes: ClassData[];
  updatedAt: string | null;
  source: string;
}

interface TierlistData {
  sections:  ClassSection[];
  cards:     Record<string, CardLookup>;
  updatedAt: string | null;
  source:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return 'нет данных';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mergeCard(tc: TierCard, lookup: Record<string, CardLookup>): CardData {
  const lu = lookup[tc.cardId] as any ?? {};
  // rarity in lookup (cards_ru.json) overrides DOM-scraped rarity from HearthArena
  const rarity: string = lu.rarity ?? tc.rarity;
  return { ...tc, ...lu, rarity };
}

// ─── Card image helpers ───────────────────────────────────────────────────────

const hsImgUrl = (cardId: string, size: '256x' | '512x' = '256x') =>
  `https://art.hearthstonejson.com/v1/render/latest/enUS/${size}/${cardId}.png`;

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

const CardModal: React.FC<{ card: CardData; tier: string; onClose: () => void }> = ({ card, tier, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [imgErr,  setImgErr]  = useState(false);
  // Track touch start position to distinguish tap vs scroll
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  const bigSrc = imgErr ? null
    : card.imageRu ? card.imageRu
    : card.imageHa ? card.imageHa
    : card.cardId  ? hsImgUrl(card.cardId, '512x')
    : null;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const scoreBg = (s: number) => s >= 100 ? '#16a34a' : s >= 75 ? '#ca8a04' : '#dc2626';

  // Rendered via portal — completely outside app stacking context
  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0,
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.22s ease',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
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
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.87)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }} />

      {/* Card container — stops propagation so tapping/scrolling card doesn't close modal */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px',
          maxWidth: '340px', width: '100%',
          maxHeight: '90dvh',
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.72) translateY(40px)',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onTouchEnd={e => e.stopPropagation()}
      >
        {bigSrc ? (
          <img src={bigSrc} alt={card.name} onError={() => setImgErr(true)}
            style={{ width: '100%', maxWidth: '300px', height: 'auto', filter: 'drop-shadow(0 24px 60px rgba(0,0,0,0.95))' }}
            draggable={false} />
        ) : (
          <div style={{
            width: '256px', height: '384px', background: '#2c1e16', borderRadius: '16px',
            border: '2px solid #a88a45', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: '#fcd34d', fontFamily: 'var(--font-hs)', fontSize: '18px', textAlign: 'center', padding: '16px' }}>{card.name}</span>
          </div>
        )}

        {/* Badges row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%' }}>
          {card.score > 0 && (
            <div style={{ padding: '6px 16px', borderRadius: '999px', color: '#fff', fontWeight: 700, fontSize: '14px', border: '1px solid rgba(255,255,255,0.2)', background: scoreBg(card.score) }}>
              Manacost: {card.score}
            </div>
          )}
          <div className={`w-9 h-9 flex items-center justify-center rounded-full border-2 font-hs text-lg shadow-lg ${TIER_COLORS[tier] || TIER_COLORS['C']}`}>
            {tier}
          </div>
          {card.rarity && RARITY_ICON[card.rarity] && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '999px', background: 'rgba(26,17,10,0.85)', border: '1px solid rgba(168,138,69,0.5)' }}>
              <img src={RARITY_ICON[card.rarity]} alt={card.rarity} style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
              <span style={{ color: '#fcd34d', fontSize: '12px', fontWeight: 700 }}>{RARITY_LABEL[card.rarity] || card.rarity}</span>
            </div>
          )}
          {card.type && (
            <div style={{ padding: '6px 12px', borderRadius: '999px', background: 'rgba(26,17,10,0.8)', border: '1px solid rgba(107,76,42,0.6)', color: '#e8d5a5', fontSize: '12px' }}>
              {TYPE_LABEL[card.type] || card.type}
            </div>
          )}
          {card.cost !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 12px', borderRadius: '999px', background: 'rgba(20,40,100,0.85)', border: '1px solid rgba(96,165,250,0.4)' }}>
              <img src={MANA_ICON} alt="мана" style={{ width: '18px', height: '18px', objectFit: 'contain' }} />
              <span style={{ color: '#bfdbfe', fontSize: '12px', fontWeight: 700 }}>{card.cost}</span>
            </div>
          )}
        </div>

        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginTop: '4px', textAlign: 'center', paddingBottom: '8px' }}>
          Коснитесь вне карточки или{' '}
          <kbd style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px', color: 'rgba(255,255,255,0.6)' }}>ESC</kbd>
          {' '}для закрытия
        </p>
      </div>

      {/* Close button */}
      <button
        style={{
          position: 'absolute', top: '16px', right: '16px', zIndex: 2,
          width: '44px', height: '44px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.75)', cursor: 'pointer', transition: 'all 0.2s',
          touchAction: 'manipulation',
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

// ─── HSCard ───────────────────────────────────────────────────────────────────

const HSCard: React.FC<{ card: CardData; onClick: () => void }> = memo(({ card, onClick }) => {
  // Multi-step fallback: imageRu → imageHa → hsJson enUS
  const sources = [
    card.imageRu  || null,
    card.imageHa  || null,
    card.cardId   ? hsImgUrl(card.cardId) : null,
  ].filter(Boolean) as string[];

  const [srcIdx, setSrcIdx] = useState(0);
  const thumbSrc = sources[srcIdx] ?? null;
  const handleErr = useCallback(() => setSrcIdx(i => i + 1), []);

  if (thumbSrc) {
    return (
      <div className="relative flex-shrink-0 group cursor-pointer" onClick={onClick} title={card.name}>
        <div className="transform transition-all duration-200 group-hover:scale-110 group-hover:z-10"
          style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.85))' }}>
          <img src={thumbSrc} alt={card.name} loading="lazy"
            onError={handleErr}
            className="w-28 sm:w-32 md:w-36 h-auto" />
        </div>
      </div>
    );
  }

  // Fallback styled card
  const rarityIconSrc = RARITY_ICON[card.rarity] ?? null;
  return (
    <div
      className="relative w-28 h-40 sm:w-32 sm:h-48 md:w-36 md:h-52 rounded-xl flex flex-col items-center justify-center text-center transform transition-transform hover:scale-105 hover:z-10 cursor-pointer overflow-hidden border-2 border-[#1a110a] bg-[#2c1e16]"
      onClick={onClick} title={card.name}
    >
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
  );
}) as React.FC<{ card: CardData; onClick: () => void }>;

// ─── Skeleton / misc ──────────────────────────────────────────────────────────

const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} />
);

const UpdateBadge: React.FC<{ updatedAt: string | null; source: string; onRefresh: () => void; refreshing: boolean }> =
  ({ updatedAt, onRefresh, refreshing }) => {
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
      {/* Refresh button */}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Обновить данные"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: refreshing
            ? 'linear-gradient(135deg,#5a3a1a,#3a2210)'
            : 'linear-gradient(135deg,#6b4c2a,#3a2210)',
          border: '1.5px solid #a88a45',
          color: '#fcd34d',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}
      >
        {refreshing
          ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
          : <RefreshCw size={12} />}
        <span>{refreshing ? 'Парсинг…' : 'Обновить'}</span>
      </button>
    </div>
  );
};

// ─── Winrates tab ─────────────────────────────────────────────────────────────

function Winrates({ classes, loading, switching, error, updatedAt, source, onRefresh, refreshing, winrateSource, onSourceChange }: {
  classes: ClassData[]; loading: boolean; switching: boolean; error: boolean;
  updatedAt: string | null; source: string; onRefresh: () => void; refreshing: boolean;
  winrateSource: 'hsreplay' | 'firestone';
  onSourceChange: (src: 'hsreplay' | 'firestone') => void;
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

  return (
    <div>
      <SectionBanner title="Классы" subtitle="Статистика побед на Арене — текущий патч" />
      {/* Source toggle + UpdateBadge row */}
      <div className="flex items-center justify-between mb-6 -mt-2 flex-wrap gap-2">
        {/* Source switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl"
          style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
          {(['hsreplay', 'firestone'] as const).map(src => {
            const active = winrateSource === src;
            const label  = src === 'hsreplay' ? 'HSReplay' : 'Firestone';
            return (
              <button
                key={src}
                onClick={() => { if (!active && !switching) onSourceChange(src); }}
                className="px-3 py-1.5 rounded-lg text-xs font-hs transition-all flex items-center gap-1.5"
                style={active ? {
                  background: 'linear-gradient(135deg,#5a3000,#3d1e00)',
                  color: '#fcd34d',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                } : {
                  color: switching ? '#b8a080' : '#6b4c2a',
                  cursor: switching ? 'wait' : 'pointer',
                }}
              >
                {active && switching && (
                  <RefreshCw size={10} style={{ animation: 'spin 0.8s linear infinite' }} />
                )}
                {label}
              </button>
            );
          })}
        </div>
        <UpdateBadge updatedAt={updatedAt} source={source} onRefresh={onRefresh} refreshing={refreshing} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Нет соединения — показаны кэшированные данные</span>
        </div>
      )}

      <div className="space-y-2.5 sm:space-y-3 relative">
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl pointer-events-none"
          style={{
            background: 'rgba(237,224,192,0.6)',
            backdropFilter: switching && !loading ? 'blur(3px)' : 'blur(0px)',
            opacity: switching && !loading ? 1 : 0,
            transition: 'opacity 0.25s ease, backdrop-filter 0.25s ease',
          }}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-hs text-sm"
            style={{ background: 'linear-gradient(135deg,#5a3000,#3d1e00)', color: '#fcd34d',
              transform: switching && !loading ? 'scale(1)' : 'scale(0.9)',
              transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)',
            }}>
            <RefreshCw size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
            Загрузка {winrateSource === 'firestone' ? 'Firestone' : 'HSReplay'}…
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
                  className="anim-fade-up row-hover group relative flex items-center gap-3 sm:gap-4 rounded-2xl overflow-hidden cursor-default"
                  style={{
                    animationDelay: delay,
                    background: 'linear-gradient(135deg, #ede0c0 0%, #e2cfa0 50%, #d8c090 100%)',
                    border: '1.5px solid #c9a86c',
                    padding: '10px 14px',
                  }}
                >
                  {/* Class icon */}
                  {icon && (
                    <img src={icon} alt={cls.name}
                      className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                      draggable={false}
                    />
                  )}

                  {/* Class name */}
                  <div className="flex-shrink-0 w-28 sm:w-40">
                    <span className="font-hs text-sm sm:text-base text-[#3d2208] tracking-wide leading-tight">
                      {cls.name}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="flex-grow relative h-7 sm:h-8 rounded-full overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg,#1a0e06 0%,#2c1a0e 100%)',
                      boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.85), inset 0 -1px 2px rgba(255,255,255,0.05)',
                      border: '1.5px solid #0a0502',
                    }}>
                    {/* Fill */}
                    <div className="absolute inset-y-0 left-0 flex items-center overflow-hidden rounded-full"
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
      className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
      style={{
        background: 'linear-gradient(135deg,#f4e8cc,#ede0c0)',
        border: '1.5px solid #c4a46a',
        boxShadow: 'inset 0 1px 3px rgba(139,69,19,0.15), 0 2px 6px rgba(0,0,0,0.12)',
      }}
    >
      {/* Icon buttons */}
      <div ref={scrollRef} className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* "All cards" virtual tab */}
        {(() => {
          const isActive = activeId === ALL_CARDS_ID;
          return (
            <button
              key={ALL_CARDS_ID}
              data-id={ALL_CARDS_ID}
              onClick={() => onChange(ALL_CARDS_ID)}
              title="Все карты"
              className="flex-shrink-0 relative transition-all duration-200"
              style={{ transform: isActive ? 'scale(1.15)' : 'scale(1)' }}
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center overflow-hidden"
                style={{
                  background: isActive
                    ? 'linear-gradient(135deg,#5a3000,#8b5a20)'
                    : 'linear-gradient(135deg,#c4a46a,#a88a45)',
                  boxShadow: isActive
                    ? '0 0 0 2.5px #fcd34d, 0 3px 10px rgba(0,0,0,0.5)'
                    : '0 2px 6px rgba(0,0,0,0.35)',
                  border: '2px solid rgba(0,0,0,0.25)',
                  fontSize: '18px',
                }}
              >⚔</div>
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
              key={sec.id}
              data-id={sec.id}
              onClick={() => onChange(sec.id)}
              title={sec.name}
              className="flex-shrink-0 relative transition-all duration-200"
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
                    className="w-6 h-6 sm:w-7 sm:h-7 object-contain"
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
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-7 flex-shrink-0 bg-[#c4a46a]/50 mx-1" />

      {/* Search */}
      <div className="relative flex-grow min-w-[140px]">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b4513]/50 pointer-events-none" />
        <input
          type="text"
          placeholder="Поиск: Йогг-Сарон, Рагнарос..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-transparent pl-8 pr-3 py-1.5 text-sm text-[#3d2a1e] placeholder-[#8b6c42]/60 outline-none"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8b4513]/50 hover:text-[#8b4513] transition-colors"
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
};

const TIER_DESC_MAP: Record<string, string> = {
  S: 'Авто-пик — доминирующие карты текущего мета.',
  A: 'Отличные карты, очень сильны в большинстве ситуаций.',
  B: 'Выше среднего — хороший выбор для стабильной колоды.',
  C: 'Средние карты, полезны при нехватке лучших вариантов.',
  D: 'Ниже среднего — берите только если нет лучших карт.',
  E: 'Плохие карты — последний выбор.',
  F: 'Ужасные карты — никогда не стоит брать.',
};

const RARITY_OPTIONS = [
  { id: 'all',       name: 'Все',        icon: null },
  { id: 'common',    name: 'Обычная',    icon: '/assets/common.png' },
  { id: 'rare',      name: 'Редкая',     icon: '/assets/rare.png' },
  { id: 'epic',      name: 'Эпическая',  icon: '/assets/epic.png' },
  { id: 'legendary', name: 'Легендарная',icon: '/assets/legendary.png' },
];

const ALL_CARDS_ID = '__all__';

function TierList({ data, loading, error, onRefresh, refreshing, companionIds }: {
  data: TierlistData; loading: boolean; error: boolean;
  onRefresh: () => void; refreshing: boolean;
  companionIds: Set<string>;
}) {
  const [activeClassId, setActiveClassId] = useState<string>(ALL_CARDS_ID);
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);

  const sections = data.sections;
  const cards    = data.cards;

  // Virtual "all cards" section — best tier per unique cardId across all sections
  const allCardsSection = useMemo(() => {
    const TIER_RANK: Record<string, number> = { S:6, A:5, B:4, C:3, D:2, E:1, F:0 };
    const best = new Map<string, { card: TierCard; tier: string }>();
    for (const sec of sections) {
      for (const tierGroup of sec.tiers) {
        for (const card of tierGroup.cards) {
          if (companionIds.has(card.cardId)) continue;
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
    const tierOrder = ['S','A','B','C','D','E','F'];
    return {
      id: ALL_CARDS_ID, name: 'Все карты', color: '#5a3000',
      totalCards: best.size,
      tiers: tierOrder
        .filter(t => tierMap.has(t))
        .map(t => ({
          tier: t, label: TIER_LABEL_FULL[t] ?? t,
          description: TIER_DESC_MAP[t] ?? '',
          cards: tierMap.get(t)!,
        })),
    };
  }, [sections, companionIds]);

  // Find active section (virtual "all" or real class)
  const activeSection = activeClassId === ALL_CARDS_ID
    ? allCardsSection
    : (sections.find(s => s.id === activeClassId) ?? sections[0]);

  // When class changes, reset filters
  const handleClassChange = (id: string) => {
    setActiveClassId(id);
    setSearchQuery('');
    setSelectedRarity('all');
  };

  const isNeutralTab    = activeClassId === 'any';
  const isAllCardsTab   = activeClassId === ALL_CARDS_ID;

  const filteredTiers = useMemo(() =>
    (activeSection?.tiers ?? []).map(t => ({
      ...t,
      cards: t.cards
        .filter(c => {
          const matchSearch = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
          const matchRarity = selectedRarity === 'all' || c.rarity === selectedRarity;
          const matchClass  = isNeutralTab ? true : isAllCardsTab ? true : c.classKey !== 'any';
          const isLegendaryCompanion = c.rarity === 'legendary' && companionIds.has(c.cardId);
          return matchSearch && matchRarity && matchClass && !isLegendaryCompanion;
        })
        .map(tc => mergeCard(tc, cards)),
    })).filter(t => t.cards.length > 0),
  [activeSection, searchQuery, selectedRarity, isNeutralTab, isAllCardsTab, companionIds, cards]);

  return (
    <div>
      <SectionBanner title="Тир-лист" subtitle="Оценки карт для каждого класса — текущий патч" />
      <div className="flex justify-end mb-4 -mt-2">
        <UpdateBadge updatedAt={data.updatedAt} source={data.source} onRefresh={onRefresh} refreshing={refreshing} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-4 opacity-70">
          <AlertTriangle size={13} /><span>Сервер недоступен — показаны кэшированные данные</span>
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
          <p className="text-[#8b6c42] text-sm">Получаем данные с manacost.ru</p>
        </div>
      ) : (
        <>
          {/* Nav bar: class icons + search */}
          <div className="mb-5">
            <ClassTabs
              sections={sections}
              activeId={activeClassId}
              onChange={handleClassChange}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Active class header + rarity filter */}
          <div className="flex items-center justify-between gap-3 mb-5">
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
                  <h3 className="font-hs text-lg sm:text-xl text-[#4a3018] leading-tight">{activeSection.name}</h3>
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
            {/* Rarity filter — icon buttons */}
            <div className="flex items-center gap-1 p-1 rounded-xl flex-shrink-0"
              style={{ background: 'linear-gradient(135deg,#e8d5a0,#d4b87a)', border: '1.5px solid #b8904a' }}>
              {RARITY_OPTIONS.map(r => {
                const active = selectedRarity === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRarity(r.id)}
                    title={r.name}
                    className="flex items-center justify-center rounded-lg transition-all"
                    style={{
                      padding: r.icon ? '4px' : '4px 10px',
                      background: active ? 'linear-gradient(135deg,#5a3000,#3d1e00)' : 'transparent',
                      boxShadow: active ? '0 2px 6px rgba(0,0,0,0.4)' : 'none',
                    }}
                  >
                    {r.icon
                      ? <img src={r.icon} alt={r.name} className="w-6 h-6 object-contain"
                          style={{ filter: active ? 'brightness(1.2) drop-shadow(0 0 4px rgba(252,211,77,0.6))' : 'brightness(0.75) saturate(0.6)', transition: 'filter 0.2s' }} />
                      : <span className="font-hs text-xs" style={{ color: active ? '#fcd34d' : '#6b4c2a' }}>Все</span>
                    }
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tiers */}
          <div className="space-y-10">
            {filteredTiers.length > 0 ? filteredTiers.map((tierGroup, tierIdx) => (
              <div key={tierGroup.tier} className="anim-fade-up" style={{ animationDelay: `${tierIdx * 0.07}s` }}>
                {/* Tier header */}
                <div className="flex items-center gap-4 mb-5">
                  <div className={`w-12 h-12 md:w-14 md:h-14 flex-shrink-0 flex items-center justify-center text-2xl md:text-3xl font-hs rounded-full border-[3px] shadow-[0_4px_14px_rgba(0,0,0,0.7),inset_0_4px_6px_rgba(255,255,255,0.35),inset_0_-4px_6px_rgba(0,0,0,0.45)] ${TIER_COLORS[tierGroup.tier] || TIER_COLORS['C']}`}>
                    <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{tierGroup.tier}</span>
                  </div>
                  <div className="flex-grow">
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-xl md:text-2xl font-hs text-[#3d2208] tracking-wide">{TIER_LABEL_FULL[tierGroup.tier] ?? tierGroup.label}</h3>
                      <span className="text-xs font-medium text-[#8b6c42] bg-[#8b6c42]/10 px-2 py-0.5 rounded-full border border-[#8b6c42]/20">{tierGroup.cards.length} карт</span>
                    </div>
                    <p className="text-sm text-[#6b4c2a] mt-0.5">{tierGroup.description}</p>
                  </div>
                </div>

                {/* Cards grid — cards are already merged in filteredTiers useMemo */}
                <div className="flex flex-wrap gap-3 md:gap-5 justify-center md:justify-start" style={{ contain: 'layout' }}>
                  {tierGroup.cards.map((card, idx) => (
                    <div
                      key={`${card.cardId}-${idx}`}
                      className="anim-scale-in"
                      style={{ animationDelay: `${tierIdx * 0.07 + idx * 0.018}s` }}
                    >
                      <HSCard
                        card={card}
                        onClick={() => setModalCard({ card, tier: tierGroup.tier })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )) : (
              <div className="text-center py-14 rounded-2xl"
                style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
                <div className="text-4xl mb-3">🃏</div>
                <p className="text-xl font-hs text-[#8b4513] tracking-wide">Карты не найдены</p>
                <p className="text-[#8b6c42] mt-2 text-sm">Попробуйте изменить фильтры.</p>
              </div>
            )}
          </div>
        </>
      )}

      {modalCard && (
        <CardModal card={modalCard.card} tier={modalCard.tier} onClose={() => setModalCard(null)} />
      )}
    </div>
  );
}

// ─── Legendaries tab ──────────────────────────────────────────────────────────

function winRateBadgeColor(wr: number | null | undefined): string {
  if (!wr) return '#6b7280';
  if (wr >= 60) return '#16a34a';
  if (wr >= 50) return '#ca8a04';
  return '#dc2626';
}

const LegendaryCardThumb: React.FC<{
  card: LegendaryCard;
  size: 'lg' | 'sm';
  onClick: () => void;
}> = memo(({ card, size, onClick }) => {
  // Fallback chain: imageRu → imageHa → hsJson enUS
  const sources = [
    card.imageRu || null,
    card.imageHa || null,
    card.cardId  ? hsImgUrl(card.cardId) : null,
  ].filter(Boolean) as string[];

  const [srcIdx, setSrcIdx] = useState(0);
  const src = sources[srcIdx] ?? null;
  const wClass = size === 'lg' ? 'w-36' : 'w-20';

  if (src) {
    return (
      <div
        className={`${wClass} flex-shrink-0 cursor-pointer group`}
        onClick={onClick}
        title={card.name}
      >
        <div className="transform transition-all duration-200 group-hover:scale-110"
          style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}>
          <img
            src={src}
            alt={card.name}
            loading="lazy"
            onError={() => setSrcIdx(i => i + 1)}
            className="w-full h-auto"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${wClass} flex-shrink-0 cursor-pointer rounded-xl bg-[#2c1e16] border-2 border-[#a88a45] flex items-center justify-center p-2 text-center`}
      style={{ minHeight: size === 'lg' ? '120px' : '72px' }}
      onClick={onClick}
      title={card.name}
    >
      <span className="font-hs text-[#fcd34d] text-[10px] leading-tight">{card.name}</span>
    </div>
  );
}) as React.FC<{ card: LegendaryCard; size: 'lg' | 'sm'; onClick: () => void }>;

// CLASS_SECTIONS_LEGEND: sections for legend tab (no neutral)
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
  { id: 'any',           name: 'Нейтральные',        color: '#6b6b6b' },
];

function Legendaries({ data, loading, error }: {
  data: LegendariesData; loading: boolean; error: boolean;
}) {
  const [activeClass, setActiveClass] = useState<string>('all');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);
  const classScrollRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const groups = data.groups ?? [];
    const base = activeClass === 'all' ? groups : groups.filter(g => g.classKey === activeClass);
    return [...base].sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  }, [data.groups, activeClass]);

  const toLegendaryCardData = useCallback((lc: LegendaryCard): CardData => ({
    name:     lc.name,
    score:    0,
    rarity:   'legendary',
    cardId:   lc.cardId,
    classKey: 'any',
    cost:     lc.cost,
    imageHa:  lc.imageHa,
    imageRu:  lc.imageRu ?? null,
  }), []);

  return (
    <div>
      <SectionBanner title="Легендарки" subtitle="Наборы карт для выбора первой легендарки на Арене" />
      {/* Count row */}
      <div className="flex justify-end mb-4 -mt-2">
        <div className="text-[#8b6c42] text-sm font-bold px-3 py-1.5 rounded-full flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }}>
          {filtered.length} групп
        </div>
      </div>

      {/* Class filter nav */}
      <div className="mb-5">
        <div
          ref={classScrollRef}
          className="flex items-center gap-1.5 sm:gap-2 px-3 py-2.5 rounded-2xl overflow-x-auto scrollbar-hs"
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
                key={cls.id}
                onClick={() => setActiveClass(cls.id)}
                title={cls.name}
                className="flex-shrink-0 relative transition-all duration-200"
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton h-64 w-full rounded-2xl" style={{ animationDelay: `${i * 0.05}s` }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-14 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
          <div className="text-4xl mb-3">⭐</div>
          <p className="text-xl font-hs text-[#8b4513] tracking-wide">Нет данных</p>
          <p className="text-[#8b6c42] mt-2 text-sm">Запустите npm run scrape для загрузки легендарных групп.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((group, idx) => (
            <div
              key={`${group.keyCard.cardId}-${idx}`}
              className="anim-scale-in card-hover rounded-2xl flex flex-col items-center p-4 gap-3 cursor-default"
              style={{
                animationDelay: `${Math.min(idx, 20) * 0.04}s`,
                background: 'linear-gradient(145deg,#ede0c0,#e0cc9e)',
                border: '1.5px solid #c4a46a',
              }}
            >
              {/* Key card image */}
              <LegendaryCardThumb
                card={group.keyCard}
                size="lg"
                onClick={() => setModalCard({ card: toLegendaryCardData(group.keyCard), tier: 'S' })}
              />

              {/* Key card name + win rate */}
              <div className="flex flex-col items-center gap-1 w-full">
                <span className="font-hs text-[#3d2208] text-base text-center leading-tight">{group.keyCard.name}</span>
                <span
                  className="px-3 py-1 rounded-full text-white text-xs font-bold shadow-md"
                  style={{ background: winRateBadgeColor(group.winRate) }}
                >
                  {group.winRate != null ? `${group.winRate.toFixed(1)}%` : '—'} винрейт
                </span>
              </div>

              {/* Divider */}
              <div className="w-full h-px" style={{ background: '#c4a46a' }} />

              {/* Package cards */}
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
            </div>
          ))}
        </div>
      )}

      {modalCard && (
        <CardModal card={modalCard.card} tier={modalCard.tier} onClose={() => setModalCard(null)} />
      )}
    </div>
  );
}

// ─── HomeTab ──────────────────────────────────────────────────────────────────

const HOME_NAV_CARDS: Array<{
  id: 'winrates' | 'tierlist' | 'legendaries';
  icon: string; title: string; desc: string;
}> = [
  { id: 'winrates',   icon: '🏆', title: 'Винрейт классов',   desc: 'Следите за топ-классами текущего патча' },
  { id: 'tierlist',   icon: '📜', title: 'Тир-лист карт',     desc: 'Оценки каждой карты по классам от Manacost' },
  { id: 'legendaries',icon: '⭐', title: 'Легендарные группы', desc: 'Лучшие легендарки и пакеты карт от Manacost' },
];

function HomeTab({ winratesData, loadingWinrates, onNavigate }: {
  winratesData: WinratesData;
  loadingWinrates: boolean;
  onNavigate: (tab: 'winrates' | 'tierlist' | 'legendaries') => void;
}) {
  const topClasses = useMemo(
    () => [...winratesData.classes].sort((a, b) => b.winrate - a.winrate).slice(0, 3),
    [winratesData.classes],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Hero row */}
      <div className="flex flex-col sm:flex-row items-center gap-6 py-6 px-2">
        <div className="relative flex-shrink-0" style={{ width: 80, height: 80 }}>
          <div className="absolute inset-0 rounded-full"
            style={{ boxShadow: '0 0 0 3px #fcd34d, 0 0 20px rgba(252,211,77,0.4)' }} />
          <img
            src={ARENA_ICON}
            alt="Arena"
            className="w-full h-full rounded-full object-cover"
            style={{ filter: 'drop-shadow(0 0 8px rgba(252,211,77,0.5))' }}
            draggable={false}
          />
        </div>
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
          <h2 className="font-hs text-[#3d2208] leading-tight mb-2"
            style={{ fontSize: 'clamp(1.4rem, 4vw, 2.2rem)' }}>
            Добро пожаловать в Manacost Arena
          </h2>
          <p className="text-[#8b6c42] text-sm sm:text-base max-w-xl leading-relaxed">
            Актуальная статистика для режима Арена в Hearthstone. Данные обновляются автоматически на основе миллионов партий.
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {HOME_NAV_CARDS.map(card => (
          <div
            key={card.id}
            className="rounded-2xl p-5 flex flex-col gap-3"
            style={{
              background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)',
              border: '1.5px solid #c4a46a',
            }}
          >
            <div className="text-3xl">{card.icon}</div>
            <div>
              <h3 className="font-hs text-[#3d2208] text-lg mb-1">{card.title}</h3>
              <p className="text-[#8b6c42] text-sm leading-relaxed">{card.desc}</p>
            </div>
            <button
              onClick={() => onNavigate(card.id)}
              className="mt-auto self-start px-4 py-2 rounded-lg text-[#fcd34d] text-sm font-hs border border-[#a88a45] transition-all hover:brightness-110"
              style={{ background: 'linear-gradient(135deg,#6b4c2a,#3a2210)' }}
            >
              Перейти →
            </button>
          </div>
        ))}
      </div>

      {/* Top classes row */}
      <div className="flex flex-col gap-3">
        <h3 className="font-hs text-[#3d2208] text-xl">Топ классы по винрейту</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loadingWinrates
            ? [0, 1, 2].map(i => (
                <div key={i} className="rounded-2xl p-4 animate-pulse"
                  style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a', height: 80 }} />
              ))
            : topClasses.map((cls, i) => {
                const icon = CLASS_ICON_BY_ID[cls.id];
                const pct = Math.max(0, Math.min(100, (cls.winrate - 40) / 20 * 100));
                return (
                  <div key={cls.id} className="rounded-2xl p-4 flex flex-col gap-2"
                    style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '1.5px solid #c4a46a' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-[#8b6c42] font-bold text-lg" style={{ minWidth: 20 }}>#{i + 1}</span>
                      {icon && <img src={icon} alt={cls.name} className="w-8 h-8 rounded-full object-cover" />}
                      <span className="font-hs text-[#3d2208] text-base flex-1">{cls.name}</span>
                      <span className="font-hs text-[#6b4c2a] text-sm font-bold">{cls.winrate.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ background: '#c4a46a44' }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#8b4513,#fcd34d)' }} />
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* ── Promo banners ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Telegram */}
        <a
          href="https://t.me/manacost_ru"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-4 px-5 py-4 rounded-2xl no-underline transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #0f2942 0%, #1a3a5c 50%, #0d2035 100%)',
            border: '1px solid rgba(42,171,238,0.35)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(42,171,238,0.15)',
          }}
        >
          {/* Icon */}
          <div className="flex-shrink-0 w-11 h-11 rounded-full overflow-hidden"
            style={{ boxShadow: '0 0 0 2px rgba(42,171,238,0.4)' }}>
            <img src="/ad/telegram.png" alt="Telegram" className="w-full h-full object-cover" draggable={false} />
          </div>

          {/* Text */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-hs text-white text-sm sm:text-base leading-tight">Telegram-канал Manacost</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                style={{ background: 'rgba(42,171,238,0.25)', color: '#7dd3fc', border: '1px solid rgba(42,171,238,0.3)' }}>
                Новости
              </span>
            </div>
            <span className="text-xs leading-snug" style={{ color: 'rgba(186,224,255,0.65)' }}>
              Патчи, обзоры мета и советы по Арене — первыми
            </span>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-hs transition-all duration-200 group-hover:brightness-110"
            style={{ background: 'rgba(42,171,238,0.2)', border: '1px solid rgba(42,171,238,0.45)', color: '#7dd3fc', whiteSpace: 'nowrap' }}>
            Подписаться
            <span className="text-base leading-none">→</span>
          </div>
        </a>

        {/* Boosty */}
        <a
          href="https://boosty.to/kolodahearthstone"
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-4 px-5 py-4 rounded-2xl no-underline transition-all duration-200 hover:scale-[1.01] hover:shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #2a1200 0%, #3d1a00 50%, #241000 100%)',
            border: '1px solid rgba(246,130,31,0.35)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(246,130,31,0.15)',
          }}
        >
          {/* Icon */}
          <div className="flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden p-1.5"
            style={{ background: 'rgba(246,130,31,0.15)', boxShadow: '0 0 0 2px rgba(246,130,31,0.35)' }}>
            <img src="/ad/boosty.png" alt="Boosty" className="w-full h-full object-contain" draggable={false} />
          </div>

          {/* Text */}
          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-hs text-white text-sm sm:text-base leading-tight">Koloda на Boosty</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0"
                style={{ background: 'rgba(246,130,31,0.25)', color: '#fdba74', border: '1px solid rgba(246,130,31,0.35)' }}>
                Эксклюзив
              </span>
            </div>
            <span className="text-xs leading-snug" style={{ color: 'rgba(255,210,170,0.6)' }}>
              Авторские гайды, разборы и контент для подписчиков
            </span>
          </div>

          {/* CTA */}
          <div className="flex-shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-hs transition-all duration-200 group-hover:brightness-110"
            style={{ background: 'rgba(246,130,31,0.2)', border: '1px solid rgba(246,130,31,0.45)', color: '#fdba74', whiteSpace: 'nowrap' }}>
            Поддержать
            <span className="text-base leading-none">→</span>
          </div>
        </a>
      </div>
    </div>
  );
}

// ─── AdminPanel ───────────────────────────────────────────────────────────────

interface AdminForm {
  title: string; tag: string; excerpt: string; image: string; url: string;
}

const EMPTY_FORM: AdminForm = { title: '', tag: '', excerpt: '', image: '', url: '' };

const ADMIN_INPUT: React.CSSProperties = {
  background: '#ecddb0',
  border: '1.5px solid #b89a55',
  color: '#3d2a1e',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box',
};

function AdminPanel({ articles, onRefresh, clientIp }: { articles: Article[]; onRefresh: () => void; clientIp: string }) {
  // Persist password in session so user doesn't retype on refresh
  const [password,  setPassword]  = useState(() => sessionStorage.getItem('ap') || '');
  const [authed,    setAuthed]    = useState(() => !!sessionStorage.getItem('ap'));
  const [activeSection, setActiveSection] = useState<'add' | 'list'>('list');
  const [form,      setForm]      = useState<AdminForm>(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [deleting,  setDeleting]  = useState<string | null>(null);
  const [msg,       setMsg]       = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const field = (key: keyof AdminForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length >= 4) {
      sessionStorage.setItem('ap', password);
      setAuthed(true);
      setMsg(null);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('ap');
    setAuthed(false);
    setPassword('');
    setMsg(null);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/admin-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, article: form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      setMsg({ type: 'ok', text: '✓ Статья добавлена!' });
      setForm(EMPTY_FORM);
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Удалить «${title}»?`)) return;
    setDeleting(id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin-articles?t=${Date.now()}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ password, id }),
      });
      let data: any = {};
      try { data = await res.json(); } catch { /* non-json body */ }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setMsg({ type: 'ok', text: '✓ Статья удалена' });
      onRefresh();
    } catch (err: any) {
      setMsg({ type: 'err', text: `Ошибка удаления: ${err.message}` });
    } finally {
      setDeleting(null);
    }
  };

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🔐</div>
        <h2 style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '1.4rem', marginBottom: '8px' }}>
          Панель администратора
        </h2>
        {clientIp && (
          <p style={{ color: '#8b6c42', fontSize: '12px', marginBottom: '20px' }}>
            Ваш IP: <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>{clientIp}</code>
          </p>
        )}
        <form onSubmit={handleAuth}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '280px', margin: '0 auto' }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Введите пароль"
            style={ADMIN_INPUT}
            autoFocus
          />
          <button type="submit" style={{
            background: 'linear-gradient(135deg,#6b4c2a,#3a2210)',
            color: '#fcd34d',
            border: '1.5px solid #a88a45',
            borderRadius: '8px',
            padding: '10px',
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            cursor: 'pointer',
          }}>Войти</button>
        </form>
      </div>
    );
  }

  // ── Main admin UI ─────────────────────────────────────────────────────────
  return (
    <div className="anim-fade-up" style={{ padding: '0' }}>

      {/* Global status message — visible from both add and delete actions */}
      {msg && (
        <div style={{
          marginBottom: '16px',
          padding: '10px 16px',
          borderRadius: '8px',
          background: msg.type === 'ok' ? '#d1fae5' : '#fee2e2',
          color: msg.type === 'ok' ? '#065f46' : '#991b1b',
          fontSize: '13px',
          lineHeight: '1.5',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', opacity: 0.5, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: '2px solid #c4a46a', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '1.5rem' }}>
            📰 Управление статьями
          </h2>
          <p style={{ color: '#8b6c42', fontSize: '13px', marginTop: '4px' }}>
            Статьи сохраняются в <code style={{ background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: '4px' }}>server/data/articles.json</code>
          </p>
          {clientIp && (
            <p style={{ color: '#aaa', fontSize: '11px', marginTop: '4px' }}>
              IP: <code style={{ fontFamily: 'monospace' }}>{clientIp}</code>
            </p>
          )}
        </div>
        <button onClick={handleLogout} style={{
          background: 'rgba(153,27,27,0.1)',
          color: '#991b1b',
          border: '1px solid #fca5a5',
          borderRadius: '8px',
          padding: '6px 14px',
          fontSize: '13px',
          cursor: 'pointer',
          flexShrink: 0,
        }}>Выйти</button>
      </div>

      {/* ── Add form ────────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(139,69,19,0.07)',
        border: '1.5px solid #c4a46a',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '32px',
      }}>
        <h3 style={{ fontFamily: 'var(--font-display)', color: '#6b4c2a', marginBottom: '16px', fontSize: '1rem' }}>
          + Добавить статью
        </h3>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Заголовок *</label>
              <input style={ADMIN_INPUT} value={form.title} onChange={field('title')} placeholder="Лучшие классы Арены — март 2026" required />
            </div>
            <div>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Тег</label>
              <input style={ADMIN_INPUT} value={form.tag} onChange={field('tag')} placeholder="Мета / Гайд / Обучение" />
            </div>
            <div>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Ссылка на статью</label>
              <input style={ADMIN_INPUT} value={form.url} onChange={field('url')} placeholder="https://manacost.ru/..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>URL обложки</label>
              <input style={ADMIN_INPUT} value={form.image} onChange={field('image')} placeholder="https://..." />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', color: '#6b4c2a', fontSize: '12px', marginBottom: '4px', fontWeight: 600 }}>Описание (краткое)</label>
              <textarea
                style={{ ...ADMIN_INPUT, minHeight: '80px', resize: 'vertical' }}
                value={form.excerpt}
                onChange={field('excerpt')}
                placeholder="Разбор текущего мета: какие классы показывают наилучший винрейт..."
              />
            </div>
          </div>

          {/* Preview if image URL set */}
          {form.image && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px' }}>
              <img src={form.image} alt="preview"
                style={{ width: '64px', height: '48px', objectFit: 'cover', borderRadius: '6px', border: '1px solid #c4a46a' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span style={{ fontSize: '12px', color: '#8b6c42' }}>Предпросмотр обложки</span>
            </div>
          )}

          <button type="submit" disabled={saving} style={{
            background: saving ? '#aaa' : 'linear-gradient(135deg,#6b4c2a,#3a2210)',
            color: '#fcd34d',
            border: '1.5px solid #a88a45',
            borderRadius: '8px',
            padding: '10px 20px',
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            cursor: saving ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}>
            {saving ? 'Сохранение...' : 'Добавить статью'}
          </button>
        </form>
      </div>

      {/* ── Existing articles ─────────────────────────────────────────────── */}
      <h3 style={{ fontFamily: 'var(--font-display)', color: '#6b4c2a', marginBottom: '12px', fontSize: '1rem' }}>
        Текущие статьи ({articles.length})
      </h3>
      {articles.length === 0 ? (
        <p style={{ color: '#8b6c42', fontSize: '14px' }}>Нет статей</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {articles.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              background: 'rgba(139,69,19,0.06)',
              border: '1px solid #c4a46a',
              borderRadius: '10px',
            }}>
              {a.image ? (
                <img src={a.image} alt=""
                  style={{ width: '52px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div style={{ width: '52px', height: '40px', borderRadius: '6px', background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '20px', opacity: 0.4 }}>📰</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', color: '#3d2208', fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.title}
                </div>
                <div style={{ color: '#8b6c42', fontSize: '11px', marginTop: '2px' }}>
                  {a.date}{a.tag ? ` · ${a.tag}` : ''}
                </div>
              </div>
              {a.url && a.url !== '#' && (
                <a href={a.url} target="_blank" rel="noreferrer"
                  style={{ fontSize: '11px', color: '#8b4513', textDecoration: 'none', flexShrink: 0 }}>
                  ↗
                </a>
              )}
              <button
                onClick={() => handleDelete(a.id, a.title)}
                disabled={deleting === a.id}
                style={{
                  background: '#fee2e2', color: '#991b1b',
                  border: '1px solid #fca5a5', borderRadius: '6px',
                  padding: '5px 11px', cursor: deleting === a.id ? 'not-allowed' : 'pointer',
                  fontSize: '12px', flexShrink: 0,
                  opacity: deleting === a.id ? 0.6 : 1,
                }}
              >
                {deleting === a.id ? '…' : 'Удалить'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SectionBanner ────────────────────────────────────────────────────────────

function SectionBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      {/* Desktop banner — image with text overlay */}
      <div
        className="relative overflow-hidden rounded-t-xl hidden sm:block -mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6"
        style={{ height: 'clamp(130px, 15vw, 190px)' }}
      >
        <img
          src="/wallpaper/blog-header-bg.jpg"
          alt=""
          className="w-full h-full object-cover object-top select-none"
          loading="lazy"
          draggable={false}
        />
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1"
          style={{
            background: 'linear-gradient(to bottom, rgba(244,228,188,0.0) 0%, rgba(244,228,188,0.45) 60%, rgba(244,228,188,0.80) 100%)',
          }}
        >
          <h2
            className="font-hs tracking-wide"
            style={{
              fontSize: 'clamp(1.6rem, 3.5vw, 2.6rem)',
              color: '#3d2208',
              textShadow: '0 2px 20px rgba(244,228,188,1), 0 0 50px rgba(244,228,188,0.9)',
            }}
          >
            {title}
          </h2>
          <p
            className="font-body font-semibold"
            style={{
              fontSize: 'clamp(0.75rem, 1.4vw, 0.9rem)',
              color: '#6b4c2a',
              textShadow: '0 1px 8px rgba(255,255,255,1)',
            }}
          >
            {subtitle}
          </p>
        </div>
      </div>

      {/* Mobile banner — simple parchment header strip, no image */}
      <div
        className="sm:hidden -mx-3 -mt-3 mb-5 px-4 py-4 rounded-t-xl"
        style={{
          background: 'linear-gradient(135deg, #e8d0a0, #d4b87a)',
          borderBottom: '2px solid #c4a46a',
        }}
      >
        <h2
          className="font-hs tracking-wide"
          style={{ fontSize: '1.5rem', color: '#3d2208' }}
        >
          {title}
        </h2>
        <p className="text-[#6b4c2a] text-xs mt-0.5 font-semibold">{subtitle}</p>
      </div>
    </>
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
  url: string;
}
interface ArticlesData {
  articles: Article[];
  updatedAt: string | null;
}

function ArticleCard({ article, idx }: { article: Article; idx: number }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div
      className="anim-scale-in rounded-2xl overflow-hidden flex flex-col cursor-pointer transition-all duration-200"
      style={{
        animationDelay: `${idx * 0.06}s`,
        background: 'linear-gradient(145deg,#fdf6e3,#f0e6c8)',
        border: '1.5px solid #c4a46a',
        boxShadow: '0 3px 12px rgba(0,0,0,0.15)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 12px 28px rgba(0,0,0,0.25)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.transform = '';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 3px 12px rgba(0,0,0,0.15)';
      }}
      onClick={() => { if (article.url && article.url !== '#') window.open(article.url, '_blank'); }}
    >
      {/* Image */}
      <div className="relative h-44 w-full overflow-hidden flex-shrink-0"
        style={{ background: 'linear-gradient(135deg,#3a2210,#1a0e04)' }}>
        {!imgErr ? (
          <img src={article.image} alt={article.title} loading="lazy"
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-40">⚔</span>
          </div>
        )}
        {article.tag && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold text-[#fcd34d]"
            style={{ background: 'linear-gradient(135deg,#6b4c2a,#3a2210)', border: '1px solid #a88a45' }}>
            {article.tag}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="p-4 flex flex-col flex-grow gap-2">
        <h3 className="font-hs text-[#3d2208] text-base leading-tight"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {article.title}
        </h3>
        <p className="text-[#6b4c2a] text-xs leading-relaxed flex-grow"
          style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {article.excerpt}
        </p>
        <div className="flex items-center justify-between mt-1 pt-2"
          style={{ borderTop: '1px solid #c4a46a' }}>
          <span className="text-[#8b6c42] text-xs">
            {new Date(article.date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
          </span>
          <span className="text-[#8b4513] text-xs font-bold">Читать →</span>
        </div>
      </div>
    </div>
  );
}

function ArticlesTab({ data, loading }: { data: ArticlesData; loading: boolean }) {
  return (
    <div>
      <SectionBanner title="Статьи" subtitle="Гайды, разборы мета и советы по режиму Арена" />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[1,2,3].map(i => <div key={i} className="skeleton h-72 rounded-2xl" />)}
        </div>
      ) : data.articles.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">📰</div>
          <p className="font-hs text-[#8b4513] text-xl">Статьи скоро появятся</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {data.articles.map((a, i) => <React.Fragment key={a.id}><ArticleCard article={a} idx={i} /></React.Fragment>)}
        </div>
      )}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'home',        label: 'Главная',    icon: Home,     slug: '/'           },
  { id: 'articles',    label: 'Статьи',     icon: BookOpen, slug: '/articles'   },
  { id: 'winrates',    label: 'Классы',     icon: Trophy,   slug: '/classes'    },
  { id: 'tierlist',    label: 'Тир-лист',   icon: Scroll,   slug: '/tierlist'   },
  { id: 'legendaries', label: 'Легендарки', icon: Star,     slug: '/legendaries'},
] as const;

// ─── Per-tab SEO meta ─────────────────────────────────────────────────────────

const SITE_URL = 'https://manacost-arena.vercel.app';

const PAGE_META: Record<string, { title: string; description: string; slug: string }> = {
  home:        {
    title:       'Manacost Arena — Тир-лист и Винрейты для Арены Hearthstone',
    description: 'Актуальная статистика Арены Hearthstone: тир-лист карт, винрейты классов, легендарные группы. Данные обновляются 4 раза в сутки.',
    slug:        '/',
  },
  winrates:    {
    title:       'Винрейт классов — Арена Hearthstone | Manacost',
    description: 'Актуальные винрейты всех 11 классов в режиме Арена Hearthstone. Рейтинг на основе миллионов партий, обновляется автоматически.',
    slug:        '/classes',
  },
  tierlist:    {
    title:       'Тир-лист карт — Арена Hearthstone | Manacost',
    description: 'Полный тир-лист карт для каждого класса в режиме Арена Hearthstone. Лучшие карты текущего патча с оценками от S до F.',
    slug:        '/tierlist',
  },
  legendaries: {
    title:       'Легендарки на Арене Hearthstone — Лучшие группы | Manacost',
    description: 'Какую легендарную карту выбрать на Арене? Все группы первого выбора с процентом побед. Обновляется автоматически.',
    slug:        '/legendaries',
  },
  articles:    {
    title:       'Статьи и гайды по Арене Hearthstone | Manacost',
    description: 'Гайды, разборы и советы по режиму Арена в Hearthstone от команды Manacost.',
    slug:        '/articles',
  },
};

/** Update <title>, meta description and canonical <link> for the current tab */
function applyPageMeta(tabId: string): void {
  const meta = PAGE_META[tabId] ?? PAGE_META.home;

  document.title = meta.title;

  const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  if (desc) desc.content = meta.description;

  const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = meta.title;

  const ogDesc = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
  if (ogDesc) ogDesc.content = meta.description;

  const ogUrl = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
  if (ogUrl) ogUrl.content = `${SITE_URL}${meta.slug}`;

  const twTitle = document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]');
  if (twTitle) twTitle.content = meta.title;

  const twDesc = document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]');
  if (twDesc) twDesc.content = meta.description;

  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.href = `${SITE_URL}${meta.slug}`;
}

type TabId = (typeof TABS)[number]['id'];

/** Resolve tab from current pathname */
function tabFromPath(path: string): TabId {
  const found = TABS.find(t => t.slug !== '/' && path.startsWith(t.slug));
  return (found?.id ?? 'home') as TabId;
}

// ─── Tab transition wrapper ────────────────────────────────────────────────────
// Simple key-based remount: React unmounts old tab, mounts new with enter animation.
// No state machine needed — eliminates double-animation and stale-children bugs.
function TabTransition({ tabKey, children }: { tabKey: string; children: React.ReactNode }) {
  return (
    <div key={tabKey} className="tab-enter">
      {children}
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>(() => tabFromPath(window.location.pathname));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  /** Navigate to a tab: update state + browser URL */
  const navigate = useCallback((tab: TabId) => {
    const slug = TABS.find(t => t.id === tab)!.slug;
    if (window.location.pathname !== slug) {
      window.history.pushState({ tab }, '', slug);
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
    applyPageMeta(tab);
  }, []);

  /** Handle browser back / forward */
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const tab = e.state?.tab ?? tabFromPath(window.location.pathname);
      setActiveTab(tab);
      applyPageMeta(tab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /** Apply initial meta on first mount */
  useEffect(() => { applyPageMeta(activeTab); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Admin panel: ?admin in URL + IP whitelist check
  const wantsAdmin = window.location.search.includes('admin');
  const [isAdminMode,    setIsAdminMode]    = useState(false);
  const [adminIpChecked, setAdminIpChecked] = useState(!wantsAdmin); // skip check if not needed
  const [adminIpAllowed, setAdminIpAllowed] = useState(false);
  const [clientIp,       setClientIp]       = useState('');
  useEffect(() => {
    if (!wantsAdmin) return;
    fetch('/api/check-ip').then(r => r.json()).then(d => {
      setAdminIpAllowed(d.allowed);
      setClientIp(d.ip ?? '');
      if (d.allowed) setIsAdminMode(true);
    }).catch(() => {}).finally(() => setAdminIpChecked(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [winrateSource, setWinrateSource] = useState<'hsreplay' | 'firestone'>('hsreplay');
  const winrateSourceRef = useRef<'hsreplay' | 'firestone'>('hsreplay');
  const [winratesData, setWinratesData] = useState<WinratesData>({
    classes: FALLBACK_CLASSES, updatedAt: null, source: 'initial',
  });
  const [tierlistData, setTierlistData] = useState<TierlistData>({
    sections: [], cards: {}, updatedAt: null, source: 'initial',
  });
  const [legendariesData, setLegendariesData] = useState<LegendariesData>({
    groups: [], updatedAt: null, source: 'manacost.ru',
  });
  const [articlesData, setArticlesData] = useState<ArticlesData>({ articles: [], updatedAt: null });
  const [loadingArticles, setLoadingArticles] = useState(true);

  const [loadingWinrates,    setLoadingWinrates]    = useState(false); // false = show fallback immediately
  const [loadingTierlist,    setLoadingTierlist]    = useState(true);
  const [loadingLegendaries, setLoadingLegendaries] = useState(true);
  const [errorWinrates,      setErrorWinrates]      = useState(false);
  const [errorTierlist,      setErrorTierlist]      = useState(false);
  const [errorLegendaries,   setErrorLegendaries]   = useState(false);
  const [refreshing,         setRefreshing]         = useState(false);
  const [switchingSource,    setSwitchingSource]    = useState(false);

  // Generation counter prevents race conditions when two fetches run simultaneously
  const wrGenRef = useRef(0);

  const fetchWinrates = useCallback(async (src: 'hsreplay' | 'firestone' = 'hsreplay') => {
    const gen = ++wrGenRef.current;
    const cacheKey = `wr_${src}`;
    try {
      // Show cached data instantly if available
      const cached = sessionStorage.getItem(cacheKey);
      if (cached && gen === wrGenRef.current) {
        setWinratesData(JSON.parse(cached));
      }
      // Refetch fresh data
      const res = await fetch(`/api/winrates?source=${src}`);
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();
      // Only apply if this is still the latest fetch (not superseded)
      if (gen !== wrGenRef.current) return;
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      setWinratesData(data);
      setErrorWinrates(false);
    } catch { if (gen === wrGenRef.current) setErrorWinrates(true); }
    finally  { if (gen === wrGenRef.current) { setLoadingWinrates(false); setSwitchingSource(false); } }
  }, []);

  const fetchTierlist = useCallback(async () => {
    try {
      const cached = sessionStorage.getItem('tl');
      if (cached) { setTierlistData(JSON.parse(cached)); setLoadingTierlist(false); }
      const res = await fetch('/api/tierlist');
      if (!res.ok) throw new Error('not ok');
      const data = await res.json();
      sessionStorage.setItem('tl', JSON.stringify(data));
      setTierlistData(data);
      setErrorTierlist(false);
    } catch { setErrorTierlist(true); }
    finally  { setLoadingTierlist(false); }
  }, []);

  const fetchLegendaries = useCallback(async () => {
    try {
      const res = await fetch('/api/legendaries');
      if (!res.ok) throw new Error('not ok');
      setLegendariesData(await res.json());
      setErrorLegendaries(false);
    } catch { setErrorLegendaries(true); }
    finally  { setLoadingLegendaries(false); }
  }, []);

  const fetchArticles = useCallback(async (bust = false) => {
    try {
      // bust=true adds timestamp so browser & CDN don't serve stale cache
      const url = bust ? `/api/articles?t=${Date.now()}` : '/api/articles';
      const res = await fetch(url, bust ? { cache: 'no-store' } : {});
      if (!res.ok) throw new Error('not ok');
      setArticlesData(await res.json());
    } catch {
      // keep empty
    } finally { setLoadingArticles(false); }
  }, []);

  // Fetch all data in parallel on mount — fastest time-to-data on first tab switch
  useEffect(() => {
    fetchWinrates();
    fetchArticles();
    fetchTierlist();
    fetchLegendaries();
  }, [fetchWinrates, fetchArticles, fetchTierlist, fetchLegendaries]);

  // Set of cardIds that are companion cards in legendary groups (not the key legendary itself)
  const companionIds = useMemo(() => {
    const keyIds = new Set(legendariesData.groups.map(g => g.keyCard.cardId));
    const ids = new Set<string>();
    legendariesData.groups.forEach(g =>
      g.cards.forEach(c => { if (!keyIds.has(c.cardId)) ids.add(c.cardId); })
    );
    return ids;
  }, [legendariesData]);

  const pollRef    = useRef<ReturnType<typeof setInterval>  | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>   | null>(null);

  // Cleanup on unmount
  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);

    // Clear any previous poll
    if (pollRef.current)    { clearInterval(pollRef.current);   pollRef.current    = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }

    try {
      await fetch('/api/scrape', { method: 'POST' });
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        await Promise.all([fetchWinrates(winrateSourceRef.current), fetchTierlist()]);
        if (attempts >= 6) {          // 6 × 5 s = 30 s max
          clearInterval(pollRef.current!); pollRef.current = null;
          setRefreshing(false);
        }
      }, 5000);

      // Hard safety timeout: cancel poll after 30 s
      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        setRefreshing(false);
      }, 30000);
    } catch { setRefreshing(false); }
  }, [refreshing, fetchWinrates, fetchTierlist]);

  return (
    <div className="min-h-screen bg-wood text-[#3d2a1e] font-body flex flex-col">
      {/* Header */}
      <header className="relative z-20 overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0d0702 0%, #1a0e04 40%, #241408 100%)',
          borderBottom: '3px solid #8b5a1a',
          boxShadow: '0 4px 32px rgba(0,0,0,0.8), 0 1px 0 rgba(212,175,55,0.3)',
        }}>
        {/* Decorative top line */}
        <div className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: 'linear-gradient(90deg, transparent, #fcd34d 20%, #fcd34d 80%, transparent)' }} />
        {/* Background texture */}
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col items-center justify-center relative">
          {/* Logo — click to go home */}
          <button
            onClick={() => navigate('home')}
            className="flex items-center gap-4 sm:gap-6 focus:outline-none group"
            aria-label="На главную"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            {/* Emblem */}
            <div className="relative flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
              style={{ width: '64px', height: '64px' }}>
              <div className="absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 0 2px #fcd34d, 0 0 20px rgba(252,211,77,0.4), 0 0 0 4px rgba(212,175,55,0.12)' }} />
              <img
                src={ARENA_ICON}
                alt="Arena"
                className="w-full h-full rounded-full object-cover"
                style={{ filter: 'drop-shadow(0 0 10px rgba(252,211,77,0.6))' }}
                draggable={false}
              />
            </div>
            {/* Title */}
            <div className="flex flex-col items-start">
              <h1
                className="leading-none tracking-wider uppercase select-none transition-opacity group-hover:opacity-90"
                style={{
                  fontFamily: 'var(--font-display, "Cinzel", serif)',
                  fontSize: 'clamp(1.8rem, 5vw, 3.5rem)',
                  background: 'linear-gradient(180deg, #fffde7 0%, #fcd34d 35%, #e8a000 70%, #b35c00 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  filter: 'drop-shadow(0 2px 8px rgba(212,175,55,0.5))',
                  textShadow: 'none',
                }}
              >
                Manacost
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-px flex-grow bg-gradient-to-r from-transparent via-[#fcd34d]/60 to-transparent" style={{ minWidth: '30px' }} />
                <span
                  className="uppercase tracking-[0.45em] text-[#c4a46a] font-bold"
                  style={{ fontFamily: 'var(--font-body)', fontSize: 'clamp(0.6rem, 1.8vw, 0.85rem)', letterSpacing: '0.5em' }}
                >
                  Arena
                </span>
                <div className="h-px flex-grow bg-gradient-to-r from-transparent via-[#fcd34d]/60 to-transparent" style={{ minWidth: '30px' }} />
              </div>
            </div>
          </button>
        </div>
      </header>

      <main className="flex-grow p-2 sm:p-4 md:p-8 relative flex flex-col items-center">
        {/* Tab bar wrapper — hidden in admin mode */}
        <div className={`relative w-full max-w-6xl flex flex-col items-center ${isAdminMode ? 'hidden' : ''}`}>
          {/* Mobile nav bar */}
          <div className="sm:hidden flex items-center justify-between px-3 py-2 -mb-px relative z-10 w-full"
            style={{ background: 'linear-gradient(135deg,#dcb883,#c4a46a)', borderRadius: '12px 12px 0 0', border: '2px solid #8b5a2b', borderBottom: 'none' }}>
            <div className="flex items-center gap-2 font-hs text-[#4a3018] text-sm">
              {(() => { const t = TABS.find(t => t.id === activeTab); const Icon = t!.icon; return <><Icon size={16} className="text-[#8b4513]" /><span>{t!.label}</span></>; })()}
            </div>
            <button onClick={() => setMobileMenuOpen(v => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-[#4a3018]"
              style={{ background: mobileMenuOpen ? 'rgba(0,0,0,0.1)' : 'transparent' }}>
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {/* Mobile dropdown */}
          {mobileMenuOpen && (
            <div className="sm:hidden absolute top-0 left-0 right-0 z-40 px-3 pt-2 pb-3 flex flex-col gap-1.5"
              style={{ background: 'linear-gradient(180deg,#2c1e16,#1a0e04)', borderBottom: '2px solid #8b5a1a', boxShadow: '0 8px 24px rgba(0,0,0,0.7)' }}>
              {TABS.map(tab => {
                const Icon = tab.icon; const active = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => navigate(tab.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl w-full text-left transition-all"
                    style={{ background: active ? 'linear-gradient(135deg,#6b4c2a,#3a2210)' : 'rgba(255,255,255,0.05)', border: `1.5px solid ${active ? '#a88a45' : 'rgba(168,138,69,0.2)'}`, color: active ? '#fcd34d' : 'rgba(255,255,255,0.75)' }}>
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="font-hs text-base">{tab.label}</span>
                    {active && <div className="ml-auto w-2 h-2 rounded-full bg-[#fcd34d]" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Desktop tab bar */}
          <div className="hidden sm:flex justify-center gap-1 md:gap-2 -mb-[3px] sm:-mb-[4px] relative z-10 px-2 w-full max-w-6xl flex-wrap">
            {TABS.map(tab => {
              const Icon = tab.icon; const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => navigate(tab.id)}
                  className={`relative px-3 sm:px-5 md:px-8 py-2 sm:py-3 font-hs text-xs sm:text-sm md:text-lg rounded-t-xl transition-all flex items-center gap-1.5 sm:gap-2 border-t-[3px] border-x-[3px] flex-shrink-0 ${
                    active
                      ? 'bg-parchment border-[#6b4c2a] text-[#4a3018] shadow-[0_-4px_10px_rgba(0,0,0,0.15)] z-20 pb-3 sm:pb-4'
                      : 'bg-parchment-inactive border-[#8b5a2b] text-[#5c3a21] hover:text-[#4a3018] hover:brightness-105 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.2)] z-0 mt-1 sm:mt-2'
                  }`}>
                  <Icon size={16} className={`flex-shrink-0 ${active ? 'text-[#8b4513]' : 'opacity-70'}`} />
                  <span className="drop-shadow-sm whitespace-nowrap">{tab.label}</span>
                  {active && <div className="absolute -bottom-[3px] left-0 right-0 h-[3px] bg-[#f4e4bc] z-30" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Parchment container */}
        <div className="w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0">
          <div className="absolute top-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-l-2 sm:border-l-4 border-gold rounded-tl-xl opacity-50" />
          <div className="absolute top-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-r-2 sm:border-r-4 border-gold rounded-tr-xl opacity-50" />
          <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-l-2 sm:border-l-4 border-gold rounded-bl-xl opacity-50" />
          <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-r-2 sm:border-r-4 border-gold rounded-br-xl opacity-50" />

          {isAdminMode ? (
            <AdminPanel articles={articlesData.articles} onRefresh={() => fetchArticles(true)} clientIp={clientIp} />
          ) : wantsAdmin && adminIpChecked && !adminIpAllowed ? (
            /* Access denied screen */
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🚫</div>
              <h2 style={{ fontFamily: 'var(--font-display)', color: '#991b1b', fontSize: '1.4rem', marginBottom: '8px' }}>
                Доступ запрещён
              </h2>
              <p style={{ color: '#8b6c42', fontSize: '14px' }}>
                Панель администратора недоступна с вашего IP-адреса.
              </p>
              {clientIp && (
                <p style={{ color: '#aaa', fontSize: '12px', marginTop: '8px' }}>
                  Ваш IP: <code style={{ fontFamily: 'monospace', background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: '4px' }}>{clientIp}</code>
                </p>
              )}
            </div>
          ) : (
            <TabTransition tabKey={activeTab}>
              <>
                {activeTab === 'home' && (
                  <HomeTab winratesData={winratesData} loadingWinrates={loadingWinrates} onNavigate={tab => navigate(tab as TabId)} />
                )}
                {activeTab === 'winrates' && (
                  <Winrates classes={winratesData.classes} loading={loadingWinrates} error={errorWinrates}
                    updatedAt={winratesData.updatedAt} source={winratesData.source}
                    onRefresh={handleRefresh} refreshing={refreshing}
                    winrateSource={winrateSource}
                    switching={switchingSource}
                    onSourceChange={async (src) => {
                      setWinrateSource(src);
                      winrateSourceRef.current = src;
                      setSwitchingSource(true);
                      await fetchWinrates(src);
                    }} />
                )}
                {activeTab === 'tierlist' && (
                  <TierList data={tierlistData} loading={loadingTierlist} error={errorTierlist}
                    onRefresh={handleRefresh} refreshing={refreshing} companionIds={companionIds} />
                )}
                {activeTab === 'legendaries' && (
                  <Legendaries data={legendariesData} loading={loadingLegendaries} error={errorLegendaries} />
                )}
                {activeTab === 'articles' && (
                  <ArticlesTab data={articlesData} loading={loadingArticles} />
                )}
              </>
            </TabTransition>
          )}
        </div>
      </main>
    </div>
  );
}

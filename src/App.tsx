/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Scroll, Info, Swords, RefreshCw, Loader2, AlertTriangle, X, Search, Star } from 'lucide-react';

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

/** Maps winrate class IDs (dk/dh/…) → icon path */
const CLASS_ICON_BY_ID: Record<string, string> = {
  dk:      '/class_icon/deathknight.png',
  dh:      '/class_icon/demonhunter.png',
  druid:   '/class_icon/druid.png',
  hunter:  '/class_icon/hunter.png',
  mage:    '/class_icon/mage.png',
  paladin: '/class_icon/paladin.png',
  priest:  '/class_icon/priest.png',
  rogue:   '/class_icon/rogue.png',
  shaman:  '/class_icon/shaman.png',
  warlock: '/class_icon/warlock.png',
  warrior: '/class_icon/warrior.png',
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
  return { ...tc, ...(lookup[tc.cardId] ?? {}) };
}

// ─── Card image helpers ───────────────────────────────────────────────────────

const hsImgUrl = (cardId: string, size: '256x' | '512x' = '256x') =>
  `https://art.hearthstonejson.com/v1/render/latest/enUS/${size}/${cardId}.png`;

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

const CardModal: React.FC<{ card: CardData; tier: string; onClose: () => void }> = ({ card, tier, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [imgErr, setImgErr] = useState(false);

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

  const rarityLabel: Record<string, string> = {
    common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная', free: 'Базовая',
  };
  const typeLabel: Record<string, string> = {
    minion: 'Существо', spell: 'Заклинание', weapon: 'Оружие', hero: 'Герой', location: 'Локация',
  };

  const scoreBg = (s: number) => s >= 100 ? '#16a34a' : s >= 75 ? '#ca8a04' : '#dc2626';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.2s ease' }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      <div
        className="relative z-10 flex flex-col items-center gap-5 max-w-sm w-full"
        style={{
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.72) translateY(40px)',
          transition: 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {bigSrc ? (
          <img src={bigSrc} alt={card.name} onError={() => setImgErr(true)}
            className="w-64 sm:w-72 md:w-80 h-auto drop-shadow-[0_24px_60px_rgba(0,0,0,0.95)]"
            draggable={false} />
        ) : (
          <div className="w-64 h-96 bg-[#2c1e16] rounded-2xl border-2 border-[#a88a45] flex items-center justify-center">
            <span className="text-[#fcd34d] font-hs text-xl text-center px-4">{card.name}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-center gap-2 w-full">
          {card.score > 0 && (
            <div className="px-4 py-1.5 rounded-full text-white font-bold text-sm shadow-lg border border-white/20"
              style={{ background: scoreBg(card.score) }}>
              HearthArena: {card.score}
            </div>
          )}
          <div className={`w-9 h-9 flex items-center justify-center rounded-full border-2 font-hs text-lg shadow-lg ${TIER_COLORS[tier] || TIER_COLORS['C']}`}>
            {tier}
          </div>
          {card.rarity && (
            <div className="px-3 py-1.5 rounded-full bg-[#1a110a]/80 border border-[#a88a45]/60 text-[#fcd34d] text-xs font-bold">
              {rarityLabel[card.rarity] || card.rarity}
            </div>
          )}
          {card.type && (
            <div className="px-3 py-1.5 rounded-full bg-[#1a110a]/80 border border-[#6b4c2a]/60 text-[#e8d5a5] text-xs">
              {typeLabel[card.type] || card.type}
            </div>
          )}
          {card.cost !== undefined && (
            <div className="px-3 py-1.5 rounded-full bg-[#1e3a8a]/80 border border-[#60a5fa]/60 text-[#bfdbfe] text-xs font-bold">
              Мана: {card.cost}
            </div>
          )}
        </div>
        <p className="text-white/40 text-xs mt-1">
          Нажмите вне карточки или <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white/60">ESC</kbd> для закрытия
        </p>
      </div>
      <button
        className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/70 hover:text-white transition-all border border-white/10 hover:border-white/30"
        onClick={onClose} aria-label="Закрыть"
      >
        <X size={18} />
      </button>
    </div>
  );
};

// ─── HSCard ───────────────────────────────────────────────────────────────────

const HSCard: React.FC<{ card: CardData; onClick: () => void }> = ({ card, onClick }) => {
  const [imgErr, setImgErr] = useState(false);

  const thumbSrc = imgErr ? null
    : card.imageRu  ? card.imageRu
    : card.imageHa  ? card.imageHa
    : card.cardId   ? hsImgUrl(card.cardId)
    : null;

  if (thumbSrc) {
    return (
      <div className="relative flex-shrink-0 group cursor-pointer" onClick={onClick} title={card.name}>
        <div className="transform transition-all duration-200 group-hover:scale-110 group-hover:z-10"
          style={{ filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.85))' }}>
          <img src={thumbSrc} alt={card.name} loading="lazy"
            onError={() => setImgErr(true)}
            className="w-28 sm:w-32 md:w-36 h-auto" />
        </div>
      </div>
    );
  }

  // Fallback styled card
  const rarityColors: Record<string, string> = {
    free: '#d1d1d1', common: '#ffffff', rare: '#0070dd', epic: '#a335ee', legendary: '#ff8000',
  };
  return (
    <div
      className="relative w-28 h-40 sm:w-32 sm:h-48 md:w-36 md:h-52 rounded-xl flex flex-col items-center justify-center text-center transform transition-transform hover:scale-105 hover:z-10 cursor-pointer overflow-hidden border-2 border-[#1a110a] bg-[#2c1e16]"
      onClick={onClick} title={card.name}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/90" />
      <div className="absolute top-[52%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-4 sm:w-4 sm:h-5 rounded-full z-20 border border-[#3a2210]"
        style={{ background: `radial-gradient(circle at 30% 30%,#fff 0%,${rarityColors[card.rarity] || '#fff'} 40%,#000 100%)` }} />
      <div className="z-10 mt-auto mb-2 w-[112%] -ml-[6%] bg-gradient-to-b from-[#4a3018] to-[#2c1e16] border-y-2 border-[#a88a45] py-1 px-1">
        <span className="font-hs text-[#fcd34d] text-[9px] sm:text-[11px] leading-tight block text-center truncate">{card.name}</span>
      </div>
    </div>
  );
};

// ─── Skeleton / misc ──────────────────────────────────────────────────────────

const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className = '', style }) => (
  <div className={`skeleton ${className}`} style={style} />
);

const UpdateBadge: React.FC<{ updatedAt: string | null; source: string; onRefresh: () => void; refreshing: boolean }> =
  ({ updatedAt, onRefresh, refreshing }) => (
    <div className="flex flex-wrap items-center gap-2">
      {/* Timestamp pill */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs"
        style={{
          background: 'linear-gradient(135deg,#3a2210,#2c1e16)',
          border: '1.5px solid #6b4c2a',
          color: '#e8d5a5',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }}>
        <Info size={12} className="text-[#a88a45]" />
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
          ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
          : <RefreshCw size={12} />}
        <span>{refreshing ? 'Парсинг…' : 'Обновить'}</span>
      </button>
    </div>
  );

// ─── Winrates tab ─────────────────────────────────────────────────────────────

function Winrates({ classes, loading, error, updatedAt, source, onRefresh, refreshing }: {
  classes: ClassData[]; loading: boolean; error: boolean;
  updatedAt: string | null; source: string; onRefresh: () => void; refreshing: boolean;
}) {
  // Trigger bar fill animation after mount
  const [barsVisible, setBarsVisible] = useState(false);
  useEffect(() => {
    if (!loading) {
      const t = setTimeout(() => setBarsVisible(true), 80);
      return () => clearTimeout(t);
    }
  }, [loading]);

  const maxWinrate = Math.max(...classes.map(c => c.winrate), 1);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-5 gap-4"
        style={{ borderBottom: '2px solid #c4a46a' }}>
        <div>
          <h2 className="text-2xl sm:text-3xl font-hs text-[#3d2208] tracking-wide">Винрейт классов</h2>
          <p className="text-[#8b6c42] text-sm mt-1">Статистика побед на Арене — текущий патч</p>
        </div>
        <UpdateBadge updatedAt={updatedAt} source={source} onRefresh={onRefresh} refreshing={refreshing} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-5 px-3 py-2 rounded-lg bg-[#8b4513]/10 border border-[#8b4513]/20">
          <AlertTriangle size={13} /><span>Нет соединения — показаны кэшированные данные</span>
        </div>
      )}

      <div className="space-y-2.5 sm:space-y-3">
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
                  className="anim-fade-up group relative flex items-center gap-3 sm:gap-4 rounded-2xl overflow-hidden cursor-default"
                  style={{
                    animationDelay: delay,
                    background: 'linear-gradient(135deg, #ede0c0 0%, #e2cfa0 50%, #d8c090 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 3px 10px rgba(0,0,0,0.18)',
                    border: '1.5px solid #c9a86c',
                    padding: '10px 14px',
                    transition: 'transform 0.25s ease, box-shadow 0.25s ease',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.8), 0 8px 20px rgba(0,0,0,0.25)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.transform = '';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.7), 0 3px 10px rgba(0,0,0,0.18)';
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
}> = ({ sections, activeId, onChange }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current?.querySelector(`[data-id="${activeId}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeId]);

  return (
    <div
      ref={scrollRef}
      className="flex gap-1.5 overflow-x-auto pb-1 snap-x"
      style={{ scrollbarWidth: 'thin' }}
    >
      {sections.map(sec => {
        const isActive = sec.id === activeId;
        const iconSrc  = CLASS_ICON[sec.id];

        return (
          <button
            key={sec.id}
            data-id={sec.id}
            onClick={() => onChange(sec.id)}
            title={sec.name}
            className={`snap-start flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl transition-all border-2 ${
              isActive
                ? 'border-[#fcd34d] shadow-[0_0_12px_rgba(252,211,77,0.4),inset_0_1px_3px_rgba(255,255,255,0.3)] scale-110 z-10'
                : 'border-transparent opacity-60 hover:opacity-90 hover:border-[#a88a45]/50 hover:scale-105'
            }`}
            style={{
              background: isActive
                ? `linear-gradient(145deg, ${sec.color}dd, ${sec.color})`
                : `${sec.color}44`,
            }}
          >
            {iconSrc ? (
              <img
                src={iconSrc}
                alt={sec.name}
                className={`object-contain transition-all ${isActive ? 'w-9 h-9' : 'w-8 h-8'}`}
                draggable={false}
              />
            ) : (
              /* Нейтральные — нет иконки, используем ⚔ */
              <div className={`flex items-center justify-center font-hs text-white/80 transition-all ${isActive ? 'text-2xl w-9 h-9' : 'text-xl w-8 h-8'}`}>
                ⚔
              </div>
            )}
            <span className={`font-hs leading-tight text-center transition-all ${
              isActive ? 'text-[#fcd34d] text-[10px]' : 'text-white/70 text-[9px]'
            }`}>
              {sec.name}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ─── TierList tab ─────────────────────────────────────────────────────────────

function TierList({ data, loading, error, onRefresh, refreshing }: {
  data: TierlistData; loading: boolean; error: boolean;
  onRefresh: () => void; refreshing: boolean;
}) {
  const [activeClassId, setActiveClassId] = useState<string>('death-knight');
  const [searchQuery, setSearchQuery]     = useState('');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);

  const sections  = data.sections;
  const cards     = data.cards;

  // Find active section
  const activeSection = sections.find(s => s.id === activeClassId) ?? sections[0];

  // When class changes, reset filters
  const handleClassChange = (id: string) => {
    setActiveClassId(id);
    setSearchQuery('');
    setSelectedRarity('all');
  };

  const rarities = [
    { id: 'all',       name: 'Все редкости' },
    { id: 'common',    name: 'Обычная' },
    { id: 'rare',      name: 'Редкая' },
    { id: 'epic',      name: 'Эпическая' },
    { id: 'legendary', name: 'Легендарная' },
  ];

  // For class tabs: hide neutral cards (classKey === 'any')
  // For the neutral tab ('any'): show only neutral cards (already the case since only 'any' cards are in that section)
  const isNeutralTab = activeClassId === 'any';

  const filteredTiers = (activeSection?.tiers ?? []).map(t => ({
    ...t,
    cards: t.cards.filter(c => {
      const matchSearch  = !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchRarity  = selectedRarity === 'all' || c.rarity === selectedRarity;
      // In class tabs: exclude neutral cards; in neutral tab: show all
      const matchClass   = isNeutralTab ? true : c.classKey !== 'any';
      return matchSearch && matchRarity && matchClass;
    }),
  })).filter(t => t.cards.length > 0);

  const tierLabelFull: Record<string, string> = {
    S: 'Отлично',
    A: 'Хорошо',
    B: 'Выше среднего',
    C: 'Средне',
    D: 'Ниже среднего',
    E: 'Плохо',
    F: 'Ужасно',
  };

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 pb-5 gap-4"
        style={{ borderBottom: '2px solid #c4a46a' }}>
        <div>
          <h2 className="text-2xl sm:text-3xl font-hs text-[#3d2208] tracking-wide">Тир-лист HearthArena</h2>
          <p className="text-[#8b6c42] mt-1 text-sm">Оценки карт для каждого класса — текущий патч.</p>
        </div>
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
          <p className="text-[#8b6c42] text-sm">Получаем данные с HearthArena</p>
        </div>
      ) : (
        <>
          {/* Class tabs */}
          <div className="mb-5 rounded-2xl p-2 scrollbar-hs"
            style={{
              background: 'linear-gradient(135deg,rgba(26,17,10,0.45),rgba(44,30,22,0.3))',
              border: '1.5px solid rgba(168,138,69,0.25)',
              boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
            }}>
            <ClassTabs sections={sections} activeId={activeClassId} onChange={handleClassChange} />
          </div>

          {/* Active class header */}
          {activeSection && (
            <div className="flex items-center gap-3 mb-5">
              {CLASS_ICON[activeSection.id] ? (
                <img src={CLASS_ICON[activeSection.id]} alt={activeSection.name} className="w-10 h-10 object-contain" />
              ) : (
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ background: activeSection.color }}>⚔</div>
              )}
              <div>
                <h3 className="font-hs text-xl text-[#4a3018]">{activeSection.name}</h3>
                <span className="text-[#8b6c42] text-xs">
                  {isNeutralTab
                    ? `${activeSection.totalCards} нейтральных карт`
                    : `${activeSection.tiers.flatMap(t => t.cards).filter(c => c.classKey !== 'any').length} карт класса`}
                </span>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="mb-6 flex flex-col sm:flex-row gap-3 p-3 sm:p-4 rounded-2xl"
            style={{
              background: 'linear-gradient(135deg,#ede0c0,#e4d0a0)',
              border: '1.5px solid #c4a46a',
              boxShadow: 'inset 0 2px 6px rgba(139,69,19,0.18), 0 1px 0 rgba(255,255,255,0.6)',
            }}>
            <div className="flex-grow relative">
              <label htmlFor="card-search" className="block text-xs font-bold text-[#8b4513] mb-1 uppercase tracking-wider">Поиск</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b4513]/60" />
                <input id="card-search" name="card-search" type="text"
                  placeholder="Название карты..."
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  className="hs-input w-full rounded-lg pl-8 pr-4 py-2.5 transition-colors placeholder-[#8b4513]/50" />
              </div>
            </div>
            <div className="sm:w-44">
              <label htmlFor="rarity-filter" className="block text-xs font-bold text-[#8b4513] mb-1 uppercase tracking-wider">Редкость</label>
              <select id="rarity-filter" name="rarity-filter"
                value={selectedRarity} onChange={e => setSelectedRarity(e.target.value)}
                className="hs-input w-full rounded-lg px-4 py-2.5 transition-colors appearance-none cursor-pointer">
                {rarities.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
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
                      <h3 className="text-xl md:text-2xl font-hs text-[#3d2208] tracking-wide">{tierLabelFull[tierGroup.tier] ?? tierGroup.label}</h3>
                      <span className="text-xs font-medium text-[#8b6c42] bg-[#8b6c42]/10 px-2 py-0.5 rounded-full border border-[#8b6c42]/20">{tierGroup.cards.length} карт</span>
                    </div>
                    <p className="text-sm text-[#6b4c2a] mt-0.5">{tierGroup.description}</p>
                  </div>
                </div>

                {/* Cards grid */}
                <div className="flex flex-wrap gap-3 md:gap-5 justify-center md:justify-start">
                  {tierGroup.cards.map((tc, idx) => {
                    const card = mergeCard(tc, cards);
                    return (
                      <div
                        key={`${tc.cardId}-${idx}`}
                        className="anim-scale-in"
                        style={{ animationDelay: `${tierIdx * 0.07 + idx * 0.018}s` }}
                      >
                        <HSCard
                          card={card}
                          onClick={() => setModalCard({ card, tier: tierGroup.tier })}
                        />
                      </div>
                    );
                  })}
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
}> = ({ card, size, onClick }) => {
  const [imgErr, setImgErr] = useState(false);
  const src = imgErr ? null : (card.imageHa || null);
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
            onError={() => setImgErr(true)}
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
};

function Legendaries({ data, loading, error }: {
  data: LegendariesData; loading: boolean; error: boolean;
}) {
  const [sortBy, setSortBy] = useState<'winrate' | 'date'>('winrate');
  const [modalCard, setModalCard] = useState<{ card: CardData; tier: string } | null>(null);

  const sorted = [...(data.groups ?? [])].sort((a, b) => {
    if (sortBy !== 'winrate') return 0;
    const wa = a.winRate ?? 0;
    const wb = b.winRate ?? 0;
    return wb - wa;
  });

  const toLegendaryCardData = (lc: LegendaryCard): CardData => ({
    name:     lc.name,
    score:    0,
    rarity:   'legendary',
    cardId:   lc.cardId,
    classKey: 'any',
    cost:     lc.cost,
    imageHa:  lc.imageHa,
    imageRu:  lc.imageRu ?? null,
  });

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 pb-5 gap-4"
        style={{ borderBottom: '2px solid #c4a46a' }}>
        <div>
          <h2 className="text-2xl sm:text-3xl font-hs text-[#3d2208] tracking-wide">Легендарные группы</h2>
          <p className="text-[#8b6c42] text-sm mt-1">
            Наборы карт для выбора первого легендарного существа на Арене
            {data.updatedAt && <> — обновлено {formatDate(data.updatedAt)}</>}
          </p>
        </div>
        {/* Sort buttons */}
        <div className="flex gap-2 flex-shrink-0">
          {(['winrate', 'date'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className="px-4 py-2 rounded-full text-xs font-bold transition-all border"
              style={{
                background: sortBy === s
                  ? 'linear-gradient(135deg,#6b4c2a,#3a2210)'
                  : 'linear-gradient(135deg,#ede0c0,#e0cc9e)',
                border: `1.5px solid ${sortBy === s ? '#a88a45' : '#c4a46a'}`,
                color: sortBy === s ? '#fcd34d' : '#6b4c2a',
              }}
            >
              {s === 'winrate' ? 'По винрейту' : 'По дате'}
            </button>
          ))}
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
      ) : sorted.length === 0 ? (
        <div className="text-center py-14 rounded-2xl"
          style={{ background: 'linear-gradient(135deg,#ede0c0,#e0cc9e)', border: '2px dashed #c4a46a' }}>
          <div className="text-4xl mb-3">⭐</div>
          <p className="text-xl font-hs text-[#8b4513] tracking-wide">Нет данных</p>
          <p className="text-[#8b6c42] mt-2 text-sm">Запустите npm run scrape для загрузки легендарных групп.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((group, idx) => (
            <div
              key={`${group.keyCard.cardId}-${idx}`}
              className="anim-scale-in rounded-2xl flex flex-col items-center p-4 gap-3 transition-all duration-200 cursor-default"
              style={{
                animationDelay: `${idx * 0.04}s`,
                background: 'linear-gradient(145deg,#ede0c0,#e0cc9e)',
                border: '1.5px solid #c4a46a',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 3px 10px rgba(0,0,0,0.18)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-3px)';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 24px rgba(0,0,0,0.28)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.transform = '';
                (e.currentTarget as HTMLDivElement).style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.6), 0 3px 10px rgba(0,0,0,0.18)';
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
                    {pc.cost !== undefined && (
                      <span className="text-[8px] text-[#2b5c85] font-bold">{pc.cost} маны</span>
                    )}
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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<'winrates' | 'tierlist' | 'legendaries'>('winrates');

  const [winratesData, setWinratesData] = useState<WinratesData>({
    classes: FALLBACK_CLASSES, updatedAt: null, source: 'initial',
  });
  const [tierlistData, setTierlistData] = useState<TierlistData>({
    sections: [], cards: {}, updatedAt: null, source: 'initial',
  });
  const [legendariesData, setLegendariesData] = useState<LegendariesData>({
    groups: [], updatedAt: null, source: 'hsreplay.net',
  });

  const [loadingWinrates,    setLoadingWinrates]    = useState(true);
  const [loadingTierlist,    setLoadingTierlist]    = useState(true);
  const [loadingLegendaries, setLoadingLegendaries] = useState(true);
  const [errorWinrates,      setErrorWinrates]      = useState(false);
  const [errorTierlist,      setErrorTierlist]      = useState(false);
  const [errorLegendaries,   setErrorLegendaries]   = useState(false);
  const [refreshing,         setRefreshing]         = useState(false);

  const fetchWinrates = useCallback(async () => {
    try {
      const res = await fetch('/api/winrates');
      if (!res.ok) throw new Error('not ok');
      setWinratesData(await res.json());
      setErrorWinrates(false);
    } catch { setErrorWinrates(true); }
    finally  { setLoadingWinrates(false); }
  }, []);

  const fetchTierlist = useCallback(async () => {
    try {
      const res = await fetch('/api/tierlist');
      if (!res.ok) throw new Error('not ok');
      setTierlistData(await res.json());
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

  useEffect(() => { fetchWinrates(); fetchTierlist(); fetchLegendaries(); }, [fetchWinrates, fetchTierlist, fetchLegendaries]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch('/api/scrape', { method: 'POST' });
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        await Promise.all([fetchWinrates(), fetchTierlist()]);
        if (attempts >= 24) clearInterval(poll);
      }, 5000);
      setTimeout(() => { clearInterval(poll); setRefreshing(false); }, 120000);
      setTimeout(() => setRefreshing(false), 30000);
    } catch { setRefreshing(false); }
  }, [refreshing, fetchWinrates, fetchTierlist]);

  return (
    <div className="min-h-screen bg-wood text-[#3d2a1e] font-body flex flex-col">
      {/* Header */}
      <header className="bg-[#1a110a] border-b-4 border-gold shadow-2xl relative z-20 bg-[url('data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h20v20H0V0zm10 10l10 10H0L10 10z\' fill=\'%232a1b12\' fill-opacity=\'0.4\' fill-rule=\'evenodd\'/%3E%3C/svg%3E')]">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-3 sm:py-5 flex flex-col items-center justify-center">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="relative flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16">
              <div className="absolute inset-0 bg-gradient-to-br from-[#2b5c85] to-[#1a3a5f] rounded-full border-[2px] sm:border-[3px] border-[#fcd34d] shadow-[0_0_15px_rgba(43,92,133,0.8),inset_0_0_10px_rgba(0,0,0,0.8)]" />
              <div className="absolute inset-1 border border-[#fff] opacity-20 rounded-full" />
              <div className="absolute inset-2 border border-[#fcd34d] opacity-40 rounded-full border-dashed" />
              <Swords size={20} className="w-6 h-6 sm:w-7 sm:h-7 text-[#fff] relative z-10 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-hs text-transparent bg-clip-text bg-gradient-to-b from-[#fffde7] via-[#fcd34d] to-[#f57f17] tracking-wider uppercase leading-none">Manacost</h1>
              <span className="text-[10px] sm:text-sm md:text-base font-body font-bold text-[#e8d5a5] tracking-[0.3em] sm:tracking-[0.4em] uppercase mt-0.5 sm:mt-1 pl-1">Arena</span>
            </div>
          </div>
        </div>
      </header>

      <div className="wood-frame-horizontal" />

      <main className="flex-grow p-2 sm:p-4 md:p-8 relative flex flex-col items-center">
        {/* Tab switcher */}
        <div className="flex justify-center gap-2 sm:gap-4 -mb-[3px] sm:-mb-[4px] relative z-10 px-2 sm:px-4 w-full max-w-6xl">
          {([
            { id: 'winrates',    label: 'Винрейт',    icon: Trophy },
            { id: 'tierlist',    label: 'Тир-лист',   icon: Scroll },
            { id: 'legendaries', label: 'Легендарки', icon: Star  },
          ] as const).map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 sm:px-8 md:px-12 py-3 sm:py-4 font-hs text-sm sm:text-lg md:text-2xl rounded-t-xl transition-all flex items-center gap-2 sm:gap-3 border-t-[3px] sm:border-t-[4px] border-x-[3px] sm:border-x-[4px] ${
                  active
                    ? 'bg-parchment border-[#6b4c2a] text-[#4a3018] shadow-[0_-4px_10px_rgba(0,0,0,0.15)] z-20 pb-4 sm:pb-5'
                    : 'bg-parchment-inactive border-[#8b5a2b] text-[#5c3a21] hover:text-[#4a3018] hover:brightness-105 shadow-[inset_0_-3px_6px_rgba(0,0,0,0.2)] z-0 mt-2 sm:mt-3'
                }`}>
                <Icon size={20} className={`w-5 h-5 sm:w-6 sm:h-6 ${active ? 'text-[#8b4513]' : 'opacity-70'}`} />
                <span className="drop-shadow-sm">{tab.label}</span>
                {active && <div className="absolute -bottom-[3px] sm:-bottom-[4px] left-0 right-0 h-[3px] sm:h-[4px] bg-[#f4e4bc] z-30" />}
              </button>
            );
          })}
        </div>

        {/* Parchment container */}
        <div className="w-full max-w-6xl mx-auto bg-parchment rounded-xl border-[3px] sm:border-[4px] border-[#6b4c2a] shadow-[inset_0_0_60px_rgba(139,69,19,0.15),0_0_0_2px_#2c1e16,0_15px_30px_rgba(0,0,0,0.6)] p-3 sm:p-6 md:p-10 relative z-0">
          <div className="absolute top-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-l-2 sm:border-l-4 border-gold rounded-tl-xl opacity-50" />
          <div className="absolute top-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-t-2 sm:border-t-4 border-r-2 sm:border-r-4 border-gold rounded-tr-xl opacity-50" />
          <div className="absolute bottom-0 left-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-l-2 sm:border-l-4 border-gold rounded-bl-xl opacity-50" />
          <div className="absolute bottom-0 right-0 w-8 h-8 sm:w-16 sm:h-16 border-b-2 sm:border-b-4 border-r-2 sm:border-r-4 border-gold rounded-br-xl opacity-50" />

          {activeTab === 'winrates' && (
            <Winrates classes={winratesData.classes} loading={loadingWinrates} error={errorWinrates}
              updatedAt={winratesData.updatedAt} source={winratesData.source}
              onRefresh={handleRefresh} refreshing={refreshing} />
          )}
          {activeTab === 'tierlist' && (
            <TierList data={tierlistData} loading={loadingTierlist} error={errorTierlist}
              onRefresh={handleRefresh} refreshing={refreshing} />
          )}
          {activeTab === 'legendaries' && (
            <Legendaries data={legendariesData} loading={loadingLegendaries} error={errorLegendaries} />
          )}
        </div>
      </main>
    </div>
  );
}

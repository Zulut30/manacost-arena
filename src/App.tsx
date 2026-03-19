/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Scroll, Info, Swords, RefreshCw, Loader2, AlertTriangle, X, Search } from 'lucide-react';

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

const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-[#c4a46a]/40 rounded-lg ${className}`} />
);

const UpdateBadge: React.FC<{ updatedAt: string | null; source: string; onRefresh: () => void; refreshing: boolean }> =
  ({ updatedAt, source, onRefresh, refreshing }) => (
    <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
      <div className="flex items-center gap-2 text-[#fcd34d] bg-gradient-to-b from-[#4a3018] to-[#2c1e16] px-3 sm:px-4 py-1.5 rounded-full border-2 border-[#a88a45] shadow-[0_2px_4px_rgba(0,0,0,0.4)]">
        <Info size={14} />
        <span className="font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {updatedAt ? `Обновлено: ${formatDate(updatedAt)}` : 'Загружается...'}
        </span>
      </div>
      <button onClick={onRefresh} disabled={refreshing} title="Обновить данные с сайтов"
        className="flex items-center gap-1.5 text-[#e8d5a5] bg-gradient-to-b from-[#3a2210] to-[#1a110a] px-3 py-1.5 rounded-full border-2 border-[#6b4c2a] shadow-[0_2px_4px_rgba(0,0,0,0.4)] hover:from-[#4a3018] hover:to-[#2c1e16] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
        {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        <span className="font-bold text-xs">{refreshing ? 'Парсинг...' : 'Обновить'}</span>
      </button>
    </div>
  );

// ─── Winrates tab ─────────────────────────────────────────────────────────────

function Winrates({ classes, loading, error, updatedAt, source, onRefresh, refreshing }: {
  classes: ClassData[]; loading: boolean; error: boolean;
  updatedAt: string | null; source: string; onRefresh: () => void; refreshing: boolean;
}) {
  return (
    <div className="animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 border-b-2 border-[#8b4513] pb-4 gap-4">
        <h2 className="text-3xl font-hs text-[#4a3018]">Винрейт классов на Арене</h2>
        <UpdateBadge updatedAt={updatedAt} source={source} onRefresh={onRefresh} refreshing={refreshing} />
      </div>
      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-4 opacity-70">
          <AlertTriangle size={13} /><span>Сервер недоступен — показаны кэшированные данные</span>
        </div>
      )}
      <div className="space-y-3 sm:space-y-4">
        {loading
          ? Array.from({ length: 11 }).map((_, i) => <Skeleton key={i} className="h-14 sm:h-16 w-full" />)
          : classes.map((cls, index) => (
              <div key={cls.id}
                className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-gradient-to-r from-[#e8d5a5] to-[#dcb883] p-3 sm:p-4 rounded-xl border-2 border-[#b58b5a] shadow-[inset_0_2px_4px_rgba(255,255,255,0.6),0_4px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_6px_12px_rgba(0,0,0,0.2)] hover:-translate-y-0.5 transition-all relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#ffffff20] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                <div className="flex items-center justify-between sm:w-52 relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-gradient-to-br from-[#4a3018] to-[#2c1e16] border-2 border-[#a88a45] text-center font-hs text-lg sm:text-xl text-[#fcd34d]">
                      #{index + 1}
                    </div>
                    <div className="font-bold text-base sm:text-lg text-[#4a3018]">{cls.name}</div>
                  </div>
                  <div className="sm:hidden font-bold text-[#8b4513]">{cls.winrate.toFixed(1)}%</div>
                </div>
                <div className="flex-grow bg-[#2c1e16] h-6 sm:h-8 rounded-full overflow-hidden border-2 border-[#4a3018] relative shadow-[inset_0_3px_8px_rgba(0,0,0,0.8)] z-10">
                  <div className="h-full flex items-center px-3 sm:px-4 text-xs sm:text-sm font-bold transition-all duration-1000 rounded-r-full relative"
                    style={{
                      width: `${Math.max(cls.winrate, 10)}%`,
                      backgroundImage: `linear-gradient(180deg, ${cls.color}ee, ${cls.color})`,
                      color: cls.textDark ? '#111' : '#fff',
                      textShadow: cls.textDark ? 'none' : '0 1px 3px rgba(0,0,0,0.9)',
                      boxShadow: 'inset 0 2px 4px rgba(255,255,255,0.3)',
                    }}>
                    <span className="hidden sm:inline relative z-10">{cls.winrate.toFixed(1)}%</span>
                  </div>
                </div>
                {(cls.games ?? 0) > 0 && (
                  <div className="hidden md:block text-xs text-[#8b6c42] min-w-[80px] text-right relative z-10">
                    {cls.games!.toLocaleString('ru-RU')} игр
                  </div>
                )}
              </div>
            ))}
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
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 border-b-2 border-[#8b4513] pb-4 gap-4">
        <div>
          <h2 className="text-3xl font-hs text-[#4a3018]">Тир-лист HearthArena</h2>
          <p className="text-[#6b4c2a] mt-1 font-body text-sm">Оценки карт для каждого класса из текущего патча.</p>
        </div>
        <UpdateBadge updatedAt={data.updatedAt} source={data.source} onRefresh={onRefresh} refreshing={refreshing} />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[#8b6c42] text-xs mb-4 opacity-70">
          <AlertTriangle size={13} /><span>Сервер недоступен — показаны кэшированные данные</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center py-16 gap-4">
          <Loader2 size={48} className="animate-spin text-[#a88a45]" />
          <p className="font-hs text-[#6b4c2a] text-xl">Загрузка тир-листа...</p>
        </div>
      ) : (
        <>
          {/* Class tabs */}
          <div className="mb-5 bg-[#2c1e16]/30 rounded-xl p-2 border border-[#a88a45]/30">
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
          <div className="mb-6 flex flex-col sm:flex-row gap-3 bg-[#e8d5a5] p-3 sm:p-4 rounded-xl border-2 border-[#c4a46a] shadow-[inset_0_3px_8px_rgba(139,69,19,0.2)]">
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
            {filteredTiers.length > 0 ? filteredTiers.map(tierGroup => (
              <div key={tierGroup.tier}>
                {/* Tier header */}
                <div className="flex items-center gap-4 mb-5 ml-0 md:ml-2">
                  <div className={`w-12 h-12 md:w-14 md:h-14 flex-shrink-0 flex items-center justify-center text-2xl md:text-3xl font-hs rounded-full border-[3px] shadow-[0_4px_10px_rgba(0,0,0,0.6),inset_0_4px_6px_rgba(255,255,255,0.4),inset_0_-4px_6px_rgba(0,0,0,0.4)] ${TIER_COLORS[tierGroup.tier] || TIER_COLORS['C']}`}>
                    <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{tierGroup.tier}</span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <h3 className="text-xl md:text-2xl font-hs text-[#4a3018]">{tierLabelFull[tierGroup.tier] ?? tierGroup.label}</h3>
                      <span className="text-xs text-[#8b6c42]">{tierGroup.cards.length} карт</span>
                    </div>
                    <p className="text-sm text-[#6b4c2a] font-body mt-0.5">{tierGroup.description}</p>
                  </div>
                </div>

                {/* Cards grid */}
                <div className="flex flex-wrap gap-3 md:gap-5 justify-center md:justify-start">
                  {tierGroup.cards.map((tc, idx) => {
                    const card = mergeCard(tc, cards);
                    return (
                      <HSCard
                        key={`${tc.cardId}-${idx}`}
                        card={card}
                        onClick={() => setModalCard({ card, tier: tierGroup.tier })}
                      />
                    );
                  })}
                </div>
              </div>
            )) : (
              <div className="text-center py-12 bg-[#e8d5a5] rounded-xl border-2 border-dashed border-[#c4a46a]">
                <p className="text-xl font-hs text-[#8b4513]">Карты не найдены</p>
                <p className="text-[#6b4c2a] mt-2">Попробуйте изменить фильтры.</p>
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

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab, setActiveTab] = useState<'winrates' | 'tierlist'>('winrates');

  const [winratesData, setWinratesData] = useState<WinratesData>({
    classes: FALLBACK_CLASSES, updatedAt: null, source: 'initial',
  });
  const [tierlistData, setTierlistData] = useState<TierlistData>({
    sections: [], cards: {}, updatedAt: null, source: 'initial',
  });

  const [loadingWinrates, setLoadingWinrates] = useState(true);
  const [loadingTierlist, setLoadingTierlist] = useState(true);
  const [errorWinrates,   setErrorWinrates]   = useState(false);
  const [errorTierlist,   setErrorTierlist]   = useState(false);
  const [refreshing,      setRefreshing]      = useState(false);

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

  useEffect(() => { fetchWinrates(); fetchTierlist(); }, [fetchWinrates, fetchTierlist]);

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
            { id: 'winrates', label: 'Винрейт', icon: Trophy },
            { id: 'tierlist', label: 'Тир-лист', icon: Scroll },
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
        </div>
      </main>
    </div>
  );
}

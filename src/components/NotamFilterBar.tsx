'use client';

import { useEffect, useRef, useState } from 'react';
import { NotamCategory, ParsedNotam } from '@/types/notam';
import { SortBy } from '@/hooks/useNotamFilter';
import { TimeWindow } from '@/lib/notam/route-filter';
import { useClickOutside } from '@/lib/use-click-outside';
import ExportMenu from './ExportMenu';

interface Props {
  searchText: string;
  setSearchText: (s: string) => void;
  category: NotamCategory | 'all';
  setCategory: (c: NotamCategory | 'all') => void;
  activeOnly: boolean;
  setActiveOnly: (v: boolean) => void;
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  timeWindow: TimeWindow | null;
  setTimeWindow: (w: TimeWindow | null) => void;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  filteredCount: number;
  totalCount: number;
  notamsForExport: ParsedNotam[];
}

const CATEGORY_CHIPS: Array<{ value: NotamCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'airspace', label: 'Airspace' },
  { value: 'obstacle', label: 'Obstacle' },
  { value: 'navaid', label: 'Navaid' },
  { value: 'runway', label: 'Runway' },
  { value: 'airport', label: 'Airport' },
  { value: 'procedure', label: 'Procedure' },
  { value: 'military', label: 'Military' },
  { value: 'other', label: 'Other' },
];

const SORT_OPTIONS: Array<{ value: SortBy; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'expiry', label: 'Soonest expiry' },
  { value: 'id', label: 'By ID' },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function windowFromNow(hours: number): TimeWindow {
  const now = new Date();
  return {
    fromIso: now.toISOString(),
    toIso: new Date(now.getTime() + hours * 3600 * 1000).toISOString(),
  };
}

function windowLabel(w: TimeWindow | null): string {
  if (!w) return 'Any';
  const from = new Date(w.fromIso);
  const to = new Date(w.toIso);
  const spanH = (to.getTime() - from.getTime()) / 3600 / 1000;
  const now = Date.now();
  const startsAboutNow = Math.abs(from.getTime() - now) < 10 * 60 * 1000;
  if (startsAboutNow) {
    if (Math.abs(spanH) < 0.2) return 'Now';
    if (Math.abs(spanH - 2) < 0.2) return '2h';
    if (Math.abs(spanH - 24) < 0.2) return '24h';
    if (Math.abs(spanH - 24 * 7) < 0.2) return '7d';
  }
  if (spanH < 48) return `${Math.round(spanH)}h`;
  return `${Math.round(spanH / 24)}d`;
}

export default function NotamFilterBar({
  searchText,
  setSearchText,
  category,
  setCategory,
  activeOnly,
  setActiveOnly,
  sortBy,
  setSortBy,
  timeWindow,
  setTimeWindow,
  hasActiveFilters,
  clearFilters,
  filteredCount,
  totalCount,
  notamsForExport,
}: Props) {
  const [sortOpen, setSortOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const [fromLocal, setFromLocal] = useState(toLocalInput(new Date()));
  const [toLocal, setToLocal] = useState(
    toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)),
  );

  useClickOutside(sortRef, sortOpen, () => setSortOpen(false));
  useClickOutside(timeRef, timeOpen, () => setTimeOpen(false));

  useEffect(() => {
    if (timeWindow) {
      setFromLocal(toLocalInput(new Date(timeWindow.fromIso)));
      setToLocal(toLocalInput(new Date(timeWindow.toIso)));
    }
  }, [timeWindow]);

  const applyCustom = () => {
    const fromD = new Date(fromLocal);
    const toD = new Date(toLocal);
    if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) return;
    const fromIso = fromD.toISOString();
    const toIso = toD < fromD ? fromIso : toD.toISOString();
    setTimeWindow({ fromIso, toIso });
    setTimeOpen(false);
  };

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3 pt-3 pb-2 space-y-2">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-3 pr-14 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-500 tabular-nums">
            {filteredCount}/{totalCount}
          </span>
        </div>

        <div className="relative" ref={timeRef}>
          <button
            type="button"
            onClick={() => setTimeOpen((v) => !v)}
            className={`px-2 py-1 rounded border text-[11px] font-semibold ${
              timeWindow
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
            title="Time window filter"
          >
            🕐 {windowLabel(timeWindow)}
          </button>
          {timeOpen && (
            <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded shadow-lg z-20 text-xs p-2 space-y-2">
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Any time', w: null },
                  { label: 'Now', w: windowFromNow(0) },
                  { label: '2h', w: windowFromNow(2) },
                  { label: '24h', w: windowFromNow(24) },
                  { label: '7d', w: windowFromNow(24 * 7) },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => {
                      setTimeWindow(q.w);
                      setTimeOpen(false);
                    }}
                    className="px-2 py-0.5 rounded-full border border-gray-300 bg-white hover:bg-blue-50 text-gray-700 font-semibold"
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-2 space-y-1.5">
                <label className="block text-[11px] text-gray-600">
                  <span className="block mb-0.5 font-semibold">From (local)</span>
                  <input
                    type="datetime-local"
                    value={fromLocal}
                    onChange={(e) => setFromLocal(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <label className="block text-[11px] text-gray-600">
                  <span className="block mb-0.5 font-semibold">To (local)</span>
                  <input
                    type="datetime-local"
                    value={toLocal}
                    onChange={(e) => setToLocal(e.target.value)}
                    className="w-full px-2 py-1 border border-gray-300 rounded text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyCustom}
                  className="w-full mt-1 px-2 py-1 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700"
                >
                  Apply range
                </button>
              </div>
            </div>
          )}
        </div>

        <ExportMenu notams={notamsForExport} variant="pill" />

        <div className="relative" ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            className="p-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            title="Sort"
            aria-label="Sort"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 3l-3 3h2v7h2V6h2L5 3zm6 10l3-3h-2V3h-2v7H8l3 3z" />
            </svg>
          </button>
          {sortOpen && (
            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded shadow-lg z-20 text-sm">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setSortBy(o.value);
                    setSortOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-blue-50 ${
                    sortBy === o.value ? 'font-semibold text-blue-700' : 'text-gray-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-nowrap gap-1 overflow-x-auto -mx-1 px-1 pb-0.5 scrollbar-thin">
        <button
          type="button"
          onClick={() => setActiveOnly(!activeOnly)}
          className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
            activeOnly
              ? 'bg-green-600 text-white border-green-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Active
        </button>
        <span className="w-px bg-gray-200 mx-0.5 shrink-0" aria-hidden />
        {CATEGORY_CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-colors ${
              category === c.value
                ? 'bg-blue-600 text-white border-blue-700'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="text-[11px] text-blue-600 hover:underline"
        >
          Clear filters ✕
        </button>
      )}
    </div>
  );
}

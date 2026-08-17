'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, Clock, Search, X } from 'lucide-react';
import { NotamCategory, ParsedNotam } from '@/types/notam';
import { SortBy } from '@/hooks/useNotamFilter';
import { TimeWindow } from '@/lib/notam/route-filter';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/lib/cn';
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

const CHIP_BASE =
  'inline-flex h-8 shrink-0 items-center rounded-pill border px-2.5 text-2xs font-medium transition-colors';
const CHIP_ON = 'border-accent/30 bg-accent-wash text-accent-text';
const CHIP_OFF =
  'border-rule-strong bg-paper-raised text-ink-2 hover:bg-paper-sunk hover:text-ink';

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

const FIELD =
  'w-full rounded-sm border border-rule-strong bg-paper-raised px-2.5 py-2 text-xs text-ink transition-colors hover:border-ink-3';

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
    <div className="sticky top-0 z-10 space-y-2 border-b border-rule bg-paper-raised px-3 pb-2 pt-3">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
            aria-hidden
          />
          <input
            type="text"
            // Short on purpose: the sidebar is 320px and shares this row with
            // three buttons, so a longer placeholder collides with the count.
            placeholder="Search…"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={cn(FIELD, 'h-9 ps-8', searchText ? 'pe-8' : 'pe-14')}
            aria-label="Search NOTAMs"
          />
          {searchText ? (
            <button
              type="button"
              onClick={() => setSearchText('')}
              aria-label="Clear search"
              className="absolute end-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-xs text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : (
            <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 font-mono text-2xs text-ink-3 tabular-nums">
              {filteredCount}/{totalCount}
            </span>
          )}
        </div>

        <div className="relative" ref={timeRef}>
          <button
            type="button"
            onClick={() => setTimeOpen((v) => !v)}
            aria-expanded={timeOpen}
            className={cn(
              'inline-flex h-9 items-center gap-1 rounded-sm border px-2 text-2xs font-medium transition-colors',
              timeWindow ? CHIP_ON : CHIP_OFF,
            )}
            title="Time window filter"
          >
            <Clock className="size-3.5" aria-hidden />
            {windowLabel(timeWindow)}
          </button>

          {timeOpen && (
            <div className="absolute end-0 z-20 mt-1 w-60 space-y-2 rounded-md border border-rule bg-paper-raised p-2 shadow-lg">
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
                    className={cn(CHIP_BASE, CHIP_OFF)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5 border-t border-rule pt-2">
                <label className="block">
                  <span className="plate-label">From (local)</span>
                  <input
                    type="datetime-local"
                    value={fromLocal}
                    onChange={(e) => setFromLocal(e.target.value)}
                    className={cn(FIELD, 'mt-1')}
                  />
                </label>
                <label className="block">
                  <span className="plate-label">To (local)</span>
                  <input
                    type="datetime-local"
                    value={toLocal}
                    onChange={(e) => setToLocal(e.target.value)}
                    className={cn(FIELD, 'mt-1')}
                  />
                </label>
                <button
                  type="button"
                  onClick={applyCustom}
                  className="mt-1 inline-flex h-9 w-full items-center justify-center rounded-sm bg-accent-strong text-xs font-medium text-ink-inverse transition-colors hover:bg-accent"
                >
                  Apply range
                </button>
              </div>
            </div>
          )}
        </div>

        <ExportMenu notams={notamsForExport} />

        <div className="relative" ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen((v) => !v)}
            aria-expanded={sortOpen}
            className={cn(
              'inline-flex size-9 items-center justify-center rounded-sm border transition-colors',
              CHIP_OFF,
            )}
            title="Sort"
            aria-label="Sort"
          >
            <ArrowUpDown className="size-3.5" aria-hidden />
          </button>

          {sortOpen && (
            <div className="absolute end-0 z-20 mt-1 w-44 overflow-hidden rounded-md border border-rule bg-paper-raised shadow-lg">
              {SORT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setSortBy(o.value);
                    setSortOpen(false);
                  }}
                  className={cn(
                    'block w-full px-3 py-2.5 text-start text-xs transition-colors hover:bg-accent-wash',
                    sortBy === o.value
                      ? 'font-medium text-accent-text'
                      : 'text-ink-2',
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="scrollbar-hairline -mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1 pb-1">
        <button
          type="button"
          onClick={() => setActiveOnly(!activeOnly)}
          className={cn(
            CHIP_BASE,
            activeOnly
              ? 'border-ok/30 bg-ok-wash text-ok'
              : CHIP_OFF,
          )}
        >
          Active
        </button>
        <span className="mx-0.5 w-px shrink-0 bg-rule" aria-hidden />
        {CATEGORY_CHIPS.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={cn(CHIP_BASE, category === c.value ? CHIP_ON : CHIP_OFF)}
          >
            {c.label}
          </button>
        ))}
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearFilters}
          className="inline-flex items-center gap-1 rounded-xs py-1 text-2xs font-medium text-accent-text transition-colors hover:underline"
        >
          <X className="size-3" aria-hidden />
          Clear filters
        </button>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ParsedNotam, NotamCategory } from '@/types/notam';
import ExportMenu from './ExportMenu';

interface NotamListProps {
  notams: ParsedNotam[];
  onSelectNotam: (notam: ParsedNotam) => void;
  selectedNotam: ParsedNotam | null;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onBulkAdd: (ids: string[]) => void;
  onInvert: (visibleIds: string[]) => void;
  onClear: () => void;
}

const CATEGORIES: NotamCategory[] = [
  'airspace',
  'obstacle',
  'navaid',
  'runway',
  'airport',
  'procedure',
  'military',
  'other',
];

export default function NotamList({
  notams,
  onSelectNotam,
  selectedNotam,
  selectedIds,
  onToggleSelect,
  onBulkAdd,
  onInvert,
  onClear,
}: NotamListProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<NotamCategory | 'all'>(
    'all'
  );
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'expiry' | 'id'>('newest');

  const filtered = useMemo(() => {
    let result = notams;

    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (n) =>
          n.id.toLowerCase().includes(lower) ||
          n.title.toLowerCase().includes(lower) ||
          n.eItem.toLowerCase().includes(lower) ||
          n.fir.toLowerCase().includes(lower)
      );
    }

    if (selectedCategory !== 'all') {
      result = result.filter((n) => n.category === selectedCategory);
    }

    if (activeOnly) {
      result = result.filter((n) => n.isActive);
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'newest') {
        return (
          new Date(b.effective).getTime() -
          new Date(a.effective).getTime()
        );
      } else if (sortBy === 'expiry') {
        const aExp =
          a.expires === 'PERM' ? Infinity : new Date(a.expires).getTime();
        const bExp =
          b.expires === 'PERM' ? Infinity : new Date(b.expires).getTime();
        return aExp - bExp;
      } else {
        return a.id.localeCompare(b.id);
      }
    });

    return result;
  }, [notams, searchText, selectedCategory, activeOnly, sortBy]);

  // Export in the user's current sort order — selected items only.
  const exportOrdered = useMemo(
    () => filtered.filter((n) => selectedIds.has(n.id)),
    [filtered, selectedIds],
  );

  const visibleIds = useMemo(() => filtered.map((n) => n.id), [filtered]);

  // Row refs keyed by NOTAM id, so we can scroll a focused row into view
  // when the user clicks a shape on the map (cross-pane sync).
  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());

  const isFocusedHidden =
    !!selectedNotam && !filtered.some((n) => n.id === selectedNotam.id);

  useEffect(() => {
    if (!selectedNotam) return;
    const el = rowRefs.current.get(selectedNotam.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedNotam]);

  const clearFilters = () => {
    setSearchText('');
    setSelectedCategory('all');
    setActiveOnly(false);
  };

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          <input
            type="text"
            placeholder="Search NOTAMs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) =>
                setSelectedCategory(
                  e.target.value as NotamCategory | 'all'
                )
              }
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="mr-2"
            />
            <span className="text-gray-700">Active only</span>
          </label>

          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">
              Sort by
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'newest' | 'expiry' | 'id')}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="newest">Newest first</option>
              <option value="expiry">Soonest expiry</option>
              <option value="id">By ID</option>
            </select>
          </div>

          {/* Selection controls */}
          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">
                {selectedIds.size} selected
              </span>
              <ExportMenu selectedNotams={exportOrdered} compact />
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => onBulkAdd(visibleIds)}
                disabled={filtered.length === 0}
                className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Select visible ({filtered.length})
              </button>
              <button
                type="button"
                onClick={() => onInvert(visibleIds)}
                disabled={filtered.length === 0}
                className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Invert
              </button>
              <button
                type="button"
                onClick={onClear}
                disabled={selectedIds.size === 0}
                className="px-2 py-1 text-[11px] font-semibold rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          <hr className="my-2" />

          {isFocusedHidden && selectedNotam && (
            <div className="bg-amber-50 border border-amber-300 rounded p-2 text-[11px] text-amber-900 flex items-center justify-between gap-2">
              <span>
                <strong>{selectedNotam.id}</strong> is hidden by filters.
              </span>
              <button
                type="button"
                onClick={clearFilters}
                className="px-2 py-0.5 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700"
              >
                Clear filters
              </button>
            </div>
          )}

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No NOTAMs found
              </div>
            ) : (
              filtered.map((notam) => {
                const isMember = selectedIds.has(notam.id);
                const isFocused = selectedNotam?.id === notam.id;
                return (
                  <div
                    key={notam.id}
                    ref={(el) => {
                      rowRefs.current.set(notam.id, el);
                    }}
                    className={`relative flex items-start gap-2 p-2 pl-3 rounded border text-xs cursor-pointer transition-colors ${
                      isFocused
                        ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-300'
                        : isMember
                          ? 'bg-blue-50 border-blue-300'
                          : 'border-gray-200 hover:bg-gray-50'
                    }`}
                    onClick={() => onSelectNotam(notam)}
                  >
                    {isFocused && (
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600 rounded-l"
                      />
                    )}
                    <input
                      type="checkbox"
                      checked={isMember}
                      onChange={() => onToggleSelect(notam.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 accent-blue-600"
                      aria-label={`Select ${notam.notamId}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{notam.id}</div>
                      <div className="text-gray-700 capitalize font-medium">
                        {notam.category}
                      </div>
                      <div className="text-gray-600 line-clamp-2">
                        {notam.title}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {notam.isActive ? (
                          <span className="text-green-600 font-semibold">Active</span>
                        ) : (
                          <span className="text-gray-400">Inactive</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

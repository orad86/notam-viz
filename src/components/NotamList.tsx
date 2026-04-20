'use client';

import { useMemo, useState } from 'react';
import { ParsedNotam, NotamCategory } from '@/types/notam';

interface NotamListProps {
  notams: ParsedNotam[];
  onSelectNotam: (notam: ParsedNotam) => void;
  selectedNotam: ParsedNotam | null;
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
}: NotamListProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<NotamCategory | 'all'>(
    'all'
  );
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'expiry' | 'id'>('newest');

  const filtered = useMemo(() => {
    let result = notams;

    // Filter by search text
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

    // Filter by category
    if (selectedCategory !== 'all') {
      result = result.filter((n) => n.category === selectedCategory);
    }

    // Filter by active status
    if (activeOnly) {
      result = result.filter((n) => n.isActive);
    }

    // Sort
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

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Search */}
          <input
            type="text"
            placeholder="Search NOTAMs..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-gray-900 bg-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          {/* Category filter */}
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

          {/* Active only */}
          <label className="flex items-center text-sm">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="mr-2"
            />
            <span className="text-gray-700">Active only</span>
          </label>

          {/* Sort */}
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

          <hr className="my-2" />

          {/* NOTAM list */}
          <div className="space-y-2">
            {filtered.length === 0 ? (
              <div className="text-xs text-gray-500 text-center py-4">
                No NOTAMs found
              </div>
            ) : (
              filtered.map((notam) => (
                <button
                  key={notam.id}
                  onClick={() => onSelectNotam(notam)}
                  className={`w-full text-left p-2 rounded border text-xs ${
                    selectedNotam?.id === notam.id
                      ? 'bg-blue-50 border-blue-400'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
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
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

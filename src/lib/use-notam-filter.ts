'use client';

import { useMemo, useState, useCallback } from 'react';
import { ParsedNotam, NotamCategory } from '@/types/notam';
import { TimeWindow, notamOverlapsWindow } from './notam/route-filter';

export type SortBy = 'newest' | 'expiry' | 'id';

export function useNotamFilter(notams: ParsedNotam[]) {
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState<NotamCategory | 'all'>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [timeWindow, setTimeWindow] = useState<TimeWindow | null>(null);

  const filtered = useMemo(() => {
    let result = notams;

    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (n) =>
          n.id.toLowerCase().includes(lower) ||
          n.title.toLowerCase().includes(lower) ||
          n.eItem.toLowerCase().includes(lower) ||
          n.fir.toLowerCase().includes(lower),
      );
    }

    if (category !== 'all') {
      result = result.filter((n) => n.category === category);
    }

    if (activeOnly) {
      result = result.filter((n) => n.isActive);
    }

    if (timeWindow) {
      result = result.filter((n) =>
        notamOverlapsWindow(n.effective, n.expires, timeWindow.fromIso, timeWindow.toIso),
      );
    }

    result = [...result].sort((a, b) => {
      if (sortBy === 'newest') {
        return (
          new Date(b.effective).getTime() - new Date(a.effective).getTime()
        );
      } else if (sortBy === 'expiry') {
        const aExp = a.expires === 'PERM' ? Infinity : new Date(a.expires).getTime();
        const bExp = b.expires === 'PERM' ? Infinity : new Date(b.expires).getTime();
        return aExp - bExp;
      }
      return a.id.localeCompare(b.id);
    });

    return result;
  }, [notams, searchText, category, activeOnly, sortBy, timeWindow]);

  const hasActiveFilters =
    searchText !== '' || category !== 'all' || activeOnly || timeWindow !== null;

  const clearFilters = useCallback(() => {
    setSearchText('');
    setCategory('all');
    setActiveOnly(false);
    setTimeWindow(null);
  }, []);

  return {
    filtered,
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
    totalCount: notams.length,
    filteredCount: filtered.length,
  };
}

'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ParsedNotam, NotamApiResponse } from '@/types/notam';
import NotamList from '@/components/NotamList';
import NotamFilterBar from '@/components/NotamFilterBar';
import RouteInput from '@/components/RouteInput';
import LegalModal from '@/components/LegalModal';
import DisclaimerModal from '@/components/DisclaimerModal';
import { useNotamFilter } from '@/lib/use-notam-filter';
import {
  Route,
  RoutePointIndex,
  buildRoutePointIndex,
  notamMatchesRoute,
} from '@/lib/notam/route-filter';
import { loadKmlPoints } from '@/lib/kml-layer';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

const EMPTY_INDEX: RoutePointIndex = {
  byCode: new Map(),
  all: [],
};

interface HomePageProps {
  termsMd: string;
  privacyMd: string;
}

export default function HomePage({ termsMd, privacyMd }: HomePageProps) {
  const [notams, setNotams] = useState<ParsedNotam[]>([]);
  const [selectedNotam, setSelectedNotam] = useState<ParsedNotam | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeIndex, setRouteIndex] = useState<RoutePointIndex>(EMPTY_INDEX);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(true);

  const filter = useNotamFilter(notams);
  const location = useDeviceLocation();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || '';
        const response = await fetch(`${apiBase}/api/notams`);
        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data: NotamApiResponse = await response.json();
        if (cancelled) return;
        setNotams(data.notams);
        setSelectedIds((prev) => {
          if (prev.size === 0) return prev;
          const ids = new Set(data.notams.map((n) => n.id));
          const next = new Set<string>();
          prev.forEach((id) => {
            if (ids.has(id)) next.add(id);
          });
          return next;
        });
        if (data.errors && data.errors.length > 0) setError(data.errors[0]);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch NOTAMs');
          setNotams([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadKmlPoints('/kml/airports.kml'),
      loadKmlPoints('/kml/navaids.kml'),
      loadKmlPoints('/kml/vfr_waypoints.kml'),
      loadKmlPoints('/kml/ifr_waypoints.kml'),
    ]).then(([airports, navaids, vfr, ifr]) => {
      if (cancelled) return;
      setRouteIndex(
        buildRoutePointIndex([
          { source: 'airport', points: airports },
          { source: 'navaid', points: navaids },
          { source: 'vfr', points: vfr },
          { source: 'ifr', points: ifr },
        ]),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedNotam(null);
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const finalList = useMemo(() => {
    if (!route || route.points.length < 1) return filter.filtered;
    return filter.filtered.filter((n) => notamMatchesRoute(n, route));
  }, [filter.filtered, route]);

  const notamsForExport = useMemo(() => {
    if (selectedIds.size === 0) return finalList;
    return notams.filter((n) => selectedIds.has(n.id));
  }, [notams, selectedIds, finalList]);

  const isFocusedHidden =
    !!selectedNotam && !finalList.some((n) => n.id === selectedNotam.id);

  const focusedHiddenHint = isFocusedHidden && selectedNotam ? (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-3 py-1.5 text-[11px] flex items-center justify-between gap-2">
      <span>
        <strong className="font-mono">{selectedNotam.id}</strong> is hidden by current filters.
      </span>
      <button
        type="button"
        onClick={() => {
          filter.clearFilters();
          setRoute(null);
        }}
        className="px-2 py-0.5 bg-amber-600 text-white rounded font-semibold hover:bg-amber-700"
      >
        Reset
      </button>
    </div>
  ) : null;

  const routeBanner = route && route.points.length >= 1 ? (
    <div className="bg-blue-600 text-white px-3 py-1.5 text-[11px] flex items-center justify-between gap-2">
      <span>
        ✈ Route · {finalList.length} NOTAM{finalList.length === 1 ? '' : 's'} affect
      </span>
      <button
        type="button"
        onClick={() => setRoute(null)}
        className="px-2 py-0.5 bg-blue-700 rounded hover:bg-blue-800 font-semibold"
      >
        Clear
      </button>
    </div>
  ) : null;

  return (
    <div className="h-screen bg-white overflow-hidden relative">
      <header className="fixed top-0 left-0 right-0 z-[10001] h-12 border-b border-gray-200 flex items-center px-3 md:px-6 bg-gradient-to-r from-blue-600 to-blue-700 gap-3">
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="md:hidden text-white text-2xl leading-none px-1"
          aria-label="Toggle NOTAM list"
        >
          ☰
        </button>
        <span className="text-white text-base md:text-lg font-bold">
          ✈ NOTAM Visualizer
        </span>
        <button
          type="button"
          onClick={() => (location.enabled ? location.stop() : location.start())}
          className={`ml-auto text-[11px] md:text-xs px-2.5 py-1 rounded border font-semibold ${
            location.enabled
              ? 'bg-white text-blue-700 border-white'
              : 'bg-blue-700/40 text-white border-white/40 hover:bg-blue-700/60'
          }`}
          aria-pressed={location.enabled}
          title={
            location.status === 'denied'
              ? 'Location permission denied'
              : 'Show my position'
          }
        >
          {location.enabled ? 'Tracking' : 'My position'}
        </button>
      </header>

      <NotamList
        filtered={finalList}
        totalCount={notams.length}
        onSelectNotam={setSelectedNotam}
        selectedNotam={selectedNotam}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onClear={clearSelection}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenLegal={setLegalDoc}
        filterBar={
          <NotamFilterBar
            searchText={filter.searchText}
            setSearchText={filter.setSearchText}
            category={filter.category}
            setCategory={filter.setCategory}
            activeOnly={filter.activeOnly}
            setActiveOnly={filter.setActiveOnly}
            sortBy={filter.sortBy}
            setSortBy={filter.setSortBy}
            timeWindow={filter.timeWindow}
            setTimeWindow={filter.setTimeWindow}
            hasActiveFilters={filter.hasActiveFilters}
            clearFilters={filter.clearFilters}
            filteredCount={finalList.length}
            totalCount={filter.totalCount}
            notamsForExport={notamsForExport}
          />
        }
        routeInput={
          routeIndex.all.length > 0 ? (
            <RouteInput index={routeIndex} route={route} setRoute={setRoute} />
          ) : null
        }
        routeBanner={routeBanner}
        focusedHiddenHint={focusedHiddenHint}
      />

      <div className="fixed top-12 left-0 right-0 bottom-0 md:left-80 bg-gray-100 overflow-hidden">
          {error && (
            <div className="absolute top-4 left-4 right-4 md:right-auto md:max-w-md bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-40">
              <span className="font-semibold">Error:</span> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mb-4"></div>
                <p className="text-gray-600">Loading NOTAMs...</p>
              </div>
            </div>
          ) : notams.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-lg font-semibold mb-2">No NOTAMs found</p>
                <p className="text-sm">
                  Try refreshing or check the source website
                </p>
              </div>
            </div>
          ) : (
            <MapView
              notams={finalList}
              onSelectNotam={setSelectedNotam}
              selectedNotam={selectedNotam}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onClearSelection={clearSelection}
              route={route}
              userLocation={location.enabled ? location.fix : null}
            />
          )}
      </div>

      {disclaimerOpen && (
        <DisclaimerModal
          onAccept={() => setDisclaimerOpen(false)}
          onOpenLegal={setLegalDoc}
        />
      )}

      {legalDoc && (
        <LegalModal
          title={legalDoc === 'terms' ? 'Terms of Use' : 'Privacy Notice'}
          body={legalDoc === 'terms' ? termsMd : privacyMd}
          onClose={() => setLegalDoc(null)}
        />
      )}
    </div>
  );
}

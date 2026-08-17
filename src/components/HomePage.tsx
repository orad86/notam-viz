'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Menu, Navigation, Plane, RotateCw } from 'lucide-react';
import { ParsedNotam, NotamApiResponse } from '@/types/notam';
import NotamList from '@/components/NotamList';
import NotamFilterBar from '@/components/NotamFilterBar';
import RouteInput from '@/components/RouteInput';
import LegalModal from '@/components/LegalModal';
import DisclaimerModal from '@/components/DisclaimerModal';
import DetailSurface, { DESKTOP_PANEL_PX } from '@/components/detail/DetailSurface';
import type { Detent } from '@/components/detail/useDragSheet';
import { useNotamFilter } from '@/hooks/useNotamFilter';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/cn';
import {
  Route,
  RoutePointIndex,
  buildRoutePointIndex,
  notamMatchesRoute,
} from '@/lib/notam/route-filter';
import { loadKmlPoints } from '@/lib/kml-layer';
import { useDeviceLocation } from '@/hooks/useDeviceLocation';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

const EMPTY_INDEX: RoutePointIndex = {
  byCode: new Map(),
  all: [],
};

/** Mobile sheet heights, mirroring useDragSheet's detents. */
const SHEET_PADDING: Record<Detent, number> = {
  peek: 132,
  half: 300,
  full: 300,
};

interface HomePageProps {
  termsMd: string;
  privacyMd: string;
}

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function HomePage({ termsMd, privacyMd }: HomePageProps) {
  const [notams, setNotams] = useState<ParsedNotam[]>([]);
  const [selectedNotam, setSelectedNotam] = useState<ParsedNotam | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [route, setRoute] = useState<Route | null>(null);
  const [routeIndex, setRouteIndex] = useState<RoutePointIndex>(EMPTY_INDEX);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [disclaimerOpen, setDisclaimerOpen] = useState(true);
  const [detent, setDetent] = useState<Detent>('half');

  const filter = useNotamFilter(notams);
  const location = useDeviceLocation();
  const isDesktop = useIsDesktop();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Every focus starts at half height: enough to read the headline and validity
  // without burying the map the NOTAM was just located on.
  const selectNotam = useCallback((n: ParsedNotam | null) => {
    setSelectedNotam(n);
    if (n) setDetent('half');
  }, []);

  // Stepping through a stack of overlapping NOTAMs. Focus moves, but the sheet
  // drops to peek: while browsing you are comparing shapes on the map, and a
  // half-height sheet would cover both the map and the picker doing the
  // stepping. Committing (a row tap) goes back to half via selectNotam.
  const previewNotam = useCallback((n: ParsedNotam) => {
    setSelectedNotam(n);
    setDetent('peek');
  }, []);

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
        setFetchedAt(data.fetchedAt ?? null);
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

  const detailOpen = selectedNotam !== null;

  // Keeps the focused shape clear of whichever chrome is covering the map.
  const focusPadding = useMemo(
    () => ({
      right: isDesktop && detailOpen ? DESKTOP_PANEL_PX : 0,
      bottom: !isDesktop && detailOpen ? SHEET_PADDING[detent] : 0,
    }),
    [isDesktop, detailOpen, detent],
  );

  const isFocusedHidden =
    !!selectedNotam && !finalList.some((n) => n.id === selectedNotam.id);

  const focusedHiddenHint = isFocusedHidden && selectedNotam ? (
    <div className="flex items-center justify-between gap-2 border-b border-warn/40 bg-warn-wash px-3 py-2 text-2xs text-ink-2">
      <span>
        <strong className="font-mono font-medium">{selectedNotam.id}</strong> is
        hidden by current filters.
      </span>
      <button
        type="button"
        onClick={() => {
          filter.clearFilters();
          setRoute(null);
        }}
        className="shrink-0 rounded-xs px-2 py-1 font-medium text-accent-text transition-colors hover:bg-accent-wash"
      >
        Reset
      </button>
    </div>
  ) : null;

  const routeBanner = route && route.points.length >= 1 ? (
    <div className="flex items-center justify-between gap-2 border-b border-nav/30 bg-nav-wash px-3 py-2 text-2xs text-ink-2">
      <span className="flex items-center gap-1.5">
        <Plane className="size-3 shrink-0 text-nav" aria-hidden />
        Route · {finalList.length} NOTAM{finalList.length === 1 ? '' : 's'} affect
      </span>
      <button
        type="button"
        onClick={() => setRoute(null)}
        className="shrink-0 rounded-xs px-2 py-1 font-medium text-nav transition-colors hover:bg-paper-sunk"
      >
        Clear
      </button>
    </div>
  ) : null;

  const age = relativeAge(fetchedAt);

  return (
    <div className="relative h-dvh overflow-hidden bg-paper">
      <header className="safe-top fixed inset-x-0 top-0 z-[10001] flex items-center gap-2 border-b border-rule bg-paper-raised px-2 md:px-4">
        <div className="flex h-12 w-full items-center gap-2">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-ink-2 transition-colors hover:bg-paper-sunk hover:text-ink md:hidden"
            aria-label="Toggle NOTAM list"
            aria-expanded={sidebarOpen}
          >
            <Menu className="size-5" aria-hidden />
          </button>

          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-display text-base font-semibold tracking-tight text-ink">
              NOTAM Visualizer
            </span>
            {age && (
              <span className="hidden font-mono text-2xs text-ink-3 sm:inline">
                updated {age}
              </span>
            )}
          </span>

          <button
            type="button"
            onClick={() => (location.enabled ? location.stop() : location.start())}
            className={cn(
              'ms-auto inline-flex h-9 shrink-0 items-center gap-1.5 rounded-sm border px-2.5 text-xs font-medium transition-colors',
              location.enabled
                ? 'border-accent/30 bg-accent-wash text-accent-text'
                : 'border-rule-strong bg-paper-raised text-ink-2 hover:bg-paper-sunk hover:text-ink',
            )}
            aria-pressed={location.enabled}
            title={
              location.status === 'denied'
                ? 'Location permission denied'
                : 'Show my position'
            }
          >
            <Navigation className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">
              {location.enabled ? 'Tracking' : 'My position'}
            </span>
          </button>
        </div>
      </header>

      <NotamList
        filtered={finalList}
        totalCount={notams.length}
        onSelectNotam={selectNotam}
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

      <div
        className={cn(
          'fixed bottom-0 top-12 z-0 overflow-hidden bg-paper-sunk',
          'start-0 end-0 md:start-80',
          // The desktop panel takes width off the map rather than covering it.
          // MapView calls invalidateSize when this transition ends.
          isDesktop && detailOpen && 'md:end-[380px]',
        )}
      >
        {error && (
          <div className="absolute inset-x-4 top-4 z-[1050] flex items-start gap-2 rounded-md border border-danger/40 bg-paper-raised px-3 py-2.5 shadow-md md:inset-x-auto md:start-4 md:max-w-md">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0 flex-1 text-xs text-ink-2">
              <p className="font-medium text-ink">Could not load NOTAMs</p>
              <p className="mt-0.5 break-words">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 rounded-xs px-1.5 py-0.5 text-2xs text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <RotateCw className="size-6 animate-spin text-ink-3" aria-hidden />
            <span className="plate-label">Loading NOTAMs</span>
          </div>
        ) : notams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="font-display text-base text-ink">No NOTAMs available</p>
            <p className="mx-auto max-w-sm text-sm text-ink-3">
              The daily snapshot may not have run yet, or the source site is
              unreachable.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center gap-2 rounded-sm border border-rule-strong bg-paper-raised px-4 text-sm font-medium text-ink transition-colors hover:bg-paper-sunk"
            >
              <RotateCw className="size-4" aria-hidden />
              Retry
            </button>
          </div>
        ) : (
          <MapView
            notams={finalList}
            onSelectNotam={selectNotam}
            selectedNotam={selectedNotam}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onClearSelection={clearSelection}
            onPreviewNotam={previewNotam}
            route={route}
            userLocation={location.enabled ? location.fix : null}
            focusPadding={focusPadding}
          />
        )}
      </div>

      <DetailSurface
        notam={selectedNotam}
        isSelected={!!selectedNotam && selectedIds.has(selectedNotam.id)}
        onToggleSelect={toggleSelect}
        onClose={() => setSelectedNotam(null)}
        detent={detent}
        onDetentChange={setDetent}
      />

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

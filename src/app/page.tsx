'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { ParsedNotam, NotamApiResponse } from '@/types/notam';
import NotamList from '@/components/NotamList';
import NotamDetail from '@/components/NotamDetail';

const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

export default function Home() {
  const [notams, setNotams] = useState<ParsedNotam[]>([]);
  const [selectedNotam, setSelectedNotam] = useState<ParsedNotam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<string | null>(null);

  const fetchNotams = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/notams');
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      const data: NotamApiResponse = await response.json();
      setNotams(data.notams);
      setLastFetched(new Date(data.fetchedAt).toLocaleTimeString());
      if (data.errors && data.errors.length > 0) {
        setError(data.errors[0]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch NOTAMs');
      setNotams([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotams();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-gray-200 flex items-center justify-between px-6 bg-gradient-to-r from-blue-600 to-blue-700">
        <div className="flex items-center gap-2">
          <span className="text-white text-lg font-bold">✈ NOTAM Visualizer</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={fetchNotams}
            disabled={loading}
            className="text-white hover:text-blue-100 disabled:opacity-50 font-semibold text-sm"
          >
            {loading ? '⟳ Fetching...' : '⟳ Refresh'}
          </button>
          <span className="text-white text-sm font-medium">
            {notams.length} NOTAMs
          </span>
          {lastFetched && (
            <span className="text-blue-100 text-xs">{lastFetched} UTC</span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <NotamList
          notams={notams}
          onSelectNotam={setSelectedNotam}
          selectedNotam={selectedNotam}
        />

        {/* Map area */}
        <div className="flex-1 relative bg-gray-100 overflow-hidden">
          {error && (
            <div className="absolute top-4 left-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded z-40">
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
              notams={notams}
              onSelectNotam={setSelectedNotam}
              selectedNotam={selectedNotam}
            />
          )}

          {/* Detail panel */}
          <NotamDetail
            notam={selectedNotam}
            onClose={() => setSelectedNotam(null)}
          />
        </div>
      </div>
    </div>
  );
}

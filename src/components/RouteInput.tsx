'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Route,
  RoutePoint,
  RoutePointIndex,
  parseRouteInput,
  resolveRouteTokens,
} from '@/lib/route-filter';
import { parseAltitudeFt } from '@/lib/altitude-parse';

interface Props {
  index: RoutePointIndex;
  route: Route | null;
  setRoute: (r: Route | null) => void;
}

const SOURCE_COLOR: Record<RoutePoint['source'], string> = {
  airport: '#dc2626',
  navaid: '#10b981',
  vfr: '#8b5cf6',
  ifr: '#f97316',
};

export default function RouteInput({ index, route, setRoute }: Props) {
  const [open, setOpen] = useState<boolean>(!!route);
  const [input, setInput] = useState<string>(
    route ? route.points.map((p) => p.code).join(' ') : '',
  );
  const [altitude, setAltitude] = useState<string>(
    route ? (route.altitudeFt >= 18000 ? `FL${route.altitudeFt / 100}` : String(route.altitudeFt)) : 'FL080',
  );
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [caretToken, setCaretToken] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!suggestOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [suggestOpen]);

  const tokens = useMemo(() => parseRouteInput(input), [input]);
  const parsed = useMemo(() => resolveRouteTokens(tokens, index), [tokens, index]);

  const suggestions = useMemo(() => {
    const q = caretToken.trim().toUpperCase();
    if (q.length < 1) return [] as RoutePoint[];
    const match = index.all
      .filter((p) => p.code.startsWith(q))
      .slice(0, 12);
    if (match.length) return match;
    return index.all
      .filter((p) => p.code.includes(q))
      .slice(0, 12);
  }, [caretToken, index]);

  const handleInput = (v: string) => {
    setInput(v);
    const words = parseRouteInput(v);
    const trailing = /[\s,\->→]$/.test(v) ? '' : words[words.length - 1] || '';
    setCaretToken(trailing);
    setSuggestOpen(trailing.length > 0);
  };

  const insertSuggestion = (rp: RoutePoint) => {
    const withoutTrailing = input.replace(/\S+$/, '');
    setInput(`${withoutTrailing}${rp.code} `);
    setSuggestOpen(false);
    setCaretToken('');
    inputRef.current?.focus();
  };

  const removeToken = (idx: number) => {
    const next = tokens.filter((_, i) => i !== idx).join(' ');
    setInput(next ? next + ' ' : '');
  };

  const apply = () => {
    if (parsed.resolved.length < 1) return;
    const altFt = parseAltitudeFt(altitude);
    if (altFt === null) return;
    setRoute({
      points: parsed.resolved,
      altitudeFt: altFt === Infinity ? 99999 : altFt,
    });
  };

  const clear = () => {
    setRoute(null);
    setInput('');
  };

  const altitudeValid = parseAltitudeFt(altitude) !== null;
  const canApply = parsed.resolved.length >= 1 && altitudeValid;

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
      >
        <span>✈ Plan route{route ? ` · ${route.points.length} pts` : ''}</span>
        <span className="text-gray-400 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <div ref={wrapRef} className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="e.g. LLBG EVLYM OLGAH LLHA"
              value={input}
              onChange={(e) => handleInput(e.target.value)}
              onFocus={() => setSuggestOpen(caretToken.length > 0)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded shadow-lg z-20 text-sm">
                {suggestions.map((s) => (
                  <button
                    key={`${s.code}-${s.source}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertSuggestion(s)}
                    className="w-full text-left px-2 py-1 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: SOURCE_COLOR[s.source] }}
                    />
                    <span className="font-mono font-semibold text-gray-900">
                      {s.code}
                    </span>
                    <span className="text-[10px] text-gray-500 ml-auto capitalize">
                      {s.source}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {(parsed.resolved.length > 0 || parsed.unresolved.length > 0) && (
            <div className="flex flex-wrap gap-1">
              {tokens.map((t, i) => {
                const rp = index.byCode.get(t.toUpperCase());
                const color = rp ? SOURCE_COLOR[rp.source] : '#dc2626';
                return (
                  <span
                    key={`${t}-${i}`}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold border ${
                      rp
                        ? 'bg-white text-gray-800 border-gray-300'
                        : 'bg-red-50 text-red-700 border-red-300'
                    }`}
                  >
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {t.toUpperCase()}
                    {!rp && '?'}
                    <button
                      type="button"
                      onClick={() => removeToken(i)}
                      className="text-gray-400 hover:text-gray-700"
                      aria-label={`Remove ${t}`}
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <label className="text-[11px] text-gray-600 block">
            <span className="block mb-0.5 font-semibold">Altitude</span>
            <input
              type="text"
              value={altitude}
              onChange={(e) => setAltitude(e.target.value)}
              placeholder="FL080"
              className={`w-full px-2 py-1 border rounded text-xs font-mono uppercase focus:outline-none focus:ring-2 ${
                altitudeValid
                  ? 'border-gray-300 text-gray-900 focus:ring-blue-500'
                  : 'border-red-300 text-red-700 focus:ring-red-400'
              }`}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={!canApply}
              className="flex-1 px-2 py-1.5 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Apply route
            </button>
            {route && (
              <button
                type="button"
                onClick={clear}
                className="px-2 py-1.5 rounded text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

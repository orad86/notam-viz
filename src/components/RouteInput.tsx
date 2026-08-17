'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plane, X } from 'lucide-react';
import {
  Route,
  RoutePoint,
  RoutePointIndex,
  parseRouteInput,
  resolveRouteTokens,
} from '@/lib/notam/route-filter';
import { parseAltitudeFt } from '@/lib/notam/altitude';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/lib/cn';

interface Props {
  index: RoutePointIndex;
  route: Route | null;
  setRoute: (r: Route | null) => void;
}

// Matches the aviation symbology on the map's reference layers.
const SOURCE_COLOR: Record<RoutePoint['source'], string> = {
  airport: 'var(--danger)',
  navaid: 'var(--ok)',
  vfr: 'var(--series-5)',
  ifr: 'var(--series-2)',
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

  useClickOutside(wrapRef, suggestOpen, () => setSuggestOpen(false));

  const tokens = parseRouteInput(input);
  const parsed = resolveRouteTokens(tokens, index);

  const suggestions: RoutePoint[] = (() => {
    const q = caretToken.trim().toUpperCase();
    if (q.length < 1) return [];
    const match = index.all.filter((p) => p.code.startsWith(q)).slice(0, 12);
    if (match.length) return match;
    return index.all.filter((p) => p.code.includes(q)).slice(0, 12);
  })();

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
    <div className="border-b border-rule bg-paper-sunk">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 w-full items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-paper"
      >
        <span className="flex items-center gap-1.5">
          <Plane className="size-3.5 text-ink-3" aria-hidden />
          <span className="plate-label">
            Plan route{route ? ` · ${route.points.length} pts` : ''}
          </span>
        </span>
        {open ? (
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
        ) : (
          <ChevronRight className="size-3.5 text-ink-3" aria-hidden />
        )}
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
              className="h-9 w-full rounded-sm border border-rule-strong bg-paper-raised px-2.5 font-mono text-xs uppercase text-ink transition-colors placeholder:text-ink-3 hover:border-ink-3"
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="scrollbar-hairline absolute inset-x-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-md border border-rule bg-paper-raised shadow-lg">
                {suggestions.map((s) => (
                  <button
                    key={`${s.code}-${s.source}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertSuggestion(s)}
                    className="flex min-h-9 w-full items-center gap-2 px-2.5 text-start transition-colors hover:bg-accent-wash"
                  >
                    <span
                      className="size-2 shrink-0 rounded-pill"
                      style={{ backgroundColor: SOURCE_COLOR[s.source] }}
                    />
                    <span className="font-mono text-xs font-medium text-ink">
                      {s.code}
                    </span>
                    <span className="ms-auto text-2xs capitalize text-ink-3">
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
                    className={cn(
                      'inline-flex items-center gap-1 rounded-xs border px-1.5 py-1 font-mono text-2xs font-medium',
                      rp
                        ? 'border-rule-strong bg-paper-raised text-ink-2'
                        : 'border-danger/40 bg-danger-wash text-danger',
                    )}
                  >
                    <span
                      className="size-1.5 rounded-pill"
                      style={{ backgroundColor: color }}
                    />
                    {t.toUpperCase()}
                    {!rp && '?'}
                    <button
                      type="button"
                      onClick={() => removeToken(i)}
                      className="text-ink-3 transition-colors hover:text-ink"
                      aria-label={`Remove ${t}`}
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <label className="block">
            <span className="plate-label">Altitude</span>
            <input
              type="text"
              value={altitude}
              onChange={(e) => setAltitude(e.target.value)}
              placeholder="FL080"
              className={cn(
                'mt-1 h-9 w-full rounded-sm border bg-paper-raised px-2.5 font-mono text-xs uppercase transition-colors',
                altitudeValid
                  ? 'border-rule-strong text-ink hover:border-ink-3'
                  : 'border-danger text-danger hover:border-danger',
              )}
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={apply}
              disabled={!canApply}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-sm bg-accent-strong text-xs font-medium text-ink-inverse transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-rule disabled:text-ink-3"
            >
              Apply route
            </button>
            {route && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex h-9 items-center justify-center rounded-sm border border-rule-strong bg-paper-raised px-3 text-xs font-medium text-ink transition-colors hover:bg-paper-sunk"
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

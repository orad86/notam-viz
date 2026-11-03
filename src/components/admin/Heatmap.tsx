// Weekday x hour launch density, Israel time. Sequential single hue: the
// series-1 blue mixed into the sunk paper, light to dark. Empty cells stay
// paper so "nothing" and "a little" read differently.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STEPS = [18, 36, 56, 78, 100];

function cellColor(n: number, max: number): string {
  if (n === 0 || max === 0) return 'var(--paper-sunk)';
  const step = STEPS[Math.min(STEPS.length - 1, Math.floor((n / max) * STEPS.length))];
  return `color-mix(in oklab, var(--series-1) ${step}%, var(--paper-raised))`;
}

const pad = (h: number) => String(h).padStart(2, '0');

export default function Heatmap({ heat, max }: { heat: number[][]; max: number }) {
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="ms-10 grid grid-cols-24 gap-0.5 font-mono text-2xs text-ink-3" aria-hidden>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h}>{h % 3 === 0 ? pad(h) : ''}</span>
            ))}
          </div>
          <div className="mt-1 space-y-0.5" role="img" aria-label="Launches by weekday and hour, Israel time">
            {heat.map((row, d) => (
              <div key={DAYS[d]} className="flex items-center gap-0">
                <span className="w-10 shrink-0 text-2xs text-ink-2">{DAYS[d]}</span>
                <div className="grid flex-1 grid-cols-24 gap-0.5">
                  {row.map((n, h) => (
                    <div
                      key={h}
                      className="h-5 rounded-xs"
                      style={{ backgroundColor: cellColor(n, max) }}
                      title={`${DAYS[d]} ${pad(h)}:00–${pad((h + 1) % 24)}:00 · ${n} launch${n === 1 ? '' : 'es'}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-2xs text-ink-3" aria-hidden>
        <span>Fewer</span>
        {[0, ...STEPS].map((s) => (
          <span
            key={s}
            className="size-3 rounded-xs"
            style={{
              backgroundColor:
                s === 0 ? 'var(--paper-sunk)' : `color-mix(in oklab, var(--series-1) ${s}%, var(--paper-raised))`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

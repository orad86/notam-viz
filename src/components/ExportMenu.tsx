'use client';

import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { ParsedNotam } from '@/types/notam';
import { exportPdf } from '@/lib/export/pdf';
import { downloadGpx } from '@/lib/export/gpx';
import { downloadKml } from '@/lib/export/kml';
import { useClickOutside } from '@/hooks/useClickOutside';
import { cn } from '@/lib/cn';

interface Props {
  notams: ParsedNotam[];
  disabled?: boolean;
}

const FORMATS: Array<{
  label: string;
  hint: string;
  run: (n: ParsedNotam[]) => void;
}> = [
  { label: 'PDF', hint: 'Printable cards', run: exportPdf },
  { label: 'GPX', hint: 'GPS devices, ForeFlight', run: downloadGpx },
  { label: 'KML', hint: 'Google Earth', run: downloadKml },
];

export default function ExportMenu({ notams, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const isDisabled = disabled || notams.length === 0;
  const count = notams.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !isDisabled && setOpen((v) => !v)}
        disabled={isDisabled}
        aria-expanded={open}
        className={cn(
          'inline-flex h-9 items-center gap-1 rounded-sm border px-2 text-2xs font-medium transition-colors',
          isDisabled
            ? 'cursor-not-allowed border-rule bg-paper text-ink-3'
            : 'border-rule-strong bg-paper-raised text-ink-2 hover:bg-paper-sunk hover:text-ink',
        )}
        title={`Export current view (${count})`}
      >
        <Download className="size-3.5" aria-hidden />
        <span className="tabular-nums">{count}</span>
      </button>

      {open && !isDisabled && (
        <div className="absolute end-0 z-[500] mt-1 w-52 overflow-hidden rounded-md border border-rule bg-paper-raised shadow-lg">
          <div className="border-b border-rule bg-paper-sunk px-3 py-1.5">
            <span className="plate-label">
              Export {count} NOTAM{count === 1 ? '' : 's'}
            </span>
          </div>
          {FORMATS.map(({ label, hint, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                run(notams);
                setOpen(false);
              }}
              className="block w-full border-b border-rule px-3 py-2.5 text-start transition-colors last:border-0 hover:bg-accent-wash"
            >
              <span className="block text-xs font-medium text-ink">{label}</span>
              <span className="block text-2xs text-ink-3">{hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

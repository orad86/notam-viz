'use client';

import { useRef, useState } from 'react';
import { ParsedNotam } from '@/types/notam';
import { exportPdf } from '@/lib/export/pdf';
import { downloadGpx } from '@/lib/export/gpx';
import { downloadKml } from '@/lib/export/kml';
import { useClickOutside } from '@/lib/use-click-outside';

interface Props {
  notams: ParsedNotam[];
  disabled?: boolean;
  compact?: boolean;
  variant?: 'compact' | 'pill';
}

export default function ExportMenu({
  notams,
  disabled,
  compact,
  variant = 'compact',
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useClickOutside(ref, open, () => setOpen(false));

  const isDisabled = disabled || notams.length === 0;
  const count = notams.length;

  const handle = (fn: (n: ParsedNotam[]) => void) => {
    if (isDisabled) return;
    fn(notams);
    setOpen(false);
  };

  const triggerClass =
    variant === 'pill'
      ? `px-2 py-1 rounded border text-[11px] font-semibold transition ${
          isDisabled
            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`
      : `${
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        } rounded font-semibold transition ${
          isDisabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !isDisabled && setOpen((v) => !v)}
        disabled={isDisabled}
        className={triggerClass}
        title={variant === 'pill' ? `Export current view (${count})` : undefined}
      >
        {variant === 'pill' ? `⬇ ${count}` : `Export ${count > 0 ? `(${count})` : ''} ▾`}
      </button>

      {open && !isDisabled && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg z-[500] text-sm overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
            Export {count} NOTAM{count === 1 ? '' : 's'}
          </div>
          <button
            type="button"
            onClick={() => handle(exportPdf)}
            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100"
          >
            <div className="font-semibold text-gray-900">PDF</div>
            <div className="text-xs text-gray-500">HTML table, print dialog</div>
          </button>
          <button
            type="button"
            onClick={() => handle(downloadGpx)}
            className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100"
          >
            <div className="font-semibold text-gray-900">GPX</div>
            <div className="text-xs text-gray-500">GPS devices, ForeFlight</div>
          </button>
          <button
            type="button"
            onClick={() => handle(downloadKml)}
            className="w-full text-left px-3 py-2 hover:bg-blue-50"
          >
            <div className="font-semibold text-gray-900">KML</div>
            <div className="text-xs text-gray-500">Google Earth</div>
          </button>
        </div>
      )}
    </div>
  );
}

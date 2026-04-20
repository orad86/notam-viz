'use client';

import { useEffect, useRef, useState } from 'react';
import { ParsedNotam } from '@/types/notam';
import { exportPdf } from '@/lib/export/pdf';
import { downloadGpx } from '@/lib/export/gpx';
import { downloadKml } from '@/lib/export/kml';

interface Props {
  selectedNotams: ParsedNotam[];
  disabled?: boolean;
  compact?: boolean;
}

export default function ExportMenu({
  selectedNotams,
  disabled,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const isDisabled = disabled || selectedNotams.length === 0;
  const count = selectedNotams.length;

  const handle = (fn: (n: ParsedNotam[]) => void) => {
    if (isDisabled) return;
    fn(selectedNotams);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !isDisabled && setOpen((v) => !v)}
        disabled={isDisabled}
        className={`${
          compact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        } rounded font-semibold transition ${
          isDisabled
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700'
        }`}
      >
        Export {count > 0 ? `(${count})` : ''} ▾
      </button>

      {open && !isDisabled && (
        <div
          className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg z-[500] text-sm overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
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

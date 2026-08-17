'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ParsedNotam } from '@/types/notam';
import { decodeNotam } from '@/lib/notam/decode';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/cn';
import NotamDetail from './NotamDetail';
import { useDragSheet, type Detent } from './useDragSheet';

export const DESKTOP_PANEL_PX = 380;

interface Props {
  notam: ParsedNotam | null;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  onClose: () => void;
  detent: Detent;
  onDetentChange: (d: Detent) => void;
}

export default function DetailSurface({
  notam,
  isSelected,
  onToggleSelect,
  onClose,
  detent,
  onDetentChange,
}: Props) {
  const isDesktop = useIsDesktop();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { sheetRef, handleProps, contentProps, style } = useDragSheet({
    enabled: !isDesktop,
    detent,
    onDetentChange,
    onDismiss: onClose,
  });

  if (!mounted) return null;

  const open = notam !== null;
  const headline = notam ? decodeNotam(notam).headline : '';

  const surface = (
    <>
      {/* Scrim only at full height on mobile, where the sheet is effectively
          modal. At peek and half the map must stay usable underneath. */}
      {open && !isDesktop && detent === 'full' && (
        <div
          className="fixed inset-x-0 bottom-0 top-12 z-[9400] bg-paper-overlay"
          onClick={() => onDetentChange('half')}
          aria-hidden
        />
      )}

      <aside
        ref={sheetRef}
        aria-label="NOTAM detail"
        aria-hidden={!open}
        style={isDesktop ? undefined : style}
        className={cn(
          'fixed z-[9500] flex flex-col border-rule bg-paper-raised',
          // `invisible` when closed, not just translated off-screen. A merely
          // transformed panel keeps its close button in the tab order, and
          // aria-hidden does not remove it — visibility:hidden does. Transitions
          // still run because only `transform` is animated.
          !open && 'invisible pointer-events-none',
          isDesktop
            ? [
                'bottom-0 end-0 top-12 w-[380px] border-s shadow-lg',
                'transition-transform duration-200 ease-out',
                open ? 'translate-x-0' : 'translate-x-full',
              ]
            : [
                'inset-x-0 bottom-0 top-12 rounded-t-lg border-t shadow-lg',
                !open && 'translate-y-full',
              ],
        )}
      >
        {/* Grabber: the drag surface on mobile, a plain header on desktop. */}
        <div
          {...handleProps}
          className={cn(
            'shrink-0 border-b border-rule',
            !isDesktop && 'cursor-grab active:cursor-grabbing',
          )}
        >
          {!isDesktop && (
            <div className="flex justify-center pb-1 pt-2">
              <span className="h-1 w-9 rounded-pill bg-rule-strong" aria-hidden />
            </div>
          )}
          <div className="flex items-start gap-2 px-4 pb-2.5 pt-2">
            <div className="min-w-0 flex-1">
              <span className="plate-label">NOTAM</span>
              <p className="truncate font-display text-sm text-ink">{headline}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close detail"
              className="-me-1 inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors hover:bg-paper-sunk hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div {...contentProps} className="min-h-0 flex-1 safe-bottom">
          {notam && (
            <NotamDetail
              notam={notam}
              isSelected={isSelected}
              onToggleSelect={onToggleSelect}
            />
          )}
        </div>
      </aside>
    </>
  );

  // Portaled to body, exactly as NotamList does. That is what keeps Leaflet out
  // of the picture: it binds every gesture handler on its own container, so a
  // subtree that is not a descendant never reaches them — no stopPropagation,
  // no map.dragging.disable() on drag start.
  return createPortal(surface, document.body);
}

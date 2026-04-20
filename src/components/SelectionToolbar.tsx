'use client';

import { ParsedNotam } from '@/types/notam';
import ExportMenu from './ExportMenu';

interface Props {
  selectedCount: number;
  selectedNotams: ParsedNotam[];
  selectMode: boolean;
  onToggleSelectMode: () => void;
  onClear: () => void;
}

export default function SelectionToolbar({
  selectedCount,
  selectedNotams,
  selectMode,
  onToggleSelectMode,
  onClear,
}: Props) {
  return (
    <div
      className="absolute top-3 left-3 z-[400] bg-white/95 backdrop-blur border border-gray-200 rounded-lg shadow-md text-xs"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggleSelectMode}
          className={`px-2 py-1 rounded font-semibold border ${
            selectMode
              ? 'bg-blue-600 text-white border-blue-700'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
          title="Toggle select mode: click to toggle, drag to box-select"
        >
          {selectMode ? '◉ Select mode' : '◯ Select mode'}
        </button>

        <span className="text-gray-700 font-semibold tabular-nums">
          {selectedCount} selected
        </span>

        <button
          type="button"
          onClick={onClear}
          disabled={selectedCount === 0}
          className={`px-2 py-1 rounded border ${
            selectedCount === 0
              ? 'text-gray-300 border-gray-200 cursor-not-allowed'
              : 'text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Clear
        </button>

        <ExportMenu selectedNotams={selectedNotams} compact />
      </div>

      {selectMode && (
        <div className="px-3 pb-2 text-[10px] text-blue-700">
          Click to toggle · drag to box-select · hold Shift to toggle in any mode
        </div>
      )}
    </div>
  );
}

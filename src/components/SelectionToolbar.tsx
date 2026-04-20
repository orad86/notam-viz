'use client';

interface Props {
  selectedCount: number;
  onClear: () => void;
}

export default function SelectionToolbar({ selectedCount, onClear }: Props) {
  if (selectedCount === 0) return null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 md:left-3 md:translate-x-0 z-[400] bg-white/95 backdrop-blur border border-gray-200 rounded-lg shadow-md text-xs"
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-gray-700 font-semibold tabular-nums">
          {selectedCount} selected
        </span>
        <button
          type="button"
          onClick={onClear}
          className="px-2 py-1 rounded border text-gray-700 border-gray-300 hover:bg-gray-50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

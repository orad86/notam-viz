'use client';

import { ParsedNotam } from '@/types/notam';
import { useState } from 'react';

interface NotamDetailProps {
  notam: ParsedNotam | null;
  onClose: () => void;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString('en-US', {
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  } catch {
    return isoString;
  }
}

export default function NotamDetail({ notam, onClose }: NotamDetailProps) {
  const [copied, setCopied] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  if (!notam) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(notam.rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const geometryDesc = notam.geometry
    ? notam.geometry.type === 'point'
      ? `Point: ${notam.geometry.lat.toFixed(4)}°N, ${notam.geometry.lon.toFixed(4)}°E`
      : notam.geometry.type === 'circle'
        ? `Circle: ${notam.geometry.lat.toFixed(4)}°N, ${notam.geometry.lon.toFixed(4)}°E, Radius: ${notam.geometry.radiusNm} NM`
        : notam.geometry.type === 'polygon'
          ? `Polygon: ${notam.geometry.vertices.length} vertices`
          : 'Unknown'
    : '(No coordinates)';

  return (
    <div className="fixed bottom-4 right-4 w-full max-w-lg bg-white rounded-lg shadow-xl border border-gray-300 z-50 max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">{notam.notamId}</span>
          <span className="text-xs font-semibold px-2.5 py-1 bg-blue-200 text-blue-900 rounded capitalize">
            {notam.category}
          </span>
          {notam.isActive && (
            <span className="text-xs font-semibold px-2.5 py-1 bg-green-200 text-green-900 rounded">
              ACTIVE
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-xl font-bold"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
        {/* Q-Code Section */}
        <div className="bg-purple-50 border border-purple-200 rounded p-3">
          <div className="text-xs font-bold text-purple-900 uppercase mb-2">Q-CODE</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-purple-700 font-semibold">Code:</span>
              <span className="font-mono text-purple-900 font-bold">{notam.qCode}</span>
            </div>
            <div className="text-purple-800 italic">{notam.qCodeExplanation}</div>
            {notam.significance && (
              <div className="flex justify-between mt-1">
                <span className="text-purple-700 font-semibold">Traffic:</span>
                <span className="font-mono text-purple-900">
                  {notam.significance === 'IV' ? 'IFR/VFR' : notam.significance === 'I' ? 'IFR' : 'VFR'}
                </span>
              </div>
            )}
            {notam.scope && (
              <div className="flex justify-between">
                <span className="text-purple-700 font-semibold">Scope:</span>
                <span className="font-mono text-purple-900">
                  {notam.scope === 'A' ? 'Aerodrome' : notam.scope === 'E' ? 'En-route' : 'Warning'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Location & FIR */}
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <div className="text-xs font-bold text-blue-900 uppercase mb-2">Location</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-blue-700 font-semibold">FIR</div>
              <div className="font-mono text-blue-900">{notam.fir}</div>
            </div>
            <div>
              <div className="text-blue-700 font-semibold">Subject</div>
              <div className="font-mono text-blue-900">{notam.subject}</div>
            </div>
          </div>
        </div>

        {/* Geometry */}
        {notam.geometry && (
          <div className="bg-cyan-50 border border-cyan-200 rounded p-3">
            <div className="text-xs font-bold text-cyan-900 uppercase mb-1">Coordinates</div>
            <div className="text-cyan-900 text-xs font-mono">{geometryDesc}</div>
          </div>
        )}

        {/* Altitude Limits */}
        {(notam.lowerLimit || notam.upperLimit) && (
          <div className="bg-orange-50 border border-orange-200 rounded p-3">
            <div className="text-xs font-bold text-orange-900 uppercase mb-2">Altitude Limits</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {notam.lowerLimit && (
                <div>
                  <div className="text-orange-700 font-semibold">Lower</div>
                  <div className="font-mono text-orange-900">{notam.lowerLimit}</div>
                </div>
              )}
              {notam.upperLimit && (
                <div>
                  <div className="text-orange-700 font-semibold">Upper</div>
                  <div className="font-mono text-orange-900">{notam.upperLimit}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Time Validity */}
        <div className="bg-green-50 border border-green-200 rounded p-3">
          <div className="text-xs font-bold text-green-900 uppercase mb-2">Valid Period</div>
          <div className="space-y-1 text-xs">
            <div>
              <div className="text-green-700 font-semibold">Effective (B)</div>
              <div className="text-green-900">{formatDate(notam.effective)}</div>
            </div>
            <div>
              <div className="text-green-700 font-semibold">Expires (C)</div>
              <div className="text-green-900 font-bold">
                {notam.expires === 'PERM' ? (
                  <span className="text-red-600">PERMANENT</span>
                ) : (
                  formatDate(notam.expires)
                )}
              </div>
            </div>
          </div>
        </div>

        {/* E-Item (Details) */}
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
          <div className="text-xs font-bold text-yellow-900 uppercase mb-2">Details (E-Item)</div>
          <div className="text-gray-900 text-xs leading-relaxed whitespace-pre-wrap">
            {notam.eItem.replace(/^E\)\s*/, '').replace(/E\)\s*/g, '')}
          </div>
        </div>

        {/* Optional Fields */}
        {(notam.dLine || notam.fLine || notam.gLine) && (
          <div className="bg-gray-50 border border-gray-200 rounded p-3">
            <div className="text-xs font-bold text-gray-700 uppercase mb-2">Additional Fields</div>
            <div className="space-y-1 text-xs">
              {notam.dLine && (
                <div>
                  <span className="font-semibold text-gray-700">D) Schedule:</span> {notam.dLine}
                </div>
              )}
              {notam.fLine && (
                <div>
                  <span className="font-semibold text-gray-700">F) Lower Alt:</span> {notam.fLine}
                </div>
              )}
              {notam.gLine && (
                <div>
                  <span className="font-semibold text-gray-700">G) Upper Alt:</span> {notam.gLine}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raw Text Toggle */}
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="w-full text-left px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded text-xs font-semibold text-gray-700"
        >
          {showRaw ? '▼ Hide Raw NOTAM Text' : '▶ Show Raw NOTAM Text'}
        </button>

        {showRaw && (
          <pre className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-x-auto max-h-40 whitespace-pre-wrap break-words font-mono">
            {notam.rawText}
          </pre>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 p-4 bg-gray-50">
        <button
          onClick={handleCopy}
          className="w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold rounded transition"
        >
          {copied ? '✓ Copied to clipboard' : 'Copy raw text'}
        </button>
      </div>
    </div>
  );
}

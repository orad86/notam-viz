export type NotamCategory =
  | 'airspace'
  | 'obstacle'
  | 'navaid'
  | 'runway'
  | 'airport'
  | 'procedure'
  | 'military'
  | 'other';

export interface NotamPoint {
  type: 'point';
  lat: number;
  lon: number;
}

export interface NotamCircle {
  type: 'circle';
  lat: number;
  lon: number;
  radiusNm: number;
}

export interface NotamPolygon {
  type: 'polygon';
  vertices: Array<[number, number]>; // [lat, lon] pairs
}

export interface NotamMultiPoint {
  // Used when a NOTAM lists multiple coordinates that don't form a simple
  // polygon (self-intersecting order, or separate areas encoded as one list).
  type: 'multipoint';
  points: Array<[number, number]>;
}

export type NotamGeometry =
  | NotamPoint
  | NotamCircle
  | NotamPolygon
  | NotamMultiPoint
  | null;

export interface NotamDetails {
  // NOTAM Identifier
  notamId: string; // e.g., A0001/26

  // Q-Line Fields (encoded)
  fir: string; // Flight Information Region (e.g., LLLL, LLBG)
  qCode: string; // Q-code (e.g., QMRXX) - extracted from full Q-line
  qCodeExplanation?: string; // Decoded explanation
  significance?: string; // IV/I/V - traffic applicability
  priority?: string; // NBO/SIB/T - operational importance
  scope?: string; // A/E/W - Aerodrome/En-route/Warning
  lowerLimit?: string; // Lower altitude/flight level
  upperLimit?: string; // Upper altitude/flight level

  // A-Line (Location)
  location?: string; // Aerodrome or FIR code from A-line

  // B-Line (Start Date/Time)
  bLine?: string; // Raw B-line (YYMMDDHHM)
  effective: string; // ISO 8601 date

  // C-Line (End Date/Time)
  cLine?: string; // Raw C-line (YYMMDDHHM or PERM)
  expires: string | 'PERM'; // ISO 8601 date or PERM

  // D-Line (Diurnal Schedule - optional)
  dLine?: string; // Daily schedule if limited hours

  // E-Line (Text Description)
  eItem: string; // Full E-item text

  // F-Line (Lower Altitude - optional)
  fLine?: string; // Lower altitude/flight level

  // G-Line (Upper Altitude - optional)
  gLine?: string; // Upper altitude/flight level
}

export interface ParsedNotam extends NotamDetails {
  // Mirror of notamId, retained as the canonical key used throughout the UI
  // (selection Sets, React list keys, list-row match by id).
  id: string;
  subject: string; // Q-line subject (2-3 letters)
  geometry: NotamGeometry;
  category: NotamCategory;
  isActive: boolean;
  title: string; // Short title derived from subject + first 80 chars of E item
  rawText: string; // Full raw NOTAM block
}

export interface NotamApiResponse {
  notams: ParsedNotam[];
  fetchedAt: string; // ISO 8601
  source: string;
  count: number;
  errors?: string[];
}

// ICAO Q-code reference and decoder.
//
// A Q-code is the 5-letter code on a NOTAM's Q-line, e.g. `QFALC`. The 2nd and
// 3rd letters are the SUBJECT (what the NOTAM is about — runway, navaid, …);
// the 4th and 5th are the CONDITION (closed, unserviceable, changed, …).
//
// This file owns three lookup tables and four helpers used elsewhere:
//   - SUBJECT_CATEGORIES    — subject → app's NotamCategory bucket
//   - SUBJECT_DESCRIPTIONS  — subject → human-readable text
//   - CONDITION_DESCRIPTIONS — condition → human-readable text
//   - getCategoryFromQCode / getCategoryFromQLine
//   - decodeQCode / formatQCodeExplanation

import { NotamCategory } from '@/types/notam';

export interface QCodeParts {
  qCode: string; // Full 5-letter code (e.g., QMRXX)
  subjectCode: string; // 2nd & 3rd letter (e.g., MR)
  conditionCode: string; // 4th & 5th letter (e.g., XX)
  subjectDescription: string;
  conditionDescription: string;
}

const SUBJECT_CATEGORIES: Record<string, NotamCategory> = {
  // Airspace Organization (AA-AZ)
  AA: 'airspace', // Minimum altitude
  AB: 'airspace', // Maximum altitude
  AC: 'airspace', // Airspace class
  AD: 'airspace', // Airspace designation
  AE: 'airspace', // Airspace activation
  AF: 'airspace', // Airspace affected
  AO: 'airspace', // Airspace organization

  // Communications (CA-CS)
  CA: 'airspace', // Aeronautical fixed service
  CB: 'airspace', // ADS-B
  CC: 'airspace', // Communication facility
  CD: 'airspace', // Displacement
  CE: 'airspace', // Emergency frequency

  // Facilities & Services (FA-FZ)
  FA: 'airport', // Aerodrome
  FB: 'airport', // Aerodrome beacon
  FC: 'airport', // Flight information center
  FD: 'airport', // Docking
  FE: 'airport', // Emergency equipment
  FF: 'airport', // Fire fighting
  FG: 'airport', // Ground control
  FH: 'airport', // Apron/holding
  FI: 'airport', // Runway/taxiway intersection
  FJ: 'airport', // Fuel
  FK: 'airport', // Aircraft parking
  FM: 'airport', // Maintenance
  FN: 'airport', // Noise
  FO: 'airport', // Operational
  FP: 'airport', // Personnel
  FQ: 'airport', // Quadrant/sector
  FR: 'airport', // Runway
  FS: 'airport', // Shoulder/verge
  FT: 'airport', // Threshold
  FU: 'airport', // Unmarked
  FV: 'airport', // Visual aids
  FW: 'airport', // Weather

  // Lighting (LA-LZ)
  LA: 'airport', // Approach lights
  LB: 'airport', // Aerodrome beacon
  LC: 'airport', // Ceiling light
  LD: 'airport', // Downwind light
  LE: 'airport', // Elevated light
  LF: 'airport', // Flare path
  LG: 'airport', // Glide path light
  LH: 'airport', // High intensity light
  LI: 'airport', // Identification light
  LJ: 'airport', // Judge light
  LK: 'airport', // Kinetic light
  LL: 'airport', // Low intensity light
  LM: 'airport', // Medium intensity light
  LN: 'airport', // Narrow beam light
  LO: 'airport', // Omnidirectional light
  LP: 'airport', // Parking area light
  LQ: 'airport', // Approach light qualification
  LR: 'airport', // Runway light
  LS: 'airport', // Stop bar light
  LT: 'airport', // Taxiway light
  LU: 'airport', // Approach slope indicator
  LV: 'airport', // Visual approach slope
  LW: 'airport', // Wind indication light
  LX: 'airport', // Taxiway light alignment

  // Movement Areas (MA-MW)
  MA: 'runway', // Apron
  MB: 'runway', // Holding
  MC: 'runway', // Movement area
  MD: 'runway', // Displacement
  ME: 'runway', // Elevation
  MF: 'runway', // Friction
  MG: 'runway', // Gradient
  MH: 'runway', // Holding point
  MI: 'runway', // Intersection
  MJ: 'runway', // Crossing
  MK: 'runway', // Kerb
  MM: 'runway', // Main landing area
  MN: 'runway', // Non precision approach
  MO: 'runway', // Obstacle
  MP: 'runway', // Parking
  MQ: 'runway', // Quadrant
  MR: 'runway', // Runway
  MS: 'runway', // Shoulder
  MT: 'runway', // Threshold
  MU: 'runway', // Unmarked
  MV: 'runway', // Visual aids
  MW: 'runway', // Work in progress

  // Navigation Facilities (NA-NT)
  NA: 'navaid', // NDB
  NB: 'navaid', // DME
  NC: 'navaid', // Fan marker
  ND: 'navaid', // Locator
  NE: 'navaid', // Middle marker
  NF: 'navaid', // Outer marker
  NG: 'navaid', // Glide path
  NH: 'navaid', // High frequency
  NI: 'navaid', // Homing
  NJ: 'navaid', // Juncture
  NK: 'navaid', // Marker
  NL: 'navaid', // Localizer
  NM: 'navaid', // Compass locator
  NN: 'navaid', // Navigation facility
  NO: 'navaid', // Omnidirectional
  NP: 'navaid', // Positioning
  NQ: 'navaid', // Qualification
  NR: 'navaid', // Reporting
  NS: 'navaid', // Speed
  NT: 'navaid', // Terminal

  // Restrictions & Airspace (RA-RZ)
  RA: 'airspace', // Alert area
  RD: 'military', // Danger area
  RM: 'military', // Military area
  RP: 'military', // Prohibited area
  RR: 'military', // Restricted area
  RZ: 'military', // Restricted zone

  // Procedures (PA-PZ)
  PA: 'procedure', // Standard arrival
  PB: 'procedure', // Holding
  PC: 'procedure', // Crossing
  PD: 'procedure', // Descent
  PE: 'procedure', // Established
  PF: 'procedure', // Final approach
  PG: 'procedure', // Gradient
  PH: 'procedure', // Holding procedure
  PI: 'procedure', // Initial approach
  PJ: 'procedure', // Climb
  PK: 'procedure', // Procedure
  PL: 'procedure', // Level
  PM: 'procedure', // Procedure modification
  PN: 'procedure', // Procedure new
  PO: 'procedure', // Procedure operating
  PP: 'procedure', // Procedure preparation
  PR: 'procedure', // Procedure route
  PS: 'procedure', // Standard departure
  PT: 'procedure', // Transition
  PU: 'procedure', // Procedure until
  PV: 'procedure', // Visual approach
  PW: 'procedure', // Waypoint

  // Obstacles (OB-OZ)
  OB: 'obstacle', // Obstacle
  OE: 'obstacle', // Elevations
  OF: 'obstacle', // Fairway hazard
  OG: 'obstacle', // Ground hazard
  OH: 'obstacle', // High altitude
  OI: 'obstacle', // Identification
  OM: 'obstacle', // Marked
  ON: 'obstacle', // Navigation
  OP: 'obstacle', // Pipeline
  OR: 'obstacle', // Removed
  OS: 'obstacle', // Supported
  OT: 'obstacle', // Tower
  OW: 'obstacle', // Wind farm
};

const SUBJECT_DESCRIPTIONS: Record<string, string> = {
  AA: 'Airspace - Minimum altitude',
  AB: 'Airspace - Maximum altitude',
  AC: 'Airspace - Class designation',
  AD: 'Airspace - Designation',
  AE: 'Airspace - Activation',
  AF: 'Airspace - Affected area',
  AO: 'Airspace - Organization',
  // AR is a real, common Israeli subject (QARLC appears in the live feed) that
  // was missing here, so those NOTAMs fell through to the generic fallback.
  // Description only — deliberately NOT added to SUBJECT_CATEGORIES, since
  // changing a NOTAM's category would move it between filter buckets.
  AR: 'Airspace - ATS route',
  CA: 'Communications - Aeronautical fixed service',
  CB: 'Communications - ADS-B',
  CC: 'Communications - Communication facility',
  CD: 'Communications - Displacement',
  CE: 'Communications - Emergency frequency',
  FA: 'Facility - Aerodrome',
  FB: 'Facility - Aerodrome beacon',
  FC: 'Facility - Flight information center',
  FD: 'Facility - Docking',
  FE: 'Facility - Emergency equipment',
  FF: 'Facility - Fire fighting',
  FG: 'Facility - Ground control',
  FH: 'Facility - Apron/holding',
  FI: 'Facility - Runway/taxiway intersection',
  FJ: 'Facility - Fuel',
  FK: 'Facility - Aircraft parking',
  FM: 'Facility - Maintenance',
  FN: 'Facility - Noise',
  FO: 'Facility - Operational',
  FP: 'Facility - Personnel',
  FQ: 'Facility - Quadrant/sector',
  FR: 'Facility - Runway',
  FS: 'Facility - Shoulder/verge',
  FT: 'Facility - Threshold',
  FU: 'Facility - Unmarked',
  FV: 'Facility - Visual aids',
  FW: 'Facility - Weather',
  LA: 'Lighting - Approach lights',
  LB: 'Lighting - Aerodrome beacon',
  LC: 'Lighting - Ceiling light',
  LD: 'Lighting - Downwind light',
  LE: 'Lighting - Elevated light',
  LF: 'Lighting - Flare path',
  LG: 'Lighting - Glide path light',
  LH: 'Lighting - High intensity',
  LI: 'Lighting - Identification light',
  LJ: 'Lighting - Judge light',
  LK: 'Lighting - Kinetic light',
  LL: 'Lighting - Low intensity',
  LM: 'Lighting - Medium intensity',
  LN: 'Lighting - Narrow beam',
  LO: 'Lighting - Omnidirectional',
  LP: 'Lighting - Parking area',
  LR: 'Lighting - Runway light',
  LS: 'Lighting - Stop bar light',
  LT: 'Lighting - Taxiway light',
  MA: 'Movement - Apron',
  MB: 'Movement - Holding',
  MC: 'Movement - Movement area',
  MD: 'Movement - Displacement',
  ME: 'Movement - Elevation',
  MF: 'Movement - Friction',
  MG: 'Movement - Gradient',
  MH: 'Movement - Holding point',
  MI: 'Movement - Intersection',
  MJ: 'Movement - Crossing',
  MM: 'Movement - Main landing area',
  MN: 'Movement - Non-precision approach',
  MO: 'Movement - Obstacle',
  MP: 'Movement - Parking',
  MQ: 'Movement - Quadrant',
  MR: 'Movement - Runway',
  MS: 'Movement - Shoulder',
  MT: 'Movement - Threshold',
  MU: 'Movement - Unmarked',
  MV: 'Movement - Visual aids',
  MW: 'Movement - Work in progress',
  NA: 'Navigation - NDB',
  NB: 'Navigation - DME',
  NC: 'Navigation - Fan marker',
  ND: 'Navigation - Locator',
  NE: 'Navigation - Middle marker',
  NF: 'Navigation - Outer marker',
  NG: 'Navigation - Glide path',
  NH: 'Navigation - High frequency',
  NI: 'Navigation - Homing',
  NK: 'Navigation - Marker',
  NL: 'Navigation - Localizer',
  NM: 'Navigation - Compass locator',
  NN: 'Navigation - Navigation facility',
  NO: 'Navigation - Omnidirectional',
  NP: 'Navigation - Positioning',
  NR: 'Navigation - Reporting',
  NS: 'Navigation - Speed',
  NT: 'Navigation - Terminal',
  NV: 'Navigation - VOR',
  OB: 'Obstacle - Obstacle',
  OE: 'Obstacle - Elevations',
  OF: 'Obstacle - Fairway hazard',
  OG: 'Obstacle - Ground hazard',
  OH: 'Obstacle - High altitude',
  OM: 'Obstacle - Marked',
  ON: 'Obstacle - Navigation',
  OP: 'Obstacle - Pipeline',
  OR: 'Obstacle - Removed',
  OS: 'Obstacle - Supported',
  OT: 'Obstacle - Tower',
  OW: 'Obstacle - Wind farm',
  PA: 'Procedure - Standard arrival route',
  PB: 'Procedure - Holding',
  PC: 'Procedure - Crossing',
  PD: 'Procedure - Descent',
  PE: 'Procedure - Established',
  PF: 'Procedure - Final approach',
  PG: 'Procedure - Gradient',
  PH: 'Procedure - Holding procedure',
  PI: 'Procedure - Initial approach',
  PJ: 'Procedure - Climb',
  PK: 'Procedure - Procedure',
  PL: 'Procedure - Level',
  PM: 'Procedure - Procedure modification',
  PN: 'Procedure - Procedure new',
  PO: 'Procedure - Procedure operating',
  PP: 'Procedure - Procedure preparation',
  PR: 'Procedure - Procedure route',
  PS: 'Procedure - Standard departure',
  PT: 'Procedure - Transition',
  RA: 'Restriction - Alert area',
  RD: 'Restriction - Danger area',
  RM: 'Restriction - Military area',
  RP: 'Restriction - Prohibited area',
  RR: 'Restriction - Restricted area',
  RZ: 'Restriction - Restricted zone',
};

const CONDITION_DESCRIPTIONS: Record<string, string> = {
  AC: 'Withdrawn maintenance',
  AO: 'Operational',
  AS: 'Unserviceable',
  CA: 'Activated',
  CB: 'Changed braking action',
  CC: 'Changed course',
  CF: 'Changed frequency',
  CN: 'Canceled',
  CO: 'Changed operating schedule',
  CR: 'Changed runway',
  CU: 'Changed upper limit',
  HA: 'Braking action poor/medium',
  HB: 'Braking action poor',
  HC: 'Braking action medium',
  HD: 'Density altitude',
  HE: 'Humidity/temperature',
  HI: 'Covered by ice',
  HJ: 'Jet blast',
  HL: 'Low level wind shear',
  HO: 'Obscured',
  HP: 'Snow clearance in progress',
  HR: 'Reduced operations',
  HS: 'Surface condition',
  HT: 'Taxiing',
  HU: 'Unserviceable',
  HV: 'Volcanic ash',
  HW: 'Weather',
  HX: 'Water on runway',
  LC: 'Closed',
  LD: 'Unsafe',
  LI: 'Closed IFR',
  LO: 'Operational limited',
  LU: 'Unserviceable',
  PP: 'Partially prepared',
  XX: 'Encoded in plain language (no standardized code)',
};

export function getCategoryFromQCode(qCodeSubject: string): NotamCategory {
  const subject = qCodeSubject.toUpperCase().trim();
  return SUBJECT_CATEGORIES[subject] || 'other';
}

export function getCategoryFromQLine(qLine: string): NotamCategory {
  // Extract Q-code from Q-line format: FIR/QXXXXX/...
  // match[1] is the 4 letters after Q (e.g. "FALC" from "QFALC"). The ICAO
  // subject code is the first two of those (FA = Facility → Aerodrome).
  const match = qLine.match(/\bQ([A-Z]{4})\b/i);
  if (!match) return 'other';

  const qCode = match[1].substring(0, 2).toUpperCase();
  return getCategoryFromQCode(qCode);
}

export function decodeQCode(qCode: string): QCodeParts {
  const cleaned = qCode.toUpperCase().trim();

  // Expect format: QXXXXX (5 letters starting with Q)
  if (!cleaned.match(/^Q[A-Z]{4}$/)) {
    return {
      qCode: cleaned,
      subjectCode: '',
      conditionCode: '',
      subjectDescription: 'Invalid Q-code format',
      conditionDescription: '',
    };
  }

  const subjectCode = cleaned.substring(1, 3); // 2nd & 3rd letters
  const conditionCode = cleaned.substring(3, 5); // 4th & 5th letters

  return {
    qCode: cleaned,
    subjectCode,
    conditionCode,
    subjectDescription:
      SUBJECT_DESCRIPTIONS[subjectCode] || `Unknown subject code: ${subjectCode}`,
    conditionDescription:
      CONDITION_DESCRIPTIONS[conditionCode] || `Unknown condition code: ${conditionCode}`,
  };
}

export function formatQCodeExplanation(qCode: string): string {
  const decoded = decodeQCode(qCode);
  return `${decoded.subjectDescription} - ${decoded.conditionDescription}`;
}

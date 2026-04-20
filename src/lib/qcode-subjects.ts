// ICAO Q-Code Subject Mapping (2nd & 3rd letters of QXXXX code)
// Maps subject codes to NOTAM categories

import { NotamCategory } from '@/types/notam';

const Q_CODE_SUBJECT_MAP: Record<string, NotamCategory> = {
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

export function getCategoryFromQCode(qCodeSubject: string): NotamCategory {
  const subject = qCodeSubject.toUpperCase().trim();
  return Q_CODE_SUBJECT_MAP[subject] || 'other';
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

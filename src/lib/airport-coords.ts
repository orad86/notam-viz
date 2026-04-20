// Israeli Airport Coordinates for aerodrome-specific NOTAMs
export const AIRPORT_COORDINATES: Record<string, { lat: number; lon: number; name: string }> = {
  // Major Israeli Airports
  LLBG: { lat: 31.946, lon: 35.2217, name: 'Ben Gurion Airport (Tel Aviv)' },
  LLHA: { lat: 32.8193, lon: 35.0001, name: 'Haifa Airport' },
  LLIB: { lat: 31.9384, lon: 35.1658, name: 'Eilat Airport' },
  LLSD: { lat: 31.2045, lon: 34.7644, name: 'Sde Dov Airport (Tel Aviv)' },
  LLPE: { lat: 31.9436, lon: 35.215, name: 'Petah Tikva Airfield' },
  LLER: { lat: 32.5268, lon: 34.9175, name: 'Megiddo Airport' },
  LLJR: { lat: 31.8436, lon: 35.1981, name: 'Jerusalem/Atarot Airfield' },
  LLRA: { lat: 32.1641, lon: 35.3719, name: 'Ramat David Air Base' },
  LLTN: { lat: 32.3878, lon: 35.4072, name: 'Tel Nof Air Base' },
  LLMG: { lat: 31.6086, lon: 34.8381, name: 'Mitzpe Ramon Airport' },
  LLHS: { lat: 31.8408, lon: 35.2019, name: 'Herzliya Airport' },
  LLKF: { lat: 32.9841, lon: 35.8208, name: 'Kfar Shmaryahu Airport' },

  // FIR Codes (use center of FIR)
  LLLL: { lat: 31.5, lon: 34.9, name: 'Tel Aviv FIR' },
  LLFA: { lat: 31.5, lon: 34.9, name: 'Tel Aviv FIR' },
  LLAK: { lat: 32.5, lon: 35.2, name: 'Haifa FIR' },

  // Helicopter Landing Sites
  LLMY: { lat: 32.0858, lon: 34.7644, name: 'Megiddo Landing Site' },
  LLHE: { lat: 32.8193, lon: 35.0001, name: 'Haifa Helicopter Base' },
};

export function getAirportCoords(
  fir: string
): { lat: number; lon: number; name: string } | null {
  const cleaned = fir.toUpperCase().trim();
  return AIRPORT_COORDINATES[cleaned] || null;
}

export function getDefaultCoordForFIR(fir: string): { lat: number; lon: number } | null {
  const coords = getAirportCoords(fir);
  return coords ? { lat: coords.lat, lon: coords.lon } : null;
}

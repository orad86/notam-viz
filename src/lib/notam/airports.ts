// Israeli Airport Coordinates for aerodrome-specific NOTAMs
export const AIRPORT_COORDINATES: Record<string, { lat: number; lon: number }> = {
  // Major Israeli Airports
  LLBG: { lat: 31.946, lon: 35.2217 }, // Ben Gurion Airport (Tel Aviv)
  LLHA: { lat: 32.8193, lon: 35.0001 }, // Haifa Airport
  LLIB: { lat: 31.9384, lon: 35.1658 }, // Eilat Airport
  LLSD: { lat: 31.2045, lon: 34.7644 }, // Sde Dov Airport (Tel Aviv)
  LLPE: { lat: 31.9436, lon: 35.215 }, // Petah Tikva Airfield
  LLER: { lat: 32.5268, lon: 34.9175 }, // Megiddo Airport
  LLJR: { lat: 31.8436, lon: 35.1981 }, // Jerusalem/Atarot Airfield
  LLRA: { lat: 32.1641, lon: 35.3719 }, // Ramat David Air Base
  LLTN: { lat: 32.3878, lon: 35.4072 }, // Tel Nof Air Base
  LLMG: { lat: 31.6086, lon: 34.8381 }, // Mitzpe Ramon Airport
  LLHS: { lat: 31.8408, lon: 35.2019 }, // Herzliya Airport
  LLKF: { lat: 32.9841, lon: 35.8208 }, // Kfar Shmaryahu Airport

  // FIR Codes (use center of FIR)
  LLLL: { lat: 31.5, lon: 34.9 }, // Tel Aviv FIR
  LLFA: { lat: 31.5, lon: 34.9 }, // Tel Aviv FIR
  LLAK: { lat: 32.5, lon: 35.2 }, // Haifa FIR

  // Helicopter Landing Sites
  LLMY: { lat: 32.0858, lon: 34.7644 }, // Megiddo Landing Site
  LLHE: { lat: 32.8193, lon: 35.0001 }, // Haifa Helicopter Base
};

export function getAirportCoords(
  fir: string
): { lat: number; lon: number } | null {
  const cleaned = fir.toUpperCase().trim();
  return AIRPORT_COORDINATES[cleaned] || null;
}

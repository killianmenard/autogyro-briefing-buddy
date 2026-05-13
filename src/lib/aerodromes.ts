export type FuelStatus = "ok" | "no" | "ask";

export interface Notam {
  id: string;
  category: string;
  text: string;
}

export interface Aerodrome {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  metarStation: string;
  phone?: string;
  fuel: { avgas100ll: FuelStatus; ul91: FuelStatus; sp98: FuelStatus };
  notams: Notam[];
}

export const AERODROMES: Aerodrome[] = [
  {
    icao: "LFLQ",
    name: "Montélimar-Ancône",
    lat: 44.58037,
    lon: 4.73917,
    metarStation: "LFLU",
    phone: "+33475002517",
    fuel: { avgas100ll: "ask", ul91: "ask", sp98: "ask" },
    notams: [
      {
        id: "A1245/26",
        category: "RWY",
        text: "Piste 02/20 herbe — bande de roulement molle après précipitations récentes",
      },
    ],
  },
  {
    icao: "LFHD",
    name: "Pierrelatte",
    lat: 44.395,
    lon: 4.7167,
    metarStation: "LFMO",
    fuel: { avgas100ll: "ask", ul91: "ask", sp98: "ask" },
    notams: [],
  },
  {
    icao: "LFHO",
    name: "Aubenas-Ardèche",
    lat: 44.5444,
    lon: 4.3722,
    metarStation: "LFMO",
    fuel: { avgas100ll: "ok", ul91: "ask", sp98: "no" },
    notams: [
      { id: "B0078/26", category: "AIRSPACE", text: "R45A activée 0800-1700Z lundi à vendredi" },
      { id: "B0091/26", category: "OBST", text: "Grue 45 m AGL à 1.2 NM SW du seuil 04" },
    ],
  },
  {
    icao: "LFNV",
    name: "Valréas-Visan",
    lat: 44.33572,
    lon: 4.90688,
    metarStation: "LFMO",
    fuel: { avgas100ll: "ask", ul91: "ok", sp98: "ask" },
    notams: [],
  },
  {
    icao: "LFLU",
    name: "Valence-Chabeuil",
    lat: 44.9216,
    lon: 4.97,
    metarStation: "LFLU",
    fuel: { avgas100ll: "ok", ul91: "ok", sp98: "no" },
    notams: [
      {
        id: "A1301/26",
        category: "NAV",
        text: "VOR VAF hors service jusqu'au 15 mai 1800Z",
      },
    ],
  },
];

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function degToCompass(deg: number): string {
  const dirs = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}

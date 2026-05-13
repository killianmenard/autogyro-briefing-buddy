import { useEffect, useState } from "react";
import type { Aerodrome } from "@/lib/aerodromes";
import { ReliabilityBadge } from "./ReliabilityBadge";

interface MetarData {
  rawOb?: string;
  rawTaf?: string;
  fltCat?: string;
  obsTime?: number;
  reportTime?: string;
}

export function MetarSection({ ad }: { ad: Aerodrome }) {
  const [data, setData] = useState<MetarData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setData(null);
    fetch(
      `https://aviationweather.gov/api/data/metar?ids=${ad.metarStation}&format=json&taf=true&hours=2`
    )
      .then((r) => r.json())
      .then((arr: MetarData[]) => {
        if (Array.isArray(arr) && arr.length > 0) setData(arr[0]);
        else setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ad.icao]);

  // station distance (approx — only useful when station != icao)
  const sameStation = ad.metarStation === ad.icao;
  // Without a known coord for stations, skip distance calc unless same
  const distKm = sameStation ? 0 : null;

  const ageMin = data?.obsTime
    ? Math.round((Date.now() / 1000 - data.obsTime) / 60)
    : null;

  const cat = data?.fltCat ?? "";
  const catColor =
    cat === "VFR"
      ? "bg-[oklch(0.72_0.17_145)] text-white"
      : cat === "MVFR"
      ? "bg-[oklch(0.75_0.17_55)] text-white"
      : cat === "IFR" || cat === "LIFR"
      ? "bg-[oklch(0.62_0.22_27)] text-white"
      : "bg-muted text-foreground";

  return (
    <div className="space-y-3">
      <ReliabilityBadge
        level="green"
        label={`Officiel mesuré · aviationweather.gov · station ${ad.metarStation}${
          !sameStation ? "" : ""
        }`}
      />
      {!sameStation && (
        <div className="rounded-md border border-[oklch(0.75_0.17_55)] bg-[oklch(0.97_0.05_55)] px-3 py-2 text-xs text-foreground">
          Station METAR différente de {ad.icao} — conditions locales peuvent différer
        </div>
      )}
      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {error && <p className="text-sm text-muted-foreground">Source indisponible</p>}
      {data && (
        <>
          <div className="flex items-center gap-2">
            {cat && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catColor}`}>
                {cat}
              </span>
            )}
            {ageMin !== null && (
              <span className="text-xs text-muted-foreground">Observé il y a {ageMin} min</span>
            )}
            {ageMin !== null && ageMin > 90 && (
              <span className="rounded-full bg-[oklch(0.62_0.22_27)] px-2 py-0.5 text-xs text-white">
                Obsolète
              </span>
            )}
          </div>
          {data.rawOb && (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {data.rawOb}
            </pre>
          )}
          {data.rawTaf && (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {data.rawTaf}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

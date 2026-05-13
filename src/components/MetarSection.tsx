import { useEffect, useState } from "react";
import type { Aerodrome } from "@/lib/aerodromes";
import { ReliabilityBadge } from "./ReliabilityBadge";

interface MetarData {
  rawOb?: string;
  rawTaf?: string;
  fltCat?: string;
  receiptTime?: string;
  icaoId?: string;
}

export function MetarSection({ ad }: { ad: Aerodrome }) {
  const [data, setData] = useState<MetarData | null>(null);
  const [errored, setErrored] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErrored(null);
    setData(null);

    (async () => {
      const apiUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(
        ad.metarStation
      )}&format=json&taf=true&hours=2`;

      const proxies = [
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(apiUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(apiUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(apiUrl)}`,
      ];

      for (const proxyUrl of proxies) {
        if (cancelled) return;
        try {
          const response = await fetch(proxyUrl);
          if (!response.ok) continue;
          const text = await response.text();
          if (!text || text.trim().startsWith("<")) continue;
          const json = JSON.parse(text);
          if (cancelled) return;
          if (Array.isArray(json) && json.length > 0) {
            setData(json[0]);
            setLoading(false);
            return;
          }
        } catch (error) {
          console.warn("Proxy failed, trying next:", proxyUrl, error);
          continue;
        }
      }

      if (!cancelled) {
        setErrored("Tous les proxies sont indisponibles");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ad.icao, ad.metarStation]);

  const sameStation = ad.metarStation === ad.icao;

  const ageMin = data?.receiptTime
    ? Math.round((Date.now() - new Date(data.receiptTime).getTime()) / 60000)
    : null;

  const cat = data?.fltCat ?? "";
  const catColor =
    cat === "VFR"
      ? "bg-green-100 text-green-900"
      : cat === "MVFR"
      ? "bg-orange-100 text-orange-900"
      : cat === "IFR" || cat === "LIFR"
      ? "bg-red-100 text-red-900"
      : "bg-muted text-foreground";

  return (
    <div className="space-y-3">
      <ReliabilityBadge
        level="green"
        label={`Officiel mesuré · aviationweather.gov · station ${ad.metarStation}`}
      />
      {!sameStation && (
        <div className="rounded-md border border-[oklch(0.75_0.17_55)] bg-[oklch(0.97_0.05_55)] px-3 py-2 text-xs text-foreground">
          Station METAR différente de {ad.icao} — conditions locales peuvent différer
        </div>
      )}
      {loading && (
        <p className="text-sm text-muted-foreground">Chargement METAR...</p>
      )}
      {errored && !loading && (
        <p className="text-sm text-red-700">
          Erreur METAR : {errored}
        </p>
      )}
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
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
                Obsolète
              </span>
            )}
          </div>
          {data.rawOb && (
            <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
              {data.rawOb}
            </pre>
          )}
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
            {data.rawTaf || ""}
          </pre>
        </>
      )}
    </div>
  );
}

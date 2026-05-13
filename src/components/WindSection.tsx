import { useEffect, useState } from "react";
import type { Aerodrome } from "@/lib/aerodromes";
import { degToCompass } from "@/lib/aerodromes";
import { ReliabilityBadge } from "./ReliabilityBadge";

interface WindData {
  current?: {
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    wind_speed_80m: number;
    wind_direction_80m: number;
    wind_speed_120m: number;
    wind_direction_120m: number;
  };
  hourly?: {
    wind_speed_950hPa: number[];
    wind_direction_950hPa: number[];
    wind_speed_925hPa: number[];
    wind_direction_925hPa: number[];
  };
}

export function WindSection({
  ad,
  onSurfaceWind,
}: {
  ad: Aerodrome;
  onSurfaceWind?: (kt: number) => void;
}) {
  const [data, setData] = useState<WindData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setData(null);
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${ad.lat}&longitude=${ad.lon}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m,wind_speed_80m,wind_direction_80m,wind_speed_120m,wind_direction_120m&hourly=wind_speed_950hPa,wind_direction_950hPa,wind_speed_925hPa,wind_direction_925hPa&forecast_days=1&wind_speed_unit=kn`
    )
      .then((r) => r.json())
      .then((d: WindData) => {
        setData(d);
        if (d.current && onSurfaceWind) onSurfaceWind(d.current.wind_speed_10m);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ad.icao]);

  const layers = data
    ? [
        {
          label: "Surface (10 m)",
          dir: data.current?.wind_direction_10m,
          spd: data.current?.wind_speed_10m,
          gust: data.current?.wind_gusts_10m,
        },
        {
          label: "80 m (260 ft)",
          dir: data.current?.wind_direction_80m,
          spd: data.current?.wind_speed_80m,
        },
        {
          label: "120 m (390 ft)",
          dir: data.current?.wind_direction_120m,
          spd: data.current?.wind_speed_120m,
        },
        {
          label: "950 hPa (1640 ft)",
          dir: data.hourly?.wind_direction_950hPa?.[0],
          spd: data.hourly?.wind_speed_950hPa?.[0],
        },
        {
          label: "925 hPa (2480 ft)",
          dir: data.hourly?.wind_direction_925hPa?.[0],
          spd: data.hourly?.wind_speed_925hPa?.[0],
        },
      ]
    : [];

  const max = data
    ? Math.max(
        ...layers.map((l) => l.spd ?? 0),
        data.current?.wind_gusts_10m ?? 0
      )
    : 0;
  const maxColor =
    max > 20
      ? "bg-[oklch(0.75_0.17_55)] text-white"
      : "bg-[oklch(0.72_0.17_145)] text-white";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <ReliabilityBadge level="yellow" label="Modèle ECMWF · open-meteo.com" />
        {data && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${maxColor}`}>
            max {Math.round(max)} kt
          </span>
        )}
      </div>
      {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
      {error && <p className="text-sm text-muted-foreground">Source indisponible</p>}
      {data && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {layers.map((l) => (
            <li key={l.label} className="flex items-center justify-between px-3 py-2 text-sm">
              <span className="text-muted-foreground">{l.label}</span>
              <span className="font-mono text-xs">
                {l.dir !== undefined && l.spd !== undefined
                  ? `${Math.round(l.dir)}° ${degToCompass(l.dir)} · ${Math.round(l.spd)} kt${
                      l.gust !== undefined ? ` (raf. ${Math.round(l.gust)})` : ""
                    }`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

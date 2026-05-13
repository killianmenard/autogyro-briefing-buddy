import { useEffect, useState } from "react";
import { ExternalLink, Phone, Utensils, BedDouble, Fuel } from "lucide-react";
import type { Aerodrome } from "@/lib/aerodromes";
import { haversine } from "@/lib/aerodromes";
import { ReliabilityBadge } from "./ReliabilityBadge";

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

interface Poi {
  id: number;
  name: string;
  lat: number;
  lon: number;
  type: "restaurant" | "lodging" | "fuel";
  distance: number;
  walkMin: number;
  score: number;
  phone?: string;
  website?: string;
  hours?: string;
}

function classify(tags: Record<string, string>): Poi["type"] | null {
  if (tags.amenity === "restaurant" || tags.amenity === "fast_food") return "restaurant";
  if (tags.tourism === "hotel" || tags.tourism === "guest_house") return "lodging";
  if (tags.amenity === "fuel") return "fuel";
  return null;
}

export function ServicesSection({ ad }: { ad: Aerodrome }) {
  const [pois, setPois] = useState<Poi[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPois(null);

    (async () => {
      try {
        const response = await fetch(`/api/services?lat=${ad.lat}&lon=${ad.lon}`);
        const d = await response.json();

        if (cancelled) return;

        if (d?.error) {
          setError(d.error);
          return;
        }

        if (!d?.elements || !Array.isArray(d.elements)) {
          setError("Réponse OSM invalide");
          return;
        }

        const list: Poi[] = [];
        for (const n of d.elements as OsmNode[]) {
          const tags = n.tags || {};
          const name = tags.name;
          if (!name) continue;
          const type = classify(tags);
          if (!type) continue;
          const distance = haversine(ad.lat, ad.lon, n.lat, n.lon);
          const score =
            (name ? 1 : 0) + (tags.phone ? 1 : 0) + (tags.opening_hours ? 1 : 0);
          list.push({
            id: n.id,
            name,
            lat: n.lat,
            lon: n.lon,
            type,
            distance,
            walkMin: Math.round(distance / 80),
            score,
            phone: tags.phone,
            website: tags.website,
            hours: tags.opening_hours,
          });
        }
        list.sort((a, b) => b.score - a.score || a.distance - b.distance);
        setPois(list);
      } catch (error) {
        console.error("OSM Overpass fetch failed", error);
        if (!cancelled) setError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ad.icao, ad.lat, ad.lon]);

  const groups: { key: Poi["type"]; label: string }[] = [
    { key: "restaurant", label: "Restaurants" },
    { key: "lodging", label: "Hébergement" },
    { key: "fuel", label: "Stations-service" },
  ];

  return (
    <div className="space-y-4">
      <ReliabilityBadge level="red" label="Communautaire · OpenStreetMap" />
      {loading && (
        <p className="text-sm text-muted-foreground">
          Recherche des services à 2 km (5-15 sec)...
        </p>
      )}
      {error && !loading && (
        <p className="text-sm text-red-700">Erreur OSM : {error}</p>
      )}
      {pois &&
        groups.map((g) => {
          const items = pois.filter((p) => p.type === g.key);
          const visible = items.slice(0, 5);
          const Icon = g.key === "restaurant" ? Utensils : g.key === "lodging" ? BedDouble : Fuel;
          return (
            <div key={g.key}>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.label}
              </h4>
              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun résultat</p>
              ) : (
                <ul className="space-y-2">
                  {visible.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-card p-2 text-sm"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          
                            href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate underline-offset-2 hover:underline"
                          >
                            {p.name}
                          </a>
                          <div className="text-xs text-muted-foreground">
                            {Math.round(p.distance)} m · {p.walkMin} min à pied
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-0.5">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className={`h-1.5 w-1.5 rounded-full ${
                                i < p.score
                                  ? "bg-[oklch(0.72_0.17_145)]"
                                  : "bg-border"
                              }`}
                            />
                          ))}
                        </div>
                        {p.phone && (
                          
                            href={`tel:${p.phone}`}
                            className="rounded-md p-1 hover:bg-muted"
                            aria-label="Appeler"
                          >
                            <Phone className="h-3.5 w-3.5" />
                          </a>
                        )}
                        {p.website && (
                          
                            href={p.website}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-md p-1 hover:bg-muted"
                            aria-label="Site"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {items.length > 5 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {items.length - 5} autres services à 2 km (cachés pour la lisibilité)
                </p>
              )}
            </div>
          );
        })}
    </div>
  );
}

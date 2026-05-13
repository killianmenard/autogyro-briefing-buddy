import { createServerFn } from "@tanstack/react-start";

export const fetchServices = createServerFn({ method: "GET" })
  .validator((data: { lat: number; lon: number }) => data)
  .handler(async ({ data }) => {
    const query = `[out:json][timeout:25];(node["amenity"="restaurant"](around:2000,${data.lat},${data.lon});node["amenity"="fast_food"](around:2000,${data.lat},${data.lon});node["tourism"="hotel"](around:2000,${data.lat},${data.lon});node["tourism"="guest_house"](around:2000,${data.lat},${data.lon});node["amenity"="fuel"](around:2000,${data.lat},${data.lon}););out body;`;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "AutogyroDash/1.0 (briefing pre-vol VFR autogire)",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`overpass-api.de returned ${response.status}`);
    }

    return (await response.json()) as {
      elements: Array<{
        id: number;
        lat: number;
        lon: number;
        tags?: Record<string, string>;
      }>;
    };
  });

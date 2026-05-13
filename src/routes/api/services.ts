import { createServerFileRoute } from "@tanstack/react-start/server";

export const ServerRoute = createServerFileRoute("/api/services").methods({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: "Missing lat or lon parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const query = `[out:json][timeout:25];(node["amenity"="restaurant"](around:2000,${lat},${lon});node["amenity"="fast_food"](around:2000,${lat},${lon});node["tourism"="hotel"](around:2000,${lat},${lon});node["tourism"="guest_house"](around:2000,${lat},${lon});node["amenity"="fuel"](around:2000,${lat},${lon}););out body;`;

    try {
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(
        query
      )}`;

      const response = await fetch(overpassUrl, {
        headers: {
          "User-Agent": "AutogyroDash/1.0 (briefing pre-vol VFR autogire)",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: `Upstream overpass-api.de returned ${response.status}`,
          }),
          {
            status: response.status,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const data = await response.json();

      return new Response(JSON.stringify(data), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=600",
        },
      });
    } catch (error) {
      console.error("Services proxy error:", error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  },
});

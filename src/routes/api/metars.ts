import { createServerFileRoute } from "@tanstack/react-start/server";

export const ServerRoute = createServerFileRoute("/api/metar").methods({
  GET: async ({ request }) => {
    const url = new URL(request.url);
    const station = url.searchParams.get("station");

    if (!station) {
      return new Response(
        JSON.stringify({ error: "Missing station parameter" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    try {
      const apiUrl = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(
        station
      )}&format=json&taf=true&hours=2`;

      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": "AutogyroDash/1.0",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({
            error: `Upstream aviationweather.gov returned ${response.status}`,
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
          "Cache-Control": "public, max-age=300",
        },
      });
    } catch (error) {
      console.error("METAR proxy error:", error);
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

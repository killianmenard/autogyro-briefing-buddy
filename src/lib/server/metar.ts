import { createServerFn } from "@tanstack/react-start";

export const fetchMetar = createServerFn({ method: "GET" })
  .validator((data: { station: string }) => data)
  .handler(async ({ data }) => {
    const url = `https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(
      data.station
    )}&format=json&taf=true&hours=2`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "AutogyroDash/1.0",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`aviationweather.gov returned ${response.status}`);
    }

    return (await response.json()) as Array<{
      rawOb?: string;
      rawTaf?: string;
      fltCat?: string;
      receiptTime?: string;
      icaoId?: string;
    }>;
  });

type GeocodeFeature = {
  text?: string;
  place_type?: string[];
  place_name?: string;
  context?: Array<{ id: string; text: string }>;
};

function fallbackFromPlaceName(placeName?: string): string | undefined {
  if (!placeName) return undefined;
  const parts = placeName.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  // "123 St, Pajac, Lapu-Lapu City, …" → suburb is usually the 2nd segment.
  if (parts.length >= 3) return parts[1];
  return parts[0];
}

/** Prefer suburb/locality over city for route labels (e.g. Pajac → Mactan). */
export function extractPlace(geocode: unknown): string | undefined {
  if (!geocode) return undefined;
  const feature = (geocode as { features?: GeocodeFeature[] })?.features?.[0];
  if (!feature) return undefined;

  const ctx = feature.context ?? [];
  for (const kind of ['neighborhood', 'locality', 'place']) {
    const found = ctx.find((c) => c.id?.startsWith(`${kind}.`));
    if (found?.text) return found.text;
  }

  const placeTypes = feature.place_type ?? [];
  for (const kind of ['neighborhood', 'locality', 'place']) {
    if (placeTypes.includes(kind) && feature.text) return feature.text;
  }

  return fallbackFromPlaceName(feature.place_name);
}

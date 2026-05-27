type GeocodeFeature = {
  text?: string;
  place_type?: string[];
  place_name?: string;
  context?: Array<{ id: string; text: string }>;
};

const CONTEXT_ORDER = [
  'neighborhood',
  'locality',
  'place',
  'district',
  'region',
  'country',
] as const;

export const GEOCODE_TYPES = 'address,street,poi,place,locality,neighborhood';
export const GEOCODE_LIMIT = 5;

export function buildGeocodeUrl(lng: number, lat: number, token: string): string {
  return (
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
    `?access_token=${token}&types=${GEOCODE_TYPES}&limit=${GEOCODE_LIMIT}`
  );
}

function buildFromParts(feature: GeocodeFeature): string | undefined {
  const parts: string[] = [];

  if (feature.text) parts.push(feature.text);

  for (const kind of CONTEXT_ORDER) {
    const found = feature.context?.find((c) => c.id?.startsWith(`${kind}.`));
    if (found?.text && !parts.includes(found.text)) parts.push(found.text);
  }

  return parts.length > 0 ? parts.join(', ') : undefined;
}

function fullAddressFromFeature(feature: GeocodeFeature): string | undefined {
  const built = buildFromParts(feature);
  const placeName = feature.place_name?.trim();

  // Mapbox often returns suburb-only place_name ("Pusok") — prefer built context chain.
  if (placeName?.includes(',')) return placeName;
  if (built && (!placeName || built.length > placeName.length)) return built;
  return placeName ?? built;
}

/** True when cached Mapbox JSON lacks a street-level feature. */
export function geocodeNeedsRefresh(geocode: unknown): boolean {
  const features = (geocode as { features?: GeocodeFeature[] })?.features ?? [];
  if (features.length === 0) return true;
  return !features.some((f) =>
    f.place_type?.some((t) => t === 'address' || t === 'street'),
  );
}

/** Full formatted address from Mapbox (street, suburb, city, …). */
export function extractPlace(geocode: unknown): string | undefined {
  if (!geocode) return undefined;
  const features = (geocode as { features?: GeocodeFeature[] })?.features ?? [];
  if (features.length === 0) return undefined;

  const candidates = features
    .map((f) => fullAddressFromFeature(f))
    .filter((v): v is string => !!v);

  if (candidates.length === 0) return undefined;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

/** Pick the most complete address from several sources. */
export function pickBestAddress(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  const values = candidates.filter((v): v is string => !!v?.trim());
  if (values.length === 0) return undefined;
  return values.sort((a, b) => b.length - a.length)[0];
}

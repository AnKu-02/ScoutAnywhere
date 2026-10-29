/** Future provider-neutral boundary. No geocoder is implemented in Phase 1. */
export interface GeoPoint { latitude: number; longitude: number }
export interface GeocodingProvider {
  forward(address: string): Promise<GeoPoint[]>;
  reverse(point: GeoPoint): Promise<{ city: string; locality: string; pinCode?: string } | null>;
}
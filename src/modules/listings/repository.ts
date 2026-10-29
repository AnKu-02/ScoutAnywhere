import { db } from "../../lib/db";
import { PAGE_SIZE, parseFilters, type SearchFilters } from "../search/filters";
export interface Listing {
  id: number; category: "flatshares" | "rent" | "buy"; title: string; description: string;
  price: number; deposit: number | null; maintenance: number; brokerage: number;
  available_from: string | null; published_at: string; is_demo: boolean;
  city: string; locality: string; pin_code: string; building: string; address_line: string;
  property_type: string; furnishing: string; bhk: number | null; carpet_sqft: number | null;
  household_size: number | null; house_rules: string | null; advertiser: string; advertiser_kind: string;
  images: { path: string; alt: string }[]; amenities: string[];
}
function baseQuery() {
  const sql = db();
  return sql`SELECT l.id,l.category,l.title,l.description,l.price::float8,l.deposit::float8,l.maintenance,l.brokerage::float8,
    l.available_from::text,l.published_at::text,l.is_demo,c.name AS city,loc.locality,loc.pin_code,
    p.building,p.address_line,p.property_type,u.furnishing,u.bhk,u.carpet_sqft,u.household_size,u.house_rules,
    a.display_name AS advertiser,a.kind AS advertiser_kind,
    COALESCE((SELECT json_agg(json_build_object('path',im.path,'alt',im.alt) ORDER BY im.sort_order,im.id) FROM property_images im WHERE im.property_id=p.id AND (im.unit_id IS NULL OR im.unit_id=u.id)),'[]') AS images,
    COALESCE((SELECT json_agg(am.name ORDER BY am.name) FROM amenities am JOIN property_amenities pa ON pa.amenity_id=am.id WHERE pa.property_id=p.id),'[]') AS amenities
    FROM listings l JOIN units u ON u.id=l.unit_id JOIN properties p ON p.id=u.property_id
    JOIN locations loc ON loc.id=p.location_id JOIN cities c ON c.id=loc.city_id JOIN advertisers a ON a.id=l.advertiser_id`;
}
export async function searchListings(input: SearchFilters) {
  const f = parseFilters(input); // Revalidate even when invoked outside the UI.
  const sql = db();
  const where = sql`l.status='published' AND l.category=${f.category}
    ${f.city ? sql`AND lower(c.name)=lower(${f.city})` : sql``}
    ${f.locality ? sql`AND lower(loc.locality)=lower(${f.locality})` : sql``}
    ${f.minPrice !== undefined ? sql`AND l.price>=${f.minPrice}` : sql``}
    ${f.maxPrice !== undefined ? sql`AND l.price<=${f.maxPrice}` : sql``}
    ${f.bhk ? sql`AND u.bhk=${f.bhk}` : sql``}
    ${f.furnishing ? sql`AND u.furnishing=${f.furnishing}` : sql``}
    ${f.propertyType ? sql`AND p.property_type=${f.propertyType}` : sql``}
    ${f.advertiser ? sql`AND a.kind=${f.advertiser}` : sql``}
    ${f.brokerageFree === 'true' ? sql`AND l.brokerage=0` : sql``}
    ${f.availableBy ? sql`AND l.available_from<=${f.availableBy}::date` : sql``}`;
  const order = f.sort === "price-asc" ? sql`l.price ASC,l.id ASC` : f.sort === "price-desc" ? sql`l.price DESC,l.id DESC` : sql`l.published_at DESC,l.id DESC`;
  // One statement gives count and results the same snapshot, including empty pages.
  const [result] = await sql`WITH matched AS (${baseQuery()} WHERE ${where}),
    page AS (SELECT * FROM matched l ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${(f.page-1)*PAGE_SIZE})
    SELECT (SELECT count(*)::int FROM matched) AS total, COALESCE((SELECT json_agg(page) FROM page),'[]') AS items`;
  return result as { total: number; items: Listing[] };
}
export async function getListing(id: number): Promise<Listing | null> {
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const rows = await db()<Listing[]>`${baseQuery()} WHERE l.id=${id} AND l.status='published' LIMIT 1`;
  return rows[0] ?? null;
}
/** Favorites reuse the public detail projection and publication rule, never snapshots. */
export async function getPublishedListingsByIds(ids: number[]): Promise<Listing[]> {
  if (!ids.length) return [];
  return db()<Listing[]>`${baseQuery()} WHERE l.id IN ${db()(ids)} AND l.status='published'`;
}
export async function getLocalities(): Promise<{ city: string; locality: string }[]> {
  return db()`SELECT c.name AS city,l.locality FROM locations l JOIN cities c ON c.id=l.city_id ORDER BY c.name,l.locality`;
}
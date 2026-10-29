import { db } from "../../lib/db";
import { getPublishedListingsByIds } from "../listings/repository";
import { listingIdSchema, SAVED_LIMIT, SAVED_PAGE_SIZE } from "./validation";

export async function savedListingIds(userId: string): Promise<number[]> {
  const rows = await db()`SELECT s.listing_id FROM saved_listings s JOIN listings l ON l.id=s.listing_id
    WHERE s.user_id=${userId} AND l.status='published' ORDER BY s.saved_at DESC,s.listing_id DESC LIMIT ${SAVED_LIMIT}`;
  return rows.map(row => row.listing_id as number);
}

export async function savedCollection(userId: string, page = 1) {
  if (!Number.isInteger(page) || page < 1 || page > 999) throw new Error("Invalid saved page");
  const ids = await savedListingIds(userId);
  const selected = ids.slice((page-1)*SAVED_PAGE_SIZE, page*SAVED_PAGE_SIZE);
  const listings = await getPublishedListingsByIds(selected);
  // Projection rechecks visibility if publication changed between statements.
  const byId = new Map(listings.map(listing => [listing.id, listing]));
  return { total: ids.length, items: selected.flatMap(id => byId.has(id) ? [byId.get(id)!] : []) };
}

export type SavedWriteResult = "saved" | "removed" | "not-found" | "limited" | "full";
export async function setSavedListing(userId: string, inputId: number, saved: boolean): Promise<SavedWriteResult> {
  const listingId = listingIdSchema.parse(inputId);
  return db().begin(async sql => {
    // Serialize this user's mutations, including the collection cap, across workers.
    const users = await sql`SELECT id FROM auth_user WHERE id=${userId} FOR UPDATE`;
    if (!users.length) return "not-found";
    const bucket = await sql`INSERT INTO saved_listing_write_limits(user_id,request_count) VALUES (${userId},1)
      ON CONFLICT(user_id) DO UPDATE SET
      request_count=CASE WHEN saved_listing_write_limits.window_started_at <= now()-interval '1 minute' THEN 1 ELSE saved_listing_write_limits.request_count+1 END,
      window_started_at=CASE WHEN saved_listing_write_limits.window_started_at <= now()-interval '1 minute' THEN now() ELSE saved_listing_write_limits.window_started_at END
      WHERE saved_listing_write_limits.window_started_at <= now()-interval '1 minute' OR saved_listing_write_limits.request_count<60
      RETURNING user_id`;
    if (!bucket.length) return "limited";
    if (!saved) {
      await sql`DELETE FROM saved_listings WHERE user_id=${userId} AND listing_id=${listingId}`;
      return "removed";
    }
    // Lock the source row so unpublishing/deletion cannot race the save check.
    const listing = await sql`SELECT id FROM listings WHERE id=${listingId} AND status='published' FOR SHARE`;
    if (!listing.length) return "not-found";
    const existing = await sql`SELECT listing_id FROM saved_listings WHERE user_id=${userId} AND listing_id=${listingId}`;
    if (existing.length) return "saved";
    const [count] = await sql`SELECT count(*)::int AS total FROM saved_listings WHERE user_id=${userId}`;
    if (count.total >= SAVED_LIMIT) return "full";
    await sql`INSERT INTO saved_listings(user_id,listing_id) VALUES (${userId},${listingId}) ON CONFLICT DO NOTHING`;
    return "saved";
  });
}
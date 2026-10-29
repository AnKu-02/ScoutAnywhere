import { db } from "../../lib/db";

function validId(id:number){return Number.isInteger(id)&&id>0&&id<=2147483647;}

/** Internal helpers: callers must derive userId from a verified server session. */
export async function canEditAdvertiserProfile(userId:string,advertiserId:number):Promise<boolean> {
  if(!validId(advertiserId))return false;
  const rows=await db()`SELECT 1 FROM advertiser_profiles p JOIN advertisers a ON a.id=p.advertiser_id
    WHERE p.user_id=${userId} AND a.owner_user_id=${userId} AND a.id=${advertiserId} AND NOT a.is_demo AND p.status='active'`;
  return rows.length>0;
}

/** Association is not a permission. Never use this check alone for a write. */
export async function isAccountAdvertiserForListing(userId:string,listingId:number):Promise<boolean> {
  if(!validId(listingId))return false;
  const rows=await db()`SELECT 1 FROM listings l JOIN advertisers a ON a.id=l.advertiser_id
    JOIN advertiser_profiles p ON p.advertiser_id=a.id AND p.user_id=a.owner_user_id
    WHERE l.id=${listingId} AND a.owner_user_id=${userId} AND NOT a.is_demo AND NOT l.is_demo AND p.status='active'`;
  return rows.length>0;
}

// No listing-management grants or publishing workflow exist in Phase 2.3.
// Intentionally deny even when account capability or advertiser association exists.
export function canManageListing():boolean {return false;}
export function canPublishListing():boolean {return false;}
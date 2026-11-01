import { requireAccount } from "@/modules/auth/session";
import { savedListingIds } from "@/modules/saved-listings/repository";
import { getPublishedListingsByIds } from "@/modules/listings/repository";
import { AccountShell } from "@/components/account-shell";
import { WishlistCollection,WishlistRetry } from "@/components/wishlist";

export const dynamic = "force-dynamic";
export const metadata={title:"Your Wishlist",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function Page() {
  const {user}=await requireAccount();
  let listings;
  try{const ids=await savedListingIds(user.id),published=await getPublishedListingsByIds(ids),byId=new Map(published.map(listing=>[listing.id,listing]));listings=ids.flatMap(id=>byId.has(id)?[byId.get(id)!]:[]);}
  catch{return <AccountShell workspace title="Your Wishlist"><section className="panel"><p role="alert">Your Wishlist is temporarily unavailable. Please try again.</p><WishlistRetry/></section></AccountShell>;}
  return <AccountShell workspace title="Your Wishlist" description="All the places you've saved, together in one place."><p className="wishlist-visibility-note">Only currently published listings are shown. Fictional demos are labeled separately.</p><WishlistCollection listings={listings}/></AccountShell>;
}
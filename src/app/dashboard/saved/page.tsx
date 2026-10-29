import Link from "next/link";
import { requireAccount } from "@/modules/auth/session";
import { savedCollection } from "@/modules/saved-listings/repository";
import { savedPage, SAVED_PAGE_SIZE } from "@/modules/saved-listings/validation";
import { AccountNavigation } from "@/components/account-shell";
import { PropertyCard } from "@/components/property";

export const dynamic = "force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const {user}=await requireAccount();
  const page=savedPage((await searchParams).page);
  let collection;
  try{collection=await savedCollection(user.id,page);}
  catch{return <section className="container section"><h1>Saved Properties</h1><AccountNavigation/><p role="alert">Saved properties are temporarily unavailable. Please reload to try again.</p></section>;}
  const pages=Math.ceil(collection.total/SAVED_PAGE_SIZE);
  return <section className="container section"><p className="eyebrow">YOUR COLLECTION</p><h1>Saved Properties</h1><AccountNavigation/><p className="muted">Your bookmarks use current published listing information. Unpublished or removed listings are not shown. All current listings are fictional demos, not real availability.</p>
    {!collection.total?<div className="panel empty"><h2>You haven&apos;t saved any properties yet.</h2><Link className="button" href="/flatshares">Browse listings</Link></div>:<><p>{collection.total} saved {collection.total===1?"property":"properties"}</p><div className="property-grid">{collection.items.map(listing=><PropertyCard key={listing.id} listing={listing}/>)}</div>{!collection.items.length&&<p role="status">No listings on this page. Choose an earlier page.</p>}<nav className="account-links" aria-label="Saved properties pages">{page>1&&<Link href={`/dashboard/saved?page=${page-1}`}>Previous page</Link>}{page<pages&&<Link href={`/dashboard/saved?page=${page+1}`}>Next page</Link>}</nav></>}
  </section>;
}
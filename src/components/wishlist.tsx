"use client";
import Link from "next/link";
import { usePathname,useRouter,useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Heart,ArrowUpRight } from "lucide-react";
import type { Listing } from "@/modules/listings/repository";
import { SAVED_PAGE_SIZE,savedPage,wishlistCategory } from "@/modules/saved-listings/validation";
import { PropertyCard } from "./property";
const wishlistCategories=[{value:"all",label:"All"},{value:"flatshares",label:"Flatshares"},{value:"rent",label:"Apartments for Rent"},{value:"buy",label:"Apartments for Sale"}] as const;
export function WishlistCollection({listings}:{listings:Listing[]}){
  const searchParams=useSearchParams(),pathname=usePathname(),router=useRouter();
  const [pending,startTransition]=useTransition();
  const category=wishlistCategory(searchParams.get("category")),page=savedPage(searchParams.get("page"));
  const filtered=listings.filter(listing=>category==='all'||listing.category===category),pages=Math.ceil(filtered.length/SAVED_PAGE_SIZE),current=Math.min(page,Math.max(1,pages));
  function navigate(nextCategory:typeof category,nextPage:number){
    const params=new URLSearchParams(searchParams.toString());
    if(nextCategory==='all')params.delete("category");else params.set("category",nextCategory);
    if(nextPage===1)params.delete("page");else params.set("page",String(nextPage));
    const query=params.toString(),href=`${pathname}${query?`?${query}`:""}`;
    startTransition(()=>router.push(href,{scroll:false}));
  }
  return <><div className="wishlist-toolbar"><p>{listings.length} {listings.length===1?"place":"places"} in your Wishlist</p><div className="wishlist-filters" role="group" aria-label="Filter Wishlist by category" aria-busy={pending}>{wishlistCategories.map(filter=><button type="button" key={filter.value} disabled={pending} aria-pressed={category===filter.value} onClick={()=>navigate(filter.value,1)}>{filter.label}</button>)}</div></div>
    {!listings.length?<section className="panel wishlist-empty"><span className="dashboard-icon"><Heart size={28} aria-hidden="true"/></span><h2>Your Wishlist is waiting.</h2><p>Found something you like? Tap the heart on any property to keep it here.</p><Link className="button" href="/flatshares">Explore properties <ArrowUpRight size={17} aria-hidden="true"/></Link></section>:!filtered.length?<section className="panel wishlist-empty"><Heart size={26} aria-hidden="true"/><h2>No places in this category yet.</h2><p>Try another category or explore more homes.</p><button type="button" className="button secondary" disabled={pending} onClick={()=>navigate("all",1)}>Show all Wishlist</button></section>:<><p className="sr-only" role="status">{pending?"Updating Wishlist…":`${filtered.length} matching ${filtered.length===1?"place":"places"}`}</p><div className="property-grid wishlist-grid" aria-busy={pending}>{filtered.slice((current-1)*SAVED_PAGE_SIZE,current*SAVED_PAGE_SIZE).map(listing=><PropertyCard key={listing.id} listing={listing}/>)}</div>{pages>1&&<nav className="wishlist-pagination" aria-label="Wishlist pages"><button type="button" className="button secondary" disabled={pending||current===1} onClick={()=>navigate(category,current-1)}>Previous page</button><span>Page {current} of {pages}</span><button type="button" className="button secondary" disabled={pending||current===pages} onClick={()=>navigate(category,current+1)}>Next page</button></nav>}</>}
  </>;
}
export function WishlistRetry(){return <button type="button" className="button secondary" onClick={()=>window.location.reload()}>Retry Wishlist</button>;}
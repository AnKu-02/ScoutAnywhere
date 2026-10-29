import Link from "next/link";
import Image from "next/image";
import { ArrowRight, SlidersHorizontal, IndianRupee, MapPin } from "lucide-react";
import { HomeSearch } from "@/components/home-search";
import { Hero } from "@/components/hero";
import { PropertyCard } from "@/components/property";
import { DatabaseError } from "@/components/site";
import { getLocalities, searchListings } from "@/modules/listings/repository";
import { parseFilters } from "@/modules/search/filters";
export const dynamic = "force-dynamic";
export default async function Home() {
  let data;
  try { const [locations, results] = await Promise.all([getLocalities(),searchListings(parseFilters({category:"flatshares"}))]); data = {locations,results}; }
  catch (error) { console.error("Homepage database read failed", error instanceof Error ? error.message : "Unknown error"); }
  return <><Hero>{data ? <HomeSearch locations={data.locations}/> : <DatabaseError/>}</Hero>
  <section className="container section"><div className="section-heading"><div><p className="eyebrow">A LITTLE SPACE, A NEW BEGINNING</p><h2>Explore shared homes</h2><p className="muted">Private rooms in existing households. Property first, always.</p></div><Link href="/flatshares" className="text-link">See all flatshares <ArrowRight size={18} aria-hidden="true"/></Link></div>{data ? <div className="property-grid">{data.results.items.slice(0,3).map(l => <PropertyCard key={l.id} listing={l} variant="compact"/>)}</div> : <DatabaseError/>}</section>
  <section className="trust-section"><div className="container"><p className="eyebrow">LESS GUESSWORK. MORE CLARITY.</p><h2>Know what you’re looking at.</h2><div className="trust-grid"><article><IndianRupee aria-hidden="true"/><h3>The full cost, up front</h3><p>Rent, deposits, maintenance and brokerage, clearly separated.</p></article><article><SlidersHorizontal aria-hidden="true"/><h3>Your priorities, your filters</h3><p>Search by location, budget and the property details that matter.</p></article><article><MapPin aria-hidden="true"/><h3>Honest from the start</h3><p>No fabricated verification, ratings or availability. This preview uses fictional listings only.</p></article></div></div></section>
  <section className="container section"><div className="entry-panel owner-entry"><div className="owner-entry-copy"><p className="eyebrow">FOR PROPERTY OWNERS & ADVERTISERS</p><h2>A clearer way to list. Coming next.</h2><p>Property submissions aren’t open yet. See what we’re building.</p><Link href="/list-property" className="button secondary">About listing a property <ArrowRight size={17} aria-hidden="true"/></Link></div><div className="owner-entry-artwork"><Image src="/images/lavender-doorway.png" alt="Editorial illustration of a sunlit lavender doorway beside an olive plant; not a property listing." width={1672} height={941} sizes="(max-width: 700px) 100vw, 420px"/></div></div></section></>;
}
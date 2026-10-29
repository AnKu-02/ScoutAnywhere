import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { SearchForm } from "@/components/search-form";
import { PropertyCard } from "@/components/property";
import { DatabaseError, EmptyState } from "@/components/site";
import { categories, categoryLabels, PAGE_SIZE, parseFilters, type Category } from "@/modules/search/filters";
import { getLocalities, searchListings } from "@/modules/listings/repository";
export const dynamic = "force-dynamic";
type Props = { params: Promise<{category:string}>; searchParams: Promise<Record<string,string|string[]|undefined>> };
export default async function CategoryPage({ params, searchParams }: Props) {
  const {category} = await params; const raw = await searchParams;
  if (category === "search") {
    const chosen = typeof raw.category === "string" && categories.includes(raw.category as Category) ? raw.category : "flatshares";
    const q = new URLSearchParams(); for (const [k,v] of Object.entries(raw)) if (k!=="category" && typeof v === "string") q.set(k,v);
    redirect(`/${chosen}?${q}`);
  }
  if (!categories.includes(category as Category)) notFound();
  const cat = category as Category;
  let f;
  try { f = parseFilters({...raw, category:cat}); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    return <div className="container section"><h1>Check your search filters</h1><ul role="alert">{error.issues.map((e,i) => <li key={i}>{e.path.join(" ")}: {e.message}</li>)}</ul><Link className="button" href={`/${cat}`}>Reset filters</Link></div>;
  }
  let data;
  try { const [locations,results] = await Promise.all([getLocalities(),searchListings(f)]); data={locations,results}; }
  catch (error) { console.error("Search database read failed", error instanceof Error ? error.message : "Unknown error"); return <div className="container section"><DatabaseError/></div>; }
  const pages = Math.ceil(data.results.total/PAGE_SIZE);
  const pageUrl = (page: number) => { const q = new URLSearchParams(); for (const [k,v] of Object.entries(raw)) if (typeof v === "string" && k!=="category") q.set(k,v); q.set("page",String(page)); return `/${cat}?${q}`; };
  return <div className="container section"><p className="eyebrow">FIND YOUR PLACE</p><h1>{categoryLabels[cat]}</h1><p className="muted">{cat==="flatshares"?"Private rooms in existing shared homes—not a people-matching service.":"Explore properties with clearly separated costs and practical details."} All listings are fictional demos.</p><div className="search-layout"><aside aria-label="Property filters"><details className="filter-disclosure" open><summary>Refine your search</summary><SearchForm key={JSON.stringify(f)} category={cat} filters={f} locations={data.locations}/><Link className="reset-link" href={`/${cat}`}>Clear all filters</Link></details></aside><section aria-label="Search results"><div className="results-summary"><strong>{data.results.total} demo {data.results.total===1?"property":"properties"}</strong><span className="muted">{data.results.total>0?`Page ${f.page} of ${pages}`:"No matches"}</span></div>{data.results.items.length ? <div className="property-grid results-grid">{data.results.items.map(l => <PropertyCard key={l.id} listing={l}/>)}</div> : <EmptyState title={data.results.total ? "No properties on this page." : undefined}><Link className="button secondary" href={`/${cat}`}>Reset search</Link></EmptyState>}<nav className="pagination" aria-label="Results pages">{f.page>1 && <Link className="button secondary" href={pageUrl(f.page-1)}>Previous</Link>}{f.page<pages && <Link className="button secondary" href={pageUrl(f.page+1)}>Next</Link>}</nav></section></div></div>;
}
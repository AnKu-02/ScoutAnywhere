import Link from "next/link";
import { notFound } from "next/navigation";
import { Hero } from "@/components/hero";
import { HomeSearch } from "@/components/home-search";
import { Navigation, DatabaseError } from "@/components/site";
import { PropertyCard, PriceBreakdown } from "@/components/property";
import { SearchForm } from "@/components/search-form";
import { getLocalities, searchListings } from "@/modules/listings/repository";
import { parseFilters } from "@/modules/search/filters";


export const dynamic = "force-dynamic";
const themes = [
  {id:"electric-calm",name:"Electric Calm",description:"The selected working identity: Space Grotesk headings, Plus Jakarta Sans UI, violet actions and restrained lime highlights.",colors:["#F7F7F2","#17251F","#6747FF","#C7F75D","#DDE2DF"]},
];
export default async function DesignLab() {
  if (process.env.NODE_ENV !== "development") notFound();
  let data;
  try { const [locations,results]=await Promise.all([getLocalities(),searchListings(parseFilters({}))]);data={locations,results}; }
  catch { return <div className="container section"><DatabaseError/></div>; }
  return <div className="design-lab">
    <div className="container section"><p className="eyebrow">DEVELOPMENT ONLY · DESIGN LAB</p><h1>Electric Calm.<br/>The working identity.</h1><p>Reference the shared live components. These searches navigate to the marketplace; nothing is written to the database.</p><nav className="lab-links" aria-label="Design reference">{themes.map(t=><a className="button secondary" key={t.id} href={`#${t.id}`}>{t.name}</a>)}</nav></div>
    {themes.map(t=><section id={t.id} data-theme={t.id} className="theme-preview" key={t.id} aria-label={`${t.name} theme`}>
      <div className="container lab-intro"><h2>{t.name}</h2><p>{t.description}</p><ul className="swatches" aria-label="Theme palette">{t.colors.map(c=><li key={c}><span style={{background:c}} aria-hidden="true"/><code>{c}</code></li>)}</ul></div>
      <Navigation label={`${t.name} navigation`}/><Hero><HomeSearch locations={data.locations}/></Hero>
      <div className="container section"><div className="section-heading"><div><p className="eyebrow">ONE IDENTITY. SHARED COMPONENTS.</p><h2>Find a space for what’s next.</h2></div><span className="tag tag-accent">Fictional demonstration data</span></div>
        <div className="lab-components"><aside><h3>Filter controls</h3><SearchForm category="rent" locations={data.locations}/></aside><div className="lab-card"><PropertyCard listing={data.results.items[0]}/></div><div><PriceBreakdown listing={data.results.items[0]}/><div className="panel"><h3>Typography & actions</h3><p>Clear costs, practical details, a little less guesswork.</p><Link href="/rent" className="button">Explore rentals</Link><p className="muted">Demo status is expressed in words, never color alone.</p></div></div></div>
      </div>
    </section>)}
  </div>;
}
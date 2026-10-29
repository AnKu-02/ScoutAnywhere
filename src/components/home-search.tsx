"use client";

import { useId, useState } from "react";
import { SearchForm } from "./search-form";
import type { Category } from "@/modules/search/filters";

export function HomeSearch({ locations }: { locations: {city:string;locality:string}[] }) {
  const [category, setCategory] = useState<Category>("flatshares");
  const group = useId();
  return <div className="search-shell">
    <fieldset className="search-tabs"><legend className="sr-only">Search category</legend>
      {([ ["flatshares","Flatshares"], ["rent","Rent"], ["buy","Buy"] ] as const).map(([value,label]) =>
        <label key={value}><input type="radio" name={group} value={value} checked={category===value} onChange={()=>setCategory(value)}/><span>{label}</span></label>)}
    </fieldset>
    <SearchForm category={category} compact locations={locations}/>
    <p className="search-help">{category==="flatshares"?"A private room in an existing shared home.":category==="rent"?"An entire apartment or independent house to rent.":"Residential properties to make your own."} Refine budget and details in results.</p>
    <noscript><p className="search-help">Search defaults to flatshares without JavaScript. Use the main navigation for Rent and Buy.</p></noscript>
  </div>;
}
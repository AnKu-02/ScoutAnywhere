import { Search } from "lucide-react";
import { Children, cloneElement, isValidElement, useId, type ReactElement } from "react";
import { type Category, type SearchFilters } from "@/modules/search/filters";
type Location = { city: string; locality: string };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{Children.map(children, child => isValidElement(child) && ["input","select","textarea"].includes(String(child.type)) ? cloneElement(child as ReactElement<{id:string}>,{id}) : child)}</div>;
}
export function SearchForm({ category = "flatshares", filters, locations, compact = false }: { category?: Category; filters?: SearchFilters; locations: Location[]; compact?: boolean }) {
  const localityId = useId();
  const f = filters;
  const cities = [...new Set(locations.map(l => l.city))];
  const localities = [...new Set(locations.filter(l => !f?.city || l.city === f.city).map(l => l.locality))];
  return <form action={category ? `/${category}` : "/search"} method="get" className={`search-form ${compact ? "compact" : "panel"}`}>
    <Field label="City"><select name="city" defaultValue={f?.city ?? ""}><option value="">All cities</option>{cities.map(c => <option key={c}>{c}</option>)}</select></Field>
    <Field label="Locality"><input name="locality" list={localityId} placeholder="e.g. HSR Layout" defaultValue={f?.locality} maxLength={100}/><datalist id={localityId}>{localities.map(l => <option key={l} value={l}/>)}</datalist></Field>
    {!compact && <>
      <Field label={category === "buy" ? "Minimum price (₹)" : "Minimum rent (₹/month)"}><input name="minPrice" type="number" min="0" max="10000000000" placeholder="No minimum" defaultValue={f?.minPrice}/></Field>
      <Field label={category === "buy" ? "Maximum price (₹)" : "Maximum rent (₹/month)"}><input name="maxPrice" type="number" min="0" max="10000000000" placeholder="No maximum" defaultValue={f?.maxPrice}/></Field>
      {category !== "flatshares" && <Field label="BHK"><select name="bhk" defaultValue={f?.bhk ?? ""}><option value="">Any BHK</option>{[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} BHK</option>)}</select></Field>}
      <Field label="Furnishing"><select name="furnishing" defaultValue={f?.furnishing ?? ""}><option value="">Any furnishing</option><option value="furnished">Furnished</option><option value="semi-furnished">Semi-furnished</option><option value="unfurnished">Unfurnished</option></select></Field>
      <Field label={category === "flatshares" ? "Shared property type" : "Property type"}><select name="propertyType" defaultValue={f?.propertyType ?? ""}><option value="">All property types</option><option value="apartment">Apartment</option><option value="independent-house">Independent house</option></select></Field>
      <Field label="Advertised by"><select name="advertiser" defaultValue={f?.advertiser ?? ""}><option value="">Any advertiser</option><option value="owner">Owner</option><option value="broker">Broker</option>{category === "buy" && <option value="developer">Developer</option>}</select></Field>
      {category !== "buy" && <Field label="Available on or before"><input type="date" name="availableBy" defaultValue={f?.availableBy}/></Field>}
      <Field label="Sort by"><select name="sort" defaultValue={f?.sort ?? "recent"}><option value="recent">Most recently published</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option></select></Field>
      <label className="checkbox"><input type="checkbox" name="brokerageFree" value="true" defaultChecked={f?.brokerageFree === "true"}/>No brokerage only</label>
    </>}
    <button className="button" type="submit"><Search size={18} aria-hidden="true"/>{compact ? "Find a place" : "Apply filters"}</button>
  </form>;
}
import Link from "next/link";
import { notFound } from "next/navigation";
import { getListing } from "@/modules/listings/repository";
import { Amenities, AdvertiserInformation, ImageGallery, LocationInformation, PriceBreakdown } from "@/components/property";
import { DatabaseError } from "@/components/site";
import { price } from "@/lib/format";
import { SaveListingButton } from "@/components/saved-properties";
export const dynamic = "force-dynamic";
export default async function DetailPage({params}: {params:Promise<{id:string}>}) {
  const {id} = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) notFound();
  let l;
  try { l=await getListing(Number(id)); } catch (error) { console.error("Detail database read failed",error instanceof Error ? error.message : "Unknown error"); return <div className="container section"><DatabaseError/></div>; }
  if (!l) notFound();
  return <div className="container section"><Link className="text-link" href={`/${l.category}`}>← Back to properties</Link><p className="eyebrow detail-label">FICTIONAL DEMO LISTING · NOT AVAILABLE TO RENT OR BUY</p><h1>{l.title}</h1><p className="muted">{l.locality}, {l.city} · {l.property_type.replaceAll("-"," ")} · {l.furnishing.replaceAll("-"," ")}</p><SaveListingButton listingId={l.id} title={l.title}/><ImageGallery listing={l}/><div className="detail-layout"><div><section className="panel"><h2>About this {l.category==="flatshares"?"room":"home"}</h2><p>{l.description}</p><p>{l.category==="flatshares"?`Private bedroom · ${l.household_size} existing household residents`:`${l.bhk} BHK · ${l.carpet_sqft} sq ft carpet area`}</p>{l.house_rules && <><h3>House rules</h3><p>{l.house_rules}</p></>}</section><Amenities items={l.amenities}/><LocationInformation listing={l}/></div><div><section className="detail-price"><strong>{price(l.price,l.category==="buy")}</strong>{l.category!=="buy" && " / month"}</section><PriceBreakdown listing={l}/><AdvertiserInformation listing={l}/></div></div></div>;
}
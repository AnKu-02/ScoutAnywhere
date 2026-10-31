import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, BedDouble, MapPin, Check, Building2 } from "lucide-react";
import type { Listing } from "@/modules/listings/repository";
import { dateLabel, inr, price } from "@/lib/format";
import { listingIllustrations } from "./listing-imagery";
import { SaveListingButton } from "./saved-properties";
export function PropertyCard({ listing: l, variant = "full" }: { listing: Listing; variant?: "full"|"compact" }) {
  const image=listingIllustrations(l)[0];
  return <article className={`property-card property-card-${variant}`}>
    <div className="card-image"><Image src={image?.path ?? "/images/building.svg"} alt={image?.alt ?? "Property illustration"} width={image?.width ?? 800} height={image?.height ?? 520} sizes="(max-width: 700px) calc(100vw - 40px), (max-width: 1100px) 45vw, 400px"/>{!image?.path.startsWith("/images/demo/")&&<span className="image-badge">Fictional demo · Illustration</span>}</div>
    <div className="card-body">
      {image?.path.startsWith("/images/demo/")&&<p className="demo-photo-label">Fictional demo · Not real availability</p>}
      <h3><Link href={`/listings/${l.id}`}>{l.title}</Link></h3>
      <p className="location"><MapPin size={16} aria-hidden="true"/>{l.locality}, {l.city}</p>
      <p className="saved-listing-category">{l.category === "flatshares" ? "Flatshare · Private bedroom" : l.category === "rent" ? `${l.bhk} BHK · For rent` : `${l.bhk} BHK · For sale`}</p>
      <div className="card-price"><strong>{price(l.price, l.category === "buy")}</strong><span>{l.category === "buy" ? "asking price" : "/ month"}</span></div>
      <div className="card-facts"><span><BedDouble size={16} aria-hidden="true"/>{l.furnishing.replaceAll("-", " ")}</span><span>{l.category === "flatshares" ? `${l.household_size} existing residents` : `${l.carpet_sqft} sq ft carpet`}</span></div>
      {variant === "full" ? <dl className="card-costs">{l.category !== "buy" && <div><dt>Deposit</dt><dd>{inr(l.deposit ?? 0)}</dd></div>}<div><dt>Maintenance / month</dt><dd>{inr(l.maintenance)}</dd></div>{l.brokerage > 0 && <div><dt>Brokerage · one-time</dt><dd>{inr(l.brokerage)}</dd></div>}</dl> : <p className="compact-cost-note">+ {inr(l.maintenance)} maintenance / month. {l.category!=="buy" && "Deposit extra. "}Full costs in details.</p>}
      <div className="card-bottom"><span className={`tag ${l.brokerage===0?"tag-accent":""}`}>{l.brokerage===0?"No brokerage":"Brokerage applies"}</span><span className="card-action">View details <ArrowUpRight size={17} aria-hidden="true"/></span></div>
      <SaveListingButton listingId={l.id} title={l.title}/>
    </div></article>;
}
export function ImageGallery({ listing }: { listing: Listing }) {
  const images=listingIllustrations(listing);const photographs=images.some(image=>image.path.startsWith("/images/demo/"));
  return <section aria-label={photographs?"Demo property photographs":"Property illustrations"}><div className={photographs?"gallery demo-photo-gallery":"gallery"}>{images.map((im,i) => <figure key={`${im.path}-${i}`}><Image src={im.path} alt={im.alt} width={im.width} height={im.height} sizes={i===0?"(max-width: 700px) 100vw, 65vw":"(max-width: 700px) 50vw, 35vw"} priority={i===0}/><figcaption>{im.caption}</figcaption></figure>)}</div><p className="muted caption">{photographs?"Fictional demonstration imagery, not photographs of a verified available property. All listing details are fictional.":"Concept illustrations only—not property photographs. All listing details are fictional."}</p></section>;
}
export function PriceBreakdown({ listing: l }: { listing: Listing }) {
  return <section className="panel"><h2>Clear costs. No guesswork.</h2><dl className="data-list"><div><dt>{l.category === "buy" ? "Asking price" : "Monthly rent"}</dt><dd>{inr(l.price)}</dd></div>{l.category !== "buy" && <div><dt>Refundable security deposit</dt><dd>{inr(l.deposit ?? 0)}</dd></div>}<div><dt>Maintenance / month</dt><dd>{inr(l.maintenance)}</dd></div><div><dt>One-time brokerage</dt><dd>{inr(l.brokerage)}</dd></div></dl><p className="muted">Utilities are extra, billed at actuals. {l.category === "buy" && "Taxes, stamp duty and registration are not included."} Illustrative costs only.</p></section>;
}
export function LocationInformation({ listing: l }: { listing: Listing }) {
  return <section className="panel"><h2><MapPin size={20} aria-hidden="true"/>Location</h2><p>{l.building}<br/>{l.address_line}<br/>{l.locality}, {l.city} – {l.pin_code}</p><div className="map-placeholder"><MapPin size={24} aria-hidden="true"/><strong>Locality overview</strong><span>Maps are planned for a future phase.</span></div><p className="muted">Fictional address. Map and nearby-place search are not available in Phase 1.</p></section>;
}
export function Amenities({ items }: { items: string[] }) {
  return <section className="panel"><h2>Amenities</h2><ul className="amenities">{items.map(a => <li key={a}><Check size={17} aria-hidden="true"/>{a}</li>)}</ul></section>;
}
export function AdvertiserInformation({ listing: l }: { listing: Listing }) {
  return <section className="panel"><h2><Building2 size={20} aria-hidden="true"/>Advertiser</h2><p><strong>{l.advertiser}</strong> · {l.advertiser_kind}</p><p className="muted">Fictional advertiser. Identity and property ownership have not been verified. Contact and messaging are not available in this preview.</p>{l.available_from && <p>Available from {dateLabel(l.available_from)}</p>}</section>;
}
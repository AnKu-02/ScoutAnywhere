import type { Listing } from "../modules/listings/repository";

export interface Illustration { path: string; alt: string; width: number; height: number; caption: string }
const illustrations: Record<string, Illustration> = {
  bedroom: { path: "/images/lavender-bedroom-workspace.png", alt: "Fictional lavender bedroom and workspace illustration, not a property photograph", width:1536,height:1024,caption:"Bedroom concept" },
  room: { path:"/images/room.svg",alt:"Fictional bedroom concept illustration, not a property photograph",width:800,height:520,caption:"Bedroom concept" },
  living: { path:"/images/living.svg",alt:"Fictional common living area illustration, not a property photograph",width:800,height:520,caption:"Living area concept" },
  building: { path:"/images/building.svg",alt:"Fictional residential building illustration, not a property photograph",width:800,height:520,caption:"Building concept" },
};

/** Presentation only: stable across renders, never changes persisted listing images. */
export function listingIllustrations(listing: Pick<Listing,"id"|"category"|"is_demo"|"images">): Illustration[] {
  if (!listing.is_demo) return listing.images.map(image=>({...image,width:800,height:520,caption:"Property image"}));
  const options = listing.category === "flatshares" ? ["bedroom","room"] : ["living","building"];
  const first=options[Math.floor((listing.id-1)/3)%options.length];
  return [first,...["room","living","building"].filter(key=>key!==first)].slice(0,3).map(key=>illustrations[key]);
}
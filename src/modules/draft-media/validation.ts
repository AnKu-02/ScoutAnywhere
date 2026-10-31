import { z } from "zod";

export const mediaOrderSchema=z.object({version:z.number().int().positive(),ids:z.array(z.uuid()).max(12).refine(ids=>new Set(ids).size===ids.length),coverId:z.uuid().nullable()}).strict();
export const mediaDeleteSchema=z.object({version:z.number().int().positive()}).strict();
export type DraftPhoto={id:string;width:number;height:number;size:number;cover:boolean;url:string};
export type MediaCollection={version:number;images:DraftPhoto[]};
export class MediaError extends Error {
  constructor(public status:number,message:string){super(message);}
}
export function photoUrl(draftId:string,id:string){return `/api/listing-drafts/${draftId}/photos/${id}/content`;}
export const guidance={flatshares:"Bedroom, shared living area, kitchen, bathroom and balcony where available.",rent:"Living room, bedrooms, kitchen, bathrooms and the building entrance.",buy:"Living room, bedrooms, kitchen, bathrooms, exterior and additional property features."};
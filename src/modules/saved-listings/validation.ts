import { z } from "zod";
import { parseFilters,type Category } from "../search/filters";

export const listingIdSchema = z.number().int().positive().max(2147483647);
export const savedWriteSchema = z.object({ listingId: listingIdSchema }).strict();
export const SAVED_PAGE_SIZE = 12;
export const SAVED_LIMIT = 500;
export function savedPage(value: unknown): number {
  return typeof value === "string" && /^[1-9]\d{0,2}$/.test(value) ? Number(value) : 1;
}
export function wishlistCategory(value: unknown): Category|"all" {
  if(typeof value!=="string"||value==="all")return "all";
  try{return parseFilters({category:value}).category;}catch{return "all";}
}
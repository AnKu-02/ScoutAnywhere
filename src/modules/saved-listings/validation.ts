import { z } from "zod";

export const listingIdSchema = z.number().int().positive().max(2147483647);
export const savedWriteSchema = z.object({ listingId: listingIdSchema }).strict();
export const SAVED_PAGE_SIZE = 12;
export const SAVED_LIMIT = 500;
export function savedPage(value: unknown): number {
  return typeof value === "string" && /^[1-9]\d{0,2}$/.test(value) ? Number(value) : 1;
}
import { z } from "zod";
export const categories = ["flatshares", "rent", "buy"] as const;
export type Category = typeof categories[number];
export const categoryLabels: Record<Category, string> = { flatshares: "Flatshares", rent: "Apartments for rent", buy: "Homes for sale" };
const optionalNumber = (max: number) => z.preprocess(v => v === "" || v === undefined ? undefined : v, z.coerce.number().int().min(0).max(max).optional());
const text = z.string().trim().max(100).optional();
const schema = z.object({
  category: z.enum(categories).default("flatshares"), city: text, locality: text,
  minPrice: optionalNumber(10000000000), maxPrice: optionalNumber(10000000000),
  bhk: z.preprocess(v => v === "" ? undefined : v, z.coerce.number().int().min(1).max(10).optional()),
  furnishing: z.enum(["", "furnished", "semi-furnished", "unfurnished"]).optional(),
  propertyType: z.enum(["", "apartment", "independent-house"]).optional(),
  advertiser: z.enum(["", "owner", "broker", "developer"]).optional(),
  brokerageFree: z.enum(["true", "false", ""]).optional(),
  availableBy: z.union([z.literal(""), z.iso.date()]).optional(),
  sort: z.enum(["recent", "price-asc", "price-desc"]).default("recent"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
}).superRefine((v, ctx) => {
  if (v.minPrice !== undefined && v.maxPrice !== undefined && v.minPrice > v.maxPrice)
    ctx.addIssue({ code: "custom", path: ["maxPrice"], message: "Maximum price must be at least minimum price." });
});
export type SearchFilters = z.infer<typeof schema>;
/** Shared entry point for URL filters and future natural-language adapters. */
export function parseFilters(input: unknown): SearchFilters {
  const result = schema.parse(input);
  if (result.category === "flatshares") result.bhk = undefined;
  if (result.category === "buy") result.availableBy = undefined;
  return result;
}
export const PAGE_SIZE = 6;
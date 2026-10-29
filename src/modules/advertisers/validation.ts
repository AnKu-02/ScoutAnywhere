import { z } from "zod";

export const advertiserTypes = ["owner","broker","tenant"] as const;
export const operatingCities = ["Bengaluru","Mumbai"] as const;
export const advertiserTypeLabels = { owner:"Property Owner", broker:"Broker / Real Estate Agent", tenant:"Existing Flatshare Tenant" } as const;
export const advertiserProfileSchema = z.object({
  displayName:z.string().trim().min(2).max(80),
  type:z.enum(advertiserTypes),
  primaryCity:z.enum(operatingCities),
  description:z.string().trim().max(600),
}).strict();
export type AdvertiserProfileInput = z.infer<typeof advertiserProfileSchema>;
export type AdvertiserProfile = AdvertiserProfileInput & {
  advertiserId:number;
  status:"active"|"suspended";
  createdAt:string;
  updatedAt:string;
};
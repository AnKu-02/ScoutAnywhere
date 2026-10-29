import { z } from "zod";

export const avatars = ["", "/images/profile-violet.svg", "/images/profile-lime.svg"] as const;
export const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  image: z.enum(avatars),
  preferredCity: z.string().trim().max(100),
  seeking: z.boolean(), owning: z.boolean(), brokering: z.boolean(),
}).strict();
export const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80), email: z.email().max(254),
  password: z.string().min(12).max(128), callbackURL: z.literal("/verify-email").optional(),
}).strict();
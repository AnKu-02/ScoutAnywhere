import { db } from "../../lib/db";
import { profileSchema } from "./validation";

export type Preferences = { preferredCity:string; seeking:boolean; owning:boolean; brokering:boolean };
export async function preferences(userId: string): Promise<Preferences> {
  const [row] = await db()<Preferences[]>`SELECT preferred_city AS "preferredCity",seeking,owning,brokering FROM account_preferences WHERE user_id=${userId}`;
  return row ?? { preferredCity: "", seeking: true, owning: false, brokering: false };
}
export async function updateProfile(userId: string, input: unknown) {
  const data = profileSchema.parse(input);
  await db().begin(async sql => {
    const rows = await sql`UPDATE auth_user SET name=${data.displayName},image=${data.image || null},"updatedAt"=now() WHERE id=${userId} RETURNING id`;
    if (!rows.length) throw new Error("Account not found");
    await sql`INSERT INTO account_preferences(user_id,preferred_city,seeking,owning,brokering)
      VALUES (${userId},${data.preferredCity},${data.seeking},${data.owning},${data.brokering})
      ON CONFLICT(user_id) DO UPDATE SET preferred_city=excluded.preferred_city,seeking=excluded.seeking,owning=excluded.owning,brokering=excluded.brokering,updated_at=now()`;
  });
}
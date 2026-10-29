import { db } from "../../lib/db";
import { advertiserProfileSchema, type AdvertiserProfile } from "./validation";

/** Private account projection, never an addressable public advertiser directory. */
export async function advertiserProfile(userId:string):Promise<AdvertiserProfile|null> {
  const [profile]=await db()<AdvertiserProfile[]>`SELECT a.id AS "advertiserId",a.display_name AS "displayName",a.kind AS type,
    p.primary_city AS "primaryCity",p.description,p.status,p.created_at::text AS "createdAt",p.updated_at::text AS "updatedAt"
    FROM advertiser_profiles p JOIN advertisers a ON (a.id,a.owner_user_id)=(p.advertiser_id,p.user_id)
    WHERE p.user_id=${userId} AND a.owner_user_id=${userId} AND NOT a.is_demo`;
  return profile??null;
}

export type AdvertiserWriteResult = "saved"|"suspended"|"limited"|"not-found";
export async function saveAdvertiserProfile(userId:string,input:unknown):Promise<AdvertiserWriteResult> {
  const data=advertiserProfileSchema.parse(input);
  return db().begin(async sql=>{
    // One parent lock makes first-time setup, updates and rate limits safe across workers.
    const users=await sql`SELECT id FROM auth_user WHERE id=${userId} FOR UPDATE`;
    if(!users.length)return "not-found";
    const bucket=await sql`INSERT INTO advertiser_profile_write_limits(user_id,request_count) VALUES (${userId},1)
      ON CONFLICT(user_id) DO UPDATE SET
      request_count=CASE WHEN advertiser_profile_write_limits.window_started_at<=now()-interval '1 minute' THEN 1 ELSE advertiser_profile_write_limits.request_count+1 END,
      window_started_at=CASE WHEN advertiser_profile_write_limits.window_started_at<=now()-interval '1 minute' THEN now() ELSE advertiser_profile_write_limits.window_started_at END
      WHERE advertiser_profile_write_limits.window_started_at<=now()-interval '1 minute' OR advertiser_profile_write_limits.request_count<20
      RETURNING user_id`;
    if(!bucket.length)return "limited";
    const [existing]=await sql`SELECT advertiser_id,status FROM advertiser_profiles WHERE user_id=${userId} FOR UPDATE`;
    if(existing){
      if(existing.status!=="active")return "suspended";
      await sql`UPDATE advertisers SET display_name=${data.displayName},kind=${data.type}
        WHERE id=${existing.advertiser_id} AND owner_user_id=${userId} AND NOT is_demo`;
      await sql`UPDATE advertiser_profiles SET primary_city=${data.primaryCity},description=${data.description}
        WHERE advertiser_id=${existing.advertiser_id} AND user_id=${userId}`;
    }else{
      const [advertiser]=await sql`INSERT INTO advertisers(display_name,kind,is_demo,owner_user_id)
        VALUES (${data.displayName},${data.type},false,${userId}) RETURNING id`;
      await sql`INSERT INTO advertiser_profiles(advertiser_id,user_id,primary_city,description)
        VALUES (${advertiser.id},${userId},${data.primaryCity},${data.description})`;
    }
    return "saved";
  });
}
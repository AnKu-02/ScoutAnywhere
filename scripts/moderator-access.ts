import { db } from "../src/lib/db";
const [action,userId]=process.argv.slice(2);
if(!["grant","revoke"].includes(action)||!userId)throw new Error("Usage: node --env-file=.env --import tsx scripts/moderator-access.ts grant|revoke ACCOUNT_ID");
const sql=db();
try{
  await sql.begin(async tx=>{
    const [user]=await tx`SELECT id FROM auth_user WHERE id=${userId} AND "emailVerified" FOR UPDATE`;
    if(!user)throw new Error("Verified account not found");
    if(action==="grant")await tx`INSERT INTO account_capabilities(user_id,capability) VALUES (${userId},'moderator') ON CONFLICT DO NOTHING`;
    else await tx`DELETE FROM account_capabilities WHERE user_id=${userId} AND capability='moderator'`;
  });
  console.log(`Moderator access ${action==='grant'?'granted':'revoked'}.`);
}finally{await sql.end();}
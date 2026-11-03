import type postgres from "postgres";
import { db } from "../../lib/db";
import { followUpState,listingId,messageId,pageInput,propertyContext,sendInput,stateInput,type Conversation,type Message,type PropertyContext,type SendInput,type StateInput } from "./validation";

type Sql=postgres.TransactionSql;
export class MessagingError extends Error {constructor(public status:number,message:string){super(message);}}
const missing=()=>new MessagingError(404,"Conversation not found.");
async function verified(sql:Sql,userId:string){
  if(!(await sql`SELECT id FROM auth_user WHERE id=${userId} AND "emailVerified" FOR UPDATE`).length)throw new MessagingError(401,"Verified account required.");
}
async function participant(sql:Sql,userId:string,id:string){
  const [row]=await sql`SELECT * FROM conversations WHERE id=${id} AND ${userId} IN (seeker_id,advertiser_id) FOR UPDATE`;
  if(!row)throw missing();return row;
}
async function reachable(sql:Sql,id:number){
  const [row]=await sql`SELECT a.owner_user_id FROM listings l JOIN listing_publications pub ON pub.listing_id=l.id
    JOIN advertisers a ON a.id=l.advertiser_id JOIN advertiser_profiles p ON (p.advertiser_id,p.user_id)=(a.id,a.owner_user_id)
    JOIN auth_user u ON u.id=p.user_id WHERE l.id=${id} AND l.status='published' AND pub.state='published'
    AND NOT l.is_demo AND NOT a.is_demo AND p.status='active' AND u."emailVerified" FOR SHARE OF l,a,p`;
  if(!row)throw new MessagingError(409,"This listing is not available for messaging.");return String(row.owner_user_id);
}
async function budget(sql:Sql,userId:string){
  const rows=await sql`INSERT INTO messaging_write_limits(user_id) VALUES (${userId}) ON CONFLICT(user_id) DO UPDATE SET
    minute_count=CASE WHEN messaging_write_limits.minute_started<=clock_timestamp()-interval '1 minute' THEN 1 ELSE messaging_write_limits.minute_count+1 END,
    minute_started=CASE WHEN messaging_write_limits.minute_started<=clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE messaging_write_limits.minute_started END,
    day_count=CASE WHEN messaging_write_limits.day_started<=clock_timestamp()-interval '1 day' THEN 1 ELSE messaging_write_limits.day_count+1 END,
    day_started=CASE WHEN messaging_write_limits.day_started<=clock_timestamp()-interval '1 day' THEN clock_timestamp() ELSE messaging_write_limits.day_started END
    WHERE (messaging_write_limits.minute_started<=clock_timestamp()-interval '1 minute' OR messaging_write_limits.minute_count<20)
      AND (messaging_write_limits.day_started<=clock_timestamp()-interval '1 day' OR messaging_write_limits.day_count<200) RETURNING user_id`;
  if(!rows.length)throw new MessagingError(429,"Sending limit reached. Please try again later.");
}
export async function sendMessage(userId:string,input:SendInput){
  const value=sendInput.parse(input);
  return db().begin(async sql=>{
    await verified(sql,userId);
    const [prior]=await sql`SELECT m.id::text,m.body,c.id AS conversation_id,c.listing_id FROM conversation_messages m JOIN conversations c ON c.id=m.conversation_id WHERE m.sender_id=${userId} AND m.request_id=${value.requestId}`;
    if(prior){
      if(prior.body!==value.text||('listingId' in value?prior.listing_id!==value.listingId:prior.conversation_id!==value.conversationId))throw new MessagingError(409,"This send request was already used for another message.");
      return {conversationId:String(prior.conversation_id),messageId:String(prior.id)};
    }
    // Resolve target before locking conversation: all writers lock listing before conversation.
    let target:number;
    if('listingId' in value)target=value.listingId;
    else{const [c]=await sql`SELECT listing_id FROM conversations WHERE id=${value.conversationId} AND ${userId} IN (seeker_id,advertiser_id)`;if(!c)throw missing();target=c.listing_id;}
    const advertiser=await reachable(sql,target);
    if('listingId' in value&&advertiser===userId)throw new MessagingError(403,"You cannot contact yourself about your listing.");
    await budget(sql,userId);
    let id:string;
    if('listingId' in value){
      const [c]=await sql`INSERT INTO conversations(listing_id,seeker_id,advertiser_id) VALUES (${target},${userId},${advertiser}) ON CONFLICT(listing_id,seeker_id) DO UPDATE SET latest_activity_at=conversations.latest_activity_at RETURNING id`;
      id=c.id;
      await sql`INSERT INTO conversation_participants(conversation_id,user_id) VALUES (${id},${userId}),(${id},${advertiser}) ON CONFLICT DO NOTHING`;
    }else id=value.conversationId;
    const c=await participant(sql,userId,id);
    if(c.advertiser_id!==advertiser)throw new MessagingError(409,"Advertiser messaging is unavailable.");
    const [m]=await sql`INSERT INTO conversation_messages(conversation_id,sender_id,request_id,body) VALUES (${id},${userId},${value.requestId},${value.text}) RETURNING id::text,created_at`;
    await sql`UPDATE conversations SET latest_activity_at=${m.created_at} WHERE id=${id}`;
    return {conversationId:id,messageId:String(m.id)};
  });
}
function projection(userId:string){
  const sql=db();
  return sql`SELECT c.id,c.listing_id,c.seeker_id,other.name AS other_name,
    latest.body AS latest_text,latest.created_at::text AS latest_at,
    EXISTS(SELECT 1 FROM conversation_messages m WHERE m.conversation_id=c.id AND m.sender_id<>${userId} AND m.id>state.read_through) AS unread,
    first_unanswered.id::text AS exchange,first_unanswered.created_at::text AS unanswered_at,state.dismissed_exchange::text,clock_timestamp()::text AS server_now,
    (l.status='published' AND pub.state='published') AS available,
    (l.status='published' AND pub.state='published' AND profile.status='active' AND advertiser."emailVerified" AND a.owner_user_id=c.advertiser_id) AS can_send,
    CASE WHEN l.status='published' AND pub.state='published' THEN json_build_object('id',l.id,'title',l.title,'locality',loc.locality,'city',city.name,'price',l.price::float8,'category',l.category,
      'image',(SELECT im.path FROM property_images im WHERE im.property_id=unit.property_id AND (im.unit_id IS NULL OR im.unit_id=unit.id) ORDER BY im.is_cover DESC,im.sort_order,im.id LIMIT 1)) ELSE NULL END AS property
    FROM conversations c JOIN conversation_participants state ON state.conversation_id=c.id AND state.user_id=${userId}
    JOIN auth_user other ON other.id=CASE WHEN c.seeker_id=${userId} THEN c.advertiser_id ELSE c.seeker_id END
    JOIN listings l ON l.id=c.listing_id JOIN listing_publications pub ON pub.listing_id=l.id
    JOIN advertisers a ON a.id=l.advertiser_id LEFT JOIN advertiser_profiles profile ON profile.advertiser_id=a.id
    JOIN auth_user advertiser ON advertiser.id=c.advertiser_id
    JOIN units unit ON unit.id=l.unit_id JOIN properties prop ON prop.id=unit.property_id JOIN locations loc ON loc.id=prop.location_id JOIN cities city ON city.id=loc.city_id
    JOIN LATERAL (SELECT body,created_at FROM conversation_messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) latest ON true
    LEFT JOIN LATERAL (SELECT id,created_at FROM conversation_messages m WHERE m.conversation_id=c.id AND m.sender_id=c.seeker_id AND m.id>COALESCE((SELECT max(reply.id) FROM conversation_messages reply WHERE reply.conversation_id=c.id AND reply.sender_id=c.advertiser_id),0) ORDER BY id LIMIT 1) first_unanswered ON true`;
}
function project(row:Record<string,unknown>,userId:string):Conversation{
  const state=followUpState(row.seeker_id===userId,row.exchange as string|null,row.unanswered_at as string|null,row.dismissed_exchange as string|null,String(row.server_now));
  return {id:String(row.id),listingId:Number(row.listing_id),otherName:String(row.other_name),property:propertyContext(Boolean(row.available),row.property as PropertyContext|null),canSend:Boolean(row.can_send),latestText:String(row.latest_text).slice(0,160),latestAt:String(row.latest_at),unread:Boolean(row.unread),...state,followUp:state.followUp&&Boolean(row.can_send),exchange:row.seeker_id===userId?row.exchange as string|null:null};
}
export async function conversations(userId:string,page=1,unread=false){
  pageInput.parse(page);const sql=db();
  const rows=await sql`${projection(userId)} WHERE ${userId} IN (c.seeker_id,c.advertiser_id)
    ${unread?sql`AND EXISTS(SELECT 1 FROM conversation_messages m WHERE m.conversation_id=c.id AND m.sender_id<>${userId} AND m.id>state.read_through)`:sql``}
    ORDER BY c.latest_activity_at DESC,c.id DESC LIMIT 21 OFFSET ${(page-1)*20}`;
  return {items:rows.slice(0,20).map(row=>project(row,userId)),hasMore:rows.length>20};
}
export async function conversation(userId:string,id:string,before?:string){
  if(before)messageId.parse(before);const sql=db();
  const [row]=await sql`${projection(userId)} WHERE c.id=${id} AND ${userId} IN (c.seeker_id,c.advertiser_id)`;
  if(!row)throw missing();
  const rows=await sql`SELECT m.id::text,m.body,m.sender_id,m.created_at::text,u.name FROM conversation_messages m JOIN auth_user u ON u.id=m.sender_id WHERE m.conversation_id=${id} ${before?sql`AND m.id<${before}::bigint`:sql``} ORDER BY m.id DESC LIMIT 51`;
  const messages:Message[]=rows.slice(0,50).reverse().map(m=>({id:String(m.id),text:String(m.body),mine:m.sender_id===userId,createdAt:String(m.created_at),sender:String(m.name)}));
  return {conversation:project(row,userId),messages,hasMore:rows.length>50};
}
export async function updateConversationState(userId:string,id:string,input:StateInput){
  const value=stateInput.parse(input);
  return db().begin(async sql=>{
    const c=await participant(sql,userId,id);
    if(value.action==='read'){
      if(!(await sql`SELECT 1 FROM conversation_messages WHERE conversation_id=${id} AND id=${value.through}::bigint`).length)throw missing();
      await sql`UPDATE conversation_participants SET read_through=greatest(read_through,${value.through}::bigint) WHERE conversation_id=${id} AND user_id=${userId}`;
    }else{
      if(c.seeker_id!==userId)throw missing();
      const [first]=await sql`SELECT id::text FROM conversation_messages WHERE conversation_id=${id} AND sender_id=${userId} AND id>COALESCE((SELECT max(id) FROM conversation_messages WHERE conversation_id=${id} AND sender_id=${c.advertiser_id}),0) ORDER BY id LIMIT 1`;
      if(first?.id!==value.exchange)throw new MessagingError(409,"This unanswered exchange has changed. Refresh Messages.");
      await sql`UPDATE conversation_participants SET dismissed_exchange=${value.exchange}::bigint WHERE conversation_id=${id} AND user_id=${userId}`;
    }
    return {ok:true};
  });
}
/** Public CTA eligibility contains no account IDs or contact details. No writes. */
export async function contactTarget(inputId:number,userId?:string){
  listingId.parse(inputId);const sql=db();
  const [row]=await sql`SELECT a.owner_user_id FROM listings l JOIN listing_publications pub ON pub.listing_id=l.id JOIN advertisers a ON a.id=l.advertiser_id JOIN advertiser_profiles p ON (p.advertiser_id,p.user_id)=(a.id,a.owner_user_id) JOIN auth_user u ON u.id=p.user_id WHERE l.id=${inputId} AND l.status='published' AND pub.state='published' AND NOT l.is_demo AND NOT a.is_demo AND p.status='active' AND u."emailVerified"`;
  if(!row)return {eligible:false,own:false,conversationId:null};
  const existing=userId?await sql`SELECT id FROM conversations WHERE listing_id=${inputId} AND seeker_id=${userId}`:[];
  return {eligible:true,own:row.owner_user_id===userId,conversationId:existing[0]?.id as string|undefined??null};
}
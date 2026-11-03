import { z } from "zod";

export const listingId = z.number().int().min(1).max(2147483647);
export const messageId = z.string().refine(value=>/^[1-9]\d{0,18}$/.test(value)&&BigInt(value)<=9223372036854775807n);
const message = { requestId:z.uuid(), text:z.string().trim().min(1).max(4000) };
export const sendInput = z.union([
  z.object({listingId,...message}).strict(),
  z.object({conversationId:z.uuid(),...message}).strict(),
]);
export const stateInput = z.discriminatedUnion("action",[
  z.object({action:z.literal("read"),through:messageId}).strict(),
  z.object({action:z.literal("dismiss"),exchange:messageId}).strict(),
]);
export const pageInput=z.coerce.number().int().min(1).max(1000);
export type SendInput=z.infer<typeof sendInput>;
export type StateInput=z.infer<typeof stateInput>;
export type PropertyContext={id:number;title:string;locality:string;city:string;price:number;category:"flatshares"|"rent"|"buy";image:string|null};
export type Message={id:string;text:string;mine:boolean;createdAt:string;sender:string};
export type Conversation={id:string;listingId:number;otherName:string;property:PropertyContext|null;canSend:boolean;latestText:string;latestAt:string;unread:boolean;waiting:boolean;followUp:boolean;exchange:string|null};
export function followUpState(isSeeker:boolean,exchange:string|null,unansweredAt:string|null,dismissed:string|null,serverNow:string){
  const waiting=isSeeker&&exchange!==null;
  return {waiting,followUp:waiting&&unansweredAt!==null&&exchange!==dismissed&&new Date(serverNow).getTime()-new Date(unansweredAt).getTime()>=48*60*60*1000};
}
/** Never retain public context when the advertisement is no longer public. */
export function propertyContext(available:boolean,context:PropertyContext|null){return available?context:null;}
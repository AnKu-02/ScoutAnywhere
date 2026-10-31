import {draftContentSchema,type DraftContent} from "./validation";
function canonical(value:unknown):string{
  if(Array.isArray(value))return JSON.stringify([...value].sort());
  if(value!==null&&typeof value==="object")return `{${Object.entries(value).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Compare persisted semantics, including trimmed text and unordered amenities. */
export function sameDraftContent(left:DraftContent,right:DraftContent):boolean{
  const normalize=(value:DraftContent)=>{const parsed=draftContentSchema.safeParse(value);return canonical(parsed.success?parsed.data:value);};
  return normalize(left)===normalize(right);
}
export function draftFieldId(field:string){return `draft-${field.replaceAll(".","-")}`;}
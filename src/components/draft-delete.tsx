"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function DraftDelete({id,version,title}:{id:string;version:number;title:string}){
  const router=useRouter();const lock=useRef(false);
  const [confirm,setConfirm]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  return <div>{!confirm?<button className="button secondary" onClick={()=>setConfirm(true)} aria-label={`Delete draft: ${title}`}>Delete</button>
    :<div role="group" aria-label={`Confirm deletion: ${title}`}><p>Delete this private draft? This cannot be undone.</p><button className="button secondary" disabled={busy} onClick={()=>{setConfirm(false);setMessage("");}}>Cancel</button>{" "}<button className="button" disabled={busy} onClick={async()=>{
      if(lock.current)return;lock.current=true;setBusy(true);setMessage("");
      try{
        const response=await fetch(`/api/listing-drafts/${id}`,{method:"DELETE",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({version})});
        const result=await response.json();if(!response.ok)throw new Error(result.message??"Could not delete this draft.");
        router.refresh();
      }catch(error){setMessage(error instanceof Error?error.message:"Could not delete. Please try again.");}
      finally{lock.current=false;setBusy(false);}
    }}>{busy?"Deleting…":"Delete permanently"}</button></div>}
    {message&&<p role="alert">{message}</p>}
  </div>;
}
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Heart } from "lucide-react";

type SavedState = {authenticated:boolean; ids:number[]};
type SavedContextValue = {state:SavedState|null; error:boolean; pending:Set<number>; reload:()=>void; change:(id:number)=>Promise<string|null>};
const SavedContext = createContext<SavedContextValue|null>(null);

export function SavedPropertiesProvider({children}:{children:React.ReactNode}) {
  const [state,setState]=useState<SavedState|null>(null);
  const stateRef=useRef<SavedState|null>(null);
  const [error,setError]=useState(false);
  const [pending,setPending]=useState(new Set<number>());
  const locks=useRef(new Set<number>());
  const version=useRef(0);
  const router=useRouter();const pathname=usePathname();
  const channel=useRef<BroadcastChannel|null>(null);
  const reload=useCallback(()=>{
    const revision=++version.current;
    fetch("/api/saved-listings",{cache:"no-store"}).then(async response=>{
      if(!response.ok)throw new Error();
      const next:SavedState=await response.json();
      if(revision===version.current){stateRef.current=next;setState(next);setError(false);}
    }).catch(()=>{if(revision===version.current)setError(true);});
  },[]);
  useEffect(()=>{reload();},[pathname,reload]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==="visible")reload();};
    document.addEventListener("visibilitychange",refresh);
    if(typeof BroadcastChannel!=="undefined"){
      channel.current=new BroadcastChannel("scout-saved-properties");
      channel.current.onmessage=()=>{reload();router.refresh();};
    }
    return()=>{document.removeEventListener("visibilitychange",refresh);channel.current?.close();};
  },[reload,router]);
  async function change(id:number):Promise<string|null> {
    if(locks.current.has(id))return null;
    if(!stateRef.current?.authenticated){router.push(`/sign-in?next=${encodeURIComponent(`/listings/${id}`)}`);return null;}
    locks.current.add(id);setPending(new Set(locks.current));++version.current;
    const saved=!stateRef.current.ids.includes(id);
    try{
      const response=await fetch("/api/saved-listings",{method:saved?"PUT":"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({listingId:id})});
      if(response.status===401){stateRef.current=null;setState(null);router.push(`/sign-in?next=${encodeURIComponent(`/listings/${id}`)}`);return null;}
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||"Could not update. Try again.");
      const current=stateRef.current!;
      const next={...current,ids:data.saved?[...new Set([...current.ids,id])]:current.ids.filter(value=>value!==id)};
      stateRef.current=next;setState(next);setError(false);
      channel.current?.postMessage("changed");
      if(pathname.startsWith("/dashboard"))router.refresh();
      return data.saved?"Added to Wishlist.":"Removed from Wishlist.";
    }catch(error){return error instanceof Error?error.message:"Could not update. Try again.";}
    finally{locks.current.delete(id);setPending(new Set(locks.current));reload();}
  }
  return <SavedContext.Provider value={{state,error,pending,reload,change}}>{children}</SavedContext.Provider>;
}

export function SaveListingButton({listingId,title,compact=false}:{listingId:number;title:string;compact?:boolean}) {
  const context=useContext(SavedContext);
  const [message,setMessage]=useState("");
  if(!context)return null;
  const saved=context.state?.ids.includes(listingId)??false;
  const pending=context.pending.has(listingId);
  const label=saved?"Remove from Wishlist":"Add to Wishlist";
  return <div className={`save-control ${compact?"save-control-compact":""}`}><button type="button" className={`save-button ${saved?"is-saved":""}`} aria-label={`${label}: ${title}`} title={label} aria-pressed={saved} aria-busy={pending} disabled={pending||(!context.state&&!context.error)} onClick={async()=>{
    if(context.error){context.reload();setMessage("Refreshing Wishlist status. Please try again.");return;}
    setMessage("");const result=await context.change(listingId);if(result)setMessage(result);
  }}><Heart size={20} fill={saved?"currentColor":"none"} aria-hidden="true"/><span className={compact?"sr-only":undefined}>{pending?"Updating…":context.error?"Retry Wishlist status":saved?"Wishlisted":"Add to Wishlist"}</span></button>{(message||context.error)&&<span className="save-feedback" role="status" aria-live="polite">{message||"Wishlist status could not be loaded. Retry to continue."}</span>}</div>;
}
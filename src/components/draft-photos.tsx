"use client";

import { useEffect,useRef,useState } from "react";
import { Upload,Check,ArrowLeft,ArrowRight,Trash2,ImagePlus } from "lucide-react";
import { guidance,type MediaCollection,type DraftPhoto } from "@/modules/draft-media/validation";

// Intentionally not next/image: private bytes must not enter a shared optimizer cache.
export function PrivatePhoto({photo,alt,...props}:{photo:DraftPhoto;alt:string;className?:string}){
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={photo.url} alt={alt} width={photo.width} height={photo.height} loading="lazy" referrerPolicy="no-referrer" {...props}/>;
}
type Upload={id:string;file:File;progress:number;state:"queued"|"uploading"|"done"|"failed";message:string};
export function DraftPhotos({draftId,category}:{draftId:string;category:"flatshares"|"rent"|"buy"}){
  const [collection,setCollection]=useState<MediaCollection>({version:1,images:[]});
  const [uploads,setUploads]=useState<Upload[]>([]);const [message,setMessage]=useState("");const [messageFailed,setMessageFailed]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [busy,setBusy]=useState(false);const [confirm,setConfirm]=useState<string|null>(null);
  const lock=useRef(false);const mounted=useRef(true);const requests=useRef(new Set<XMLHttpRequest>());
  const url=`/api/listing-drafts/${draftId}/photos`;
  useEffect(()=>{
    mounted.current=true;const controller=new AbortController();
    fetch(url,{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.message);if(mounted.current)setCollection(data);}).catch(error=>{if(mounted.current&&!controller.signal.aborted)setMessage(error instanceof Error?error.message:"Could not load photographs.");});
    const active=requests.current;
    return ()=>{mounted.current=false;controller.abort();for(const request of active)request.abort();};
  },[url]);
  function updateUpload(id:string,patch:Partial<Upload>){if(mounted.current)setUploads(previous=>previous.map(item=>item.id===id?{...item,...patch}:item));}
  function send(item:Upload):Promise<void>{
    updateUpload(item.id,{state:"uploading",progress:0,message:"Uploading…"});
    return new Promise(resolve=>{
      const request=new XMLHttpRequest();requests.current.add(request);
      request.open("POST",url);request.timeout=65000;request.withCredentials=true;
      request.setRequestHeader("Content-Type","application/octet-stream");request.setRequestHeader("Idempotency-Key",item.id);
      request.upload.onprogress=event=>{if(event.lengthComputable)updateUpload(item.id,{progress:Math.round(event.loaded/event.total*100),message:event.loaded===event.total?"Processing securely…":"Uploading…"});};
      const finish=(error?:string)=>{requests.current.delete(request);if(error)updateUpload(item.id,{state:"failed",message:error});resolve();};
      request.onload=()=>{
        try{const data=JSON.parse(request.responseText);if(request.status<200||request.status>=300){finish(data.message||"Upload failed. Retry shortly.");return;}
          if(mounted.current)setCollection(data);updateUpload(item.id,{state:"done",progress:100,message:"Uploaded privately"});finish();
        }catch{finish("Upload response was interrupted. Retry to check the same request.");}
      };
      request.onerror=()=>finish("Connection failed. Retry to check the same upload.");request.ontimeout=()=>finish("Upload timed out. Retry shortly.");request.onabort=()=>finish("Upload interrupted.");
      request.send(item.file);
    });
  }
  async function accept(files:File[]){
    if(lock.current)return;
    const chosen=files.slice(0,12);
    if(files.length>12||collection.images.length+chosen.length>12){setMessageFailed(true);setMessage("A draft can have at most 12 photographs. Select fewer files.");return;}
    const items=chosen.map(file=>({id:crypto.randomUUID(),file,progress:0,state:"queued" as const,message:"Waiting"}));
    setUploads(previous=>[...previous.filter(item=>item.state!=="done"),...items]);setMessage("");
    lock.current=true;setBusy(true);
    try{for(const item of items){if(!mounted.current)break;if(item.file.size>10485760){updateUpload(item.id,{state:"failed",message:"File exceeds 10 MB. Choose a smaller photograph."});continue;}await send(item);}}
    finally{lock.current=false;if(mounted.current)setBusy(false);}
  }
  async function manage(method:string,body:object,id?:string){
    if(lock.current)return;lock.current=true;setBusy(true);setMessageFailed(false);setMessage("");
    try{const response=await fetch(id?`${url}/${id}`:url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body),credentials:"same-origin"});const data=await response.json();
      if(!response.ok)throw new Error(data.message||"Could not update photographs.");setCollection(data);setConfirm(null);setMessage("Photographs saved privately.");
    }catch(error){setMessageFailed(true);setMessage(error instanceof Error?error.message:"Could not update photographs.");}
    finally{lock.current=false;setBusy(false);}
  }
  function arrange(ids:string[],coverId:string|null){return manage("PUT",{version:collection.version,ids,coverId});}
  const ids=collection.images.map(photo=>photo.id),cover=collection.images.find(photo=>photo.cover)?.id??null;
  return <section id="draft-photos" tabIndex={-1} className="photo-section" aria-labelledby="photos-heading"><div className="photo-heading"><h2 id="photos-heading">5. Photos</h2><span className="photo-private">Private draft</span></div><p>Photos save automatically. Save listing text separately.</p><p className="muted">Only you can see these photos. Self-supplied, not independently verified.</p>
    <div className={`photo-drop${dragging&&!busy?" is-dragging":""}`} onDragEnter={event=>{event.preventDefault();setDragging(true);}} onDragLeave={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setDragging(false);}} onDragOver={event=>{event.preventDefault();event.dataTransfer.dropEffect=busy?"none":"copy";}} onDrop={event=>{event.preventDefault();setDragging(false);void accept(Array.from(event.dataTransfer.files));}}>
      <span className="photo-upload-icon"><Upload size={26} aria-hidden="true"/></span>
      <h3>Add a little more of your home</h3><p>Drag photos here, or choose files from your device.</p>
      <label className={`photo-picker button${busy?" is-disabled":""}`}><ImagePlus size={18} aria-hidden="true"/><span>Add photos</span><input type="file" aria-label="Choose property photographs" aria-describedby="photo-formats" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event=>{void accept(Array.from(event.target.files||[]));event.target.value="";}}/></label>
      <p id="photo-formats" className="muted">JPEG, PNG or WebP · Up to 12 photos · 10 MB each</p>
      <p className="photo-phone-help">HEIC/iPhone HEIF? Export as JPEG first. No animated images.</p>
    </div>
    <details className="photo-tips"><summary>Photo tips and image limits</summary><p>Suggested views: {guidance[category]}</p><p>Maximum 12,000 pixels on either side and 40 megapixels. Avoid people, documents, contact details and sensitive belongings.</p></details>
    {uploads.length>0&&<ul className="upload-list" aria-label="Upload progress">{uploads.map(item=><li className={`upload-${item.state}`} key={item.id}><div className="upload-status">{item.state==="done"&&<Check size={16} aria-hidden="true"/>}<strong>{item.file.name}</strong><span role="status">{item.message}</span></div>{item.state==="uploading"&&<progress max={100} value={item.progress} aria-label={`Upload progress: ${item.file.name}`}/>}{item.state==="failed"&&<button className="button secondary" disabled={busy} onClick={async()=>{
      if(lock.current)return;lock.current=true;setBusy(true);try{await send(item);}finally{lock.current=false;setBusy(false);}
    }}>Retry {item.file.name}</button>}{item.state==="failed"&&<button className="button secondary" disabled={busy} onClick={()=>{setUploads(previous=>previous.filter(old=>old.id!==item.id));void accept([item.file]);}}>Upload again with a new request</button>}</li>)}</ul>}
    <p className="photo-count">{collection.images.length} {collection.images.length===1?"photo":"photos"} saved</p>
    {!collection.images.length&&<p className="photo-empty">No photos yet. Start with your favourite view.</p>}
    <div className="photo-grid">{collection.images.map((photo,index)=><article className={`photo-card${photo.cover?" is-cover":""}`} key={photo.id}><div className="photo-thumbnail"><PrivatePhoto photo={photo} alt={`Property photograph ${index+1}${photo.cover?", cover":""}`}/>{photo.cover&&<span className="photo-cover-badge"><Check size={14} aria-hidden="true"/>Cover photograph</span>}</div><p className="photo-card-title">Photo {index+1}</p><div className="photo-actions">
      <button className="button secondary" disabled={busy||photo.cover} onClick={()=>void arrange(ids,photo.id)} aria-label={`Use photograph ${index+1} as cover`}>{photo.cover?<><Check size={14} aria-hidden="true"/>Cover selected</>:"Set as cover"}</button>
      <button className="button secondary" disabled={busy||index===0} onClick={()=>{const next=[...ids];[next[index-1],next[index]]=[next[index],next[index-1]];void arrange(next,cover);}} aria-label={`Move photograph ${index+1} earlier`}><ArrowLeft size={16} aria-hidden="true"/>Earlier</button>
      <button className="button secondary" disabled={busy||index===ids.length-1} onClick={()=>{const next=[...ids];[next[index],next[index+1]]=[next[index+1],next[index]];void arrange(next,cover);}} aria-label={`Move photograph ${index+1} later`}><ArrowRight size={16} aria-hidden="true"/>Later</button>
      <button className="button secondary" disabled={busy} onClick={()=>setConfirm(photo.id)} aria-label={`Delete photograph ${index+1}`}><Trash2 size={15} aria-hidden="true"/>Delete</button>
    </div>{confirm===photo.id&&<div className="photo-delete-confirm" role="group" aria-label="Confirm photograph deletion"><p>Delete this photograph permanently?</p><button className="button secondary" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</button>{" "}<button className="button" disabled={busy} onClick={()=>void manage("DELETE",{version:collection.version},photo.id)}>Delete photograph permanently</button></div>}</article>)}</div>
    {message&&<p className={messageFailed?"notice":"photo-save-feedback"} role="status">{!messageFailed&&<Check size={16} aria-hidden="true"/>}{message}</p>}
    <button className="button secondary" disabled={busy} onClick={async()=>{try{const response=await fetch(url,{cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.message);setCollection(data);setMessageFailed(false);setMessage("Saved photographs reloaded.");}catch(error){setMessageFailed(true);setMessage(error instanceof Error?error.message:"Reload failed.");}}}>Reload photographs</button>
  </section>;
}
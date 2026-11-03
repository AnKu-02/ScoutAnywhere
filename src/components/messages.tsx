"use client";
/* Public photographs deliberately bypass next/image: publication delivery rechecks visibility. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback,useEffect,useRef,useState } from "react";
import { price } from "@/lib/format";
import type { Conversation,Message,PropertyContext } from "@/modules/messaging/validation";

type Detail={conversation:Conversation;messages:Message[];hasMore:boolean};
async function api<T>(path:string,method='GET',body?:object):Promise<T>{
  const response=await fetch(path,{method,cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const value=await response.json();if(!response.ok)throw new Error(value.message??'Messages are unavailable. Please retry.');return value;
}
function Time({value}:{value:string}){return <time dateTime={value}>{new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value))}</time>;}
function Property({value}:{value:PropertyContext|null}){
  if(!value)return <div className="message-property"><span className="message-thumbnail" aria-hidden="true">—</span><div><strong>Listing no longer available</strong><p className="muted">History remains private. New messages are paused.</p></div></div>;
  return <div className="message-property">{value.image?<img className="message-thumbnail" src={value.image} alt="Property cover" loading="lazy" referrerPolicy="no-referrer"/>:<span className="message-thumbnail" aria-hidden="true">⌂</span>}<div><Link href={`/listings/${value.id}`}>{value.title}</Link><p>{value.locality}, {value.city}</p><strong>{price(value.price,value.category==='buy')}{value.category!=='buy'?' / month':''}</strong><small>Public listing · availability not independently verified</small></div></div>;
}
export function Messages({selectedId,draft,initialError}:{selectedId:string|null;draft:PropertyContext|null;initialError:string}){
  const router=useRouter();
  const [items,setItems]=useState<Conversation[]>([]),[detail,setDetail]=useState<Detail|null>(null);
  const [filter,setFilter]=useState('all'),[page,setPage]=useState(1),[more,setMore]=useState(false);
  const [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(Boolean(selectedId)),[error,setError]=useState(initialError),[busy,setBusy]=useState(false),[text,setText]=useState('');
  const [notice,setNotice]=useState(''),[retrying,setRetrying]=useState(false);
  // A failed/ambiguous send retains the same immutable payload and idempotency key.
  const pending=useRef<{requestId:string;text:string}|null>(null),sending=useRef(false);
  const loadList=useCallback(async()=>{
    try{const value=await api<{items:Conversation[];hasMore:boolean}>(`/api/messages?page=${page}&filter=${filter}`);setItems(value.items);setMore(value.hasMore);}catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[filter,page]);
  const loadDetail=useCallback(async()=>{
    if(!selectedId)return;
    try{
      const value=await api<Detail>(`/api/messages/${selectedId}`);setDetail(value);
      const latest=value.messages.at(-1);
      // Never mark unseen later messages read, or read a background tab.
      if(latest&&document.visibilityState==='visible'){
        await api(`/api/messages/${selectedId}`,'PATCH',{action:'read',through:latest.id});
        await loadList();
      }
    }catch(e){setError((e as Error).message);}finally{setDetailLoading(false);}
  },[selectedId,loadList]);
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/messages?page=${page}&filter=${filter}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.message);return value;}).then(value=>{setItems(value.items);setMore(value.hasMore);setLoading(false);}).catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});return ()=>controller.abort();},[filter,page]);
  useEffect(()=>{
    if(!selectedId)return;
    const controller=new AbortController();
    void fetch(`/api/messages/${selectedId}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const value=await response.json();if(!response.ok)throw new Error(value.message);return value as Detail;}).then(async value=>{
      setDetail(value);setDetailLoading(false);
      const latest=value.messages.at(-1);
      if(latest&&document.visibilityState==='visible'&&!controller.signal.aborted){await api(`/api/messages/${selectedId}`,'PATCH',{action:'read',through:latest.id});await loadList();}
    }).catch(e=>{if(!controller.signal.aborted){setError(e.message);setDetailLoading(false);}});
    return ()=>controller.abort();
  },[selectedId,loadList]);
  async function refresh(){setError('');await Promise.all([loadList(),loadDetail()]);}
  async function send(event:React.FormEvent){
    event.preventDefault();if(sending.current||!text.trim())return;
    sending.current=true;setBusy(true);setError('');setNotice('');
    pending.current??={requestId:crypto.randomUUID(),text:text.trim()};
    try{
      const result=await api<{conversationId:string}>('/api/messages','POST',{...pending.current,...(selectedId?{conversationId:selectedId}:{listingId:draft!.id})});
      pending.current=null;setRetrying(false);setText('');setNotice('Message sent.');
      if(!selectedId){router.push(`/dashboard/messages?conversation=${result.conversationId}`);return;}
      await refresh();
    }catch(e){setRetrying(true);setError((e as Error).message);}finally{sending.current=false;setBusy(false);}
  }
  async function older(){
    if(!detail?.messages[0]||!selectedId)return;setBusy(true);
    try{const value=await api<Detail>(`/api/messages/${selectedId}?before=${detail.messages[0].id}`);setDetail({...value,messages:[...value.messages,...detail.messages]});}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function dismiss(c:Conversation){
    setBusy(true);setError('');try{await api(`/api/messages/${c.id}`,'PATCH',{action:'dismiss',exchange:c.exchange});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  const active=Boolean(selectedId||draft),context=detail?.conversation.property??draft,c=detail?.conversation;
  return <div className={`messages-workspace ${active?'has-conversation':''}`}>
    <div className="messages-toolbar"><div className="wishlist-filters" aria-label="Message filters">{['all','unread'].map(value=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>{setFilter(value);setPage(1);}}>{value==='all'?'All':'Unread'}</button>)}</div><button className="button secondary" onClick={refresh} disabled={busy}>Refresh messages</button></div>
    {error&&<p role="alert" className="notice">{error}</p>}
    <div className="messages-columns"><section className="conversation-list" aria-label="Conversations" aria-busy={loading}>
      {loading?<p role="status">Loading conversations…</p>:!items.length?<div className="messages-empty"><h2>{filter==='unread'?'All caught up':'No conversations yet'}</h2><p>{filter==='unread'?'No unread conversations.':'Contact an advertiser from a published listing to start a conversation.'}</p><Link href="/rent">Explore properties</Link></div>:items.map(item=><article key={item.id} className="conversation-row" data-selected={item.id===selectedId}>
        <Link className="conversation-open" href={`/dashboard/messages?conversation=${item.id}`} aria-current={item.id===selectedId?'page':undefined}>
          {item.property?.image?<img className="message-thumbnail" src={item.property.image} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="message-thumbnail" aria-hidden="true">⌂</span>}
          <div><strong>{item.property?.title??'Listing no longer available'}</strong>{item.property&&<small>{item.property.locality}, {item.property.city} · {price(item.property.price,item.property.category==='buy')}{item.property.category!=='buy'?' / month':''}</small>}<span>{item.otherName} {item.unread&&<b className="message-unread">Unread</b>}</span><p className="message-preview">{item.latestText}</p><Time value={item.latestAt}/>{item.waiting&&<small>Waiting for reply</small>}{item.followUp&&<small className="message-follow-up">Follow-up suggested</small>}</div>
        </Link>{item.followUp&&<button className="message-dismiss" disabled={busy} onClick={()=>dismiss(item)}>Dismiss suggestion</button>}
      </article>)}
      <nav className="wishlist-pagination" aria-label="Conversation pages">{page>1&&<button className="button secondary" onClick={()=>setPage(page-1)}>Previous</button>}{(page>1||more)&&<span>Page {page}</span>}{more&&<button className="button secondary" onClick={()=>setPage(page+1)}>Next</button>}</nav>
    </section><section className="conversation-detail" aria-label="Selected conversation" aria-busy={detailLoading}>
      {active&&<Link className="messages-back text-link" href="/dashboard/messages">← Back to conversations</Link>}
      {!active?<div className="messages-empty"><h2>A little context, a better conversation.</h2><p>Choose a conversation to see the property and your messages.</p></div>:detailLoading?<p role="status">Loading messages…</p>:selectedId&&!detail?<p>Select Refresh messages to retry loading this conversation.</p>:<>
        <header><Property value={context}/>{c&&<h2>Conversation with {c.otherName}</h2>}{c?.waiting&&<p className="muted">Waiting for reply</p>}{c?.followUp&&<aside className="message-reminder"><strong>Follow-up suggested</strong><p>Still interested? You can follow up with the advertiser.</p><a href="#message-text">Continue conversation</a><button className="message-dismiss" disabled={busy} onClick={()=>dismiss(c)}>Dismiss suggestion</button></aside>}</header>
        <div className="message-history" aria-label="Message history">{detail?.hasMore&&<button className="button secondary" onClick={older} disabled={busy}>Load older messages</button>}{!detail&&<p className="muted">Send your first inquiry to start this conversation. Your email and phone number are not shared by ScoutAnywhere.</p>}{detail?.messages.map(message=><article key={message.id} className={`message-bubble ${message.mine?'mine':''}`}><strong>{message.mine?'You':message.sender}</strong><p>{message.text}</p><Time value={message.createdAt}/></article>)}</div>
        {(!c||c.canSend)?<form className="message-composer" onSubmit={send}><label htmlFor="message-text">Your message</label><textarea id="message-text" value={text} required maxLength={4000} rows={4} disabled={busy||retrying} onChange={event=>setText(event.target.value)}/><div><small>{text.length} / 4,000 · Text only</small><button className="button" disabled={busy||!text.trim()}>{busy?'Sending…':retrying?'Retry same message':'Send message'}</button></div>{retrying&&!busy&&<p className="muted">The previous send could not be confirmed. Retry safely; it will not send twice.</p>}</form>:<p className="notice">New messages are paused because the listing or advertiser is no longer available for messaging. This does not mean the property was rented or sold.</p>}
        <p role="status">{notice}</p>
      </>}
    </section></div>
  </div>;
}
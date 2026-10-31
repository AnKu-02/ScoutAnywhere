/** Reclaim a bounded batch per minute; durable DB tombstones survive crashes. */
export async function register(){
  if(process.env.NEXT_RUNTIME!=="nodejs")return;
  const {cleanupMedia}=await import("./modules/draft-media/repository");
  let running=false;
  const timer=setInterval(async()=>{
    if(running)return;running=true;
    try{await cleanupMedia();}catch{/* DB/storage outage: retry next tick, never log keys or credentials. */}
    finally{running=false;}
  },60000);
  timer.unref();
}
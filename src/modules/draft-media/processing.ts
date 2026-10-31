import { spawn } from "node:child_process";
import path from "node:path";
import { mediaLimits } from "./config";
import { MediaError } from "./validation";

export function imageSignature(bytes:Buffer):"jpeg"|"png"|"webp"|null {
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return "jpeg";
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "png";
  if(bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "webp";
  return null;
}
let active=0;
export function hasAnimation(bytes:Buffer){
  const format=imageSignature(bytes);
  if(format==="png"){
    for(let offset=8;offset+12<=bytes.length;){
      const size=bytes.readUInt32BE(offset);const type=bytes.toString("ascii",offset+4,offset+8);
      if(type==="acTL")return true;
      if(size>bytes.length-offset-12)break;offset+=size+12;
    }
  }
  if(format==="webp"){
    for(let offset=12;offset+8<=bytes.length;){
      const size=bytes.readUInt32LE(offset+4),type=bytes.toString("ascii",offset,offset+4);
      if(type==="ANIM"||type==="ANMF"||(type==="VP8X"&&size>=1&&offset+8<bytes.length&&(bytes[offset+8]&2)!==0))return true;
      if(size>bytes.length-offset-8)break;offset+=8+size+(size%2);
    }
  }
  return false;
}
export async function processPhoto(bytes:Buffer):Promise<{bytes:Buffer;width:number;height:number}> {
  const limits=mediaLimits();
  if(!bytes.length||bytes.length>limits.original)throw new MediaError(413,"Photographs must be no larger than 10 MB.");
  if(!imageSignature(bytes))throw new MediaError(415,"Choose a JPEG, PNG or WebP photograph. HEIC, SVG, GIF, video and PDF are not supported; export HEIC as JPEG first.");
  if(hasAnimation(bytes))throw new MediaError(422,"Animated photographs are not supported. Export a still JPEG, PNG or WebP.");
  if(active>=2)throw new MediaError(429,"Photo processing is busy. Please retry shortly.");
  active++;
  try{return await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,["--max-old-space-size=128",path.join(process.cwd(),"scripts/process-draft-photo.mjs"),String(limits.pixels),String(limits.dimension)],{
      stdio:["pipe","pipe","ignore"],env:{NODE_ENV:process.env.NODE_ENV,PATH:process.env.PATH,VIPS_CONCURRENCY:"1",MALLOC_ARENA_MAX:"2"},
    });
    const chunks:Buffer[]=[];let length=0;let finished=false;
    const timer=setTimeout(()=>child.kill("SIGKILL"),16000);
    function fail(){if(finished)return;finished=true;clearTimeout(timer);reject(new MediaError(422,"This image could not be processed. It may be damaged, animated or exceed the dimension/pixel limits."));}
    child.on("error",fail);child.stdin.on("error",()=>{});
    child.stdout.on("data",(chunk:Buffer)=>{length+=chunk.length;if(length>limits.processed+1024){child.kill("SIGKILL");return;}chunks.push(chunk);});
    child.on("close",code=>{
      clearTimeout(timer);if(code!==0||finished){fail();return;}
      try{
        const output=Buffer.concat(chunks);const split=output.indexOf(10);const info=JSON.parse(output.subarray(0,split).toString());const data=output.subarray(split+1);
        if(split<0||info.size!==data.length||!Number.isInteger(info.width)||!Number.isInteger(info.height)||info.width<1||info.height<1||info.width>2560||info.height>2560||imageSignature(data)!=="webp")throw new Error("output");
        finished=true;resolve({bytes:data,width:info.width,height:info.height});
      }catch{fail();}
    });
    child.stdin.end(bytes);
  });}finally{active--;}
}
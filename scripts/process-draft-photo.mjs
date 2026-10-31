// Dedicated subprocess: no filesystem paths or credentials arrive from the client.
import sharp from "sharp";
sharp.cache(false);sharp.concurrency(1);
const [maxPixels,maxDimension]=process.argv.slice(2).map(Number);
let total=0;const chunks=[];
try{
  for await(const chunk of process.stdin){total+=chunk.length;if(total>10485760)throw new Error("size");chunks.push(chunk);}
  const bytes=Buffer.concat(chunks);
  const input=sharp(bytes,{limitInputPixels:maxPixels,limitInputChannels:4,failOn:"warning",sequentialRead:true});
  const metadata=await input.metadata();
  if(!["jpeg","png","webp"].includes(metadata.format)||!metadata.width||!metadata.height||metadata.width>maxDimension||metadata.height>maxDimension||metadata.width*metadata.height>maxPixels||(metadata.pages||1)!==1)throw new Error("dimensions or animation");
  // Default sharp output strips metadata; auto-orientation must happen first.
  const {data,info}=await input.rotate().resize({width:2560,height:2560,fit:"inside",withoutEnlargement:true}).webp({quality:82,effort:3}).timeout({seconds:12}).toBuffer({resolveWithObject:true});
  if(data.length>5242880)throw new Error("output size");
  process.stdout.write(Buffer.from(JSON.stringify({width:info.width,height:info.height,size:data.length})+"\n"));process.stdout.write(data);
}catch{process.exitCode=1;}
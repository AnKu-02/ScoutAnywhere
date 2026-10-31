import path from "node:path";
function limit(name:string,fallback:number,max:number){
  const value=Number(process.env[name]||fallback);
  if(!Number.isSafeInteger(value)||value<1||value>max)throw new Error(`Invalid ${name}`);
  return value;
}
export function mediaLimits(){return {
  count:limit("MEDIA_MAX_IMAGES",12,12), original:limit("MEDIA_MAX_ORIGINAL_BYTES",10485760,10485760),
  pixels:limit("MEDIA_MAX_PIXELS",40000000,40000000),dimension:limit("MEDIA_MAX_DIMENSION",12000,12000),
  accountBytes:limit("MEDIA_ACCOUNT_BYTES",262144000,1073741824),
  accountImages:limit("MEDIA_ACCOUNT_IMAGES",240,1200),
  processed:5242880,
};}
export function mediaRoot(){
  // Runtime data is not a deployment input; do not trace private objects or secrets.
  const root=path.resolve(/* turbopackIgnore: true */ process.env.MEDIA_LOCAL_ROOT||path.join(process.cwd(),".private-media","development"));
  const publicRoot=path.join(process.cwd(),"public");
  if(root===publicRoot||root.startsWith(publicRoot+path.sep))throw new Error("Private media must be outside public");
  if(process.env.NODE_ENV==="production"&&!process.env.MEDIA_LOCAL_ROOT)throw new Error("Configure private storage explicitly");
  return root;
}
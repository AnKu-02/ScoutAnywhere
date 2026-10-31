import { mkdir, readFile, writeFile, unlink,lstat } from "node:fs/promises";
import path from "node:path";
import { S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,GetBucketPolicyStatusCommand,GetPublicAccessBlockCommand } from "@aws-sdk/client-s3";
import { mediaRoot } from "./config";

export interface PrivateStorage {put(key:string,bytes:Buffer):Promise<void>;get(key:string):Promise<Buffer>;remove(key:string):Promise<void>}
export function validateStorageKey(key:string){
  if(!/^drafts\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.webp$/.test(key))throw new Error("Invalid private object key");
  return key;
}
export class LocalPrivateStorage implements PrivateStorage {
  constructor(private root=mediaRoot()){}
  private file(key:string){return path.join(this.root,validateStorageKey(key));}
  private async noSymlinks(file:string){
    let current=path.resolve(this.root);
    try{if((await lstat(current)).isSymbolicLink())throw new Error("Private storage root must not be a symlink");}
    catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    for(const part of path.relative(current,path.resolve(file)).split(path.sep)){
      current=path.join(current,part);
      try{if((await lstat(current)).isSymbolicLink())throw new Error("Private storage paths must not contain symlinks");}
      catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}
    }
  }
  async put(key:string,bytes:Buffer){const file=this.file(key);await this.noSymlinks(file);await mkdir(path.dirname(file),{recursive:true,mode:0o700});await this.noSymlinks(file);await writeFile(file,bytes,{mode:0o600,flag:"wx"});}
  async get(key:string){const file=this.file(key);await this.noSymlinks(file);const info=await lstat(file);if(!info.isFile()||info.size>5242880)throw new Error("Invalid private object");return readFile(file);}
  async remove(key:string){const file=this.file(key);await this.noSymlinks(file);try{await unlink(file);}catch(error){if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error;}}
}
export class S3PrivateStorage implements PrivateStorage {
  private client:S3Client;
  private bucket:string;
  private checked:Promise<void>|undefined;
  constructor(){
    this.bucket=process.env.MEDIA_S3_BUCKET||"";
    if(!this.bucket||!process.env.MEDIA_S3_ACCESS_KEY||!process.env.MEDIA_S3_SECRET_KEY)throw new Error("Private S3 configuration is incomplete");
    const endpoint=process.env.MEDIA_S3_ENDPOINT;
    if(endpoint&&new URL(endpoint).protocol!=="https:"&&!['localhost','127.0.0.1'].includes(new URL(endpoint).hostname))throw new Error("S3 requires TLS");
    this.client=new S3Client({region:process.env.MEDIA_S3_REGION||"us-east-1",endpoint,forcePathStyle:true,maxAttempts:2,
      credentials:{accessKeyId:process.env.MEDIA_S3_ACCESS_KEY,secretAccessKey:process.env.MEDIA_S3_SECRET_KEY},
      requestHandler:{connectionTimeout:5000,requestTimeout:20000}});
  }
  // Fail closed when the provider cannot attest the bucket's privacy. Compatible
  // providers must support these controls; no unsafe bypass is offered.
  private privacy(){return this.checked??=Promise.all([
    this.client.send(new GetBucketPolicyStatusCommand({Bucket:this.bucket})),
    this.client.send(new GetPublicAccessBlockCommand({Bucket:this.bucket})),
  ]).then(([policy,block])=>{
    const b=block.PublicAccessBlockConfiguration;
    if(policy.PolicyStatus?.IsPublic!==false||!b?.BlockPublicAcls||!b.IgnorePublicAcls||!b.BlockPublicPolicy||!b.RestrictPublicBuckets)throw new Error("Bucket must block public access");
  }).catch(error=>{this.checked=undefined;throw error;});}
  async put(key:string,bytes:Buffer){await this.privacy();await this.client.send(new PutObjectCommand({Bucket:this.bucket,Key:validateStorageKey(key),Body:bytes,ContentType:"image/webp",CacheControl:"private, no-store"}),{abortSignal:AbortSignal.timeout(25000)});}
  async get(key:string){
    await this.privacy();const object=await this.client.send(new GetObjectCommand({Bucket:this.bucket,Key:validateStorageKey(key)}),{abortSignal:AbortSignal.timeout(25000)});
    if(!object.Body||Number(object.ContentLength)>5242880)throw new Error("Invalid private object");
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of object.Body as AsyncIterable<Uint8Array>){length+=chunk.length;if(length>5242880)throw new Error("Invalid private object");chunks.push(Buffer.from(chunk));}
    return Buffer.concat(chunks);
  }
  async remove(key:string){await this.privacy();await this.client.send(new DeleteObjectCommand({Bucket:this.bucket,Key:validateStorageKey(key)}),{abortSignal:AbortSignal.timeout(25000)});}
}
let instance:PrivateStorage|undefined;
export function privateStorage():PrivateStorage {
  const driver=process.env.MEDIA_STORAGE_DRIVER||"local";
  if(!["local","s3"].includes(driver))throw new Error("Unknown private storage driver");
  return instance??=driver==="s3"?new S3PrivateStorage():new LocalPrivateStorage();
}
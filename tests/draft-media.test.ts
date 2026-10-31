import { afterEach,describe,expect,it,vi } from "vitest";
import sharp from "sharp";
import { mkdtemp,stat,rm,symlink,mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { processPhoto,imageSignature,hasAnimation } from "../src/modules/draft-media/processing";
import { LocalPrivateStorage,validateStorageKey } from "../src/modules/draft-media/storage";
import { mediaOrderSchema,mediaDeleteSchema } from "../src/modules/draft-media/validation";
import { mediaLimits,mediaRoot } from "../src/modules/draft-media/config";
import { boundedImageBody } from "../src/modules/draft-media/http";
afterEach(()=>vi.unstubAllEnvs());
describe("private photograph processing",()=>{
  it.each(["jpeg","png","webp"] as const)("decodes %s bytes and outputs metadata-free WebP",async format=>{
    const input=await sharp({create:{width:80,height:50,channels:3,background:"red"}}).toFormat(format).toBuffer();
    expect(imageSignature(input)).toBe(format);
    const result=await processPhoto(input);const metadata=await sharp(result.bytes).metadata();
    expect(metadata.format).toBe("webp");expect(result.width).toBe(80);expect(result.height).toBe(50);
    expect(metadata.exif).toBeUndefined();expect(metadata.icc).toBeUndefined();expect(metadata.xmp).toBeUndefined();
  });
  it("corrects phone orientation before dropping EXIF and GPS metadata",async()=>{
    const input=await sharp({create:{width:60,height:30,channels:3,background:"blue"}}).withMetadata({orientation:6}).withExif({IFD0:{Artist:"Private person"},IFD3:{GPSLatitudeRef:"N",GPSLatitude:"12/1 58/1 0/1",GPSLongitudeRef:"E",GPSLongitude:"77/1 35/1 0/1"}}).jpeg().toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output=await processPhoto(input);expect([output.width,output.height]).toEqual([30,60]);
    const metadata=await sharp(output.bytes).metadata();expect(metadata.exif).toBeUndefined();expect(metadata.orientation).toBeUndefined();
  });
  it.each(["<svg><script>alert(1)</script></svg>","GIF89a", "%PDF-1.5","not an image"])("rejects unsupported signatures",async value=>{
    expect(imageSignature(Buffer.from(value))).toBeNull();await expect(processPhoto(Buffer.from(value))).rejects.toMatchObject({status:415});
  });
  it("rejects corrupt image bytes and oversized originals",async()=>{
    await expect(processPhoto(Buffer.from([255,216,255,0,0]))).rejects.toMatchObject({status:422});
    await expect(processPhoto(Buffer.alloc(10485761))).rejects.toMatchObject({status:413});
  });
  it("enforces decoded dimension and pixel limits and resizes accepted images",async()=>{
    const input=await sharp({create:{width:200,height:100,channels:3,background:"red"}}).png().toBuffer();
    vi.stubEnv("MEDIA_MAX_PIXELS","10000");await expect(processPhoto(input)).rejects.toMatchObject({status:422});
    vi.stubEnv("MEDIA_MAX_PIXELS","40000000");vi.stubEnv("MEDIA_MAX_DIMENSION","150");await expect(processPhoto(input)).rejects.toMatchObject({status:422});
    vi.unstubAllEnvs();
    const large=await sharp({create:{width:3000,height:100,channels:3,background:"red"}}).png().toBuffer();
    expect((await processPhoto(large)).width).toBe(2560);
  });
  it("rejects animated PNG and WebP container markers",async()=>{
    const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.from([0,0,0,8]),Buffer.from("acTL"),Buffer.alloc(12)]);
    const webp=Buffer.concat([Buffer.from("RIFF"),Buffer.alloc(4),Buffer.from("WEBPANIM"),Buffer.alloc(8)]);
    for(const bytes of [png,webp]){expect(hasAnimation(bytes)).toBe(true);await expect(processPhoto(bytes)).rejects.toMatchObject({status:422});}
  });
});
describe("media contracts and private local objects",()=>{
  it("rejects duplicate order, mass assignment, invalid ids and oversized sequences",()=>{
    const id=crypto.randomUUID();
    for(const value of [{version:1,ids:[id,id],coverId:id},{version:1,ids:Array.from({length:13},()=>crypto.randomUUID()),coverId:id},{version:1,ids:[id],coverId:id,userId:"victim"},{version:0,ids:[],coverId:null}])expect(mediaOrderSchema.safeParse(value).success).toBe(false);
    expect(mediaDeleteSchema.safeParse({version:1,storageKey:"victim"}).success).toBe(false);
    expect(mediaOrderSchema.safeParse({version:1,ids:[id],coverId:id}).success).toBe(true);
  });
  it("enforces configurable hard ceilings and rejects a public media root",()=>{
    vi.stubEnv("MEDIA_MAX_IMAGES","13");expect(()=>mediaLimits()).toThrow();vi.unstubAllEnvs();
    vi.stubEnv("MEDIA_LOCAL_ROOT",path.join(process.cwd(),"public/images/uploads"));expect(()=>mediaRoot()).toThrow();
  });
  it("uses only opaque scoped keys and owner-only object files, with idempotent deletion",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"scout-photo-unit-"));
    try{
      const storage=new LocalPrivateStorage(root),key=`drafts/${crypto.randomUUID()}/${crypto.randomUUID()}.webp`;
      for(const invalid of ["../secret","/tmp/file","drafts/../../file.webp","images/a.png"])expect(()=>validateStorageKey(invalid)).toThrow();
      await storage.put(key,Buffer.from("test"));expect(await storage.get(key)).toEqual(Buffer.from("test"));
      expect((await stat(path.join(root,key))).mode&0o777).toBe(0o600);
      await expect(storage.put(key,Buffer.from("overwrite"))).rejects.toThrow();
      await storage.remove(key);await storage.remove(key);await expect(storage.get(key)).rejects.toThrow();
    }finally{await rm(root,{recursive:true,force:true});}
  });
  it("bounds actual streamed bytes regardless of Content-Length",async()=>{
    vi.stubEnv("MEDIA_MAX_ORIGINAL_BYTES","5");
    const request=new Request("http://localhost",{method:"POST",body:new Uint8Array(6)});
    await expect(boundedImageBody(request)).rejects.toMatchObject({status:413});
    expect(await boundedImageBody(new Request("http://localhost",{method:"POST",body:new Uint8Array([1,2])}))).toEqual(Buffer.from([1,2]));
  });
  it("rejects a symlink inside the private object hierarchy",async()=>{
    const root=await mkdtemp(path.join(os.tmpdir(),"scout-symlink-unit-"));
    try{
      const target=path.join(root,"elsewhere");await mkdir(target);await symlink(target,path.join(root,"drafts"));
      const storage=new LocalPrivateStorage(root),key=`drafts/${crypto.randomUUID()}/${crypto.randomUUID()}.webp`;
      await expect(storage.put(key,Buffer.from("test"))).rejects.toThrow("symlink");
      await expect(storage.get(key)).rejects.toThrow("symlink");
      await expect(storage.remove(key)).rejects.toThrow("symlink");
    }finally{await rm(root,{recursive:true,force:true});}
  });
});
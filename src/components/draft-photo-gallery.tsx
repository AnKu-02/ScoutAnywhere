import { listMedia } from "@/modules/draft-media/repository";
import { PrivatePhoto } from "./draft-photos";
export async function DraftPhotoGallery({userId,draftId,coverOnly=false}:{userId:string;draftId:string;coverOnly?:boolean}){
  let media;
  try{media=await listMedia(userId,draftId);}catch{return <p role="status">Photographs are temporarily unavailable.</p>;}
  const photos=coverOnly?media.images.filter(photo=>photo.cover):media.images;
  if(!photos.length)return coverOnly?null:<div className="map-placeholder"><strong>No photographs added</strong><span>This is a private draft, not a public property page.</span></div>;
  return <div className={coverOnly?"draft-cover":"photo-gallery"} aria-label={coverOnly?"Draft cover photograph":"Private property photographs"}>{photos.map((photo,index)=><figure key={photo.id}><PrivatePhoto photo={photo} alt={`Property photograph ${index+1}${photo.cover?", cover":""}`}/>{!coverOnly&&<figcaption>{photo.cover?"Cover photograph · ":""}Self-supplied, not verified</figcaption>}</figure>)}</div>;
}
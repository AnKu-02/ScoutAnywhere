"use client";

import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { accountRequest } from "./auth-forms";
import { advertiserTypes,advertiserTypeLabels,operatingCities,type AdvertiserProfile } from "@/modules/advertisers/validation";

export function AdvertiserProfileForm({profile,defaultName}:{profile:AdvertiserProfile|null;defaultName:string}){
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [failed,setFailed]=useState(false);
  const lock=useRef(false);const router=useRouter();
  return <form className="account-form" onSubmit={async event=>{
    event.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage("");setFailed(false);
    const form=new FormData(event.currentTarget);
    try{
      await accountRequest("/api/advertiser-profile",{displayName:form.get("displayName"),type:form.get("type"),primaryCity:form.get("primaryCity"),description:form.get("description")},"PUT");
      setMessage("Advertiser profile saved.");router.refresh();
    }catch(error){setFailed(true);setMessage(error instanceof Error?error.message:"Could not save. Please try again.");}
    finally{lock.current=false;setBusy(false);}
  }}>
    <fieldset disabled={busy||profile?.status==="suspended"}><legend className="sr-only">Advertiser profile details</legend>
      <label className="field"><span>Advertiser display name</span><input name="displayName" required minLength={2} maxLength={80} defaultValue={profile?.displayName??defaultName} autoComplete="nickname" aria-describedby="advertiser-name-help"/></label>
      <p id="advertiser-name-help" className="muted">Choose the name you would use when advertising. This profile is private for now. Your account email is not published.</p>
      <div className="field"><label htmlFor="advertiser-type">Advertiser type</label><select id="advertiser-type" name="type" required defaultValue={profile?.type??""}><option value="" disabled>Select your type</option>{advertiserTypes.map(type=><option key={type} value={type}>{advertiserTypeLabels[type]}</option>)}</select></div>
      <div className="field"><label htmlFor="advertiser-city">Primary operating city</label><select id="advertiser-city" name="primaryCity" required defaultValue={profile?.primaryCity??""}><option value="" disabled>Select your city</option>{operatingCities.map(city=><option key={city}>{city}</option>)}</select></div>
      <label className="field"><span>Short description (optional)</span><textarea name="description" rows={4} maxLength={600} defaultValue={profile?.description??""} aria-describedby="advertiser-description-help"/></label>
      <p id="advertiser-description-help" className="muted">Up to 600 characters about your advertising activity. Please do not include phone numbers, email addresses, identity documents or other sensitive information.</p>
      <p className="notice">Your type is self-declared. It does not verify your identity, ownership, tenancy or broker credentials, or give permission to manage a property.</p>
      <button type="submit" className="button">{busy?"Saving…":profile?"Save advertiser profile":"Create advertiser profile"}</button>
    </fieldset>
    {message&&<p role={failed?"alert":"status"} className={failed?"notice":"account-feedback"}>{message}</p>}
  </form>;
}
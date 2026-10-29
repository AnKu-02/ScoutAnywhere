"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { accountRequest } from "./auth-forms";

export function ProfileForm({name,image,preferences}: {name:string;image:string;preferences:{preferredCity:string;seeking:boolean;owning:boolean;brokering:boolean}}) {
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);const router=useRouter();
  return <form className="account-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setMessage("");const f=new FormData(event.currentTarget);try{await accountRequest("/api/account",{displayName:f.get("displayName"),image:f.get("image"),preferredCity:f.get("preferredCity"),seeking:f.has("seeking"),owning:f.has("owning"),brokering:f.has("brokering")},"PATCH");setMessage("Profile updated.");router.refresh();}catch(error){setMessage(error instanceof Error?error.message:"Update failed");}finally{setBusy(false);}}}>
    <fieldset disabled={busy}><legend className="sr-only">Profile preferences</legend>
      <label className="field"><span>Display name</span><input name="displayName" defaultValue={name} minLength={2} maxLength={80} autoComplete="nickname" required/></label>
      <label className="field"><span>Profile image</span><select name="image" defaultValue={image}><option value="">No image</option><option value="/images/profile-violet.svg">Violet geometric avatar</option><option value="/images/profile-lime.svg">Lime geometric avatar</option></select></label><p className="muted">Optional supplied avatars only. Photo uploads are not available yet.</p>
      <label className="field"><span>Preferred city</span><input name="preferredCity" maxLength={100} defaultValue={preferences.preferredCity}/></label>
      <p>Interests (choose any)</p>{([ ["seeking","Finding a home"],["owning","Property ownership"],["brokering","Brokerage"] ] as const).map(([key,label])=><label className="checkbox" key={key}><input name={key} type="checkbox" defaultChecked={preferences[key]}/>{label}</label>)}
      <p className="muted">Interests grant no permissions and do not verify identity, property ownership or broker status.</p><button className="button" type="submit">{busy?"Saving…":"Save profile"}</button>
    </fieldset>{message&&<p role="status" className="account-feedback">{message}</p>}
  </form>;
}

export function PasswordSettings() {
  const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
  return <form className="account-form" onSubmit={async event=>{event.preventDefault();setBusy(true);setMessage("");const form=event.currentTarget;const f=new FormData(form);try{await accountRequest("/api/auth/change-password",{currentPassword:f.get("currentPassword"),newPassword:f.get("newPassword"),revokeOtherSessions:true});setMessage("Password changed. Other sessions were signed out.");form.reset();}catch{setMessage("Could not change password. Check your current password and try again.");}finally{setBusy(false);}}}><fieldset disabled={busy}><legend className="sr-only">Password settings</legend><label className="field"><span>Current password</span><input name="currentPassword" type="password" autoComplete="current-password" required maxLength={128}/></label><label className="field"><span>New password</span><input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required/></label><button className="button secondary">Change password</button></fieldset>{message&&<p role="status">{message}</p>}</form>;
}
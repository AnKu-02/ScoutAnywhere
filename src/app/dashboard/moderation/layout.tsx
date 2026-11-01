import { notFound } from "next/navigation";
import { requireAccount } from "@/modules/auth/session";
import { isModerator } from "@/modules/submissions/repository";
import { AccountShell } from "@/components/account-shell";
export const dynamic="force-dynamic";
export const metadata={title:"Private moderation",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function Layout({children}:{children:React.ReactNode}){
  const {user}=await requireAccount();if(!await isModerator(user.id))notFound();
  return <AccountShell workspace title="Listing moderation">{children}</AccountShell>;
}
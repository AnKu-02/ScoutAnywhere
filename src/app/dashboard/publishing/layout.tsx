import { notFound } from "next/navigation";
import { requireAccount } from "@/modules/auth/session";
import { isPublisher } from "@/modules/publications/repository";
import { AccountShell } from "@/components/account-shell";
export const dynamic="force-dynamic";
export const metadata={title:"Controlled publication",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function Layout({children}:{children:React.ReactNode}){const {user}=await requireAccount();if(!await isPublisher(user.id))notFound();return <AccountShell workspace title="Controlled publishing">{children}</AccountShell>;}
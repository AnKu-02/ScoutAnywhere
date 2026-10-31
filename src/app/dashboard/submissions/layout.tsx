import { requireAccount } from "@/modules/auth/session";
import { AccountShell, AccountNavigation } from "@/components/account-shell";
export const dynamic="force-dynamic";
export const metadata={title:"Private submitted listing",robots:{index:false,follow:false},referrer:"no-referrer" as const};
export default async function Layout({children}:{children:React.ReactNode}){
  await requireAccount();return <AccountShell title="Submitted listing"><AccountNavigation/>{children}</AccountShell>;
}
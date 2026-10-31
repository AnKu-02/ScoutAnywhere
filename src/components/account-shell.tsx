export {AccountNavigation} from "./account-navigation";
export function AccountShell({ title, children }: { title:string;children:React.ReactNode }) {
  return <section className="container narrow section account-shell"><p className="eyebrow">YOUR SCOUTANYWHERE ACCOUNT</p><h1>{title}</h1><div className="panel">{children}</div></section>;
}
import { AccountNavigation } from "./account-navigation";
export {AccountNavigation} from "./account-navigation";
export function AccountShell({ title, children, workspace=false, description }: { title:string;children:React.ReactNode;workspace?:boolean;description?:string }) {
  if(workspace)return <section className="container section dashboard-shell"><aside className="dashboard-sidebar"><p className="eyebrow">YOUR SPACE</p><AccountNavigation/></aside><div className="dashboard-main"><header className="dashboard-page-header"><p className="eyebrow">SCOUTANYWHERE ACCOUNT</p><h1>{title}</h1>{description&&<p className="muted">{description}</p>}</header><div className="dashboard-content">{children}</div></div></section>;
  return <section className="container narrow section account-shell"><p className="eyebrow">YOUR SCOUTANYWHERE ACCOUNT</p><h1>{title}</h1><div className="panel">{children}</div></section>;
}
import Link from "next/link";
import { AccountControl } from "./account-control";
import { NavLinks } from "./nav-links";
import { ArrowUpRight, House, MapPin } from "lucide-react";
export function Navigation({ label = "Main navigation" }: { label?: string }) {
  return <header className="site-header"><div className="container nav"><Link href="/" className="wordmark" aria-label="ScoutAnywhere home"><House size={25} aria-hidden="true"/>ScoutAnywhere<span className="brand-dot">.</span></Link><NavLinks label={label}/><div className="nav-actions"><AccountControl/><Link href="/list-property" className="button secondary small">List a property <ArrowUpRight size={16} aria-hidden="true"/></Link></div></div></header>;
}
export function Footer() {
  return <footer><div className="container footer-grid"><div><Link href="/" className="wordmark">ScoutAnywhere.</Link><p>Find your place, anywhere.</p><p className="muted">A property-first housing marketplace for India.</p></div><nav aria-label="Footer navigation"><Link href="/flatshares">Flatshares</Link><Link href="/rent">Rent a home</Link><Link href="/buy">Buy a home</Link><Link href="/pg-management">PG Management</Link></nav><div><p><MapPin size={16} aria-hidden="true"/> Starting with Bengaluru & Mumbai</p><p className="muted">Public listings are fictional demo data.<br/>Signed-in users can create private drafts. No publishing, verified ownership or booking services.</p></div></div></footer>;
}
export function EmptyState({ title = "No homes match these filters.", children }: { title?: string; children?: React.ReactNode }) {
  return <div className="empty panel"><House size={32} aria-hidden="true"/><h2>{title}</h2><p>Try a wider budget, a different locality, or fewer filters.</p>{children}</div>;
}
export function DatabaseError() {
  return <section className="panel notice" role="status"><h2>Property search is temporarily unavailable</h2><p>We couldn’t load the database. Please try again later. For local setup, configure the database, run migrations, and seed the demo listings as described in the README.</p><Link href="/">Back to home</Link></section>;
}
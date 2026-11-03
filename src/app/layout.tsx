import type { Metadata } from "next";
import { Navigation, Footer } from "@/components/site";
import "./globals.css";
import "./dashboard.css";
import "./messages.css";
import { space, jakarta } from "@/lib/fonts";
import { SavedPropertiesProvider } from "@/components/saved-properties";
export const metadata: Metadata = { title: { default: "ScoutAnywhere · Find your place, anywhere", template: "%s | ScoutAnywhere" }, description: "Discover flatshares, rentals and homes for sale in India. Public demo listings and account-owned private drafts.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN" className={`${space.variable} ${jakarta.variable}`}><body><SavedPropertiesProvider><a className="skip-link" href="#main">Skip to content</a><Navigation/><div className="demo-banner">Fictional demos are labeled separately from advertiser-supplied listings. Sign in to create private drafts. Operator publication does not verify ownership or availability.</div><main id="main">{children}</main><Footer/></SavedPropertiesProvider></body></html>;
}
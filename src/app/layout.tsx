import type { Metadata } from "next";
import { Navigation, Footer } from "@/components/site";
import "./globals.css";
import { space, jakarta } from "@/lib/fonts";
import { SavedPropertiesProvider } from "@/components/saved-properties";
export const metadata: Metadata = { title: { default: "ScoutAnywhere · Find your place, anywhere", template: "%s | ScoutAnywhere" }, description: "Discover flatshares, rentals and homes for sale in India. Phase 1 demonstration marketplace.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-IN" className={`${space.variable} ${jakarta.variable}`}><body><SavedPropertiesProvider><a className="skip-link" href="#main">Skip to content</a><Navigation/><div className="demo-banner">Phase 1 preview · All properties and advertisers are fictional demonstration data. No real availability.</div><main id="main">{children}</main><Footer/></SavedPropertiesProvider></body></html>;
}
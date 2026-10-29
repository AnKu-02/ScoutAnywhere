import { MapPin } from "lucide-react";
import Image from "next/image";

export function Hero({ children }: {children:React.ReactNode}) {
  return <section className="hero"><div className="container">
    <div className="hero-intro"><div className="hero-copy"><p className="eyebrow">A NEW PERSPECTIVE ON HOME</p>
      <h1>A place that fits.<br/><span>A search that makes sense.</span></h1>
      <p className="hero-description">Find your next room, rental or home to own.<br/>Clear details. Your priorities. A little less guesswork.</p>
    </div>
    <div className="hero-artwork" aria-hidden="true"><Image src="/images/violet-topographic-map.png" alt="" width={1672} height={941} sizes="(max-width: 700px) 160px, (max-width: 1100px) 32vw, 520px" priority/></div></div>
    {children}
    <p className="hero-note"><MapPin size={16} aria-hidden="true"/>Bengaluru & Mumbai to begin with. Built for India.</p>
  </div></section>;
}
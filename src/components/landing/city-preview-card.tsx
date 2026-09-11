import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { LandingDestination } from "@/lib/landing-destinations";
import type { CSSProperties } from "react";

/** Lives inside the existing selected marker, retaining its position and action. */
export function CityPreviewCard({ city }: { city: LandingDestination }) {
  const story = city.editorial;
  return <span className="globe-pin-label globe-preview-card" data-city={city.id} data-long-name={city.name.length > 5} style={{ "--city-name-length": city.name.length } as CSSProperties}>
    <span className="city-preview-image"><Image key={city.id} src={story.image} alt={story.imageAlt} width={640} height={400} sizes="(max-width: 767px) 152px, 218px" /></span>
    <span className="city-preview-copy">
      <span className="city-preview-kicker">{city.en}, {city.countryEn}</span>
      <strong className="city-preview-title">{city.name}</strong>
      <span className="city-preview-description">{story.description.map(line => <span key={line}>{line}</span>)}</span>
      <span className="city-preview-meta">3일 · 9곳</span>
      <span className="city-preview-link">이 여정 둘러보기 <ArrowUpRight size={17} strokeWidth={1.6} /></span>
    </span>
  </span>;
}

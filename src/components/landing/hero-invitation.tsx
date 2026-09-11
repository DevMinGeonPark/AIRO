"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useDestination } from "./destination-context";
import { DEFAULT_DESTINATION, DESTINATIONS } from "@/lib/landing-destinations";

/** The approved editorial headline remains real, selectable typography. */
export function HeroInvitation() {
  const { destination, selectDestination } = useDestination();
  const story = destination.editorial;
  const ordered = [DEFAULT_DESTINATION, ...DESTINATIONS.filter(city => city.id !== DEFAULT_DESTINATION.id)];
  const number = String(ordered.findIndex(city => city.id === destination.id) + 1).padStart(2, "0");
  return <div className="hero-invitation">
    <h1 aria-label="마음 가는 대로, AIRO."><span className="editorial-opening">마음 가는 대로,</span><span className="editorial-wordmark"><LogoMark /><em>AIRO.</em></span></h1>
    <div className="editorial-intro" data-hero-reveal>
      <p className="editorial-description">계획은 가볍게, 여행은 깊게.</p>
      <Link href="/app" prefetch={false} className="editorial-start">여행 시작하기 <span className="editorial-arrow"><ArrowRight size={20} strokeWidth={1.4} /></span></Link>
    </div>
    <button type="button" className="city-feature" data-city={destination.id} onClick={() => selectDestination(destination.id)} aria-label={`${story.featureTitle} — 지구본에서 ${destination.name} 여행 선택`} data-hero-reveal>
      <Image key={destination.id} className="city-feature-photo" src={story.featureImage} alt={story.featureImageAlt} width={330} height={208} sizes="(max-width: 767px) 80px, 165px" />
      <span key={`copy-${destination.id}`} className="city-feature-copy"><span className="city-feature-kicker"><i>{number}</i><span>/</span> {destination.en}</span><strong>{story.featureTitle}</strong><span className="city-feature-description">{story.featureDescription}</span></span>
      <span className="editorial-arrow"><ArrowRight size={17} strokeWidth={1.4} /></span>
    </button>
  </div>;
}

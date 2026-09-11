"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, Bookmark, Download, FileText } from "lucide-react";
import { useLenis } from "lenis/react";
import { LogoMark } from "@/components/logo";
import { useDestination } from "./destination-context";
import { ConversationPreview } from "./lower-conversation-preview";
import { RoutePreview } from "./lower-route-preview";
import { IntegrationSection } from "./lower-integration-section";
import type { McpLandingConfig } from "./mcp-quick-start";
import { useLandingMotion } from "./motion-system";

function MaterialsPreview() {
  const { destination: city } = useDestination();
  const [selected, setSelected] = useState(0), [saved, setSaved] = useState(true);
  const id = useId();
  const categories = ["장소", "예약 자료", "예산"];
  const photo = city.id === "rome" ? "/travel/rome/cafe.jpg" : city.editorial.featureImage;
  return <div className="lower-notebook lower-panel"><header><h3>{city.name} 여행 노트</h3><small>예시 자료</small></header>
    <div className="lower-material-tabs" role="group" aria-label="여행 자료 종류">{categories.map((label, index) => <button type="button" key={label} aria-pressed={selected === index} aria-controls={`${id}-material-${index}`} onClick={() => setSelected(index)}>{label}</button>)}</div>
    <div className="lower-material-grid">
      <article id={`${id}-material-0`} data-selected={selected === 0}><div className="lower-saved-photo"><Image src={photo} alt={city.id === "rome" ? "로마 안티코 카페 그레코" : city.editorial.featureImageAlt} width={420} height={300} sizes="(max-width: 767px) 80vw, 230px" /><button type="button" aria-label={saved ? "예시 장소 북마크 해제" : "예시 장소 북마크 저장"} aria-pressed={saved} onClick={() => { setSaved(value => !value); setSelected(0); }}><Bookmark size={19} fill={saved ? "currentColor" : "none"} /></button></div><h4>{city.id === "rome" ? "들르고 싶은 카페" : `${city.name}에서 머물 곳`}</h4><p>{city.id === "rome" ? "조용한 골목에서 쉬어가기. 커피 한 잔의 여유를 위해." : city.editorial.featureDescription}</p></article>
      <article id={`${id}-material-1`} data-selected={selected === 1}><a href="/examples/airo-reservation-sample.pdf" download="AIRO-숙소-예약-확인서-예시.pdf" className="lower-document" onClick={() => setSelected(1)} aria-label="숙소 예약 확인서 예시 PDF 내려받기"><FileText size={34} strokeWidth={1} /><h4>숙소 예약 확인서.pdf</h4><p>보관 예시 · 3박<br />실제 예약이 아닌 샘플</p><Download size={20} /></a><p>예약 확인서도 일정 곁에.</p></article>
      <article id={`${id}-material-2`} data-selected={selected === 2}><div className="lower-budget"><h4>여행 예산</h4>{[["숙소", 30], ["식비", 12], ["교통", 8]].map(([label, value]) => <div key={label}><span>{label}</span><span className="lower-budget-bar"><i style={{ width: `${Number(value) / 50 * 100}%` }} /></span><span>{value}만</span></div>)}<small>합계 50만 원 · 예시</small></div><p>예산을 기록하고,<br />일정을 더 여유롭게.</p></article>
    </div>
    <p className="lower-material-status" role="status">{selected === 0 ? saved ? "북마크에 담아둔 예시 장소예요." : "예시 북마크를 해제했어요." : selected === 1 ? "직접 내려받아 볼 수 있는 예시 문서예요." : "숙소·식비·교통을 합한 예시 예산이에요."}</p>
  </div>;
}

function CitySections({ mcp }: { mcp: McpLandingConfig }) {
  const { destination: city } = useDestination();
  return <div className="landing-lower" data-destination={city.id}>
    <section id="기능" className="lower-conversation lower-container" aria-labelledby="lower-conversation-title">
      <div className="lower-heading"><h2 id="lower-conversation-title">떠오른 생각이,<br /><span className="lower-serif">여행이 되는 순간.</span></h2><p>가고 싶은 곳도, 보내고 싶은 하루도.<br />이야기할수록 여행은 나다워져요.</p></div>
      <ConversationPreview />
    </section>
    <RoutePreview />
    <section className="lower-materials lower-container" aria-labelledby="lower-material-title"><div className="lower-materials-heading"><p className="lower-eyebrow">03 <span>/</span> ALL IN ONE PLACE</p><h2 id="lower-material-title">저장한 장소부터,<br />예약한 숙소까지.</h2><p>장소와 예약 자료, 예산을<br />일정 곁에 정리해두세요.</p></div><MaterialsPreview /></section>
    <IntegrationSection {...mcp} />
    <section className="lower-finale" aria-labelledby="lower-finale-title"><Image src={city.editorial.featureImage} alt={city.editorial.featureImageAlt} fill sizes="100vw" /><div className="lower-finale-shade" /><div className="lower-container"><LogoMark /><h2 id="lower-finale-title">이제, 떠날 차례.</h2><p>마음 가는 대로, AIRO.</p><Link href="/app" prefetch={false}>여행 시작하기 <ArrowUpRight size={18} /></Link></div></section>
  </div>;
}

export function LowerLanding({ mcp }: { mcp: McpLandingConfig }) {
  const { destination } = useDestination();
  return <CitySections key={destination.id} mcp={mcp} />;
}

export function EditorialFooter() {
  const lenis = useLenis();
  const { enabled } = useLandingMotion();
  const toTop = () => {
    if (lenis) lenis.scrollTo(0, { immediate: !enabled, duration: 1.1 });
    else window.scrollTo({ top: 0, behavior: enabled ? "smooth" : "instant" });
  };
  return <footer className="lower-footer lower-footer-editorial" aria-label="아이로 사이트 안내">
    <div className="lower-container">
      <div className="lower-footer-top">
        <div className="lower-footer-brand">
          <Link href="/" aria-label="아이로 AIRO 홈" className="lower-footer-submark"><LogoMark /></Link>
          <p>계획은 가볍게,<br />여행은 깊게.</p>
        </div>
        <nav className="lower-footer-links" aria-label="푸터 메뉴">
          <div><h3>아이로와 여행</h3><Link href="/app" prefetch={false}>내 여행</Link><Link href="/pricing" prefetch={false}>요금제</Link><Link href="/login" prefetch={false}>로그인</Link></div>
          <div><h3>도움이 필요할 때</h3><a href="#mcp">AI 도구 연결 <ArrowUpRight size={12} /></a><Link href="/app/settings/keys" prefetch={false}>API 키 관리</Link><Link href="/credits/photos" prefetch={false}>사진 출처</Link></div>
        </nav>
        <button type="button" className="lower-footer-to-top" onClick={toTop} aria-label="페이지 맨 위로 이동"><ArrowUp size={16} /><span>맨 위로</span></button>
      </div>
      <div className="lower-footer-bottom">
        <span className="lower-footer-copyright">© AIRO</span>
        <span className="lower-footer-policy">이용약관 · 개인정보처리방침 준비 중</span>
        <a className="lower-footer-map-credit" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">지도 © OpenStreetMap <ArrowUpRight size={10} /></a>
      </div>
    </div>
  </footer>;
}

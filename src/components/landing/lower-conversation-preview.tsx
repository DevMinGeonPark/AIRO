"use client";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Pause, Play, Sparkles } from "lucide-react";
import { useInView } from "motion/react";
import { LogoMark } from "@/components/logo";
import { useDestination } from "./destination-context";
import { conversationDay, placeStory } from "@/lib/landing-lower";
import type { LandingDestination } from "@/lib/landing-destinations";
import { useLandingMotion, usePageVisible } from "./motion-system";
import { DayTabs } from "./lower-tabs";

const AUTOPLAY_INTERVAL = 6_000;

function conversationStories(city: LandingDestination) {
  return [0, 1, 2].map(day => {
    const stops = conversationDay(city, day);
    const first = stops[0].name, last = stops[stops.length - 1].name;
    if (city.id === "rome") {
      const versions = [
        {
          title: "로마의 오후",
          request: "로마에서 느긋하게 걷고, 카페에도 들르고 싶어.",
          reply: "판테온에서 시작해, 분수와 골목을 따라 걸어볼까요?",
          image: city.editorial.image,
          alt: city.editorial.imageAlt,
        },
        {
          title: "고대 로마를 걷다",
          request: "로마의 오래된 유적들을 천천히 둘러보고 싶어.",
          reply: "콜로세움에서 시작해, 유적과 광장을 차례로 걸어볼까요?",
          ...placeStory(city, "콜로세움"),
        },
        {
          title: "강 건너의 오후",
          request: "로마의 강을 따라 걷고, 광장에서도 쉬고 싶어.",
          reply: "산탄젤로성에서 시작해, 강 건너 광장까지 이어볼까요?",
          ...placeStory(city, "산탄젤로성"),
        },
      ];
      return { ...versions[day], stops };
    }
    const photo = city.id === "kyoto"
      ? { image: `/gen/${city.days[day].image}.webp`, alt: `${city.name} ${city.days[day].scene} 예시 이미지` }
      : { image: day === 0 ? city.editorial.image : city.editorial.featureImage, alt: day === 0 ? city.editorial.imageAlt : city.editorial.featureImageAlt };
    return {
      title: day === 0 ? city.editorial.featureTitle : city.days[day].scene,
      request: [
        `${city.name}에서 느긋하게 걷고 싶어.`,
        `${city.name}에서 ${first}도 꼭 들르고 싶어.`,
        `${city.name}의 또 다른 풍경을 만나고 싶어.`,
      ][day],
      reply: `${first}부터 ${last}까지, 천천히 이어볼까요?`,
      ...photo,
      stops,
    };
  });
}

export function ConversationPreview() {
  const { destination: city } = useDestination();
  const [day, setDay] = useState(0), [relaxed, setRelaxed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const inView = useInView(panel, { amount: 0.25 });
  const pageVisible = usePageVisible();
  const { enabled } = useLandingMotion();
  const id = useId();
  const stories = conversationStories(city);
  const story = stories[day];
  const running = enabled && inView && pageVisible && !paused && !hovered && !focused;
  useEffect(() => {
    if (!running) return;
    const timeout = window.setTimeout(() => {
      setDay(current => (current + 1) % 3);
      setRelaxed(false);
    }, AUTOPLAY_INTERVAL);
    return () => window.clearTimeout(timeout);
  }, [running, day, relaxed]);

  const selectDay = (next: number) => { setDay(next); setRelaxed(false); };
  return <>
    <div
      ref={panel}
      className="lower-conversation-panel lower-panel"
      data-relaxed={relaxed}
      data-story={day + 1}
      data-autoplay={running ? "playing" : "paused"}
      data-animate={enabled && inView && pageVisible}
      onPointerEnter={event => { if (event.pointerType !== "touch") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={event => setFocused(!event.target.closest(".lower-conversation-autoplay"))}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <div className="lower-chat">
        <header><LogoMark /><span>아이로와 여행 만들기</span><small>예시 대화</small></header>
        <div className="lower-chat-user"><p className="lower-story-copy" key={`request-${day}`}>{story.request}</p></div>
        <div className="lower-chat-reply"><LogoMark /><p className="lower-story-copy" key={`reply-${day}-${relaxed}`}>{relaxed ? "좋아요. 장소 사이에 쉬는 시간을 조금 더 두었어요." : story.reply}</p></div>
        <button className="lower-chat-prompt" type="button" onClick={() => setRelaxed(value => !value)} aria-label={relaxed ? "처음 예시 일정 다시 보기" : "조금 더 여유롭게 바꾸는 예시 보기"}><span>{relaxed ? "처음 일정으로 돌아가기" : "조금 더 여유롭게 바꿔줘"}</span><i><ArrowRight size={17} /></i></button>
      </div>
      <span className="lower-conversation-arrow" aria-hidden="true"><ArrowRight size={21} /></span>
      <div className="lower-generated-trip">
        <div className="lower-trip-banner">
          {stories.map((version, index) => <Image key={index} src={version.image} alt={day === index ? version.alt : ""} aria-hidden={day !== index} data-active={day === index} fill sizes="(max-width: 767px) 90vw, 750px" />)}
          <div><p>{city.en}, {city.countryEn} <span>· 예시 여행</span></p><h3 className="lower-story-copy" key={`title-${day}`}>{story.title}</h3></div>
        </div>
        <DayTabs id={id} day={day} onChange={selectDay} label="대화 예시 날짜 선택" />
        <ol id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${day}`} className="lower-generated-stops" data-day={day + 1}>{story.stops.map((stop, index) => <li key={index}><time>{relaxed ? ["10:00", "11:30", "13:30"][index] : stop.time}</time><div className="lower-story-copy" key={`${day}-${index}`}><h4>{stop.name}</h4><p>{stop.description}</p></div>{index !== 1 && <Image src={stop.image} alt={stop.alt} width={132} height={70} sizes="132px" />}</li>)}</ol>
        <div className="lower-trip-caption"><span><Sparkles size={14} />{relaxed ? "쉬는 시간을 더한 예시 일정" : "대화와 함께 달라지는 일정"}</span><button
          className="lower-conversation-autoplay"
          type="button"
          aria-label={paused ? "여행 예시 자동 넘김 재생" : "여행 예시 자동 넘김 일시정지"}
          aria-pressed={paused}
          disabled={!enabled}
          title={!enabled ? "동작 설정에 따라 자동 넘김이 꺼져 있어요. 날짜를 눌러 다른 여행을 볼 수 있어요." : "6초마다 다음 여행 예시 · 내용을 읽거나 조작하는 동안 멈춰요"}
          onClick={() => setPaused(value => !value)}
        >{paused || !enabled ? <Play size={12} /> : <Pause size={12} />}<span>{!enabled ? "자동 꺼짐" : paused ? "자동 재생" : "자동 넘김"}</span></button></div>
      </div>
    </div>
    <div className="lower-conversation-end"><Link href="/app" prefetch={false} className="lower-text-link">나의 여행 만들기 <ArrowUpRight size={18} /></Link><small>대화 <ArrowRight size={12} /> 일정</small></div>
  </>;
}

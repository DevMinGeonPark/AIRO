"use client";
import { useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useInView } from "motion/react";
import { ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { useDestination } from "./destination-context";
import { useLandingMotion, usePageVisible } from "./motion-system";
import { placeName, placeStory } from "@/lib/landing-lower";
import { landingAiTools as tools } from "@/lib/landing-ai-tools";
import { tabKey } from "./lower-tabs";
import { McpQuickStart, type McpLandingConfig } from "./mcp-quick-start";

function IntegrationPreview(config: McpLandingConfig) {
  const { destination: city } = useDestination();
  const { enabled } = useLandingMotion();
  const pageVisible = usePageVisible();
  const [tool, setTool] = useState(0), [run, setRun] = useState(0);
  const ref = useRef<HTMLDivElement>(null), id = useId();
  const visible = useInView(ref, { amount: .2 });
  const selectedTool = tools[tool];
  const stops = city.map.journeys[1].stops;
  const changeTool = (index: number) => { setTool(index); setRun(value => value + 1); };
  return <div ref={ref} className="lower-integration-preview">
    <div className="lower-tool-tabs" role="tablist" aria-label="AI 도구 연동 미리보기">{tools.map((entry, index) => <button key={entry.id} type="button" role="tab" id={`${id}-tab-${index}`} aria-label={`${entry.name}${entry.surface ? ` ${entry.surface}` : ""}`} aria-controls={`${id}-panel`} aria-selected={tool === index} tabIndex={tool === index ? 0 : -1} onClick={() => changeTool(index)} onKeyDown={event => tabKey(event, index, tools.length, changeTool)}><span>{entry.name}</span>{entry.surface && <small>{entry.surface}</small>}</button>)}</div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tool}`} className="lower-tool-preview-panel" data-tool={selectedTool.id}>
    <div className="lower-tool-context"><p>{selectedTool.description}</p><a href={selectedTool.source} target="_blank" rel="noreferrer">공식 연동 문서 <ArrowUpRight size={12} /></a></div>
    <div className="lower-integration-flow" key={`${city.id}-${run}`} data-animate={enabled} data-running={visible && pageVisible}>
      <div className="lower-tool-chat lower-panel"><p className="lower-flow-label">AI에게 말하기</p><header>{selectedTool.name} {selectedTool.surface && <small>{selectedTool.surface}</small>} <span>· 예시 대화</span></header><div className="lower-tool-request"><span>나</span><p>둘째 날, {placeName(stops[1].name)} 다음에 카페를 넣어줘.</p></div><div className="lower-tool-reply"><LogoMark /><p>아이로에 반영했어요.</p></div></div>
      <div className="lower-mcp-connector" aria-label="MCP로 요청한 내용을 아이로 일정에 반영"><div><i /><ArrowRight size={17} /></div><span>MCP</span></div>
      <div className="lower-connected-trip lower-panel"><p className="lower-flow-label">AIRO 일정에 반영</p><header><h3>{city.name}의 둘째 날</h3><small>예시 일정</small></header><ol>{stops.flatMap((stop, index) => {
        const story = placeStory(city, stop.name);
        const row = <li key={stop.name}><i /><time>{["14:00", "14:30", "16:00"][index]}</time><span>{placeName(stop.name)}</span>{city.id === "rome" && <Image src={story.image} alt={story.alt} width={96} height={44} sizes="96px" />}</li>;
        return index !== 1 ? [row] : [row, <li key="added-cafe" className="lower-mcp-inserted"><i /><time>15:00</time><span>골목 안 작은 카페</span>{city.id === "rome" && <Image src="/travel/rome/cafe.jpg" alt="로마 안티코 카페 그레코" width={60} height={44} sizes="60px" />}<small><Check size={10} />추가됨</small></li>];
      })}</ol></div>
    </div>
    <p className="lower-tool-compatibility">{selectedTool.note}</p>
    </div>
    <div className="lower-mcp-cta"><div><a href="#mcp-시작" className="lower-text-link">아래에서 직접 연결하기 <ArrowRight size={17} /></a></div><p className="lower-integration-demo-note">위 화면은 사용 예시예요. 아래에서 내 계정을 연결하세요.</p></div>
    <McpQuickStart key={selectedTool.id} tool={selectedTool} city={city.name} {...config} />
    <Link href={`/docs/mcp#${selectedTool.id}`} prefetch={false} className="mcp-full-guide">{selectedTool.name} 상세 문서 <ArrowUpRight size={13} /></Link>
  </div>;
}

export function IntegrationSection(config: McpLandingConfig) {
  return <section id="mcp" className="lower-integration lower-container" aria-labelledby="lower-integration-title"><div className="lower-heading"><div><p className="lower-eyebrow">04 <span>/</span> CONNECTED JOURNEYS</p><h2 id="lower-integration-title">쓰던 AI에 말하면,<br /><span className="lower-serif lower-blue">여행은 아이로에.</span></h2></div><p>카페 추가도, 방문 순서 변경도.<br />AI에게 부탁하고 아이로에서 확인하세요.</p></div><IntegrationPreview {...config} /></section>;
}

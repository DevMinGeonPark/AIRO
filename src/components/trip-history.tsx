"use client";
import { useEffect, useState } from "react";
import { managementRequest } from "@/lib/browser-management";
import type { Stop } from "@/lib/types";
type Change={id:string;created_at:string;fields:string[]};
type Detail={id:string;created_at:string;changes:Record<string,{before:unknown;after:unknown}>};
const labels:Record<string,string>={trip:"여행 설정",itinerary:"일정",documents:"PDF",reservations:"예약",expenseBudget:"예산",notificationSettings:"알림 설정",predepartureChecklist:"출국 준비",itineraryProgress:"일정 진행",images:"QR·이미지",name:"이름",title:"제목",start_date:"시작일",day:"Day",time:"시간",note:"메모",bookingStatus:"예약 상태",paymentStatus:"결제 상태",bookingUrl:"예약 주소",reference:"예약 번호",amount:"금액",currency:"통화",paid:"결제 완료",done:"완료",completedAt:"완료 시각",source:"체크 방법",timeZone:"시간대",entries:"항목",items:"목록",rules:"자동 체크",mode:"방법",radiusMeters:"도착 범위(m)",reserve:"예비비",exchangeRate:"환율",lat:"위도",lng:"경도"};
function readable(value:unknown,stops:Stop[],documents:{name:string;sha256:string}[]):string {
  if(value==null)return "없음";
  if(typeof value==="boolean")return value?"예":"아니오";
  if(typeof value!=="object")return String(value);
  if(Array.isArray(value))return value.length?value.map((item,i)=>`${i+1}. ${readable(item,stops,documents)}`).join("\n\n"):"없음";
  const place=(id:unknown)=>{const stop=stops.find(s=>s.id===id||s.source_id===id);return stop?`Day ${stop.day} · ${stop.name}`:String(id??"없음");};
  return Object.entries(value).filter(([key])=>!["base64","revision","id","trip_id","user_id","source_id","sha256","transaction_id"].includes(key)).map(([key,item])=>{
    if(key==="stopId"||key==="stopIds")return `연결 장소: ${Array.isArray(item)?item.map(place).join(", ")||"없음":place(item)}`;
    if(key==="documentSha256s"&&Array.isArray(item))return `연결 PDF: ${item.map(hash=>documents.find(doc=>doc.sha256===hash)?.name??hash).join(", ")||"없음"}`;
    return `${labels[key]??key}: ${readable(item,stops,documents)}`;
  }).join("\n");
}
function ChangeValue({value,stops,documents}:{value:unknown;stops:Stop[];documents:{name:string;sha256:string}[]}){const[expanded,setExpanded]=useState(false);const text=readable(value,stops,documents);return <><pre>{expanded?text:text.slice(0,6000)}</pre>{text.length>6000&&<button type="button" onClick={()=>setExpanded(v=>!v)}>{expanded?"내용 접기":"전체 내용 보기"}</button>}</>;}
export function TripHistory({tripId,stops,documents,onReverted}:{tripId:string;stops:Stop[];documents:{name:string;sha256:string}[];onReverted:()=>void}) {
  const base=`/api/mobile/trips/${tripId}/changes`;
  const[rows,setRows]=useState<Change[]>([]),[detail,setDetail]=useState<Detail|null>(null),[latest,setLatest]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[more,setMore]=useState(false);
  useEffect(()=>{let active=true;managementRequest(base+"?limit=20").then(value=>{if(active){setRows(value.changes);setMore(value.changes.length===20);}}).catch(error=>{if(active)setError(error.message);});return()=>{active=false;};},[base]);
  async function load(older=false){setBusy(true);setError("");try{const value=await managementRequest(base+`?limit=20${older&&rows.length?`&beforeId=${rows.at(-1)!.id}`:""}`);setRows(older?[...rows,...value.changes.filter((row:Change)=>!rows.some(r=>r.id===row.id))]:value.changes);setMore(value.changes.length===20);setDetail(null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function select(id:string){setBusy(true);setError("");setMessage("");try{const [selected,current]=await Promise.all([managementRequest(base+"/"+id),managementRequest(base+"?limit=1")]);setDetail(selected);setLatest(current.changes[0]?.id??null);}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  async function undo(){if(!detail||!latest||!window.confirm("검토한 변경을 변경 전 상태로 되돌릴까요?"))return;setBusy(true);setError("");try{await managementRequest(base+"/"+detail.id,"POST",{expectedLatestChangeId:latest});setDetail(null);setMessage("선택한 변경을 되돌렸습니다.");await load();onReverted();}catch(error){setError((error as Error).message);}finally{setBusy(false);}}
  return <section className="trip-history" aria-label="변경 이력"><div className="management-actions"><h2>변경 이력</h2><button type="button" disabled={busy} onClick={()=>void load()}>이력 새로고침</button></div>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{busy&&<p role="status">불러오는 중…</p>}
    {detail?<section className="management-editor" aria-label="변경 내용"><h3>{new Date(detail.created_at).toLocaleString("ko-KR")}</h3>{Object.entries(detail.changes).map(([key,value])=><section key={key}><h3>{labels[key]??key}</h3><h4>변경 전</h4><ChangeValue value={value.before} stops={stops} documents={documents}/><h4>변경 후</h4><ChangeValue value={value.after} stops={stops} documents={documents}/></section>)}
      <p>이후 같은 자료가 변경됐다면 되돌리기가 차단됩니다. 먼저 최신 내용을 다시 확인해 주세요.</p>
      <div className="management-actions"><button type="button" className="management-primary" disabled={busy||!!error||!latest} onClick={()=>void undo()}>이 변경 되돌리기</button>{error&&<button type="button" disabled={busy} onClick={()=>void select(detail.id)}>최신 내용 다시 검토</button>}<button type="button" disabled={busy} onClick={()=>setDetail(null)}>목록으로</button></div>
    </section>:<><ul className="management-cards">{rows.map(row=><li key={row.id}><button type="button" disabled={busy} onClick={()=>void select(row.id)}><strong>{row.fields.map(f=>labels[f]??f).join(" · ")}</strong><br/>{new Date(row.created_at).toLocaleString("ko-KR")} · 변경 내용 보기</button></li>)}</ul>{!rows.length&&!busy&&<p>아직 기록된 변경이 없습니다.</p>}{more&&<button type="button" disabled={busy} onClick={()=>void load(true)}>이전 이력 더 보기</button>}</>}
  </section>;
}

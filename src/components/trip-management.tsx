"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { TripSubheader } from "./trip-subheader";
import { PdfPreviewButton } from "./pdf-preview";
import { BookingPlatformLink } from "./booking-platform-link";
import { PlaceNote } from "./place-note";
import { TripHistory } from "./trip-history";
import { bookingLink } from "@/lib/trip-attachments";
import { reservationsSchema, reservationSchema, MAX_PDF_BYTES } from "@/lib/trip-management";
import type { Trip, Stop } from "@/lib/types";
import { managementRequest } from "@/lib/browser-management";
import "./trip-management.css";

type Reservation = z.infer<typeof reservationSchema>;
type Document = {name:string;sha256:string;stopIds:string[]};
type Resources = {stops:Stop[];documents:Document[];reservations:z.infer<typeof reservationsSchema>};
export function TripManagement({trip,initialStopId,initialTab="documents"}:{trip:Trip;initialStopId?:string;initialTab?:"documents"|"history"}) {
  const base=`/api/mobile/trips/${trip.id}`;
  const [data,setData]=useState<Resources|null>(null),[error,setError]=useState(""),[tab,setTab]=useState<"documents"|"reservations"|"history">(initialTab),[filter,setFilter]=useState(initialStopId??""),[query,setQuery]=useState("");
  const [document,setDocument]=useState<Document|"new"|null>(null),[reservation,setReservation]=useState<Reservation|null>(null);
  const sequence=useRef(0);
  const load=useCallback(async()=>{const ticket=++sequence.current;try{const value=await managementRequest(base+"/resources");if(ticket===sequence.current){setData({...value,reservations:reservationsSchema.parse(value.reservations)});setError("");}}catch(error){if(ticket===sequence.current)setError(error instanceof Error?error.message:"불러오지 못했어요.");}},[base]);
  useEffect(()=>{const requestSequence=sequence;const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);requestSequence.current++;};},[load]);
  const matches=(ids:string[]=[])=>(!filter||ids.includes(filter)||data?.stops.some(s=>(s.id===filter||s.source_id===filter)&&ids.some(id=>id===s.id||id===s.source_id)));
  const docs=data?.documents.filter(doc=>matches(doc.stopIds)&&doc.name.toLowerCase().includes(query.toLowerCase()))??[];
  const reservations=data?.reservations.entries.filter(r=>matches([...(r.stopIds??[]),...(r.stopId?[r.stopId]:[])])&&`${r.name} ${r.reference??""}`.toLowerCase().includes(query.toLowerCase()))??[];
  const completed=()=>{setDocument(null);setReservation(null);void load();};
  return <><TripSubheader trip={trip} title="자료·예약 관리"/><main className="trip-management">
    <h1>자료·예약 관리</h1><p>{trip.title}</p>
    <nav aria-label="자료 관리 메뉴">{([["documents","PDF"],["reservations","예약"],["history","변경 이력"]]as const).map(([id,label])=><button key={id} type="button" aria-pressed={tab===id} disabled={document!==null||reservation!==null} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==="history"?<TripHistory tripId={trip.id} stops={data?.stops??[]} documents={data?.documents??[]} onReverted={()=>void load()}/>:<>
      {error&&<div role="alert">{error}<button type="button" onClick={()=>void load()}>다시 불러오기</button></div>}
      {!data&&!error&&<p role="status">자료를 불러오는 중…</p>}
      {data&&<>
        <div className="management-filters"><label>장소<select aria-label="자료 장소" value={filter} onChange={e=>setFilter(e.target.value)} disabled={document!==null||reservation!==null}><option value="">여행 전체</option>{data.stops.map(stop=><option key={stop.id} value={stop.id}>Day {stop.day} · {stop.name}</option>)}</select></label><label>검색<input aria-label="자료 검색" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
        {document!==null?<DocumentEditor key={document==="new"?"new":document.sha256} tripId={trip.id} data={data} original={document} defaultStopId={filter} onClose={()=>setDocument(null)} onSaved={completed}/>:reservation?<ReservationEditor key={reservation.id} tripId={trip.id} data={data} original={reservation} onClose={()=>setReservation(null)} onSaved={completed}/>:tab==="documents"?<>
          <button type="button" className="management-primary" onClick={()=>setDocument("new")}>PDF 추가</button>
          <p>PDF는 한 파일당 2 MiB까지 첨부할 수 있습니다. 저장 전에 미리보고 연결할 장소를 선택하세요.</p>
          <ul className="management-cards">{docs.map(doc=><li key={doc.sha256}><PdfPreviewButton tripId={trip.id} document={doc}>{doc.name}</PdfPreviewButton><p>{doc.stopIds.length?`${doc.stopIds.length}개 장소에 연결됨`:"여행 전체 자료"}</p><button type="button" onClick={()=>setDocument(doc)}>장소 연결 수정</button></li>)}</ul>{!docs.length&&<p>조건에 맞는 PDF가 없습니다.</p>}
        </>:<>
          <button type="button" className="management-primary" onClick={()=>setReservation({id:crypto.randomUUID(),name:"",stopId:null,stopIds:filter?[filter]:[],documentSha256s:[],bookingUrl:null,bookingStatus:"not_booked",paymentStatus:"unpaid",reference:null,note:null})}>예약 추가</button>
          <ul className="management-cards">{reservations.map(r=>{const link=bookingLink(r.bookingUrl);return <li key={r.id}><h2>{r.name}</h2><p>{bookingLabels[r.bookingStatus]} · {paymentLabels[r.paymentStatus]}</p>{r.reference&&<p>예약번호 {r.reference}</p>}{r.note&&<PlaceNote name={r.name} note={r.note}/>}<div className="management-actions"><button type="button" onClick={()=>setReservation(r)}>예약 수정</button>{link&&<BookingPlatformLink href={link.href}>{link.label}</BookingPlatformLink>}<Link href={`/app/${trip.id}/cost?reservationId=${r.id}`}>예산에 연결</Link></div>{data.documents.filter(d=>r.documentSha256s?.includes(d.sha256)).map(doc=><PdfPreviewButton key={doc.sha256} tripId={trip.id} document={doc}>{doc.name}</PdfPreviewButton>)}</li>;})}</ul>{!reservations.length&&<p>조건에 맞는 예약이 없습니다.</p>}
        </>}
      </>}
    </>}
    <Link href={`/app/${trip.id}/resources`}>사진·저장한 장소 보기</Link>
  </main></>;
}
export const bookingLabels={not_booked:"미예약",pending:"예약 대기",confirmed:"예약 확정",cancelled:"예약 취소"};
export const paymentLabels={unpaid:"미결제",partial:"일부 결제",paid:"결제 완료",refunded:"환불 완료"};
function StopChoices({stops,ids,onChange,disabled}:{stops:Stop[];ids:string[];onChange:(ids:string[])=>void;disabled:boolean}) {
  return <fieldset className="management-choices" disabled={disabled}><legend>연결할 장소</legend>{stops.map(stop=>{const keys=[stop.id,stop.source_id].filter((v):v is string=>!!v),checked=keys.some(id=>ids.includes(id));return <label key={stop.id}><input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked?[...ids,stop.id]:ids.filter(id=>!keys.includes(id)))}/>Day {stop.day} · {stop.name}</label>;})}<p>선택하지 않으면 여행 전체 자료로 보관합니다.</p></fieldset>;
}
function DocumentEditor({tripId,data,original,defaultStopId,onClose,onSaved}:{tripId:string;data:Resources;original:Document|"new";defaultStopId:string;onClose:()=>void;onSaved:()=>void}) {
  const [file,setFile]=useState<{name:string;base64:string;url:string}|null>(null),[ids,setIds]=useState(original==="new"?defaultStopId?[defaultStopId]:[]:original.stopIds),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const url=useRef<string|null>(null);
  useEffect(()=>()=>{if(url.current)URL.revokeObjectURL(url.current);},[]);
  async function choose(file?:File){if(!file)return;setBusy(true);setError("");try{if(file.size>MAX_PDF_BYTES||!file.size)throw new Error("PDF는 파일당 2 MiB까지 올릴 수 있어요.");const bytes=new Uint8Array(await file.arrayBuffer());if(new TextDecoder().decode(bytes.subarray(0,5))!=="%PDF-"||!new TextDecoder().decode(bytes.subarray(-1024)).includes("%%EOF"))throw new Error("올바른 PDF 파일을 선택해 주세요.");let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const value=URL.createObjectURL(file);if(url.current)URL.revokeObjectURL(url.current);url.current=value;setFile({name:file.name,base64:btoa(binary),url:value});}catch(error){setError(error instanceof Error?error.message:"파일을 읽지 못했어요.");}finally{setBusy(false);}}
  async function save(){setBusy(true);setError("");try{await managementRequest(`/api/mobile/trips/${tripId}/documents`,original==="new"?"POST":"PUT",original==="new"?{name:file!.name,base64:file!.base64,stopIds:ids}:{sha256:original.sha256,stopIds:ids});onSaved();}catch(error){setError(error instanceof Error?error.message:"저장하지 못했어요.");}finally{setBusy(false);}}
  return <section className="management-editor" aria-label="PDF 편집"><h2>{original==="new"?"PDF 추가":"장소 연결 수정"}</h2>{original==="new"&&<label>PDF 파일<input type="file" aria-label="PDF 파일" accept="application/pdf,.pdf" disabled={busy} onChange={e=>{void choose(e.target.files?.[0]);e.target.value="";}}/></label>}
    {file&&<PdfPreviewButton tripId={tripId} document={{name:file.name,sha256:""}} previewUrl={file.url}>선택한 PDF 미리보기 · {file.name}</PdfPreviewButton>}
    {original!=="new"&&<PdfPreviewButton tripId={tripId} document={original}>{original.name}</PdfPreviewButton>}
    <StopChoices stops={data.stops} ids={ids} onChange={setIds} disabled={busy}/>{error&&<p role="alert">{error}</p>}
    <div className="management-actions"><button type="button" className="management-primary" disabled={busy||(original==="new"&&!file)} onClick={()=>void save()}>PDF 저장</button><button type="button" disabled={busy} onClick={()=>{if(window.confirm("작성 중인 PDF 연결을 취소할까요?"))onClose();}}>취소</button></div>
  </section>;
}
function ReservationEditor({tripId,data,original,onClose,onSaved}:{tripId:string;data:Resources;original:Reservation;onClose:()=>void;onSaved:()=>void}) {
  const [draft,setDraft]=useState({...original,stopIds:[...new Set([...(original.stopIds??[]),...(original.stopId?[original.stopId]:[])])],stopId:null}),[revision,setRevision]=useState(data.reservations.revision),[busy,setBusy]=useState(false),[error,setError]=useState(""),[conflict,setConflict]=useState(false);
  async function save(event:React.FormEvent){event.preventDefault();setError("");const parsed=reservationSchema.safeParse({...draft,name:draft.name.trim()});if(!parsed.success){setError("예약 이름과 HTTPS 링크를 확인해 주세요.");return;}setBusy(true);try{await managementRequest(`/api/mobile/trips/${tripId}/reservations`,"PUT",{revision,reservation:parsed.data});onSaved();}catch(error){setConflict((error as {status?:number}).status===409);setError(error instanceof Error?error.message:"저장하지 못했어요.");}finally{setBusy(false);}}
  async function reload(){if(!window.confirm("작성 중인 예약을 최신 저장 내용으로 교체할까요?"))return;setBusy(true);try{const value=await managementRequest(`/api/mobile/trips/${tripId}/reservations`);const newest=value.entries.find((r:Reservation)=>r.id===draft.id)??draft;setDraft({...newest,stopId:null,stopIds:[...new Set<string>([...(newest.stopIds??[]),...(newest.stopId?[newest.stopId]:[])])]});setRevision(value.revision);setConflict(false);setError("");}catch(error){setError(error instanceof Error?error.message:"불러오지 못했어요.");}finally{setBusy(false);}}
  return <form className="management-editor" aria-label="예약 편집" onSubmit={save}><h2>예약 편집</h2><fieldset disabled={busy}>
    <label>예약 이름<input required maxLength={200} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <label>예약 페이지 (HTTPS)<input type="url" maxLength={2048} value={draft.bookingUrl??""} onChange={e=>setDraft({...draft,bookingUrl:e.target.value||null})}/></label>
    <label>예약 상태<select aria-label="예약 상태" value={draft.bookingStatus} onChange={e=>setDraft({...draft,bookingStatus:e.target.value as Reservation["bookingStatus"]})}>{Object.entries(bookingLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>결제 상태<select aria-label="결제 상태" value={draft.paymentStatus} onChange={e=>setDraft({...draft,paymentStatus:e.target.value as Reservation["paymentStatus"]})}>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label>예약 번호<input maxLength={300} value={draft.reference??""} onChange={e=>setDraft({...draft,reference:e.target.value||null})}/></label>
    <label>예약 메모<textarea rows={6} placeholder={"체크인: 15:00\nPIN: 0123#"} maxLength={4000} value={draft.note??""} onChange={e=>setDraft({...draft,note:e.target.value||null})}/></label>
    <StopChoices stops={data.stops} ids={draft.stopIds} onChange={stopIds=>setDraft({...draft,stopIds})} disabled={busy}/>
    <fieldset className="management-choices"><legend>연결할 PDF</legend>{data.documents.map(doc=><label key={doc.sha256}><input type="checkbox" checked={draft.documentSha256s?.includes(doc.sha256)??false} onChange={e=>setDraft({...draft,documentSha256s:e.target.checked?[...(draft.documentSha256s??[]),doc.sha256]:draft.documentSha256s?.filter(hash=>hash!==doc.sha256)})}/>{doc.name}</label>)}</fieldset>
    </fieldset>{error&&<p role="alert">{error}</p>}{conflict&&<button type="button" disabled={busy} onClick={()=>void reload()}>최신 예약으로 교체</button>}
    <div className="management-actions"><button className="management-primary" type="submit" disabled={busy||conflict}>예약 저장</button><button type="button" disabled={busy} onClick={()=>{if(JSON.stringify(draft)!==JSON.stringify(original)&&!window.confirm("작성 중인 예약 변경을 취소할까요?"))return;onClose();}}>취소</button></div>
  </form>;
}

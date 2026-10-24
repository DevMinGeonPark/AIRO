"use client";
/* Original selected files stay in IndexedDB; no upload or image-processing service. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { ImagePlus, X, ZoomIn } from "lucide-react";
import { addPlacePhotos, readPlacePhotos, removePlacePhoto, type PlacePhoto } from "@/lib/place-photo-store";
import "./place-photos.css";

export function PlacePhotos({ scope }: { scope:string }) {
  const [photos,setPhotos] = useState<PlacePhoto[]>([]), [busy,setBusy] = useState(false), [ready,setReady] = useState(false), [error,setError] = useState(""), [selected,setSelected] = useState<string|null>(null), [attempt,setAttempt] = useState(0);
  useEffect(()=> { let active=true; readPlacePhotos(scope).then(rows=>{if(active){setPhotos(rows);setReady(true);setError("");}}).catch(()=>{if(active)setError("이 브라우저에서 사진 저장소를 열지 못했어요.");});return ()=>{active=false;}; },[scope,attempt]);
  async function mutate(action:()=>Promise<PlacePhoto[]>) {
    setBusy(true);setError("");try{setPhotos(await action());}catch(error){setError(error instanceof Error ? error.name==="QuotaExceededError" ? "브라우저 저장 공간이 부족해요. 연결한 사진을 정리한 뒤 다시 시도해 주세요." : error.message : "사진을 저장하지 못했어요.");}finally{setBusy(false);}
  }
  return <section className="place-photos" aria-label="장소 사진">
    <div><strong>장소 사진 <small>{photos.length} / 20</small></strong><label className="place-photo-picker"><ImagePlus size={16}/>사진 연결<input aria-label="장소 사진 선택" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!ready||busy} onChange={event=>{const files=Array.from(event.target.files??[]);event.target.value="";if(files.length)void mutate(()=>addPlacePhotos(scope,files));}} /></label></div>
    <p>선택한 사진은 이 계정의 이 브라우저에만 보관합니다. 앱·다른 기기와 동기화되지 않으며, 사이트 데이터를 지우면 사라집니다.</p>
    {error && <p role="alert">{error}{!ready&&<button type="button" onClick={()=>setAttempt(value=>value+1)}>다시 시도</button>}</p>}
    {busy&&<p role="status">사진을 저장하는 중…</p>}
    <ul>{photos.map(photo=><li key={photo.id}><LocalPhoto photo={photo} onOpen={()=>setSelected(photo.id)} open={selected===photo.id} onClose={()=>setSelected(null)} /><button type="button" aria-label={`${photo.name} 연결 해제`} disabled={busy} onClick={()=>void mutate(()=>removePlacePhoto(scope,photo.id))}>연결 해제</button></li>)}</ul>
  </section>;
}
function LocalPhoto({photo,onOpen,open,onClose}:{photo:PlacePhoto;onOpen:()=>void;open:boolean;onClose:()=>void}) {
  const [url,setUrl] = useState("");const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{const value=URL.createObjectURL(photo.blob);const timer=setTimeout(()=>setUrl(value),0);return()=>{clearTimeout(timer);URL.revokeObjectURL(value);};},[photo.blob]);
  return <><button ref={trigger} type="button" aria-label={`${photo.name} 사진 보기`} onClick={onOpen}>{url&&<Image unoptimized src={url} alt={photo.name} width={96} height={96}/>}</button>
    {open&&url&&createPortal(<LocalPhotoViewer photo={photo} url={url} onClose={()=>{onClose();trigger.current?.focus();}}/>,document.body)}</>;
}
function LocalPhotoViewer({photo,url,onClose}:{photo:PlacePhoto;url:string;onClose:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);const [zoom,setZoom]=useState(false);
  useEffect(()=>{const element=dialog.current!;element.showModal();return()=>element.close();},[]);
  return <dialog ref={dialog} className="local-photo-viewer" aria-label={`${photo.name} 사진`} onCancel={event=>{event.preventDefault();event.stopPropagation();onClose();}} data-lenis-prevent>
    <header><strong>{photo.name}</strong><button type="button" onClick={()=>setZoom(value=>!value)} aria-pressed={zoom}><ZoomIn size={16}/>확대</button><button type="button" aria-label="사진 닫기" onClick={onClose}><X size={20}/></button></header>
    <div data-zoom={zoom}><Image unoptimized src={url} alt={photo.name} width={1200} height={900}/></div><a href={url} download={photo.name}>원본 사진 저장</a>
  </dialog>;
}

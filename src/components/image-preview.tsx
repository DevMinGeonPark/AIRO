"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, ImageIcon, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from "lucide-react";
import { tripImageUrl, type TripImageMetadata } from "@/lib/trip-images";
import "./image-preview.css";

export function ImagePreviewButton({ tripId, image }: { tripId: string; image: TripImageMetadata }) {
  const [open, setOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className="trip-image-trigger" aria-label={`이미지 보기: ${image.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}><ImageIcon size={17} /><span>{image.name}</span></button>
    {open && createPortal(<ImagePreview tripId={tripId} image={image} onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} />, document.body)}
  </>;
}

function ImagePreview({ tripId, image, onClose }: { tripId: string; image: TripImageMetadata; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), titleId = useId();
  const [expanded, setExpanded] = useState(false), [zoom, setZoom] = useState(false), [error, setError] = useState(false), [loaded, setLoaded] = useState(false), [attempt, setAttempt] = useState(0);
  const url = tripImageUrl(tripId, image.sha256);
  useEffect(() => {
    const element = dialog.current!, previous = document.body.style.overflow;
    document.body.style.overflow = "hidden"; element.showModal();
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  const close = () => { dialog.current?.close(); onClose(); };
  return <dialog ref={dialog} className="image-preview" data-expanded={expanded} aria-labelledby={titleId} data-lenis-prevent onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}>
    <header><div><p>저장한 이미지</p><h2 id={titleId}>{image.name}</h2></div><button type="button" aria-label="이미지 뷰어 닫기" onClick={close}><X size={20} /></button></header>
    <div className="image-preview-actions">
      <button type="button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{expanded ? "작게 보기" : "크게 보기"}</button>
      <button type="button" aria-pressed={zoom} onClick={() => setZoom(value => !value)}>{zoom ? <ZoomOut size={16} /> : <ZoomIn size={16} />}{zoom ? "화면에 맞추기" : "확대"}</button>
      <a href={`${url}?download=1`}><Download size={16} />이미지 저장</a>
    </div>
    <div className="image-preview-body" data-zoom={zoom} aria-busy={!loaded && !error}>
      {!loaded && !error && <p role="status">이미지를 불러오는 중…</p>}
      {error ? <div role="alert"><p>이미지를 불러오지 못했어요.</p><button type="button" onClick={() => { setError(false); setLoaded(false); setAttempt(value => value + 1); }}>다시 시도</button></div>
        : <Image key={attempt} unoptimized src={`${url}${attempt ? `?retry=${attempt}` : ""}`} alt={image.name} width={image.width} height={image.height} style={zoom ? { width: image.width * 2, maxWidth: "none" } : undefined} onLoad={() => setLoaded(true)} onError={() => setError(true)} />}
    </div>
    <footer><p>저장 시각 · {new Date(image.capturedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p><a href={image.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} />원본 사이트 열기</a><a className="image-preview-source" href={image.sourceUrl} target="_blank" rel="noopener noreferrer">{image.sourceUrl}</a></footer>
  </dialog>;
}

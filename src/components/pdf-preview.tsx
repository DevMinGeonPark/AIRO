"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Minimize2, X } from "lucide-react";
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from "pdfjs-dist";
import { documentViewUrl } from "@/lib/trip-attachments";
import "./pdf-preview.css";

export function PdfPreviewButton({ tripId, document, className, children, label, previewUrl }: {
  tripId: string; document: { name: string; sha256: string }; className?: string; children: ReactNode; label?: string; previewUrl?: string;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return <>
    <button ref={trigger} type="button" className={className} aria-label={label ?? `PDF 보기: ${document.name}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>{children}</button>
    {open && createPortal(<PdfPreview name={document.name} url={previewUrl ?? documentViewUrl(tripId, document.sha256)} onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }} />, window.document.body)}
  </>;
}

function PdfPreview({ name, url, onClose }: { name: string; url: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);
  const close = () => { dialog.current?.close(); onClose(); };
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previous; };
  }, []);
  return <dialog ref={dialog} className="pdf-preview" data-expanded={expanded} aria-labelledby={titleId} data-lenis-prevent
    onCancel={event => { event.preventDefault(); event.stopPropagation(); close(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }}>
    <header className="pdf-preview-heading"><div><p>PDF 미리보기</p><h2 id={titleId}>{name}</h2></div><button type="button" aria-label="PDF 미리보기 닫기" onClick={close}><X size={20} /></button></header>
    <div className="pdf-preview-actions">
      <button type="button" aria-pressed={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{expanded ? "작게 보기" : "크게 보기"}</button>
      <a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} />새 탭</a>
      <a href={url.replace("?view=1", "")}><Download size={16} />다운로드</a>
    </div>
    <PdfPages key={url} url={url} name={name} />
  </dialog>;
}

function PdfPages({ url, name }: { url: string; name: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setWidth(Math.max(1, element.clientWidth - 24)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let task: PDFDocumentLoadingTask | undefined;
    async function load() {
      try {
        const library = await import("pdfjs-dist/legacy/build/pdf.mjs");
        if (!active) return;
        const assets = `/vendor/pdfjs/${library.version}/`;
        library.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
        task = library.getDocument({ url, withCredentials: true,
          cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
        const document = await task.promise;
        if (active) setPdf(document);
      } catch { if (active) { setError(true); setLoading(false); } }
    }
    void load();
    return () => { active = false; void task?.destroy().catch(() => {}); };
  }, [url, attempt]);
  useEffect(() => {
    if (!pdf || !width) return;
    let active = true;
    let render: RenderTask | undefined;
    async function draw() {
      try {
        const page = await pdf!.getPage(pageNumber);
        if (!active || !canvas.current) return;
        const view = page.getViewport({ scale: Math.min(width, 1500) / page.getViewport({ scale: 1 }).width });
        const density = Math.min(window.devicePixelRatio || 1, 2);
        const element = canvas.current;
        element.width = Math.ceil(view.width * density); element.height = Math.ceil(view.height * density);
        element.style.width = `${view.width}px`; element.style.height = `${view.height}px`;
        render = page.render({ canvas: element, viewport: view, transform: [density, 0, 0, density, 0, 0] });
        await render.promise;
        if (active) setLoading(false);
      } catch { if (active) { setError(true); setLoading(false); } }
    }
    void draw();
    return () => { active = false; render?.cancel(); };
  }, [pdf, pageNumber, width]);
  function changePage(next: number) {
    setPageNumber(next); setLoading(true); setError(false); viewport.current?.scrollTo({ top: 0 });
  }
  return <>
    <div ref={viewport} className="pdf-preview-pages" aria-busy={loading}>
      {loading && <p className="pdf-preview-status" role="status">PDF를 불러오는 중…</p>}
      {error && <div className="pdf-preview-status" role="alert"><p>PDF를 미리보지 못했어요. 다시 시도하거나 새 탭에서 열어 주세요.</p><button type="button" onClick={() => { setPdf(null); setError(false); setLoading(true); setPageNumber(1); setAttempt(value => value + 1); }}>다시 시도</button></div>}
      <canvas ref={canvas} hidden={loading || error} role="img" aria-label={`${name} · ${pageNumber}페이지`} />
    </div>
    <footer className="pdf-preview-pagination">
      <button type="button" aria-label="이전 PDF 페이지" disabled={!pdf || pageNumber <= 1 || loading} onClick={() => changePage(pageNumber - 1)}><ChevronLeft size={20} /></button>
      <span aria-live="polite">{pdf ? `${pageNumber} / ${pdf.numPages} 페이지` : "PDF 미리보기"}</span>
      <button type="button" aria-label="다음 PDF 페이지" disabled={!pdf || pageNumber >= pdf.numPages || loading} onClick={() => changePage(pageNumber + 1)}><ChevronRight size={20} /></button>
    </footer>
  </>;
}

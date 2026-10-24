"use client";

import { useEffect, useState } from "react";
import { tripImageMetadataSchema, VISIT_JAPAN_QR_URL, type TripImageMetadata } from "@/lib/trip-images";
import { ImagePreviewButton } from "./image-preview";

export function TripImageList({ tripId }: { tripId: string }) {
  const [images, setImages] = useState<TripImageMetadata[] | null>(null), [error, setError] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/trips/${tripId}/images`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Image list failed");
        const result = await response.json();
        setImages(tripImageMetadataSchema.array().max(10).parse(result.images)); setError(false);
      } catch { if (!controller.signal.aborted) setError(true); }
    }
    void load(); return () => controller.abort();
  }, [tripId, attempt]);
  return <section className="trip-image-list" aria-label="QR·이미지 자료">
    <h3>QR·이미지 자료</h3>
    {error ? <><p role="alert">이미지 목록을 불러오지 못했어요.</p><button type="button" className="trip-image-retry" onClick={() => { setError(false); setAttempt(value => value + 1); }}>목록 다시 불러오기</button></>
      : images === null ? <p role="status">이미지 목록을 불러오는 중…</p>
      : images.length ? <ul>{images.map(image => <li key={image.sha256}><ImagePreviewButton tripId={tripId} image={image} /></li>)}</ul>
      : <p>아직 저장한 이미지가 없습니다.</p>}
    <a className="trip-image-source" href={VISIT_JAPAN_QR_URL} target="_blank" rel="noopener noreferrer">Visit Japan Web QR 화면<br />{VISIT_JAPAN_QR_URL}</a>
    <details className="wallet-web-help"><summary>삼성월렛</summary><p>웹에서는 삼성월렛의 설치 여부를 확인할 수 없어요. 기기에서 월렛을 직접 열거나 공식 안내를 확인해 주세요.</p><a href="https://www.samsung.com/sec/apps/samsung-wallet/" target="_blank" rel="noopener noreferrer">삼성월렛 공식 안내·설치</a></details>
  </section>;
}

"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Map, MapControls, MapMarker, MarkerContent, type MapRef } from "./ui/map";
import { useDarkMode } from "./app-shell";
import { TripSubheader } from "./trip-subheader";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { webUrl, type ArchivedPlace, type ArchiveData } from "@/lib/archive";
import { importSavedSchema } from "@/lib/archive";
import type { Stop, Trip } from "@/lib/types";
import { bounds } from "@/lib/geo";

export function TripResources({ trip, stops, food, photos, documents, initialSaved, hasBudget }: {
  trip: Trip; stops: Stop[]; food: ArchivedPlace[]; photos: ArchiveData["photos"];
  documents: { name: string }[]; initialSaved: string[]; hasBudget: boolean;
}) {
  const [query, setQuery] = useState("");
  const [day, setDay] = useState<string>("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const map = useRef<MapRef>(null);
  const dark = useDarkMode();
  const visible = useMemo(() => food.filter((p) => (!day || p.day === Number(day)) && (!savedOnly || saved.includes(p.id)) && `${p.name} ${p.nameKo} ${p.nameEn} ${p.cuisine}`.toLowerCase().includes(query.toLowerCase())), [food, day, savedOnly, saved, query]);
  const days = [...new Set(food.map((p) => p.day))].sort((a, b) => a - b);
  const picked = food.find((p) => p.id === selected);
  useEffect(() => {
    if (visible.length) map.current?.fitBounds(bounds(visible), { padding: 45, maxZoom: 15 });
  }, [visible]);

  async function save(ids: string[], value: boolean) {
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const res = await fetch(`/api/trips/${trip.id}/saved`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, saved: value }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setSaved(data.ids); setStatus(value ? "즐겨찾기에 저장했습니다." : "즐겨찾기를 해제했습니다.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function importSaved(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error("즐겨찾기 파일이 너무 큽니다.");
      const value = importSavedSchema.safeParse(JSON.parse(await file.text()));
      if (!value.success) throw new Error("즐겨찾기 내보내기 파일을 선택해 주세요.");
      await save(value.data.ids, true);
    } catch (error) { setStatus(error instanceof Error ? error.message : "파일을 읽지 못했습니다."); }
  }
  function focus(place: ArchivedPlace) {
    setSelected(place.id);
    map.current?.flyTo({ center: [place.lng, place.lat], zoom: 15 });
  }
  return <><TripSubheader trip={trip} title="자료·맛집" /><main className="trip-resources mx-auto max-w-6xl space-y-8 px-5 py-6 sm:py-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">{trip.title}</h1><p className="text-muted-foreground mt-1 text-sm">여행 자료</p></div>
      <div className="flex gap-3 text-sm"><Link className="rounded-full border px-4 py-2" href={`/app/${trip.id}/cost`}>{hasBudget ? "예산 보기" : "예산 작성"}</Link><a className="rounded-full border px-4 py-2" href={`/api/trips/${trip.id}/export`}>전체 내보내기</a></div>
    </div>
    {!!documents.length && <section className="rounded-2xl border p-5"><h2 className="font-semibold">원본 문서</h2><ul className="mt-3 flex flex-wrap gap-3">{documents.map((doc, i) => <li key={i}><a className="text-sm underline" href={`/api/trips/${trip.id}/documents/${i}`}>{doc.name}</a></li>)}</ul></section>}
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">저장한 장소 <span className="text-muted-foreground text-sm">{food.length}곳</span></h2>
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" aria-label="맛집 검색" placeholder="이름·음식으로 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="맛집 일차" className="rounded-lg border bg-background px-3" value={day} onChange={(e) => setDay(e.target.value)}><option value="">전체 일차</option>{days.map((d) => <option key={d} value={d}>{d === 0 ? "출국 전날" : `${d}일차`}</option>)}</select>
        <Button variant={savedOnly ? "default" : "outline"} onClick={() => setSavedOnly(!savedOnly)}>즐겨찾기 {saved.length}</Button>
        <label className="cursor-pointer rounded-lg border px-3 py-2 text-sm">즐겨찾기 가져오기<input type="file" accept="application/json,.json" disabled={busy} className="sr-only" onChange={(e) => { void importSaved(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      {status && <p role="status" className="text-sm">{status}</p>}
      {!!food.length && <div className="relative h-80 overflow-hidden rounded-2xl border">
        <Map ref={map} cooperativeGestures locale={{ "CooperativeGesturesHandler.MobileHelpText": "두 손가락으로 지도를 움직여 보세요" }} theme={dark ? "dark" : "light"} styles={{ light: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json", dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json" }} bounds={bounds(stops)} fitBoundsOptions={{ padding: 45 }} localIdeographFontFamily="system-ui, sans-serif">
          <MapControls />{visible.map((p) => <MapMarker key={p.id} longitude={p.lng} latitude={p.lat} onClick={() => focus(p)}><MarkerContent><button type="button" aria-label={`${p.nameKo || p.name} 지도에서 보기`} className="resource-map-pin"><span className={`block size-3 rounded-full border-2 border-white ${saved.includes(p.id) ? "bg-route-flight" : "bg-route-ground"}`} /></button></MarkerContent></MapMarker>)}
        </Map>
        {picked && <div className="absolute bottom-4 left-4 max-w-64 rounded-xl border bg-background p-3 text-sm shadow"><p className="font-medium">{picked.nameKo || picked.name}</p><p>{picked.name}</p><a className="underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(picked.name)}`} target="_blank" rel="noreferrer">구글지도</a></div>}
      </div>}
      <p className="text-muted-foreground text-xs">지도에서 찾은 장소와 가져온 여행 자료를 함께 보관해요. 영업시간은 방문 전에 확인해 주세요.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map((place) => {
        const photo = webUrl(photos[place.id]?.image) ?? webUrl(place.image);
        const website = webUrl(place.website);
        const host = stops.find((s) => s.id === place.stopId || s.source_id === place.stopId);
        return <article key={place.id} className={`overflow-hidden rounded-2xl border ${selected === place.id ? "border-primary" : ""}`}>
          {photo && <div className="h-36 overflow-hidden bg-muted"><Image unoptimized width={640} height={360} src={photo} alt={place.nameKo || place.name} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /></div>}
          <div className="space-y-2 p-4"><div className="flex items-start justify-between gap-2"><button className="text-left font-semibold" onClick={() => focus(place)}>{place.nameKo || place.name}</button><button disabled={busy} aria-label={`${place.name} 즐겨찾기`} aria-pressed={saved.includes(place.id)} onClick={() => void save([place.id], !saved.includes(place.id))} className="px-2 text-xl">{saved.includes(place.id) ? "★" : "☆"}</button></div>
            {place.nameKo && place.nameKo !== place.name && <p className="text-muted-foreground text-xs">{place.name}</p>}
            <p className="text-sm">{place.day === 0 ? "출국 전날" : `${place.day}일차`} · {place.cuisine || place.kind}{host ? ` · ${host.name} 근처` : ""}</p>
            {place.addr && <p className="text-muted-foreground text-xs">{place.addr}</p>}{place.hours && <p className="text-xs">{place.hours}</p>}{place.phone && <p className="text-xs">{place.phone}</p>}
            <div className="flex gap-3 pt-2 text-sm"><a className="underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`} target="_blank" rel="noreferrer">구글지도</a><a className="underline" href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`} target="_blank" rel="noreferrer">길찾기</a>{website && <a className="underline" href={website} target="_blank" rel="noreferrer">웹사이트</a>}</div>
          </div>
        </article>;
      })}</div>
      {!visible.length && <div className="rounded-2xl border border-dashed px-5 py-10 text-center text-muted-foreground"><p>{food.length ? "조건에 맞는 장소가 없습니다." : "지도에서 마음에 드는 맛집·카페·숙소를 저장해 보세요."}</p>{!food.length && <Link className="mt-4 inline-flex min-h-11 items-center rounded-full border px-4 text-sm text-primary" href={`/app/${trip.id}`}>지도에서 장소 찾기</Link>}</div>}
    </section>
  </main></>;
}

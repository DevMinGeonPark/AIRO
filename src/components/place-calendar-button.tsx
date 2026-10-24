"use client";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import type { Stop, Trip } from "@/lib/types";
import { placeCalendarFile } from "@/lib/place-calendar";

export function PlaceCalendarButton({ trip, stop, timeZone }: { trip: Trip; stop: Stop; timeZone: string }) {
  const [message,setMessage] = useState("");
  function download() {
    try {
      const file = placeCalendarFile(trip,stop,timeZone); if (!file) return;
      const url = URL.createObjectURL(new Blob([file.content],{type:"text/calendar;charset=utf-8"}));
      const link = document.createElement("a"); link.href=url; link.download=file.filename; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),60000);
      setMessage("캘린더 파일을 열고 기기의 캘린더에서 저장해 주세요.");
    } catch { setMessage("캘린더 파일을 만들지 못했어요. 날짜와 시간대를 확인해 주세요."); }
  }
  return <div className="place-calendar"><button type="button" className="inline-flex min-h-11 items-center gap-2 text-xs text-primary" disabled={!trip.start_date} onClick={download}><CalendarPlus size={16} />캘린더에 추가</button>
    {!trip.start_date && <p className="text-xs text-muted-foreground">여행 시작일을 먼저 정해 주세요.</p>}{message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}</div>;
}

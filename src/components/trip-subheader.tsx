"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DarkToggle } from "@/components/app-shell";
import type { Trip } from "@/lib/types";

/** 여행 하위 화면(예산·자료·설정)이 같이 쓰는 복귀 헤더. 휴대폰에서 56px 한 줄, 안전 영역 포함. */
export function TripSubheader({ trip, title, action }: { trip: Trip; title: string; action?: React.ReactNode }) {
  return (
    <header className="trip-subheader bg-card/90 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-6xl items-center gap-1 px-2 sm:px-4">
        <Link href={`/app/${trip.id}`} className="flex min-w-0 flex-1 items-center gap-1 rounded-full py-1 pr-2 text-sm hover:text-primary">
          <span className="grid size-11 shrink-0 place-items-center text-muted-foreground"><ArrowLeft className="size-5" /></span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{trip.title}</span>
            <span className="block text-xs text-muted-foreground">{title}</span>
          </span>
        </Link>
        {action}
        <DarkToggle />
      </div>
    </header>
  );
}

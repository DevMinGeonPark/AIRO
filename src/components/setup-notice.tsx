"use client";

import { useState } from "react";
import { demoEnabled } from "@/lib/supabase/config";

/**
 * 자격증명 없이 데모 모드로 돌고 있다는 한 줄 안내.
 * 헤더 아래에 얇게 깔리고, 닫으면 그 탭에서는 다시 뜨지 않는다.
 */
export function SetupNotice({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(true);
  if (configured || !demoEnabled || !open) return null;
  return (
    <div className="bg-muted/40 border-b">
      <div className="text-muted-foreground mx-auto flex max-w-6xl items-center gap-2.5 px-6 py-2 text-xs">
        <span
          aria-hidden
          className="size-1.5 shrink-0 rounded-full bg-amber-500"
        />
        <p className="min-w-0 flex-1 truncate">
          <span className="text-foreground font-medium">미리보기</span> · 이 환경의 여행은 개발용으로 저장됩니다.
        </p>
        <button
          onClick={() => setOpen(false)}
          aria-label="안내 닫기"
          className="hover:text-foreground shrink-0 px-1 leading-none"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

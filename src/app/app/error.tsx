"use client";
export default function AccountError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg space-y-4 px-6 py-20"><h1 className="text-xl font-semibold">여행을 불러오지 못했습니다</h1><p>연결 상태를 확인한 뒤 다시 시도해 주세요.</p><button onClick={reset} className="rounded-full border px-4 py-2">다시 불러오기</button></main>;
}

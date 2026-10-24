import { z } from "zod";
import { VISIT_JAPAN_QR_URL } from "./trip-images";

export const todoCategories = { packing: "챙길 것", documents: "여권·비자·서류", tasks: "출국 준비" } as const;
export const predepartureSchema = z.object({
  revision: z.number().int().min(0).max(2147483645),
  items: z.array(z.object({
    id: z.uuid(), title: z.string().trim().min(1).max(200),
    category: z.enum(["packing", "documents", "tasks"]), done: z.boolean(),
  }).strict()).max(100),
}).strict().refine(value => new Set(value.items.map(item => item.id)).size === value.items.length, "중복된 항목입니다.");
export type Predeparture = z.infer<typeof predepartureSchema>;
export type TodoCategory = keyof typeof todoCategories;

export function defaultPredeparture(): Predeparture {
  const rows: [TodoCategory, string][] = [
    ["packing", "여권·지갑·결제 카드 챙기기"], ["packing", "충전기·보조배터리·어댑터 챙기기"], ["packing", "복용약·세면도구·옷 챙기기"],
    ["documents", "여권 유효기간 확인"], ["documents", "목적지 비자 필요 여부 확인·필요 시 신청"], ["documents", "항공권·숙소 예약 확인서 저장"],
    ["tasks", "항공편·체크인·공항 이동 시간 확인"], ["tasks", "수하물 규정·로밍 또는 eSIM 확인"],
  ];
  return { revision: 0, items: rows.map(([category, title], index) => ({ id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, category, title, done: false })) };
}

export const japanPreparationLinks = [
  { title: "일본 비자 안내·신청 방법", description: "주대한민국일본국대사관", url: "https://www.kr.emb-japan.go.jp/itpr_ko/visa_application.html" },
  { title: "Visit Japan Web · QR 화면", description: "로그인 후 여행을 선택해 주세요", url: VISIT_JAPAN_QR_URL },
];

import Link from "next/link";
import Image from "next/image";
import { Nav, Footer } from "@/components/marketing";
import credits from "@/lib/landing-photo-credits.json";

export const metadata = { title: "사진 출처 · AIRO" };
export default function PhotoCredits() {
  return <><Nav /><main className="mx-auto max-w-6xl px-6 py-16"><Link href="/" className="text-sm text-muted-foreground">← AIRO로 돌아가기</Link><h1 className="mt-6 text-3xl font-normal">여행 사진 출처</h1><p className="mt-4 text-sm leading-7 text-muted-foreground">각 도시의 사진을 담아준 사진가들을 소개합니다. 사진은 카드에 맞춰 크기와 표시 영역을 조정했습니다. 원본과 이용 조건은 아래 링크에서 확인할 수 있습니다.</p><div className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">{credits.map(photo => <article key={photo.id} id={photo.id} className="min-w-0"><Image src={photo.image} alt={`${photo.city}의 풍경`} width={480} height={300} sizes="(max-width: 640px) 90vw, 360px" className="aspect-[8/5] w-full rounded-xl object-cover" /><h2 className="mt-4 text-lg">{photo.city}</h2><p className="mt-2 break-words text-xs leading-6 text-muted-foreground">© {photo.author}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"><a href={photo.source} target="_blank" rel="noreferrer" className="underline underline-offset-4">사진 원본</a><a href={photo.licenseUrl || photo.source} target="_blank" rel="noreferrer" className="underline underline-offset-4">{photo.license}</a></div></article>)}</div></main><Footer /></>;
}

import { ExternalLink, FileText } from "lucide-react";
import { buttonVariants } from "./ui/button";
import { stopAttachments, type TripAttachments } from "@/lib/trip-attachments";
import { PdfPreviewButton } from "./pdf-preview";
import type { Stop } from "@/lib/types";
import { BookingPlatformLink } from "./booking-platform-link";

const bookingLabels = { not_booked: "미예약", pending: "예약 대기", confirmed: "예약 확정", cancelled: "예약 취소" };
const paymentLabels = { unpaid: "미결제", partial: "일부 결제", paid: "결제 완료", refunded: "환불 완료" };

export function StopAttachmentActions({ tripId, stop, attachments }: { tripId: string; stop: Stop; attachments: TripAttachments }) {
  const { documents, reservations, links } = stopAttachments(stop, attachments);
  if (!documents.length && !reservations.length && !links.length) return null;
  const style = buttonVariants({ size: "sm", variant: "outline", className: "min-h-11 h-auto w-full justify-start gap-2 rounded-xl px-3 py-2 text-left whitespace-normal" });
  return <section className="stop-attachments mt-2 space-y-2" aria-label="예약 및 첨부 자료">
    <div className="grid gap-2">
      {documents.map(doc => <PdfPreviewButton key={doc.sha256} className={style} tripId={tripId} document={doc}>
        <FileText className="size-4 shrink-0" /><span className="min-w-0"><span className="block">PDF 보기</span><span className="mt-0.5 block break-all text-[11px] font-normal text-muted-foreground">{doc.name}</span></span>
      </PdfPreviewButton>)}
      {links.map(link => <BookingPlatformLink key={link.href} className={style} href={link.href}><ExternalLink className="size-4 shrink-0" />{link.label}</BookingPlatformLink>)}
    </div>
    {reservations.map(reservation => <div className="rounded-xl bg-secondary/60 px-3 py-2 text-xs leading-relaxed" key={reservation.id}>
      <p className="font-medium">{reservation.name}</p>
      <p className="mt-1 text-muted-foreground">{bookingLabels[reservation.bookingStatus]} · {paymentLabels[reservation.paymentStatus]}</p>
      {reservation.reference && <p className="mt-1 break-all">예약번호 {reservation.reference}</p>}
      {reservation.note && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{reservation.note}</p>}
    </div>)}
  </section>;
}

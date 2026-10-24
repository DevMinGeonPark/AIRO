import { apiRoute } from "@/lib/api";
import { readTripImage } from "@/lib/trip-images-store";

export const GET = apiRoute(async (request: Request, { params }: { params: Promise<{ tripId: string; sha256: string }> }) => {
  const { tripId, sha256 } = await params;
  const image = await readTripImage(tripId, sha256);
  const extension = image.mime === "image/png" ? "png" : "jpg";
  return new Response(Buffer.from(image.base64, "base64"), { headers: {
    "Content-Type": image.mime, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `${new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="travel-image.${extension}"; filename*=UTF-8''${encodeURIComponent(image.name)}.${extension}`,
  } });
}, true);

import { apiRoute, HttpError } from "@/lib/api";
import { attachTripImage, listTripImages } from "@/lib/trip-images-store";
import { readMcpJson } from "@/lib/mcp-http";

type Context = { params: Promise<{ tripId: string }> };
export const GET = apiRoute(async (_request: Request, { params }: Context) => {
  const { tripId } = await params;
  return Response.json({ images: await listTripImages(tripId) });
}, true);
export const POST = apiRoute(async (request: Request, { params }: Context) => {
  const { tripId } = await params;
  let input: unknown;
  try { input = await readMcpJson(request, 3 * 1024 * 1024); }
  catch (error) { if (error instanceof SyntaxError) throw error; throw new HttpError(413, "이미지 요청은 최대 3 MiB입니다."); }
  return Response.json({ image: await attachTripImage(tripId, input) }, { status: 201 });
}, true);

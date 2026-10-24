import { managementRoute, managementBody } from "@/lib/mobile-management";
import { toolSchemas } from "@/lib/tool-contracts";
import { getChange, revertChange } from "@/lib/trip-management-store";

type Context = { params: Promise<{ tripId: string; changeId: string }> };
export const GET = managementRoute(async (_request, { params }: Context) =>
  Response.json(await getChange(toolSchemas.getChange.parse(await params))));
export const POST = managementRoute(async (request, { params }: Context) => {
  const input = await managementBody(request, toolSchemas.revertChange.omit({ tripId: true, changeId: true }));
  return Response.json(await revertChange(toolSchemas.revertChange.parse({ ...input, ...await params })));
});

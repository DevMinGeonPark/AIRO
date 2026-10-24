import "server-only";
import * as choices from "./stop-choices-store";
import * as store from "./store";
import { getArchive, getSavedPlaces } from "./archive-store";
import * as management from "./trip-management-store";
import { getTrip } from "./store";
import { searchPlaces } from "./places";
import { roadRoute } from "./road-routing";
import { bindTripTools, createToolRunner } from "./tool-runtime";
import { toolDefinitions, toolParameters, type ToolName, type ToolPermission } from "./tool-contracts";

export const runTool = createToolRunner({ ...store, ...management, ...choices, getArchive, getSavedPlaces, searchPlaces, roadRoute });
const runOsmTool = createToolRunner({ ...store, ...management, ...choices, getArchive, getSavedPlaces, roadRoute,
  searchPlaces: (query, near, limit) => searchPlaces(query, near, limit, undefined, { allowGoogle: false }),
});
export const tripToolRunner = (tripId: string, options: { allowGoogle?: boolean } = {}) =>
  bindTripTools(options.allowGoogle === false ? runOsmTool : runTool, tripId);
export const tools = (Object.keys(toolDefinitions) as ToolName[]).map(name => ({ name, ...toolDefinitions[name], parameters: toolParameters(name) }));
export const MUTATING = new Set<string>(tools.filter(t => t.permission === "trips:write").map(t => t.name));
export const mcpToolList = (permissions: readonly ToolPermission[] = ["trips:read", "trips:write"]) => tools
  .filter(t => permissions.includes(t.permission))
  .map(t => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.parameters,
    annotations: { readOnlyHint: t.permission === "trips:read", destructiveHint: t.destructive, idempotentHint: t.idempotent, openWorldHint: t.openWorld } }));

/** Trip chat never exposes account tools or accepts a model-selected trip ID. */
export function chatToolSchemas() {
  return tools.filter(t => t.scope === "trip").map(t => {
    const { tripId: _drop, ...properties } = t.parameters.properties;
    void _drop;
    return { type: "function" as const, function: { name: t.name, description: t.description,
      parameters: { type: "object", properties, required: t.parameters.required?.filter(k => k !== "tripId"), additionalProperties: false } } };
  });
}

/** 모델에게 현재 일정을 보여주는 요약. stopId 를 포함해야 수정 도구가 동작한다. */
export async function itinerarySnapshot(tripId: string) {
  const detail = await getTrip(tripId);
  if (!detail) return "(여행을 찾을 수 없음)";
  if (!detail.stops.length) return `여행 "${detail.trip.title}" — 아직 지점이 없습니다.`;
  const lines = detail.stops.map(
    (s) =>
      `- Day ${s.day} #${s.position} [${s.id}] ${s.name} (${s.lat.toFixed(4)}, ${s.lng.toFixed(4)})` +
      `${s.choice ? ` [선택형 ${s.choice.label}, revision=${s.choice.revision}, 선택=${s.choice.selectedId ?? "미정"}, 후보=${JSON.stringify(s.choice.candidates)}]` : ""}${s.time ? ` ${s.time}` : ""}${s.mode === "flight" ? " ✈" : ""}${s.note ? ` — ${s.note}` : ""}`,
  );
  return `여행 "${detail.trip.title}" 현재 일정:\n${lines.join("\n")}`;
}

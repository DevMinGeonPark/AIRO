import "server-only";
import { createClient } from "./supabase/server";
import { getTrip } from "./store";
import { ManagementError } from "./trip-management";
import type { ToolInput } from "./tool-contracts";
import type { Stop } from "./types";

async function mutate(tripId: string, action: string, input: Record<string, unknown>) {
  if (!await getTrip(tripId)) throw new ManagementError(404, "여행을 찾을 수 없습니다.");
  const client = await createClient();
  if (!client) throw new ManagementError(503, "선택형 일정은 계정 연결이 필요합니다.");
  const { data, error } = await client.rpc("mutate_stop_choice", { p_trip: tripId, p_action: action, p_input: input });
  if (error) {
    if (error.code === "40001") throw new ManagementError(409, "후보가 변경됐어요. 최신 일정을 확인한 뒤 다시 선택해 주세요.");
    if (error.code === "42501") throw new ManagementError(404, "여행 또는 편집 권한을 확인해 주세요.");
    if (["22023", "23514"].includes(error.code)) throw new ManagementError(400, error.message);
    throw new Error(error.message);
  }
  return { ok: true, stop: data as Stop };
}
export const addChoiceStop = ({ tripId, ...input }: ToolInput<"addChoiceStop">) => mutate(tripId, "add", input);
export const setStopChoices = ({ tripId, ...input }: ToolInput<"setStopChoices">) => mutate(tripId, "configure", input);
export const selectStopChoice = ({ tripId, ...input }: ToolInput<"selectStopChoice">) => mutate(tripId, "select", input);

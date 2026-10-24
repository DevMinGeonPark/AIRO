import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "./supabase/server";
import { getTrip } from "./store";
import { expenseBudgetSchema, emptyExpenseBudget, expenseTotals } from "./expense-budget";
import { MAX_PDF_BYTES, ManagementError, emptyReservations, emptyNotificationSettings, reservationsSchema, notificationSettingsSchema } from "./trip-management";
import type { ToolInput } from "./tool-contracts";

async function clientFor(tripId: string) {
  if (!await getTrip(tripId)) throw new ManagementError(404, "여행을 찾을 수 없습니다.");
  const client = await createClient();
  if (!client) throw new ManagementError(503, "자료 관리에는 계정 데이터베이스 연결이 필요합니다.");
  return client;
}
async function readField(tripId: string, field: string) {
  const client = await clientFor(tripId);
  const { data, error } = await client.from("trip_archives").select(`data->${field}`).eq("trip_id", tripId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown> | null)?.[field] ?? null;
}
async function rpc(tripId: string, name: string, args: Record<string, unknown>) {
  const client = await clientFor(tripId);
  const { data, error } = await client.rpc(name, { p_trip: tripId, ...args });
  if (error) {
    if (error.code === "40001") throw new ManagementError(409, "다른 곳에서 자료가 변경됐습니다. 최신 자료와 변경 이력을 조회한 뒤 다시 시도하세요.");
    if (["22023", "23514"].includes(error.code)) throw new ManagementError(400, error.message);
    if (error.code === "42501") throw new ManagementError(404, "자료를 찾을 수 없습니다.");
    throw new Error(error.message);
  }
  return data;
}
type Document = { name: string; mime: "application/pdf"; sha256: string; base64: string; stopIds?: string[] };
const documentInfo = ({ base64, ...doc }: Document, tripId: string) => ({ ...doc, sizeBytes: Buffer.byteLength(base64, "base64"), uri: `airo://trips/${encodeURIComponent(tripId)}/documents/${doc.sha256}` });
export async function listDocuments({ tripId }: ToolInput<"listDocuments">) {
  const documents = (await readField(tripId, "documents") ?? []) as Document[];
  return { tripId, documents: documents.map(doc => documentInfo(doc, tripId)) };
}
export async function getDocument({ tripId, sha256 }: ToolInput<"getDocument">) {
  const documents = (await readField(tripId, "documents") ?? []) as Document[];
  const doc = documents.find(doc => doc.sha256 === sha256);
  if (!doc) throw new ManagementError(404, "PDF를 찾을 수 없습니다. 문서 목록을 다시 조회하세요.");
  return { tripId, document: { ...documentInfo(doc, tripId), base64: doc.base64 } };
}
export async function attachDocument({ tripId, name, base64, stopIds }: ToolInput<"attachDocument">) {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > MAX_PDF_BYTES || bytes.toString("base64") !== base64 || bytes.subarray(0, 5).toString() !== "%PDF-" || !bytes.subarray(-1024).includes(Buffer.from("%%EOF"))) throw new ManagementError(400, "올바른 PDF 원본을 첨부하세요. 파일당 최대 2 MiB입니다.");
  const doc: Document = { name, mime: "application/pdf", base64, sha256: createHash("sha256").update(bytes).digest("hex"), ...(stopIds === undefined ? {} : { stopIds }) };
  const stored = await rpc(tripId, "attach_trip_document", { p_document: doc }) as Document;
  return { ok: true, document: documentInfo(stored, tripId) };
}
export async function getReservations({ tripId }: ToolInput<"getReservations">) {
  return { tripId, ...reservationsSchema.parse(await readField(tripId, "reservations") ?? emptyReservations()) };
}
export async function setReservation({ tripId, revision, reservation }: ToolInput<"setReservation">) {
  const current = await getReservations({ tripId });
  if (current.revision !== revision) throw new ManagementError(409, "예약이 변경됐습니다. 최신 예약을 확인한 뒤 다시 저장하세요.");
  const stops = (await getTrip(tripId))!.stops;
  if ([...(reservation.stopIds ?? []), ...(reservation.stopId ? [reservation.stopId] : [])].some(id => !stops.some(stop => stop.id === id || stop.source_id === id))) throw new ManagementError(400, "이 여행에 속한 장소 ID를 지정하세요.");
  if (reservation.documentSha256s?.length) {
    const { documents } = await listDocuments({ tripId });
    if (reservation.documentSha256s.some(hash => !documents.some(doc => doc.sha256 === hash))) throw new ManagementError(400, "이 여행에 첨부된 PDF를 선택하세요.");
  }
  const entries = current.entries.some(entry => entry.id === reservation.id)
    ? current.entries.map(entry => entry.id === reservation.id ? reservation : entry) : [...current.entries, reservation];
  const value = reservationsSchema.parse({ revision, entries });
  return { ok: true, reservations: await rpc(tripId, "set_trip_management", { p_field: "reservations", p_value: value, p_revision: revision }) };
}
export async function getBudget({ tripId }: ToolInput<"getBudget">) {
  const budget = expenseBudgetSchema.parse(await readField(tripId, "expenseBudget") ?? emptyExpenseBudget());
  return { tripId, budget, totals: expenseTotals(budget) };
}
async function writeBudget({ tripId, revision, entry }: ToolInput<"addBudgetEntry">, create: boolean) {
  const { budget } = await getBudget({ tripId });
  if (budget.revision !== revision) throw new Error("예산이 변경됐습니다. getBudget으로 다시 조회하세요.");
  const exists = budget.entries.some(item => item.id === entry.id);
  if (create === exists) throw new Error(create ? "이미 등록된 예산 ID입니다. 수정 도구를 사용하세요." : "예산 항목을 찾을 수 없습니다.");
  const { revision: _revision, ...value } = expenseBudgetSchema.parse({ ...budget, entries: create ? [...budget.entries, entry] : budget.entries.map(item => item.id === entry.id ? { ...item, ...entry } : item) });
  void _revision;
  const saved = expenseBudgetSchema.parse(await rpc(tripId, "update_trip_budget", { p_budget: value, p_revision: revision }));
  return { ok: true, budget: saved, totals: expenseTotals(saved) };
}
export const addBudgetEntry = (input: ToolInput<"addBudgetEntry">) => writeBudget(input, true);
export const updateBudgetEntry = (input: ToolInput<"updateBudgetEntry">) => writeBudget(input, false);
export async function getNotificationSettings({ tripId }: ToolInput<"getNotificationSettings">) {
  return { tripId, settings: notificationSettingsSchema.parse(await readField(tripId, "notificationSettings") ?? emptyNotificationSettings()), delivery: "not_configured" };
}
export async function updateNotificationSettings({ tripId, settings }: ToolInput<"updateNotificationSettings">) {
  return { ok: true, settings: await rpc(tripId, "set_trip_management", { p_field: "notificationSettings", p_value: settings, p_revision: settings.revision }), delivery: "not_configured" };
}
export async function listChanges({ tripId, beforeId, limit = 20 }: ToolInput<"listChanges">) {
  return await rpc(tripId, "list_trip_changes", { p_before: beforeId ?? null, p_limit: limit }) as Record<string, unknown>;
}
export async function getChange({ tripId, changeId }: ToolInput<"getChange">) {
  return await rpc(tripId, "get_trip_change", { p_change: changeId }) as Record<string, unknown>;
}
export async function revertChange({ tripId, changeId, expectedLatestChangeId }: ToolInput<"revertChange">) {
  return { ok: true, ...await rpc(tripId, "revert_trip_change", { p_change: changeId, p_expected_latest: expectedLatestChangeId }) };
}

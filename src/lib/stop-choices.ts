import { z } from "zod";
import type { Stop } from "./types";

export const choiceCandidateSchema = z.object({
  id: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(300),
  lng: z.number().finite().min(-180).max(180), lat: z.number().finite().min(-90).max(90),
  map_query: z.string().max(500).nullable().default(null),
  note: z.string().max(4000).nullable().default(null),
  mode: z.enum(["ground", "flight"]).default("ground"),
}).strict();
export const choiceFields = {
  label: z.string().trim().min(1).max(100),
  kind: z.enum(["meal", "visit", "stay", "other"]).default("meal"),
  candidates: z.array(choiceCandidateSchema).min(2).max(8).refine(a => new Set(a.map(c => c.id)).size === a.length, "후보 ID가 중복되었습니다."),
};
export const stopChoiceSchema = z.object({
  ...choiceFields, revision: z.number().int().min(0).max(2147483645), selectedId: z.string().nullable(),
}).strict().refine(c => c.selectedId === null || c.candidates.some(a => a.id === c.selectedId), "선택한 후보가 없습니다.");
export type StopChoice = z.infer<typeof stopChoiceSchema>;
export type ChoiceCandidate = z.infer<typeof choiceCandidateSchema>;
export const pendingChoice = (stop: Pick<Stop, "choice">) => Boolean(stop.choice && stop.choice.selectedId === null);
/** A pending slot is a route boundary, never an implicitly chosen first candidate. */
export const routablePair = (a: Stop, b: Stop) => !pendingChoice(a) && !pendingChoice(b);
export function choicePreviewStop(slot: Stop, candidate: ChoiceCandidate): Stop {
  return { ...slot, ...candidate, id: slot.id, choice: { ...slot.choice!, selectedId: candidate.id } };
}

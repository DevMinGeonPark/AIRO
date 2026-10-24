import { automaticCandidates, progressEntry, progressRule, progressStopKey, type ItineraryProgress, type ProgressAction } from "./itinerary-progress";
import type { Stop } from "./types";

type Schedule = { stops: Stop[]; startDate: string | null };
type Pending = { action: ProgressAction; at: number; resolve: ((saved: boolean) => void)[] };
type Options = {
  read: () => Promise<ItineraryProgress>;
  write: (action: ProgressAction, revision: number) => Promise<ItineraryProgress>;
  schedule: () => Schedule;
  now?: () => number;
  changed: (value: ItineraryProgress | null, busy: boolean, error: string) => void;
  idle: () => void;
};

function key(action: ProgressAction) {
  return action.action === "manual" || action.action === "resume" ? `entry:${action.stopId}` : action.action === "rule" ? `rule:${action.rule.stopId}` : action.action;
}

/** Project user intent without changing the server revision used by the next write. */
export function projectProgress(value: ItineraryProgress, action: ProgressAction, schedule: Schedule, at: number): ItineraryProgress {
  const stamp = new Date(at).toISOString();
  if (action.action === "timezone") return { ...value, timeZone: action.timeZone };
  if (action.action === "automatic") return { ...value, entries: [...value.entries, ...automaticCandidates(value, schedule.stops, schedule.startDate, at, action.position).map(candidate => ({ ...candidate, done: true, completedAt: stamp, updatedAt: stamp }))] };
  const id = action.action === "rule" ? action.rule.stopId : action.stopId;
  const stop = schedule.stops.find(stop => stop.id === id || progressStopKey(stop) === id);
  const matches = (stopId: string) => stopId === id || (stop && (stopId === stop.id || stopId === progressStopKey(stop)));
  if (action.action === "rule") return { ...value, rules: [...value.rules.filter(rule => !matches(rule.stopId)), ...(action.rule.mode === "manual" ? [] : [action.rule])] };
  const entries = value.entries.filter(entry => !matches(entry.stopId));
  if (action.action === "manual") entries.push({ stopId: id, done: action.done, source: "manual", completedAt: action.done ? stamp : null, updatedAt: stamp });
  return { ...value, entries };
}

function applied(value: ItineraryProgress, item: Pending, before: ItineraryProgress, schedule: Schedule) {
  const action = item.action;
  if (action.action === "timezone") return value.timeZone === action.timeZone;
  if (action.action === "automatic") return automaticCandidates(before, schedule.stops, schedule.startDate, item.at, action.position).every(candidate => value.entries.some(entry => entry.stopId === candidate.stopId && entry.done));
  const id = action.action === "rule" ? action.rule.stopId : action.stopId;
  const stop = schedule.stops.find(stop => stop.id === id || progressStopKey(stop) === id) ?? { id, source_id: id };
  if (action.action === "rule") { const rule = progressRule(value, stop); return rule.mode === action.rule.mode && (rule.mode === "manual" || rule.radiusMeters === action.rule.radiusMeters); }
  const entry = progressEntry(value, stop);
  return action.action === "resume" ? !entry : entry?.source === "manual" && entry.done === action.done;
}

/** One writer per mounted trip; queued clicks remain visible through conflicts and failures. */
export class ProgressWriteQueue {
  confirmed: ItineraryProgress | null = null;
  value: ItineraryProgress | null = null;
  retryAt = 0;
  private options: Options;
  private pending: Pending[] = [];
  private active: Pending | null = null;
  private running = false;
  private disposed = false;
  private version = 0;
  private error = "";
  constructor(options: Options) { this.options = options; }
  get busy() { return this.running || this.pending.length > 0; }
  private now() { return this.options.now?.() ?? Date.now(); }
  private publish() {
    if (this.disposed) return;
    let value = this.confirmed;
    if (value) for (const item of [...(this.active ? [this.active] : []), ...this.pending]) value = projectProgress(value, item.action, this.options.schedule(), item.at);
    this.value = value;
    this.options.changed(value, this.busy, this.error);
  }
  async refresh() {
    if (this.busy || this.disposed) return;
    const ticket = ++this.version;
    try {
      const value = await this.options.read();
      if (ticket !== this.version || this.disposed || this.busy) return;
      this.confirmed = value; this.error = ""; this.publish(); this.options.idle();
    } catch (error) {
      if (ticket === this.version && !this.disposed) { this.error = error instanceof Error ? error.message : "진행 상태를 불러오지 못했어요."; this.publish(); }
    }
  }
  async submit(actions: ProgressAction[]) {
    if (!this.confirmed || this.disposed) return false;
    ++this.version; this.error = "";
    const results = actions.map(action => new Promise<boolean>(resolve => {
      const index = this.pending.findIndex(item => key(item.action) === key(action));
      const old = index < 0 ? undefined : this.pending.splice(index, 1)[0];
      this.pending.push({ action, at: this.now(), resolve: [...(old?.resolve ?? []), resolve] });
    }));
    this.publish(); void this.pump();
    return (await Promise.all(results)).every(Boolean);
  }
  private async pump() {
    if (this.running || this.disposed) return;
    this.running = true;
    try {
      while (this.pending.length && !this.disposed) {
        const item = this.pending.shift()!; this.active = item; this.publish();
        let saved = false;
        try {
          for (let attempt = 0; ; attempt++) {
            const before = this.confirmed!;
            try {
              this.confirmed = await this.options.write(item.action, before.revision);
              this.retryAt = item.action.action === "automatic" && this.confirmed.revision === before.revision ? this.now() + 15000 : 0;
              saved = true; break;
            } catch (error) {
              // A failed response may still have committed. Read before rollback/retry.
              let recovered = false;
              try { this.confirmed = await this.options.read(); recovered = true; } catch { /* Keep the last confirmed revision. */ }
              if (recovered && applied(this.confirmed!, item, before, this.options.schedule())) { saved = true; break; }
              if (recovered && (error as { status?: number })?.status === 409 && attempt < 2 && !this.disposed) { this.publish(); continue; }
              throw error;
            }
          }
        } catch (error) {
          this.retryAt = this.now() + 60000;
          this.error = error instanceof Error ? error.message : "진행 상태를 저장하지 못했어요.";
        } finally {
          this.active = null; item.resolve.forEach(resolve => resolve(saved)); this.publish();
        }
      }
    } finally {
      this.running = false; this.publish();
      if (!this.disposed) this.options.idle();
    }
  }
  dispose() { this.disposed = true; ++this.version; this.pending.splice(0).forEach(item => item.resolve.forEach(resolve => resolve(false))); }
}

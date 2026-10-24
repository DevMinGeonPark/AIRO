import { parseToolInput, toolDefinitions, type ToolInput, type ToolName, type ToolPermission } from "./tool-contracts";
import { getDayRoute, searchAlongRoute, type RouteProvider, type PlaceProvider } from "./route-tools";
import type * as Choices from "./stop-choices-store";
import type * as Store from "./store";
import type * as Archive from "./archive-store";
import { savedPlacesPage } from "./saved-places-query";
import type * as Management from "./trip-management-store";

type StoreOperations = Pick<typeof Store, "listTrips" | "getTrip" | "createTrip" | "updateTrip" | "deleteTrip" | "addStop" | "moveStop" | "removeStop" | "reorderDay">;
export type ToolDependencies = StoreOperations & typeof Choices & typeof Management & Pick<typeof Archive, "getArchive" | "getSavedPlaces"> & { searchPlaces: PlaceProvider; roadRoute: RouteProvider };

export function bindTripTools(run: (name: string, args: Record<string, unknown>) => Promise<Record<string, unknown>>, tripId: string) {
  return (name: string, args: Record<string, unknown>) => {
    if (!Object.hasOwn(toolDefinitions, name) || toolDefinitions[name as ToolName].scope !== "trip") throw new Error("이 채팅에서 사용할 수 없는 도구입니다.");
    return run(name, { ...args, tripId });
  };
}

/** Dependencies are injected so contracts/order/permissions can be checked without live APIs. */
export function createToolRunner(deps: ToolDependencies, permissions: readonly ToolPermission[] = ["trips:read", "trips:write"]) {
  const ownedTrip = async (tripId: string) => {
    const detail = await deps.getTrip(tripId);
    if (!detail) throw new Error("여행을 찾을 수 없습니다. listTrips에서 현재 계정의 여행 ID를 확인하세요.");
    return detail;
  };
  const handlers: { [N in ToolName]: (input: ToolInput<N>) => Promise<unknown> } = {
    addChoiceStop: a => deps.addChoiceStop(a),
    setStopChoices: a => deps.setStopChoices(a),
    selectStopChoice: a => deps.selectStopChoice(a),
    listSavedPlaces: async a => {
      const detail = await ownedTrip(a.tripId);
      const [archive, saved] = await Promise.all([deps.getArchive(a.tripId), deps.getSavedPlaces(a.tripId)]);
      return savedPlacesPage(archive?.data.food ?? [], saved, detail.stops, a);
    },
    listDocuments: a => deps.listDocuments(a),
    getDocument: a => deps.getDocument(a),
    attachDocument: a => deps.attachDocument(a),
    getReservations: a => deps.getReservations(a),
    setReservation: a => deps.setReservation(a),
    getBudget: a => deps.getBudget(a),
    addBudgetEntry: a => deps.addBudgetEntry(a),
    updateBudgetEntry: a => deps.updateBudgetEntry(a),
    getNotificationSettings: a => deps.getNotificationSettings(a),
    updateNotificationSettings: a => deps.updateNotificationSettings(a),
    listChanges: a => deps.listChanges(a),
    getChange: a => deps.getChange(a),
    revertChange: a => deps.revertChange(a),
    listTrips: async () => ({ trips: await deps.listTrips() }),
    getTrip: async a => {
      const { trip, stops, messages } = await ownedTrip(a.tripId);
      return { trip, stops, ...(a.includeMessages ? { messages } : {}) };
    },
    createTrip: async a => {
      const result = await deps.createTrip(a.title, a.startDate ?? null, a.requestId);
      if ("error" in result) throw new Error(result.error);
      return { ok: true, ...result };
    },
    updateTrip: async a => {
      const trip = await deps.updateTrip(a.tripId, { ...(a.title !== undefined ? { title: a.title } : {}), ...(a.startDate !== undefined ? { start_date: a.startDate } : {}) });
      if (!trip) throw new Error("여행을 찾을 수 없습니다.");
      return { ok: true, trip };
    },
    deleteTrip: async a => {
      const { trip } = await ownedTrip(a.tripId);
      if (trip.title !== a.expectedTitle) throw new Error("여행 이름이 바뀌었습니다. 현재 여행을 다시 확인한 뒤 삭제해 주세요.");
      await deps.deleteTrip(a.tripId, a.expectedTitle);
      return { ok: true, tripId: a.tripId, deleted: true };
    },
    searchPlaces: async a => {
      const detail = await ownedTrip(a.tripId);
      const middle = [...detail.stops].sort((a, b) => a.lng - b.lng)[Math.floor(detail.stops.length / 2)];
      const near = a.near ?? (middle ? { lng: middle.lng, lat: middle.lat } : undefined);
      const result = await deps.searchPlaces(a.query, near, a.limit ?? 8);
      return { ...result, tripId: a.tripId, ...(near ? { near } : {}), nextAction: "후보가 여러 개면 사용자에게 선택을 요청하세요. 선택한 실제 좌표로만 addStop을 호출하세요." };
    },
    addStop: async ({ tripId, requestId, ...input }) => ({ ok: true, stop: await deps.addStop(tripId, input, requestId) }),
    moveStop: async ({ tripId, stopId, requestId, ...patch }) => {
      const stop = await deps.moveStop(tripId, stopId, patch, requestId);
      if (!stop) throw new Error("장소를 찾을 수 없습니다. 현재 일정을 다시 조회하세요.");
      return { ok: true, stop };
    },
    removeStop: async a => {
      await ownedTrip(a.tripId);
      const removed = await deps.removeStop(a.tripId, a.stopId, a.requestId);
      return { ok: true, removed, stopId: a.stopId, ...(removed ? {} : { note: "이미 삭제되었거나 이 여행에 없는 장소입니다." }) };
    },
    reorderDay: async a => ({ ok: true, order: await deps.reorderDay(a.tripId, a.day, a.stopIds, a.requestId) }),
    getDayRoute: async a => ({ tripId: a.tripId, ...await getDayRoute((await ownedTrip(a.tripId)).stops, a, deps.roadRoute) }),
    searchAlongRoute: async a => ({ tripId: a.tripId, ...await searchAlongRoute((await ownedTrip(a.tripId)).stops, a, deps.roadRoute, deps.searchPlaces) }),
  };
  return async (name: string, args: unknown): Promise<Record<string, unknown>> => {
    if (!Object.hasOwn(toolDefinitions, name)) throw new Error(`알 수 없는 도구: ${name}`);
    const key = name as ToolName;
    if (!permissions.includes(toolDefinitions[key].permission)) throw new Error("이 연결은 읽기 전용입니다. 일정 변경 권한으로 다시 연결하세요.");
    const parsed = parseToolInput(key, args);
    // The key chooses both schema and handler; their mapped types remain coupled here.
    const handler = handlers[key] as (input: typeof parsed) => Promise<unknown>;
    return await handler(parsed) as Record<string, unknown>;
  };
}

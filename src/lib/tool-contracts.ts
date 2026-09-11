import { z } from "zod";

const id = z.string().trim().min(1).max(128);
const trip = { tripId: id.describe("listTrips/createTrip에서 받은 여행 ID") };
const day = z.number().int().min(0).max(3650);
const requestId = z.string().min(8).max(120).optional().describe("변경 요청의 고유 ID. 응답을 못 받아 재시도할 때 같은 ID를 재사용하면 중복 저장을 방지한다.");
const coordinates = {
  lng: z.number().finite().min(-180).max(180),
  lat: z.number().finite().min(-90).max(90),
};
const stopFields = {
  name: z.string().trim().min(1).max(300),
  ...coordinates,
  day,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "시간은 HH:mm 형식이어야 합니다.").nullable().optional(),
  note: z.string().max(4000).nullable().optional(),
  map_query: z.string().max(500).nullable().optional(),
  mode: z.enum(["flight", "ground"]).optional(),
};
const placement = {
  afterStopId: id.optional().describe("이 장소 바로 다음에 삽입. 카페를 식당 다음에 추가하려면 식당의 stopId를 지정한다."),
  beforeStopId: id.optional().describe("이 장소 바로 전에 삽입. afterStopId와 함께 사용하지 않는다."),
  position: z.number().int().nonnegative().max(10000).optional().describe("0부터 시작하는 방문 순서. 앞/뒤 장소 ID와 함께 사용하지 않는다. 모두 생략하면 해당 일차의 마지막에 추가한다."),
};
const validPlacement = (value: { afterStopId?: string; beforeStopId?: string; position?: number }) =>
  [value.afterStopId, value.beforeStopId, value.position].filter(v => v !== undefined).length <= 1;

export const toolSchemas = {
  listTrips: z.object({}).strict(),
  getTrip: z.object({ ...trip, includeMessages: z.boolean().optional().describe("기본 false. 여행 대화 기록까지 필요한 경우에만 true") }).strict(),
  createTrip: z.object({ title: z.string().trim().min(1).max(120), startDate: z.iso.date().nullable().optional(), requestId }).strict(),
  updateTrip: z.object({ ...trip, title: z.string().trim().min(1).max(120).optional(), startDate: z.iso.date().nullable().optional() }).strict()
    .refine(v => v.title !== undefined || v.startDate !== undefined, "변경할 제목이나 시작일을 지정하세요."),
  deleteTrip: z.object({ ...trip, expectedTitle: z.string().trim().min(1).max(120).describe("getTrip으로 확인한 현재 여행 이름. 전체 여행 삭제를 사용자가 명확히 요청한 경우에만 실행한다.") }).strict(),
  searchPlaces: z.object({
    ...trip,
    query: z.string().trim().min(1).max(200),
    near: z.object(coordinates).strict().optional(),
    limit: z.number().int().min(1).max(20).optional(),
  }).strict(),
  addStop: z.object({ ...trip, ...stopFields, ...placement, requestId }).strict().refine(validPlacement, "삽입 기준은 앞 장소, 뒤 장소, 순서 중 하나만 지정하세요."),
  moveStop: z.object({
    ...trip, stopId: id,
    ...z.object(stopFields).partial().shape,
    ...placement, requestId,
  }).strict().refine(validPlacement, "삽입 기준은 하나만 지정하세요.")
    .refine(v => Object.keys(v).some(k => !["tripId", "stopId", "requestId"].includes(k)), "변경할 내용을 지정하세요.")
    .refine(v => v.afterStopId !== v.stopId && v.beforeStopId !== v.stopId, "자기 자신을 삽입 기준으로 선택할 수 없습니다."),
  removeStop: z.object({ ...trip, stopId: id, requestId }).strict(),
  reorderDay: z.object({
    ...trip, day, requestId,
    stopIds: z.array(id).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, "중복된 장소 ID가 있습니다."),
  }).strict(),
  getDayRoute: z.object({
    ...trip, day, profile: z.enum(["pedestrian", "auto"]).optional(),
    includeGeometry: z.boolean().optional().describe("지도에 그릴 실제 도로 좌표가 필요할 때만 true. 기본은 거리, 예상 이동 시간, 방문 순서를 반환한다."),
  }).strict(),
  searchAlongRoute: z.object({
    ...trip, day,
    query: z.string().trim().min(1).max(200).describe("찾는 장소 종류. 예: 식당, 카페, 베이커리"),
    fromStopId: id.optional().describe("탐색할 경로의 시작 장소. 생략하면 해당 일차의 첫 장소"),
    toStopId: id.optional().describe("탐색할 경로의 끝 장소. 생략하면 해당 일차의 마지막 장소"),
    radiusMeters: z.number().int().min(100).max(3000).optional(),
    limit: z.number().int().min(1).max(12).optional(),
    profile: z.enum(["pedestrian", "auto"]).optional(),
  }).strict(),
};

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>;
export type ToolScope = "trip" | "account";
export type ToolPermission = "trips:read" | "trips:write";

type Definition = {
  title: string;
  description: string;
  scope: ToolScope;
  permission: ToolPermission;
  destructive: boolean;
  idempotent: boolean;
  openWorld: boolean;
};
export const toolDefinitions: Record<ToolName, Definition> = {
  listTrips: { title: "내 여행 목록", description: "연결한 계정의 여행 목록을 조회한다. 다른 계정의 여행에는 접근할 수 없다.", scope: "account", permission: "trips:read", destructive: false, idempotent: true, openWorld: false },
  getTrip: { title: "여행 일정 확인", description: "여행의 현재 방문 순서와 실제 stopId를 읽는다. 일정을 변경하기 전에 조회하고 반환된 ID를 사용한다.", scope: "account", permission: "trips:read", destructive: false, idempotent: true, openWorld: false },
  createTrip: { title: "새 여행 만들기", description: "여행 이름과 선택한 시작일로 계정에 여행을 저장한다. requestId를 지정하고 재시도에는 같은 ID를 사용한다. 요금제 한도를 초과하면 오류를 반환한다.", scope: "account", permission: "trips:write", destructive: false, idempotent: false, openWorld: false },
  updateTrip: { title: "여행 정보 수정", description: "여행 이름 또는 시작일을 변경한다. 시작일 null은 시작일 지우기다.", scope: "account", permission: "trips:write", destructive: true, idempotent: true, openWorld: false },
  deleteTrip: { title: "여행 전체 삭제", description: "여행과 그 일정·대화·자료를 삭제한다. 사용자가 명확하게 여행 전체 삭제를 요청한 경우에만, 현재 이름을 확인한 뒤 실행한다.", scope: "account", permission: "trips:write", destructive: true, idempotent: true, openWorld: false },
  searchPlaces: { title: "실제 장소 검색", description: "장소 이름이나 종류로 실제 후보를 검색한다. tripId는 필수다. near가 없으면 여행의 실제 장소를 기준으로 한다. 빈 여행은 query에 도시와 장소명을 함께 넣는다. 좌표·평점·영업 정보는 검색 결과에 있는 값만 사용하고 후보가 여러 개면 사용자가 고르게 한다.", scope: "trip", permission: "trips:read", destructive: false, idempotent: true, openWorld: true },
  addStop: { title: "경유지 추가", description: "searchPlaces/searchAlongRoute에서 확인한 장소를 일정에 추가한다. 식당 다음에 카페를 추가할 때 afterStopId에 식당 ID를 넣는다. 기존 장소는 유지하고 방문 순서를 함께 갱신한다. 재시도에는 같은 requestId를 사용한다.", scope: "trip", permission: "trips:write", destructive: false, idempotent: false, openWorld: false },
  moveStop: { title: "장소 수정·이동", description: "기존 장소의 일차, 순서, 시간, 메모 또는 좌표를 변경한다. afterStopId/beforeStopId로 기준 장소를 지정할 수 있다. 기존 좌표를 임의로 만들어 바꾸지 않는다.", scope: "trip", permission: "trips:write", destructive: true, idempotent: true, openWorld: false },
  removeStop: { title: "경유지 삭제", description: "선택한 장소 하나를 일정에서 삭제하고 남은 방문 순서를 유지한다. 사용자가 요청한 장소의 stopId만 사용한다.", scope: "trip", permission: "trips:write", destructive: true, idempotent: true, openWorld: false },
  reorderDay: { title: "방문 순서 변경", description: "일차의 방문 순서를 지정한다. 현재 일정의 stopId만 사용하며 목록에서 빠진 장소는 기존 순서대로 뒤에 남긴다. 장소를 삭제하지 않는다.", scope: "trip", permission: "trips:write", destructive: true, idempotent: true, openWorld: false },
  getDayRoute: { title: "실제 이동 경로", description: "일차의 방문 순서대로 실제 도로 경로와 거리·예상 이동 시간을 조회한다. 도로를 구하지 못하면 직선 경로를 만들어내지 않고 실패를 반환한다. 비행 구간은 도보·도로 경로와 구분한다.", scope: "trip", permission: "trips:read", destructive: false, idempotent: true, openWorld: true },
  searchAlongRoute: { title: "가는 길의 식당·카페", description: "저장된 두 장소 사이의 실제 도로를 따라 식당·카페 등의 후보를 찾는다. 후보와 경로까지의 대략적인 거리를 반환하며 바로 저장하지 않는다. 사용자가 고르면 addStop에 앞/뒤 장소 ID를 지정한다.", scope: "trip", permission: "trips:read", destructive: false, idempotent: true, openWorld: true },
};

export function parseToolInput<N extends ToolName>(name: N, value: unknown): ToolInput<N> {
  return toolSchemas[name].parse(value) as ToolInput<N>;
}

export function toolParameters(name: ToolName) {
  const { $schema: _schema, ...schema } = z.toJSONSchema(toolSchemas[name]);
  void _schema;
  return schema as { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };
}

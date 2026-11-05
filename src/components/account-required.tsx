import { TripSubheader } from "./trip-subheader";
import type { Trip } from "@/lib/types";

/** Demo storage (.demo-db.json) has no account database: management, budget, history and progress need one. */
export function AccountRequired({ trip, title }: { trip: Trip; title: string }) {
  return <><TripSubheader trip={trip} title={title} /><main className="trip-management">
    <h1>{title}</h1>
    <p role="status">데모 모드에서는 사용할 수 없습니다. 예산·자료·예약·변경 이력·선택형 일정은 Community Edition(SELF_HOSTING.md) 또는 계정 저장소를 연결하면 사용할 수 있습니다.</p>
  </main></>;
}

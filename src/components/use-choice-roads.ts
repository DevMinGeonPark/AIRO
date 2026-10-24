"use client";
import { useEffect, useState } from "react";
import { pendingChoice } from "@/lib/stop-choices";
import type { Stop } from "@/lib/types";

type Preview = { id: string; coordinates: [number, number][] };
/** Load bounded road alternatives only while the user has opened a choice slot. */
export function useChoiceRoads(tripId: string, stops: Stop[], active: Stop | null) {
  const index = active ? stops.findIndex(s => s.id === active.id) : -1;
  const from = stops[index - 1], to = stops[index + 1];
  const plan = JSON.stringify(active?.choice && pendingChoice(active) && index >= 0 ? active.choice.candidates.filter(c => c.id !== active.choice!.selectedId).flatMap(candidate => [
    ...(from && !pendingChoice(from) && candidate.mode !== "flight" ? [{ fromId: from.id, toId: active.id, toCandidateId: candidate.id }] : []),
    ...(to && !pendingChoice(to) && to.mode !== "flight" ? [{ fromId: active.id, toId: to.id, fromCandidateId: candidate.id }] : []),
  ]) : []);
  const key = `${tripId}:${active?.choice?.revision}:${plan}`;
  const [state, setState] = useState<{ key: string; routes: Preview[]; loading: boolean; failed: boolean }>({key:"",routes:[],loading:false,failed:false});
  useEffect(() => {
    const controller = new AbortController();
    const requests = JSON.parse(plan) as Record<string,string>[];
    void (async () => {
      setState({key,routes:[],loading:requests.length>0,failed:false});
      let failed = false;
      for (let i=0;i<requests.length;i++) {
        if (controller.signal.aborted) return;
        try {
          const response = await fetch(`/api/trips/${tripId}/routes`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(requests[i]),signal:controller.signal});
          if (!response.ok) throw Error("route");
          const road = await response.json();
          if (controller.signal.aborted) return;
          setState(s => ({...s,routes:[...s.routes,{id:`${i}`,coordinates:road.coordinates}]}));
        } catch { if (!controller.signal.aborted) failed=true; }
      }
      if (!controller.signal.aborted) setState(s=>({...s,loading:false,failed}));
    })();
    return () => controller.abort();
  },[key,plan,tripId]);
  return state.key===key ? state : {routes:[],loading:Boolean(active?.choice),failed:false};
}

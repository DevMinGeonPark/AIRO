import { tripLegs } from "@/lib/geo";
import type { Stop } from "@/lib/types";

/** 선만 있으면 허전해서 깔아두는 옅은 점 격자. 지도 느낌만 낸다. */
function Grid() {
  return (
    <>
      <defs>
        <pattern id="thumb-grid" width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect
        width="100%"
        height="100%"
        fill="url(#thumb-grid)"
        className="text-muted-foreground/15"
      />
    </>
  );
}

const W = 160;
const H = 80;
const PAD = 11;

/**
 * 여행 카드용 경로 미니맵. 타일을 부르지 않고 좌표만 정규화해 선과 점으로 그린다.
 * 색과 선 규칙은 앱 지도와 같다 — 항공은 보조색 점선 곡선, 육상은 블루 실선.
 */
export function RouteThumb({ stops }: { stops: Stop[] }) {
  if (!stops.length)
    return (
      <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-full w-full">
        <Grid />
        <path
          d={`M${PAD} ${H - PAD} Q ${W / 2} ${PAD} ${W - PAD} ${H / 2}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="4 5"
          className="text-muted-foreground/35"
        />
      </svg>
    );

  const lngs = stops.map((s) => s.lng);
  const lats = stops.map((s) => s.lat);
  const [w0, w1] = [Math.min(...lngs), Math.max(...lngs)];
  const [s0, s1] = [Math.min(...lats), Math.max(...lats)];
  // 한 점뿐이거나 일직선이면 폭이 0 이라 나눗셈이 깨진다.
  const spanX = w1 - w0 || 1;
  const spanY = s1 - s0 || 1;
  // 가로세로 비율을 유지해야 동선 모양이 여행마다 실제로 달라 보인다.
  const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
  const offX = (W - spanX * scale) / 2;
  const offY = (H - spanY * scale) / 2;
  const x = (lng: number) => offX + (lng - w0) * scale;
  const y = (lat: number) => H - offY - (lat - s0) * scale;

  const { flight, ground } = tripLegs(stops);

  /** 항공 구간은 살짝 부풀린 2차 곡선으로. */
  const arc = (a: [number, number], b: [number, number]) => {
    const [x1, y1] = [x(a[0]), y(a[1])];
    const [x2, y2] = [x(b[0]), y(b[1])];
    const [dx, dy] = [x2 - x1, y2 - y1];
    const k = 0.22;
    return `M${x1} ${y1} Q ${(x1 + x2) / 2 + dy * k} ${(y1 + y2) / 2 - dx * k} ${x2} ${y2}`;
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-full w-full">
      <Grid />
      {ground.map((l) => (
        <line
          key={l.id}
          x1={x(l.from[0])}
          y1={y(l.from[1])}
          x2={x(l.to[0])}
          y2={y(l.to[1])}
          stroke="var(--route-ground)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.8"
        />
      ))}
      {flight.map((l) => (
        <path
          key={l.id}
          d={arc(l.from, l.to)}
          fill="none"
          stroke="var(--route-flight)"
          strokeWidth="2"
          strokeDasharray="4 3"
          strokeLinecap="round"
          opacity="0.9"
        />
      ))}
      {stops.map((s, i) => (
        <circle
          key={s.id}
          cx={x(s.lng)}
          cy={y(s.lat)}
          r={i === 0 || i === stops.length - 1 ? 3.6 : 2.4}
          fill={i === stops.length - 1 ? "var(--route-flight)" : "var(--route-ground)"}
          stroke="#fff"
          strokeWidth="1.2"
        />
      ))}
    </svg>
  );
}

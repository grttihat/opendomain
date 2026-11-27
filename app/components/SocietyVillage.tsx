"use client";

import { useCallback, useMemo } from "react";
import type { Citizen, SocietyResult, SocietySpec } from "@/lib/sim/society";
import Village2D, { type CenterMood, type VillageStatus, type ZoneMood } from "./Village2D";
import { detectCrises, type Crisis } from "@/lib/sim/societyCrisis";

// 사회 시뮬 결과 → 2D 마을. 자유 실험 화면과 통치자 게임 엔딩이 함께 쓴다.

export const SUPPORT = "#4be08a";
export const OPPOSE = "#ff5a5a";
export const NEUTRAL = "#9a9a9a";

type Stance = "support" | "neutral" | "oppose" | "gone";
export const stanceAt = (c: Citizen, y: number): Stance =>
  c.emigratedYear !== null && c.emigratedYear <= y ? "gone" : c.stance[y - 1] ?? "neutral";

export default function SocietyVillage({
  spec,
  result,
  onPick,
  meId = null,
  live = false,
}: {
  spec: SocietySpec;
  result: SocietyResult;
  onPick: (c: Citizen) => void;
  meId?: number | null;
  live?: boolean; // 통치 게임: 한 해씩 늘어나는 결과를 이어서 보여줌
}) {
  // 사람·동네 구성은 같은 사회(spec)에서 바뀌지 않는다. live에선 이걸 고정해야
  // 해마다 마을이 처음부터 다시 그려지지 않는다.
  const nPeople = result.citizens.length;
  const people = useMemo(
    () => result.citizens.map((c) => ({ id: c.id, segment: c.cls })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    live ? [spec, nPeople] : [result],
  );
  const segments = useMemo(() => spec.classes.map((c) => c.name), [spec]);
  const priorityIds = useMemo(
    () => [...(meId !== null ? [meId] : []), ...(live ? [] : result.events.map((e) => e.citizenId))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    live ? [meId] : [result, meId],
  );
  const village = useMemo(
    () => ({
      people,
      segments,
      priorityIds,
      events: result.events.map((e) => ({ tick: e.year, personId: e.citizenId, bubble: e.bubble })),
    }),
    [people, segments, priorityIds, result],
  );

  // 해마다 위기 판정 → 동네·시청 연출
  const crisesByYear = useMemo(() => {
    const m = new Map<number, Crisis[]>();
    for (let y = 1; y <= result.years; y++) m.set(y, detectCrises(result, spec, y));
    return m;
  }, [result, spec]);
  const zoneMood = useCallback(
    (i: number, y: number): ZoneMood => {
      const cls = spec.classes[i]?.name;
      const list = (crisesByYear.get(y) ?? []).filter((c) => c.cls === cls);
      const lv = (k: Crisis["kind"]) => list.find((c) => c.kind === k)?.level;
      const darkLv = lv("dark");
      const dark = darkLv === "erupt" ? 1 : darkLv === "warn" ? 0.6 : darkLv === "omen" ? 0.35 : 0;
      const mood: ZoneMood = { dark };
      if (lv("strike") === "erupt") Object.assign(mood, { picket: true, sign: "파업!", signColor: "#e0453a" });
      else if (lv("exodus") === "erupt") Object.assign(mood, { sign: "이주 행렬", signColor: "#3a7bd5" });
      else if (darkLv === "erupt") Object.assign(mood, { sign: "불 꺼진 거리", signColor: "#555a70" });
      else if (lv("trap") === "erupt") Object.assign(mood, { sign: "일해도 손해", signColor: "#8a7a5a" });
      else if (lv("rehire")) Object.assign(mood, { sign: "다시 일터로", signColor: "#2f9e5b" });
      return mood;
    },
    [crisesByYear, spec],
  );
  const centerMood = useCallback(
    (y: number): CenterMood => {
      const P = result.policy[y - 1];
      if (!P) return {};
      return {
        treasury: Math.max(0, Math.min(1, (P.fiscalBalance + 0.08) / 0.12)),
        closed: P.fiscalBalance < -0.06,
        festival: P.support >= 0.6,
      };
    },
    [result],
  );
  const statusAt = useCallback(
    (id: number, y: number): VillageStatus => {
      const c = result.citizens[id];
      if (!c) return { icon: null };
      const st = stanceAt(c, y);
      if (st === "gone") return { icon: null, gone: true };
      const faded = c.unemployedYears.includes(y); // 일자리를 잃은 사람은 흐릿하게
      if (id === meId) return { icon: "★", iconColor: "#ffd84b", faded };
      if (st === "support") return { icon: "+", iconColor: SUPPORT, faded };
      if (st === "oppose") return { icon: "−", iconColor: OPPOSE, faded };
      return { icon: null, faded };
    },
    [result, meId],
  );
  const visitsAt = useCallback(
    (id: number, y: number) => Boolean(result.citizens[id]?.protestYears.includes(y)),
    [result],
  );
  const legend = useCallback(
    (y: number) => {
      const n = { support: 0, neutral: 0, oppose: 0, gone: 0 };
      for (const c of result.citizens) n[stanceAt(c, y)]++;
      return [
        { icon: "+", color: SUPPORT, label: "지지", n: n.support },
        { icon: "·", color: NEUTRAL, label: "중립", n: n.neutral },
        { icon: "−", color: OPPOSE, label: "반대", n: n.oppose },
        { icon: "→", color: "#8fd3ff", label: "떠남", n: n.gone },
      ];
    },
    [result],
  );

  return (
    <Village2D
      people={village.people}
      segments={village.segments}
      ticks={result.years}
      tickUnit="년차"
      centerName="시청"
      center="hall"
      statusAt={statusAt}
      visitsAt={visitsAt}
      events={village.events}
      legend={legend}
      priorityIds={village.priorityIds}
      footnote={`흐릿한 사람은 일자리를 잃은 사람, 어두운 동네는 실업이 번지는 곳, 시청 위 막대는 금고예요. 반대가 35%를 넘으면 시청 앞에 모여요.${meId !== null ? " ★는 당신이에요." : ""}`}
      live={live}
      zoneMood={zoneMood}
      centerMood={centerMood}
      onPick={(id) => {
        const c = result.citizens[id];
        if (c) onPick(c);
      }}
    />
  );
}

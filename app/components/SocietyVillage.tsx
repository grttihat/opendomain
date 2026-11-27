"use client";

import { useCallback, useMemo } from "react";
import type { Citizen, SocietyResult, SocietySpec } from "@/lib/sim/society";
import Village2D, { type VillageStatus } from "./Village2D";

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
}: {
  spec: SocietySpec;
  result: SocietyResult;
  onPick: (c: Citizen) => void;
  meId?: number | null;
}) {
  const village = useMemo(
    () => ({
      people: result.citizens.map((c) => ({ id: c.id, segment: c.cls })),
      segments: spec.classes.map((c) => c.name),
      priorityIds: [...(meId !== null ? [meId] : []), ...result.events.map((e) => e.citizenId)],
      events: result.events.map((e) => ({ tick: e.year, personId: e.citizenId, bubble: e.bubble })),
    }),
    [result, spec, meId],
  );
  const statusAt = useCallback(
    (id: number, y: number): VillageStatus => {
      const c = result.citizens[id];
      if (!c) return { icon: null };
      const st = stanceAt(c, y);
      if (st === "gone") return { icon: null, gone: true };
      if (id === meId) return { icon: "★", iconColor: "#ffd84b" };
      if (st === "support") return { icon: "+", iconColor: SUPPORT };
      if (st === "oppose") return { icon: "−", iconColor: OPPOSE };
      return { icon: null };
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
      footnote={`반대가 35%를 넘는 해엔 반대하는 시민이 시청 앞에 모여요.${meId !== null ? " ★는 당신이에요." : ""}`}
      onPick={(id) => {
        const c = result.citizens[id];
        if (c) onPick(c);
      }}
    />
  );
}

// 통치자 게임 규칙 — 플레이어는 공약을 들고 취임해서, AI 물결이 오는 10년 동안
// 해마다 레버를 최대 2개씩 움직인다. 엔진(society.ts)은 그대로 두고, 여기서는
// 목표·패배·엔딩·시민의 목소리만 정한다.

import {
  AI_WAVES,
  LEVER_META,
  type Citizen,
  type Levers,
  type SocietyResult,
  type SocietySpec,
} from "./society";

export const GAME_YEARS = 10;
export const MOVES_PER_YEAR = 2;

// --- 승리 조건 — 서로 당기는 네 가치. 하나만 보면 숫자 맞추기가 된다 ----------
export type GoalKey = "legit" | "fiscal" | "inclusion" | "vitality";

export type GoalState = { key: GoalKey; label: string; rule: string; ok: boolean; now: string };

export type GameCtx = {
  spec: SocietySpec;
  poorest: string; // 가장 어려운 계층 이름
  poorestStart: number; // 그 계층의 1년차(현재 사회) 평균 삶의 만족
};

export function makeCtx(spec: SocietySpec, projection: SocietyResult): GameCtx {
  const poorest = [...spec.classes].sort((a, b) => a.income - b.income)[0].name;
  const group = projection.citizens.filter((c) => c.cls === poorest);
  const poorestStart = group.reduce((s, c) => s + c.baseWellbeing[0], 0) / Math.max(1, group.length);
  return { spec, poorest, poorestStart };
}

const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

function classWellbeing(r: SocietyResult, cls: string, y: number): number {
  const stay = r.citizens.filter((c) => c.cls === cls && (c.emigratedYear === null || c.emigratedYear > y));
  return stay.reduce((s, c) => s + (c.wellbeing[y - 1] ?? 0), 0) / Math.max(1, stay.length);
}

export function evalGoals(r: SocietyResult, ctx: GameCtx): GoalState[] {
  const y = r.years;
  const P = r.policy[y - 1];
  const B = r.baseline[y - 1];
  const poorNow = classWellbeing(r, ctx.poorest, y);
  return [
    {
      key: "legit",
      label: "재선",
      rule: "지지율 50% 이상",
      ok: P.support >= 0.5,
      now: `지지 ${pct(P.support)}`,
    },
    {
      key: "fiscal",
      label: "지속 가능",
      rule: "재정 적자 GDP 3% 이내",
      ok: P.fiscalBalance >= -0.03,
      now: `재정 ${P.fiscalBalance >= 0 ? "+" : ""}${pct(P.fiscalBalance, 1)}`,
    },
    {
      key: "inclusion",
      label: "아무도 버려지지 않음",
      rule: `${ctx.poorest}의 삶이 취임 때보다 나음`,
      ok: poorNow >= ctx.poorestStart,
      now: `만족 ${Math.round(ctx.poorestStart * 100)} → ${Math.round(poorNow * 100)}`,
    },
    {
      key: "vitality",
      label: "활력",
      rule: "1인당 생산이 '아무것도 안 했을 때'보다 높음",
      ok: P.gdpPerCapita >= B.gdpPerCapita,
      now: `${P.gdpPerCapita >= B.gdpPerCapita ? "+" : ""}${((P.gdpPerCapita / B.gdpPerCapita - 1) * 100).toFixed(1)}%`,
    },
  ];
}

// --- 패배 -------------------------------------------------------------------
export type Defeat = { title: string; text: string } | null;

export function checkDefeat(r: SocietyResult): Defeat {
  const y = r.years;
  const P = r.policy[y - 1];
  const prev = r.policy[y - 2];
  if (prev && P.oppose > 0.5 && prev.oppose > 0.5) {
    return { title: "정권 교체", text: `반대가 2년 연속 과반(${pct(prev.oppose)} → ${pct(P.oppose)})이었어요. 시민들이 다른 길을 골랐습니다.` };
  }
  if (P.fiscalBalance < -0.1) {
    return { title: "재정 위기", text: `재정 적자가 GDP의 ${pct(-P.fiscalBalance, 1)}에 이르렀어요. 국채 금리가 치솟고, 약속한 지원을 더는 이어갈 수 없습니다.` };
  }
  return null;
}

// --- 엔딩 이름 ----------------------------------------------------------------
export function endingTitle(goals: GoalState[]): { title: string; text: string } {
  const miss = goals.filter((g) => !g.ok).map((g) => g.key);
  if (miss.length === 0) return { title: "AI와 함께 사는 사회", text: "네 가지 목표를 모두 지켰어요. 이 정책 경로는 유토피아 조건의 후보입니다." };
  if (miss.length === 1) {
    const t: Record<GoalKey, { title: string; text: string }> = {
      legit: { title: "옳았지만 외면받은 개혁", text: "사회는 버텼지만 시민의 마음을 얻지 못했어요." },
      fiscal: { title: "빚으로 산 평화", text: "모두가 버텼지만, 청구서는 다음 세대에게 갔어요." },
      inclusion: { title: "부유하지만 분열된 나라", text: "나라는 잘 굴러가지만 가장 약한 사람들이 뒤처졌어요." },
      vitality: { title: "따뜻하지만 느린 나라", text: "아무도 버려지지 않았지만 경제의 활력은 잃었어요." },
    };
    return t[miss[0]];
  }
  if (miss.length === 4) return { title: "무너진 약속", text: "어느 목표도 지키지 못했어요. 무엇이 엇갈렸는지 경로를 되짚어 보세요." };
  return { title: "버텨낸 10년", text: `네 목표 중 ${4 - miss.length}개를 지켰어요.` };
}

// --- 레버 이동 규칙 ------------------------------------------------------------
export function movedKeys(prev: Levers, draft: Levers): (keyof Levers)[] {
  return LEVER_META.map((m) => m.key).filter((k) => Math.abs(prev[k] - draft[k]) > 1e-6);
}

// --- 다가오는 물결 --------------------------------------------------------------
export function upcomingWave(y: number) {
  return AI_WAVES.find((w) => w.year === y) ?? null;
}

// --- "나" -------------------------------------------------------------------
// 그 계층에서 소득이 가운데인 사람을 "나"로 삼는다 (id는 seed로 고정이라 매 턴 같은 사람).
export function pickMe(r: SocietyResult, cls: string): number {
  const group = r.citizens.filter((c) => c.cls === cls).sort((a, b) => a.income[0] - b.income[0]);
  return group[Math.floor(group.length / 2)]?.id ?? 0;
}

export const riskLabel = (x: number) => (x >= 0.6 ? "높음" : x >= 0.3 ? "보통" : "낮음");

const man = (n: number) => `${Math.round(n).toLocaleString()}만원`;

// 그해 그 시민이 겪은 일을 한두 문장으로. 엔진이 기록한 사실만 쓴다.
export function voice(c: Citizen, y: number): string {
  if (c.emigratedYear !== null && c.emigratedYear <= y) {
    return c.emigratedYear === y ? "더는 못 버티겠어요. 이 나라를 떠나기로 했어요." : "(이미 이 나라를 떠났어요)";
  }
  const monthly = (c.income[y - 1] ?? 0) / 12;
  const lastMonthly = (c.income[y - 2] ?? c.income[y - 1] ?? 0) / 12;
  let life: string;
  if (c.aiDisplacedYears.includes(y)) {
    life = "회사가 제 일을 AI로 바꿨어요. 하루아침에 자리가 없어졌어요.";
  } else if (c.reemployedYears.includes(y)) {
    life = "다시 일자리를 구했어요. 예전만큼 벌진 못하지만요.";
  } else if (c.unemployedYears.includes(y)) {
    const run = c.unemployedYears.filter((t) => t <= y).length;
    life = `일을 못 구한 지 ${run}년째예요.`;
  } else if (c.foundedYears.includes(y)) {
    life = "큰맘 먹고 내 가게를 차렸어요.";
  } else if (monthly > lastMonthly * 1.05) {
    life = "살림이 조금 나아졌어요.";
  } else if (monthly < lastMonthly * 0.95) {
    life = "갈수록 빠듯해요.";
  } else {
    life = "그럭저럭 지내요.";
  }
  const st = c.stance[y - 1];
  const view =
    st === "support" ? "지금 정부 방향은 괜찮은 것 같아요." : st === "oppose" ? "이 정부, 솔직히 실망이에요." : "";
  return `${life} 한 달에 손에 쥐는 돈은 ${man(monthly)}. ${view}`.trim();
}

// 공약 문장에서 "시뮬레이션에 반영되지 않음" 부분을 떼어낸다.
export function splitSummary(summary: string): { main: string; missing: string | null } {
  const m = summary.match(/시뮬레이션에\s*반영되지\s*않음\s*[:：]\s*/);
  if (!m || m.index === undefined) return { main: summary, missing: null };
  return { main: summary.slice(0, m.index).trim(), missing: summary.slice(m.index + m[0].length).trim() };
}

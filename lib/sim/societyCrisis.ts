// 위기와 카드 — 통치 게임의 손에 쥐는 부분. 엔진(society.ts)의 레버는 카드
// 뒤에 숨기고, 플레이어는 생활 언어의 선택만 본다. 위기는 엔진이 이미 계산한
// 계층별 실업·불만·이민·재정으로 판정한다. 조짐 → 경고 → 발생 순서로 와서,
// 갑자기 터지는 일은 없다.

import { LEVER_META, type Levers, type SocietyResult, type SocietySpec } from "./society";

// --- 카드 ---------------------------------------------------------------------
export type Card = {
  id: string;
  title: string;
  desc: string; // 무엇을 하는지, 무엇을 감수하는지 (생활 언어)
  apply: (lv: Levers) => Levers;
  kind: "basic" | "promise" | "invented";
  unmodeled?: string; // 발명 카드: 엔진이 아직 모르는 효과
};

const metaOf = (k: keyof Levers) => LEVER_META.find((m) => m.key === k)!;
const bump = (lv: Levers, k: keyof Levers, d: number): Levers => {
  const m = metaOf(k);
  const v = Math.round((lv[k] + d) / m.step) * m.step;
  return { ...lv, [k]: Math.max(m.min, Math.min(m.max, v)) };
};

export const BASIC_CARDS: Record<string, Card> = {
  school: {
    id: "school",
    title: "직업학교 세우기",
    desc: "일자리를 잃은 사람이 새 일을 배우게 해요. 돈이 들고, 효과는 1~2년 뒤에 나타나요.",
    apply: (lv) => bump(lv, "reskill", 0.7),
    kind: "basic",
  },
  benefit: {
    id: "benefit",
    title: "실직자 생활비 늘리기",
    desc: "일자리를 잃은 사람에게 2년 동안 예전 월급의 더 많은 부분을 줘요.",
    apply: (lv) => bump(lv, "unemployBenefit", 15),
    kind: "basic",
  },
  aitax: {
    id: "aitax",
    title: "AI로 아낀 돈에 세금",
    desc: "AI로 인건비를 아낀 회사에게 그 이익의 일부를 걷어요. 기업과 투자자가 반발할 수 있어요.",
    apply: (lv) => bump(lv, "aiTax", 15),
    kind: "basic",
  },
  dividend: {
    id: "dividend",
    title: "모두에게 매달 용돈",
    desc: "모든 국민에게 조건 없이 매달 20만원씩 더 줘요. 일해도 깎이지 않지만 돈이 아주 많이 들어요.",
    apply: (lv) => bump(lv, "basicIncome", 20),
    kind: "basic",
  },
  floor: {
    id: "floor",
    title: "가장 어려운 이웃의 바닥 올리기",
    desc: "생활비가 모자란 사람에게 월 20만원까지 더 채워줘요. 너무 높이면 일해도 손해인 사람이 생겨요.",
    apply: (lv) => bump(lv, "minLiving", 20),
    kind: "basic",
  },
  floorDown: {
    id: "floorDown",
    title: "생활 보장선 낮추기",
    desc: "보장선을 월 15만원 낮춰서 일하는 쪽이 이득이 되게 해요. 가장 어려운 사람들이 힘들어져요.",
    apply: (lv) => bump(lv, "minLiving", -15),
    kind: "basic",
  },
  richtax: {
    id: "richtax",
    title: "부자에게 더 걷기",
    desc: "연 1억 넘게 버는 부분에 세금을 더 매겨요. 부자 일부가 나라를 떠날 수 있어요.",
    apply: (lv) => bump(lv, "topTax", 8),
    kind: "basic",
  },
  alltax: {
    id: "alltax",
    title: "모두 조금씩 더 내기",
    desc: "모든 사람의 세금을 조금 올려요. 금고는 채워지지만 모두가 조금씩 불만이에요.",
    apply: (lv) => bump(lv, "taxRate", 3),
    kind: "basic",
  },
  relief: {
    id: "relief",
    title: "세금 깎아주기",
    desc: "세금을 낮춰서 사람들이 더 일하고 투자하고 머물게 해요. 금고가 줄어요.",
    apply: (lv) => bump(bump(lv, "taxRate", -3), "topTax", -5),
    kind: "basic",
  },
  austerity: {
    id: "austerity",
    title: "허리띠 졸라매기",
    desc: "실업급여·용돈·생활 보장을 조금씩 줄여 금고를 지켜요. 어려운 사람들이 가장 먼저 힘들어져요.",
    apply: (lv) => bump(bump(bump(lv, "unemployBenefit", -10), "basicIncome", -10), "minLiving", -10),
    kind: "basic",
  },
  hold: {
    id: "hold",
    title: "버티기",
    desc: "아무것도 바꾸지 않아요. 비용은 없지만 상황은 저절로 나아지지 않을 수 있어요.",
    apply: (lv) => lv,
    kind: "basic",
  },
};

// 공약 카드: 공약까지 남은 거리가 가장 먼 레버를 3분의 1씩 옮긴다.
export function promiseCard(spec: SocietySpec, lv: Levers): Card | null {
  let best: { k: keyof Levers; gap: number } | null = null;
  for (const m of LEVER_META) {
    const total = spec.policy[m.key] - spec.baseline[m.key];
    if (Math.abs(total) < 1e-6) continue;
    const left = spec.policy[m.key] - lv[m.key];
    if (Math.abs(left) < m.step / 2) continue;
    const rel = Math.abs(left / total);
    if (!best || rel > best.gap) best = { k: m.key, gap: rel };
  }
  if (!best) return null;
  const m = metaOf(best.k);
  const total = spec.policy[best.k] - spec.baseline[best.k];
  const left = spec.policy[best.k] - lv[best.k];
  const step = Math.sign(left) * Math.min(Math.abs(left), Math.max(m.step, Math.abs(total) / 3));
  const next = bump(lv, best.k, step);
  return {
    id: `promise:${best.k}`,
    title: `공약 지키기: ${m.label}`,
    desc: `공약을 한 걸음 더 지켜요. ${m.label} ${m.fmt(lv[best.k])} → ${m.fmt(next[best.k])} (공약 ${m.fmt(spec.policy[best.k])})`,
    apply: (x) => bump(x, best!.k, step),
    kind: "promise",
  };
}

// --- 위기 판정 -----------------------------------------------------------------
export type CrisisKind =
  | "dark" // 불 꺼진 거리 (대량 실업)
  | "strike" // 파업
  | "exodus" // 이주 행렬
  | "trap" // 일해도 손해 (복지 함정)
  | "underground" // 지하경제 (탈세)
  | "protest" // 시청 앞 시위 (전국)
  | "treasury" // 금고 고갈 (전국)
  | "boom" // 창업 붐 (좋음)
  | "rehire" // 다시 일터로 (좋음)
  | "festival"; // 축제 (좋음)

export type Crisis = {
  key: string; // kind:계층
  kind: CrisisKind;
  cls: string | null;
  level: "omen" | "warn" | "erupt" | "good";
  title: string;
  cause: string; // 엔진 숫자로 쓴 원인
  options: string[]; // 대응 카드 id (발생일 때)
};

const SEVERITY: CrisisKind[] = ["treasury", "protest", "strike", "dark", "exodus", "trap", "underground"];

const LABEL: Record<CrisisKind, string> = {
  dark: "불 꺼진 거리",
  strike: "파업",
  exodus: "이주 행렬",
  trap: "일해도 손해",
  underground: "지하경제",
  protest: "시청 앞 시위",
  treasury: "금고 고갈",
  boom: "창업 붐",
  rehire: "다시 일터로",
  festival: "축제",
};

const OPTIONS: Partial<Record<CrisisKind, string[]>> = {
  dark: ["school", "benefit", "hold"],
  strike: ["benefit", "aitax", "hold"],
  exodus: ["relief", "hold"],
  trap: ["floorDown", "dividend", "hold"],
  underground: ["relief", "hold"],
  protest: ["benefit", "dividend", "hold"],
  treasury: ["alltax", "richtax", "austerity"],
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

// 3단계 판정: 발생 기준의 70% 이상이면 조짐, 85% 이상이면 경고.
function stage(v: number, erupt: number): Crisis["level"] | null {
  if (v >= erupt) return "erupt";
  if (v >= erupt * 0.85) return "warn";
  if (v >= erupt * 0.7) return "omen";
  return null;
}

export function detectCrises(r: SocietyResult, spec: SocietySpec, y: number): Crisis[] {
  const out: Crisis[] = [];
  const P = r.policy[y - 1];
  const B = r.baseline[y - 1];
  if (!P) return out;
  const add = (kind: CrisisKind, cls: string | null, level: Crisis["level"] | null, cause: string) => {
    if (!level) return;
    out.push({
      key: `${kind}:${cls ?? ""}`,
      kind,
      cls,
      level,
      title: cls ? `${cls} — ${LABEL[kind]}` : LABEL[kind],
      cause,
      options: level === "erupt" ? OPTIONS[kind] ?? ["hold"] : [],
    });
  };

  for (const cl of spec.classes) {
    const group = r.citizens.filter((c) => c.cls === cl.name);
    const stay = group.filter((c) => c.emigratedYear === null || c.emigratedYear >= y);
    const n = Math.max(1, stay.length);
    const unemp = stay.filter((c) => c.unemployedYears.includes(y)).length / n;
    const oppose = stay.filter((c) => c.stance[y - 1] === "oppose").length / n;
    const aiLost = stay.filter((c) => c.aiDisplacedYears.includes(y)).length;
    const left = group.filter((c) => c.emigratedYear === y).length / Math.max(1, group.length);
    const trapped = stay.filter((c) => c.trappedYears.includes(y)).length / n;
    const rehired = stay.filter((c) => c.reemployedYears.includes(y)).length;
    const lost = stay.filter((c) => c.unemployedYears.includes(y) && !c.unemployedYears.includes(y - 1)).length;

    add("dark", cl.name, stage(unemp, 0.2), `실업 ${pct(unemp)}${aiLost > 0 ? ` · 올해 AI로 ${aiLost}명 실직` : ""}`);
    // 파업은 일자리 문제가 있을 때만 (실업 10% 이상)
    if (unemp >= 0.1) add("strike", cl.name, stage(oppose, 0.5), `불만 ${pct(oppose)} · 실업 ${pct(unemp)}`);
    add("exodus", cl.name, stage(left, 0.03), `올해 ${pct(left)}가 나라를 떠남 — 세 부담이나 형편 악화`);
    add("trap", cl.name, stage(trapped, 0.15), `일하는 사람의 ${pct(trapped)}가 생활 보장선보다 적게 벌어요`);
    if (rehired >= 3 && rehired > lost) add("rehire", cl.name, "good", `올해 ${rehired}명이 다시 일자리를 찾음`);
  }

  add("underground", null, stage(P.evasion, 0.1), `소득을 숨기는 사람 ${pct(P.evasion)}`);
  add("protest", null, stage(P.oppose, 0.35), `전체 반대 ${pct(P.oppose)}`);
  add("treasury", null, stage(-P.fiscalBalance, 0.06), `재정 적자 GDP ${(-P.fiscalBalance * 100).toFixed(1)}%`);
  if (P.startups >= 3 && P.startups >= B.startups * 1.5) add("boom", null, "good", `올해 창업 ${P.startups}건`);
  if (P.support >= 0.6) add("festival", null, "good", `지지 ${pct(P.support)}`);
  return out;
}

// 그해 대응해야 할 위기 하나 — 가장 심각한 발생 위기
export function topCrisis(list: Crisis[]): Crisis | null {
  const erupted = list.filter((c) => c.level === "erupt");
  erupted.sort((a, b) => SEVERITY.indexOf(a.kind) - SEVERITY.indexOf(b.kind));
  return erupted[0] ?? null;
}

// --- 연말 결정 ---------------------------------------------------------------
export function yearEndOptions(
  spec: SocietySpec,
  lv: Levers,
  r: SocietyResult | null,
  nextWaveSoon: boolean,
): Card[] {
  const cards: Card[] = [];
  const promise = promiseCard(spec, lv);
  if (promise) cards.push(promise);
  if (nextWaveSoon) cards.push(lv.reskill < 1.5 ? BASIC_CARDS.school : BASIC_CARDS.aitax);
  const fiscal = r ? r.policy[r.years - 1].fiscalBalance : 0;
  if (fiscal < -0.02) cards.push(fiscal < -0.04 ? BASIC_CARDS.austerity : BASIC_CARDS.alltax);
  else cards.push(BASIC_CARDS.floor);
  if (cards.length < 3) cards.push(BASIC_CARDS.relief);
  const seen = new Set<string>();
  const uniq = cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true))).slice(0, 3);
  return [...uniq, BASIC_CARDS.hold];
}

export const crisisLabel = LABEL;

// --- 발명한 카드 (사고확장기 → 번역기) ------------------------------------------
// 번역기 API가 돌려주는 직렬화 가능한 형태. 효과는 엔진 레버 변화(deltas)뿐이다.
export type InventedCardData = {
  title: string;
  desc: string;
  deltas: Partial<Levers>;
  unmodeled: string; // 엔진이 아직 모르는 효과
  source: string; // 원래 아이디어 제목
};

// 한 카드가 움직일 수 있는 최대 크기 — 마법 카드 방지
const DELTA_CAP: Record<keyof Levers, number> = {
  basicIncome: 30,
  minLiving: 30,
  aiTax: 20,
  topTax: 20,
  unemployBenefit: 20,
  taxRate: 5,
  reskill: 1,
};

export function normalizeInventedCard(raw: unknown, source: string): InventedCardData {
  const r = (raw ?? {}) as { title?: unknown; desc?: unknown; deltas?: unknown; unmodeled?: unknown };
  const d = (r.deltas ?? {}) as Record<string, unknown>;
  const picked = LEVER_META.map((m) => {
    const v = Number(d[m.key]);
    if (!Number.isFinite(v) || v === 0) return null;
    const cap = DELTA_CAP[m.key];
    return { k: m.key, v: Math.max(-cap, Math.min(cap, v)), rel: Math.abs(v) / cap };
  })
    .filter((x): x is { k: keyof Levers; v: number; rel: number } => x !== null)
    .sort((a, b) => b.rel - a.rel)
    .slice(0, 2);
  const deltas: Partial<Levers> = {};
  for (const p of picked) deltas[p.k] = p.v;
  return {
    title: String(r.title ?? source).slice(0, 24) || "발명한 해법",
    desc: String(r.desc ?? ""),
    deltas,
    unmodeled: String(r.unmodeled ?? ""),
    source,
  };
}

export function cardFromInvented(c: InventedCardData, index: number): Card {
  return {
    id: `inv:${index}:${c.title}`,
    title: c.title,
    desc: c.desc,
    apply: (lv) => {
      let out = lv;
      for (const [k, v] of Object.entries(c.deltas) as [keyof Levers, number][]) out = bump(out, k, v);
      return out;
    },
    kind: "invented",
    unmodeled: c.unmodeled || undefined,
  };
}

// 게임 → 사고확장기로 가져가는 숙제, 그리고 돌아올 때 들고 오는 아이디어
export type InventQuest = { crisisTitle: string; problem: string; startedAt: number };
export type IncomingIdea = { title: string; summary: string; crisisTitle: string; problem: string };

// 가상 사회 시뮬레이션 엔진 — 제도를 실제 정책 수단(단위 있는 레버)으로
// 표현하고, 계층별 NPC가 매년 일·실직·재취업·창업·탈세·이민·지지를
// 규칙으로 결정한다.
//
// LLM은 제도 아이디어를 SocietySpec(계층 + 현재 사회 레버 + 새 제도 레버)
// 으로 한 번만 바꾸고, 실제 계산은 여기서 한다. 같은 사람들(같은 seed)이
// 같은 AI 자동화 충격 아래에서 "현재 사회"와 "새 제도"를 각각 살아본다.

export type Levers = {
  taxRate: number; // 소득세 평균 실효세율 % (0~50)
  topTax: number; // 연소득 1억 초과분 추가세율 %p (0~40)
  basicIncome: number; // 전 국민 기본소득 월 만원 (0~200)
  minLiving: number; // 최저생활 보장선 월 만원 (0~200)
  unemployBenefit: number; // 실업급여 소득대체율 % (0~90, 최대 2년)
  reskill: number; // 직업 재훈련 예산 GDP 대비 % (0~3)
  aiTax: number; // AI·자동화로 생긴 기업 이익에 매기는 세율 % (0~60)
};

export type LeverMeta = {
  key: keyof Levers;
  label: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  hint: string;
};

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
const monthly = (v: number) => (v <= 0 ? "없음" : `월 ${Math.round(v)}만원`);

export const LEVER_META: LeverMeta[] = [
  { key: "basicIncome", label: "기본소득", min: 0, max: 200, step: 5, fmt: monthly, hint: "모든 시민에게 조건 없이" },
  { key: "aiTax", label: "AI·자동화 이익세", min: 0, max: 60, step: 1, fmt: pct, hint: "자동화로 늘어난 기업 이익에 과세" },
  { key: "unemployBenefit", label: "실업급여 대체율", min: 0, max: 90, step: 5, fmt: pct, hint: "잃은 임금의 몇 %를, 최대 2년" },
  { key: "reskill", label: "직업 재훈련 예산", min: 0, max: 3, step: 0.1, fmt: (v) => `GDP ${v.toFixed(1)}%`, hint: "실직자의 재취업 확률을 높임" },
  { key: "minLiving", label: "최저생활 보장선", min: 0, max: 200, step: 5, fmt: monthly, hint: "가처분소득이 이보다 낮으면 채워줌" },
  { key: "taxRate", label: "소득세 평균 실효세율", min: 0, max: 50, step: 1, fmt: pct, hint: "저소득은 덜, 고소득은 더 냄" },
  { key: "topTax", label: "고소득 추가세율", min: 0, max: 40, step: 1, fmt: (v) => `+${Math.round(v)}%p`, hint: "연 1억 초과분에만" },
];

// 현재 한국과 비슷한 값 (2025년 전후, 대략치)
export const KOREA_BASELINE: Levers = {
  taxRate: 18,
  topTax: 15,
  basicIncome: 0,
  minLiving: 75, // 1인 생계급여 수준
  unemployBenefit: 60, // 구직급여 60%
  reskill: 0.1,
  aiTax: 0,
};

// --- AI 자동화 시나리오 (정책이 아니라 바깥에서 오는 충격) ---------------------
export type AiSpeed = "slow" | "normal" | "fast";
export const AI_SPEED: Record<
  AiSpeed,
  { label: string; desc: string; displace: number; productivity: number; reemployPenalty: number }
> = {
  slow: { label: "느림", desc: "노출 직종의 연 1%가 대체", displace: 0.01, productivity: 1.2, reemployPenalty: 0 },
  normal: { label: "보통", desc: "노출 직종의 연 3%가 대체", displace: 0.03, productivity: 1.4, reemployPenalty: 0.1 },
  fast: { label: "빠름", desc: "노출 직종의 연 7%가 대체", displace: 0.07, productivity: 1.7, reemployPenalty: 0.2 },
};

// AI 물결 — 대체가 고르게 오지 않고 몇 번의 큰 파도로 온다. 연도별 배수의
// 합이 10이라 10년 동안의 총 대체량은 속도 설정(displace)과 같다.
export const AI_WAVES: { year: number; name: string; target: string; power: 1 | 2 | 3 }[] = [
  { year: 2, name: "콜센터·상담 자동화", target: "상담·고객응대", power: 1 },
  { year: 4, name: "사무 AI 에이전트", target: "회계·총무·행정", power: 2 },
  { year: 7, name: "자율주행 물류", target: "배송·운수", power: 3 },
];
const WAVE_FACTOR = [0.4, 1.6, 0.6, 2.0, 0.8, 0.8, 2.4, 0.8, 0.3, 0.3];
const waveFactor = (y: number) => WAVE_FACTOR[y - 1] ?? 0.5;

export type ValueKey = "wealth" | "equality" | "freedom" | "security";
export const VALUE_LABEL: Record<ValueKey, string> = {
  wealth: "부",
  equality: "평등",
  freedom: "자유",
  security: "안정",
};

export type SocialClass = {
  name: string;
  share: number;
  income: number; // 연소득 (만원)
  capitalShare: number; // 소득 중 사업·자본 비중 0~1
  aiExposure: number; // 일자리가 AI로 대체될 수 있는 정도 0~1
  values: Record<ValueKey, number>; // 0~1 중요도
  honesty: number; // 0~1
  mobility: number; // 해외로 떠날 수 있는 능력 0~1
  entrepreneurship: number; // 창업 성향 0~1
};

export type SocietySpec = {
  policyName: string;
  policySummary: string;
  classes: SocialClass[];
  baseline: Levers; // 현재 사회
  policy: Levers; // 새 제도
  leverNotes: Partial<Record<keyof Levers, string>>; // 새 제도를 왜 이 값으로 옮겼는지
};

export type Citizen = {
  id: number;
  name: string;
  cls: string;
  values: Record<ValueKey, number>;
  honesty: number;
  mobility: number;
  entrepreneurship: number;
  aiExposure: number;
  // 연도별 기록 (index = year-1)
  income: number[]; // 가처분소득 (만원)
  wellbeing: number[];
  baseWellbeing: number[]; // 같은 사람이 현재 사회에서 살았을 때
  stance: ("support" | "neutral" | "oppose")[];
  emigratedYear: number | null;
  foundedYears: number[];
  evadedYears: number[];
  protestYears: number[];
  unemployedYears: number[];
  aiDisplacedYears: number[]; // AI 때문에 일자리를 잃은 해
  reemployedYears: number[];
};

export type YearStat = {
  year: number;
  gdpPerCapita: number; // 만원 (남은 인구 기준 총생산, AI 생산 포함)
  gini: number;
  wellbeing: number;
  support: number; // 비율 0~1
  oppose: number;
  emigrants: number; // 누적
  evasion: number; // 그해 탈세 비율
  startups: number;
  population: number;
  unemployment: number; // 실업률 0~1
  aiDisplaced: number; // 그해 AI 자동화로 일자리를 잃은 사람 수
  fiscalBalance: number; // 재정수지 / 총생산 (음수면 적자)
  aiShare: number; // 총생산 중 자동화 생산 비중
};

export type SocietyEvent = { year: number; citizenId: number; text: string; bubble: string };

export type SocietyResult = {
  years: number;
  ai: AiSpeed;
  citizens: Citizen[];
  policy: YearStat[];
  baseline: YearStat[];
  byClass: {
    name: string;
    size: number;
    incomeChange: number; // 마지막 해, 현재 사회 대비 %
    wellbeingChange: number; // 마지막 해 차이
    support: number;
    oppose: number;
    emigrated: number;
    unemployment: number; // 마지막 해, 새 제도
  }[];
  events: SocietyEvent[];
};

// 이 사회에 고정된 조건 (레버로 노출하지 않음)
const FREEDOM = 0.7; // 창업 환경
const ENFORCEMENT = 0.6; // 탈세 단속
const EXIT_BARRIER = 0.5; // 이민 장벽
const CHURN = 0.03; // AI와 무관한 연간 실직 확률
// 교육·국방·의료 등 기본 공공지출(총생산 대비)은 고정값 대신, "현재 사회" 1년차의
// 재정수지가 0이 되도록 맞춘다 — 계층 구성이 달라도 출발점은 늘 균형 재정.

// --- 정규화 -----------------------------------------------------------------
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

function fixLevers(raw: unknown, fallback: Levers): Levers {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const m of LEVER_META) out[m.key] = clamp(num(r[m.key], fallback[m.key]), m.min, m.max);
  return out;
}

export function normalizeSocietySpec(raw: unknown): SocietySpec {
  const r = (raw ?? {}) as Partial<SocietySpec>;
  let classes = (Array.isArray(r.classes) ? r.classes : [])
    .filter((c) => c && c.name)
    .slice(0, 5)
    .map((c) => {
      const v = (c.values ?? {}) as Partial<Record<ValueKey, number>>;
      return {
        name: String(c.name),
        share: Math.max(0.01, num(c.share, 0.25)),
        income: clamp(num(c.income, 4000), 300, 100000),
        capitalShare: clamp(num(c.capitalShare, 0.1), 0, 1),
        aiExposure: clamp(num(c.aiExposure, 0.3), 0, 1),
        values: {
          wealth: clamp(num(v.wealth, 0.5), 0, 1),
          equality: clamp(num(v.equality, 0.5), 0, 1),
          freedom: clamp(num(v.freedom, 0.5), 0, 1),
          security: clamp(num(v.security, 0.5), 0, 1),
        },
        honesty: clamp(num(c.honesty, 0.7), 0, 1),
        mobility: clamp(num(c.mobility, 0.2), 0, 1),
        entrepreneurship: clamp(num(c.entrepreneurship, 0.2), 0, 1),
      };
    });
  if (classes.length === 0) throw new Error("사회 설정에 계층이 없습니다");
  const total = classes.reduce((a, c) => a + c.share, 0);
  classes = classes.map((c) => ({ ...c, share: c.share / total }));
  const baseline = fixLevers(r.baseline, KOREA_BASELINE);
  const notes: SocietySpec["leverNotes"] = {};
  const rn = (r.leverNotes ?? {}) as Record<string, unknown>;
  for (const m of LEVER_META) if (rn[m.key]) notes[m.key] = String(rn[m.key]);
  return {
    policyName: String(r.policyName ?? "새 제도"),
    policySummary: String(r.policySummary ?? ""),
    classes,
    baseline,
    policy: fixLevers(r.policy, baseline),
    leverNotes: notes,
  };
}

// --- RNG --------------------------------------------------------------------
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gini(xs: number[]): number {
  const a = xs.filter((x) => x >= 0).sort((p, q) => p - q);
  const n = a.length;
  if (n === 0) return 0;
  const sum = a.reduce((s, x) => s + x, 0);
  if (sum === 0) return 0;
  let cum = 0;
  for (let i = 0; i < n; i++) cum += (2 * (i + 1) - n - 1) * a[i];
  return cum / (n * sum);
}

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
const GIVEN = ["민준", "서연", "도윤", "지우", "하준", "서윤", "은우", "하은", "지호", "수아", "현우", "지민", "유진", "예준", "채원", "건우", "다은", "시우", "소율", "주원"];

type Person = {
  cls: SocialClass;
  values: Record<ValueKey, number>;
  honesty: number;
  mobility: number;
  entrepreneurship: number;
  aiExposure: number;
  base: number; // 세전 노동+자본 소득 잠재력 (만원)
  capitalShare: number;
  base0: number; // 시작 시점 소득 — "예전보다 나아졌나"의 기준
  gone: boolean;
  employed: boolean;
  unempYears: number; // 연속 실업 연수
  lostWage: number; // 실직 직전 임금 (실업급여 기준)
};

type WorldOut = {
  stats: YearStat[];
  disposable: number[][]; // [year][person]
  wellbeing: number[][];
  gone: (number | null)[]; // 떠난 해
  founded: number[][]; // person → years
  evaded: number[][];
  unemployed: number[][];
  aiDisplaced: number[][];
  reemployed: number[][];
  essentialRatio: number;
};

// 소득세: 평균 실효세율을 소득 위치에 따라 기울이고, 1억 초과분에 추가세율.
function incomeTax(taxable: number, median: number, lv: Levers): number {
  if (taxable <= 0) return 0;
  const rel = taxable / Math.max(1, median);
  const tilt = clamp(0.3 + 0.7 * rel, 0.3, 1.6); // 중위소득이면 1
  return taxable * (lv.taxRate / 100) * tilt + Math.max(0, taxable - 10000) * (lv.topTax / 100);
}

// 한 세계(레버 세트)에서 years년을 산다. 같은 seed면 같은 사람·같은 운.
function runWorld(
  lvs: Levers[], // 연도별 레버 (모자라면 마지막 값 유지)
  ai: AiSpeed,
  people: Person[],
  years: number,
  seed: number,
  refWb: number[] | null, // 취임 직전의 삶 (null이면 이 세계의 1년차를 기준으로)
  essentialRatio: number | null, // null이면 1년차에서 보정
): WorldOut {
  // 공통 난수: 같은 사람은 같은 해·같은 사건에 대해 두 세계에서 같은 운을 갖는다.
  // 그래야 결과 차이가 제도 차이에서만 나온다.
  const luck = (i: number, y: number, k: number) => {
    let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i + 1, 0xc2b2ae35) ^ Math.imul(y * 31 + k, 0x27d4eb2f);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sc = AI_SPEED[ai];
  const ps = people.map((p) => ({ ...p }));
  const n = ps.length;
  const stats: YearStat[] = [];
  const disposable: number[][] = [];
  const wellbeing: number[][] = [];
  const gone: (number | null)[] = ps.map(() => null);
  const founded: number[][] = ps.map(() => []);
  const evaded: number[][] = ps.map(() => []);
  const unemployed: number[][] = ps.map(() => []);
  const aiDisplaced: number[][] = ps.map(() => []);
  const reemployed: number[][] = ps.map(() => []);
  let emigrants = 0;
  let essentialR = essentialRatio ?? 0;
  let ref = refWb;
  let automated = 0; // 자동화가 만들어내는 연간 생산 (만원) — 자본 소유자에게 돌아감

  for (let y = 1; y <= years; y++) {
    const lv = lvs[Math.min(y, lvs.length) - 1];
    const BI = lv.basicIncome * 12;
    const floor = lv.minLiving * 12;
    const repl = lv.unemployBenefit / 100;
    let aiDisplacedN = 0;
    const alive = ps.map((p, i) => (p.gone ? -1 : i)).filter((i) => i >= 0);
    const aliveN = Math.max(1, alive.length);
    const sortedPre = alive.map((i) => ps[i].base).sort((a, b) => a - b);
    const median = sortedPre[Math.floor(sortedPre.length / 2)] || 1;

    // 1) 일자리: 재취업 → 실직 (AI 대체 + 일반 이직)
    const reemployP = (p: Person) =>
      clamp(0.5 - sc.reemployPenalty * p.aiExposure + 0.12 * lv.reskill, 0.05, 0.9);
    for (const i of alive) {
      const p = ps[i];
      if (!p.employed) {
        if (luck(i, y, 1) < reemployP(p)) {
          p.employed = true;
          p.unempYears = 0;
          // 다시 일해도 대개 예전보다 낮은 임금에서 시작한다
          p.base -= p.lostWage * (0.15 - 0.03 * lv.reskill);
          reemployed[i].push(y);
        }
        continue;
      }
      const wage = p.base * (1 - p.capitalShare);
      if (wage <= 0) continue;
      if (luck(i, y, 2) < sc.displace * waveFactor(y) * p.aiExposure * 1.5) {
        aiDisplacedN++;
        p.employed = false;
        p.lostWage = wage;
        automated += wage * sc.productivity;
        aiDisplaced[i].push(y);
      } else if (luck(i, y, 3) < CHURN) {
        p.employed = false;
        p.lostWage = wage;
      }
    }

    // 2) 자동화 생산은 자본 비중만큼 나눠 가진다
    const capW = alive.map((i) => ps[i].base * ps[i].capitalShare);
    const capTotal = capW.reduce((s, x) => s + x, 0) || 1;

    let revenue = 0;
    let startups = 0;
    let successes = 0;
    let evaders = 0;
    let benefits = 0;
    let totalGross = 0;
    let unempN = 0;
    const afterTax: number[] = new Array(n).fill(0);
    const effTax: number[] = new Array(n).fill(0);
    const benefit: number[] = new Array(n).fill(0);

    alive.forEach((i, k) => {
      const p = ps[i];
      if (!p.employed) {
        p.unempYears++;
        unempN++;
        unemployed[i].push(y);
      }
      const aiRent = automated * (capW[k] / capTotal);
      const aiTaxPaid = aiRent * (lv.aiTax / 100);
      revenue += aiTaxPaid;

      // 일하는 강도: 손에 남는 몫이 클수록 조금 더 일한다. 기본소득의 소득효과는
      // 작게(핀란드·알래스카 실험에서 고용 감소가 거의 없었음).
      const probeTax = incomeTax(p.base, median, lv) / Math.max(1, p.base);
      const keep = 1 - probeTax;
      // 복지 함정: 일해서 손에 쥐는 돈이 최저생활 보장선보다 적으면, 더 벌어도
      // 보충분이 그만큼 줄어서 일할 이유가 사라진다 (실효 한계세율 100%).
      const trapped = clamp((floor - (p.base * keep + BI)) / Math.max(1, floor), 0, 1);
      const effort = p.employed
        ? clamp(
            0.85 + 0.3 * (keep - 0.75) - 0.03 * (BI / median) - 0.3 * trapped + (luck(i, y, 4) * 2 - 1) * 0.05,
            0.5,
            1.1,
          )
        : 0;

      // 창업: 성향 × 창업 환경 × 이익을 가져갈 수 있는 정도
      if (p.employed && luck(i, y, 5) < p.entrepreneurship * 0.06 * (0.3 + FREEDOM) * (0.4 + keep)) {
        startups++;
        founded[i].push(y);
        if (luck(i, y, 6) < 0.35 + 0.15 * FREEDOM) {
          successes++;
          p.base *= 1.5;
          p.capitalShare = Math.min(0.9, p.capitalShare + 0.25);
        } else {
          // 실패 — 최저생활 보장이 두터울수록 덜 추락
          p.base *= 0.75 + 0.15 * clamp(floor / median, 0, 1);
        }
      }

      const wage = p.base * (1 - p.capitalShare) * effort;
      const capital = p.base * p.capitalShare;
      const g = wage + capital;
      totalGross += g + aiRent;
      const taxable = g + aiRent - aiTaxPaid;
      let tax = incomeTax(taxable, median, lv);
      const rate = tax / Math.max(1, taxable);
      // 탈세: 세 부담이 크고, 단속이 약하고, 정직하지 않을수록
      const pEvade = (1 - p.honesty) * (1 - ENFORCEMENT) * Math.max(0, rate - 0.15) * 2.5;
      if (luck(i, y, 7) < pEvade) {
        evaders++;
        evaded[i].push(y);
        tax *= luck(i, y, 8) < ENFORCEMENT * 0.5 ? 1.3 : 0.4; // 걸리면 추징
      }
      revenue += tax;
      afterTax[i] = taxable - tax;
      effTax[i] = (tax + aiTaxPaid) / Math.max(1, g + aiRent);
      if (!p.employed && p.unempYears <= 2) {
        benefit[i] = p.lostWage * repl;
        benefits += benefit[i];
      }
    });

    // 3) 이전지출: 기본소득 + 실업급여 + 최저생활 보충 + 재훈련
    const disp: number[] = new Array(n).fill(0);
    let topUps = 0;
    for (const i of alive) {
      let d = afterTax[i] + benefit[i] + BI;
      if (d < floor) {
        topUps += floor - d;
        d = floor;
      }
      disp[i] = d;
    }
    const transfers = BI * alive.length + benefits + topUps + totalGross * (lv.reskill / 100);
    const serviceFunds = revenue - transfers;
    if (essentialRatio === null && y === 1) {
      essentialR = clamp(serviceFunds / Math.max(1, totalGross), 0.05, 0.4);
    }
    const essential = totalGross * essentialR;
    const publicQuality = clamp(serviceFunds / essential, 0, 1.2) / 1.2;
    const fiscalBalance = (serviceFunds - essential) / Math.max(1, totalGross);

    const dispAlive = alive.map((i) => disp[i]);
    const g = gini(dispAlive);
    const sortedDisp = [...dispAlive].sort((a, b) => a - b);
    const medDisp = sortedDisp[Math.floor(sortedDisp.length / 2)] || 1;

    // 4) 웰빙: 각자 가치관 가중 평균 (0~1)
    const wbRow: number[] = new Array(n).fill(NaN);
    for (const i of alive) {
      const p = ps[i];
      // 부: 내 처음 형편 대비 지금(절대) + 남들 대비 내 위치(상대)
      const wealth = clamp(
        0.5 +
          0.3 * Math.log2(Math.max(0.05, disp[i] / Math.max(1, p.base0 * 0.78))) +
          0.1 * Math.log2(Math.max(0.05, disp[i] / medDisp)),
        0,
        1,
      );
      const equality = clamp(1 - g * 1.4, 0, 1);
      // 자유: 번 돈을 내 뜻대로 쓸 수 있는 정도
      const freedom = clamp(1 - effTax[i] * 1.6, 0, 1);
      const job = p.employed ? 1 : benefit[i] > 0 ? 0.4 : 0;
      const security = clamp(
        0.3 * publicQuality +
          0.2 * clamp((floor / medDisp) * 2.5, 0, 1) +
          0.2 * clamp((BI / medDisp) * 4, 0, 1) +
          0.3 * job,
        0,
        1,
      );
      const v = p.values;
      const wsum = v.wealth + v.equality + v.freedom + v.security || 1;
      let wb = (v.wealth * wealth + v.equality * equality + v.freedom * freedom + v.security * security) / wsum;
      // 실직은 소득 손실과 별개로 삶의 만족을 크게 깎는다 (실증 연구에서 일관됨)
      if (!p.employed) wb -= 0.08;
      wbRow[i] = clamp(wb, 0, 1);
    }

    // 5) 성장: 창업 성공·공공서비스는 끌어올리고, 과도한 세금·재정적자는 끌어내린다
    const avgTax = revenue / Math.max(1, totalGross);
    const growth =
      0.012 +
      (successes / aliveN) * 2 -
      0.04 * Math.max(0, avgTax - 0.35) +
      0.01 * publicQuality +
      0.1 * clamp(fiscalBalance, -0.15, 0); // 적자 GDP 10%면 성장 −1%p
    for (const i of alive) ps[i].base *= 1 + growth + (luck(i, y, 9) * 2 - 1) * 0.04;
    automated *= 1 + growth;

    // 6) 이민: 평행세계와 비교하지 않는다. 본인이 겪은 것 — 예전보다 삶이 확실히
    // 나빠졌거나, 세금 부담이 다른 나라 수준(약 40%)보다 무거울 때 — 과 떠날 능력으로.
    if (!ref) ref = wbRow.slice();
    for (const i of alive) {
      const p = ps[i];
      const push = Math.max(0, (ref[i] ?? wbRow[i]) - wbRow[i]) + 0.5 * Math.max(0, effTax[i] - 0.4);
      if (push > 0.04 && luck(i, y, 10) < p.mobility * (1 - EXIT_BARRIER) * (push - 0.02) * 0.6) {
        p.gone = true;
        gone[i] = y;
        emigrants++;
      }
    }

    const aiTotal = automated / (1 + growth);
    stats.push({
      year: y,
      gdpPerCapita: totalGross / aliveN,
      gini: g,
      wellbeing: alive.reduce((s, i) => s + wbRow[i], 0) / aliveN,
      support: 0,
      oppose: 0,
      emigrants,
      evasion: evaders / aliveN,
      startups,
      population: alive.length,
      unemployment: unempN / aliveN,
      aiDisplaced: aiDisplacedN,
      fiscalBalance,
      aiShare: aiTotal / Math.max(1, totalGross),
    });
    disposable.push(disp);
    wellbeing.push(wbRow);
  }
  return { stats, disposable, wellbeing, gone, founded, evaded, unemployed, aiDisplaced, reemployed, essentialRatio: essentialR };
}

// 정부 평가 — 평행세계("다른 제도였다면")를 모른다. 시민이 실제로 아는 것만 쓴다:
//   내 삶: 취임 직전 대비 + 작년 대비 (최근 변화에 더 민감)
//   이웃·동료: 같은 계층 사람들의 형편
//   나라 경제: 실업률이 늘었나
//   성향: 원래 이 정부에 호의적인지, 그리고 취임 초 허니문
type Stance = "support" | "neutral" | "oppose";
function judge(
  w: WorldOut,
  ref: number[],
  clsOf: string[],
  lean: number[],
): { stance: Stance[][]; support: number[]; oppose: number[] } {
  const n = clsOf.length;
  const years = w.stats.length;
  const stance: Stance[][] = Array.from({ length: n }, () => []);
  const support: number[] = [];
  const oppose: number[] = [];
  const unemp0 = w.stats[0]?.unemployment ?? 0;
  const mood: number[] = new Array(n).fill(NaN); // 지난 평가가 쌓인 관성
  for (let y = 1; y <= years; y++) {
    const row = w.wellbeing[y - 1];
    const prevRow = w.wellbeing[y - 2];
    // 계층별 평균 변화 (취임 직전 대비)
    const sum = new Map<string, { s: number; k: number }>();
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(row[i])) continue;
      const e = sum.get(clsOf[i]) ?? { s: 0, k: 0 };
      e.s += row[i] - (ref[i] ?? row[i]);
      e.k++;
      sum.set(clsOf[i], e);
    }
    const nation = -0.25 * (w.stats[y - 1].unemployment - unemp0);
    const honeymoon = 0.015 * Math.max(0, 1 - (y - 1) / 3);
    let sup = 0;
    let opp = 0;
    let alive = 0;
    for (let i = 0; i < n; i++) {
      const goneY = w.gone[i];
      if (goneY !== null && goneY < y) {
        stance[i].push("oppose");
        continue;
      }
      alive++;
      const wb = row[i];
      const me = 0.35 * (wb - (ref[i] ?? wb)) + 0.15 * (prevRow && Number.isFinite(prevRow[i]) ? wb - prevRow[i] : 0);
      const pe = sum.get(clsOf[i]);
      const peers = pe ? 0.2 * (pe.s / Math.max(1, pe.k)) : 0;
      const raw = me + peers + nation + lean[i] + honeymoon;
      // 지지율은 한 해 사건으로 뒤집히지 않는다 — 올해 인상 절반, 지난 평가 절반
      const a = Number.isFinite(mood[i]) ? 0.5 * mood[i] + 0.5 * raw : raw;
      mood[i] = a;
      const st: Stance = a > 0.01 ? "support" : a < -0.01 ? "oppose" : "neutral";
      stance[i].push(st);
      if (st === "support") sup++;
      if (st === "oppose") opp++;
    }
    support.push(sup / Math.max(1, alive));
    oppose.push(opp / Math.max(1, alive));
  }
  return { stance, support, oppose };
}

export function simulateSociety(
  spec: SocietySpec,
  opts: {
    population?: number;
    years?: number;
    seed?: number;
    ai?: AiSpeed;
    schedule?: Levers[]; // 새 제도의 연도별 레버 (통치자 게임). 없으면 spec.policy 고정
  } = {},
): SocietyResult {
  const population = opts.population ?? 500;
  const years = opts.years ?? 10;
  const seed = opts.seed ?? 42;
  const ai = opts.ai ?? "normal";
  const rand = rng(seed);
  const jit = (v: number, a: number) => clamp(v + (rand() * 2 - 1) * a, 0, 1);

  const people: Person[] = [];
  const names: string[] = [];
  for (const c of spec.classes) {
    const k = Math.round(c.share * population);
    for (let i = 0; i < k; i++) {
      people.push({
        cls: c,
        values: {
          wealth: jit(c.values.wealth, 0.2),
          equality: jit(c.values.equality, 0.2),
          freedom: jit(c.values.freedom, 0.2),
          security: jit(c.values.security, 0.2),
        },
        honesty: jit(c.honesty, 0.2),
        mobility: jit(c.mobility, 0.15),
        entrepreneurship: jit(c.entrepreneurship, 0.15),
        aiExposure: jit(c.aiExposure, 0.2),
        // 계층 안에서도 소득은 로그정규에 가깝게 퍼진다
        base: c.income * Math.exp((rand() + rand() + rand() - 1.5) * 0.5),
        capitalShare: jit(c.capitalShare, 0.1),
        base0: 0,
        gone: false,
        employed: true,
        unempYears: 0,
        lostWage: 0,
      });
      names.push(
        SURNAMES[Math.floor(rand() * SURNAMES.length)] + GIVEN[Math.floor(rand() * GIVEN.length)],
      );
    }
  }

  for (const p of people) p.base0 = p.base;
  // 같은 사람들, 같은 운(seed), 같은 AI 충격으로 두 세계를 산다.
  const sched = opts.schedule && opts.schedule.length > 0 ? opts.schedule : [spec.policy];
  const base = runWorld([spec.baseline], ai, people, years, seed + 1, null, null);
  const ref = base.wellbeing[0] ?? [];
  const pol = runWorld(sched, ai, people, years, seed + 1, ref, base.essentialRatio);
  const lean = people.map(() => (rand() * 2 - 1) * 0.03); // 원래 정부에 호의적인지 (사람마다 고정)
  const clsOf = people.map((p) => p.cls.name);
  const baseStance = judge(base, ref, clsOf, lean);
  const polStance = judge(pol, ref, clsOf, lean);

  const citizens: Citizen[] = people.map((p, i) => ({
    id: i,
    name: names[i],
    cls: p.cls.name,
    values: p.values,
    honesty: p.honesty,
    mobility: p.mobility,
    entrepreneurship: p.entrepreneurship,
    aiExposure: p.aiExposure,
    income: pol.disposable.map((row) => row[i]),
    wellbeing: pol.wellbeing.map((row) => row[i]),
    baseWellbeing: base.wellbeing.map((row) => row[i]),
    stance: [],
    emigratedYear: pol.gone[i],
    foundedYears: pol.founded[i],
    evadedYears: pol.evaded[i],
    protestYears: [],
    unemployedYears: pol.unemployed[i],
    aiDisplacedYears: pol.aiDisplaced[i],
    reemployedYears: pol.reemployed[i],
  }));

  // 지지/반대 — judge()가 시민이 볼 수 있는 것만으로 정한다
  citizens.forEach((c, i) => (c.stance = polStance.stance[i]));
  pol.stats.forEach((st, k) => {
    st.support = polStance.support[k];
    st.oppose = polStance.oppose[k];
  });
  base.stats.forEach((st, k) => {
    st.support = baseStance.support[k];
    st.oppose = baseStance.oppose[k];
  });

  // 사건 피드
  const events: SocietyEvent[] = [];
  const push = (e: SocietyEvent) => {
    if (events.length < 90) events.push(e);
  };
  const protestYears = new Set<number>();
  for (const s of pol.stats) if (s.oppose > 0.35) protestYears.add(s.year);
  for (const c of citizens) {
    for (const y of c.aiDisplacedYears.slice(0, 1)) {
      if (rand() < 0.35) {
        push({ year: y, citizenId: c.id, text: `${c.name}님(${c.cls})의 일자리가 AI 자동화로 사라졌어요`, bubble: "일자리가…" });
      }
    }
    for (const y of c.reemployedYears.slice(0, 1)) {
      if (c.aiDisplacedYears.length > 0 && rand() < 0.3) {
        push({ year: y, citizenId: c.id, text: `${c.name}님(${c.cls})이 다시 일자리를 찾았어요`, bubble: "재취업!" });
      }
    }
    if (c.emigratedYear !== null && rand() < 0.6) {
      push({
        year: c.emigratedYear,
        citizenId: c.id,
        text: `${c.name}님(${c.cls})이 나라를 떠났어요 — 연소득 약 ${Math.round(c.income[Math.max(0, c.emigratedYear - 2)] ?? 0).toLocaleString()}만원`,
        bubble: "떠날래…",
      });
    }
    for (const y of c.foundedYears.slice(0, 1)) {
      if (rand() < 0.2) {
        push({ year: y, citizenId: c.id, text: `${c.name}님(${c.cls})이 창업했어요`, bubble: "창업!" });
      }
    }
    for (const y of c.evadedYears.slice(0, 1)) {
      if (rand() < 0.1) {
        push({ year: y, citizenId: c.id, text: `${c.name}님(${c.cls})이 소득을 숨겼어요`, bubble: "쉿…" });
      }
    }
    for (const y of Array.from(protestYears)) {
      if (c.stance[y - 1] === "oppose" && c.emigratedYear === null) {
        c.protestYears.push(y);
      }
    }
  }
  for (const y of Array.from(protestYears)) {
    const protester = citizens.find((c) => c.protestYears.includes(y));
    if (protester) {
      push({
        year: y,
        citizenId: protester.id,
        text: `${y}년차 — 반대 ${Math.round(pol.stats[y - 1].oppose * 100)}%, 시청 앞 시위`,
        bubble: "반대한다!",
      });
    }
  }
  for (const s of pol.stats) {
    if (s.fiscalBalance < -0.03) {
      const c = citizens.find((x) => x.emigratedYear === null);
      if (c) {
        push({
          year: s.year,
          citizenId: c.id,
          text: `${s.year}년차 — 재정 적자 GDP ${(s.fiscalBalance * -100).toFixed(1)}%, 공공서비스 축소`,
          bubble: "예산이…",
        });
      }
      break;
    }
  }
  // 계층 여론이 과반으로 기우는 첫 해
  for (const cl of spec.classes) {
    let saidSupport = false;
    let saidOppose = false;
    for (let y = 1; y <= years; y++) {
      const stay = citizens.filter(
        (c) => c.cls === cl.name && (c.emigratedYear === null || c.emigratedYear >= y),
      );
      if (stay.length === 0) continue;
      const sup = stay.filter((c) => c.stance[y - 1] === "support");
      const opp = stay.filter((c) => c.stance[y - 1] === "oppose");
      if (!saidSupport && sup.length / stay.length > 0.5) {
        saidSupport = true;
        push({
          year: y,
          citizenId: sup[0].id,
          text: `${cl.name} 과반이 지지로 — ${sup[0].name}님: "예전보다 살 만해요"`,
          bubble: "살 만해요",
        });
      }
      if (!saidOppose && opp.length / stay.length > 0.5) {
        saidOppose = true;
        push({
          year: y,
          citizenId: opp[0].id,
          text: `${cl.name} 과반이 반대로 — ${opp[0].name}님: "손해 보는 느낌이에요"`,
          bubble: "손해야…",
        });
      }
    }
  }
  events.sort((a, b) => a.year - b.year);

  const last = years - 1;
  const byClass = spec.classes.map((cl) => {
    const group = citizens.filter((c) => c.cls === cl.name);
    const stay = group.filter((c) => c.emigratedYear === null);
    const idxs = stay.map((c) => c.id);
    const polInc = idxs.reduce((s, i) => s + pol.disposable[last][i], 0);
    const baseInc = idxs.reduce((s, i) => s + base.disposable[last][i], 0);
    const wbd =
      stay.reduce((s, c) => s + (c.wellbeing[last] - c.baseWellbeing[last]), 0) /
      Math.max(1, stay.length);
    return {
      name: cl.name,
      size: group.length,
      incomeChange: baseInc > 0 ? (polInc / baseInc - 1) * 100 : 0,
      wellbeingChange: wbd,
      support: stay.filter((c) => c.stance[last] === "support").length / Math.max(1, stay.length),
      oppose: stay.filter((c) => c.stance[last] === "oppose").length / Math.max(1, stay.length),
      emigrated: group.length - stay.length,
      unemployment:
        stay.filter((c) => c.unemployedYears.includes(years)).length / Math.max(1, stay.length),
    };
  });

  return {
    years,
    ai,
    citizens,
    policy: pol.stats,
    baseline: base.stats,
    byClass,
    events,
  };
}

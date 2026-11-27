// 가상 사회 시뮬레이션 엔진 — 제도를 정책 레버로 표현하고, 계층별 NPC가
// 매년 일하는 강도·창업·탈세·이민·지지를 규칙으로 결정한다.
//
// LLM은 제도 아이디어를 SocietySpec(계층 + 현재 사회 레버 + 새 제도 레버)
// 으로 한 번만 바꾸고, 실제 계산은 여기서 한다. 같은 사람들(같은 seed)을
// "현재 사회"와 "새 제도"에서 각각 살게 해서 차이를 본다.

export type Levers = {
  taxRate: number; // 평균 소득세율 0~0.7
  progressivity: number; // 누진성 0~1 (고소득일수록 더 냄)
  dividendShare: number; // 세수 중 전 국민 균등 배당 비율 0~1 (나머지는 공공서비스)
  profitShare: number; // 사업·자본 이익 중 사회로 환원되어 균등 배당되는 비율 0~0.8
  freedom: number; // 경제·개인 자율성 0~1
  enforcement: number; // 법 집행·탈세 단속 0~1
  safetyNet: number; // 최저 생활 보장 강도 0~1
  exitBarrier: number; // 이민(이탈) 장벽 0~1
};

export const LEVER_META: { key: keyof Levers; label: string; max: number }[] = [
  { key: "taxRate", label: "소득세율", max: 0.7 },
  { key: "progressivity", label: "누진성", max: 1 },
  { key: "dividendShare", label: "세수 배당 비율", max: 1 },
  { key: "profitShare", label: "기업 이익 환원", max: 0.8 },
  { key: "freedom", label: "경제·개인 자유", max: 1 },
  { key: "enforcement", label: "법 집행", max: 1 },
  { key: "safetyNet", label: "최저 생활 보장", max: 1 },
  { key: "exitBarrier", label: "이민 장벽", max: 1 },
];

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
  // 연도별 기록 (index = year-1)
  income: number[]; // 가처분소득 (만원)
  wellbeing: number[];
  baseWellbeing: number[]; // 같은 사람이 현재 사회에서 살았을 때
  stance: ("support" | "neutral" | "oppose")[];
  emigratedYear: number | null;
  foundedYears: number[];
  evadedYears: number[];
  protestYears: number[];
};

export type YearStat = {
  year: number;
  gdpPerCapita: number; // 만원 (남은 인구 기준 총생산)
  gini: number;
  wellbeing: number;
  support: number; // 비율 0~1
  oppose: number;
  emigrants: number; // 누적
  evasion: number; // 그해 탈세 비율
  startups: number;
  population: number;
};

export type SocietyEvent = { year: number; citizenId: number; text: string; bubble: string };

export type SocietyResult = {
  years: number;
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
  }[];
  events: SocietyEvent[];
};

// --- 정규화 -----------------------------------------------------------------
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);

const DEFAULT_BASELINE: Levers = {
  taxRate: 0.22,
  progressivity: 0.5,
  dividendShare: 0.05,
  profitShare: 0.05,
  freedom: 0.7,
  enforcement: 0.6,
  safetyNet: 0.4,
  exitBarrier: 0.5,
};

function fixLevers(raw: unknown, fallback: Levers): Levers {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const m of LEVER_META) out[m.key] = clamp(num(r[m.key], fallback[m.key]), 0, m.max);
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
  const baseline = fixLevers(r.baseline, DEFAULT_BASELINE);
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
  base: number; // 세전 노동+자본 소득 잠재력 (만원)
  capitalShare: number;
  base0: number; // 시작 시점 소득 — "예전보다 나아졌나"의 기준
  gone: boolean;
};

type WorldOut = {
  stats: YearStat[];
  disposable: number[][]; // [year][person]
  wellbeing: number[][];
  gone: (number | null)[]; // 떠난 해
  founded: number[][]; // person → years
  evaded: number[][];
};

// 한 세계(레버 세트)에서 years년을 산다. 같은 seed면 같은 사람·같은 운.
function runWorld(
  spec: SocietySpec,
  lv: Levers,
  people: Person[],
  years: number,
  seed: number,
  baselineWb: number[][] | null,
): WorldOut {
  const rand = rng(seed);
  const ps = people.map((p) => ({ ...p }));
  const n = ps.length;
  const stats: YearStat[] = [];
  const disposable: number[][] = [];
  const wellbeing: number[][] = [];
  const gone: (number | null)[] = ps.map(() => null);
  const founded: number[][] = ps.map(() => []);
  const evaded: number[][] = ps.map(() => []);
  let emigrants = 0;
  // 해외 기준선: 고소득·고이동성 사람이 비교하는 "다른 나라의 삶" — 현재
  // 사회의 평균적 웰빙과 비슷하게 둔다(baselineWb 사용).

  for (let y = 1; y <= years; y++) {
    const alive = ps.map((p, i) => (p.gone ? -1 : i)).filter((i) => i >= 0);
    const incomesPre = alive.map((i) => ps[i].base);
    const sortedPre = [...incomesPre].sort((a, b) => a - b);
    const median = sortedPre[Math.floor(sortedPre.length / 2)] || 1;

    let revenue = 0;
    let profitPool = 0;
    let startups = 0;
    let successes = 0;
    let evaders = 0;
    const gross: number[] = new Array(n).fill(0);
    const afterTax: number[] = new Array(n).fill(0);

    for (const i of alive) {
      const p = ps[i];
      const rel = Math.min(5, p.base / median);
      const personalTax = clamp(lv.taxRate * (1 + lv.progressivity * (rel - 1) * 0.5), 0, 0.9);
      const keepLabor = 1 - personalTax;
      const keepCapital = (1 - lv.profitShare) * (1 - personalTax);
      // 일하는 강도: 손에 남는 몫이 클수록, 자유로울수록 더 일한다
      const keep = keepLabor * (1 - p.capitalShare) + keepCapital * p.capitalShare;
      const effort = clamp(0.8 + 0.5 * (keep - 0.65) + 0.1 * (lv.freedom - 0.5) + (rand() * 2 - 1) * 0.05, 0.45, 1.15);

      // 창업: 성향 × 자유 × 이익을 가져갈 수 있는 정도
      if (rand() < p.entrepreneurship * 0.06 * (0.3 + lv.freedom) * (0.4 + keepCapital)) {
        startups++;
        founded[i].push(y);
        if (rand() < 0.35 + 0.15 * lv.freedom) {
          successes++;
          p.base *= 1.5;
          p.capitalShare = Math.min(0.9, p.capitalShare + 0.25);
        } else {
          // 실패 — 안전망이 두터울수록 덜 추락
          p.base *= 0.75 + 0.2 * lv.safetyNet;
        }
      }

      const g = p.base * effort;
      gross[i] = g;
      const capital = g * p.capitalShare;
      const shared = capital * lv.profitShare;
      profitPool += shared;
      const taxable = g - shared;
      let tax = taxable * personalTax;
      // 탈세: 세 부담이 크고, 단속이 약하고, 정직하지 않을수록
      const pEvade = (1 - p.honesty) * (1 - lv.enforcement) * Math.max(0, personalTax - 0.15) * 2.5;
      if (rand() < pEvade) {
        evaders++;
        evaded[i].push(y);
        // 걸리면 추징 (집행이 강할수록 잘 걸림)
        if (rand() < lv.enforcement * 0.5) {
          tax *= 1.3;
        } else {
          tax *= 0.4;
        }
      }
      revenue += tax;
      afterTax[i] = taxable - tax;
    }

    const aliveN = Math.max(1, alive.length);
    // 배당: 환원된 기업 이익 전부 + 세수 중 배당 몫을 균등 분배
    const dividend = (profitPool + revenue * lv.dividendShare) / aliveN;
    let publicBudget = revenue * (1 - lv.dividendShare);
    // 최저 생활 보장: 중위 소득의 일정 비율까지 채워줌 (공공예산에서)
    const disp: number[] = new Array(n).fill(0);
    const floor = lv.safetyNet * 0.5 * median;
    for (const i of alive) {
      let d = afterTax[i] + dividend;
      if (d < floor) {
        const topUp = Math.min(floor - d, publicBudget / aliveN * 3);
        d += topUp;
        publicBudget -= topUp;
      }
      disp[i] = d;
    }
    // 공공서비스 질: 1인당 공공예산 / 중위소득 → 0~1
    const publicQuality = clamp((publicBudget / aliveN / median) * 3, 0, 1);
    const dispAlive = alive.map((i) => disp[i]);
    const g = gini(dispAlive);
    const sortedDisp = [...dispAlive].sort((a, b) => a - b);
    const medDisp = sortedDisp[Math.floor(sortedDisp.length / 2)] || 1;

    // 웰빙: 각자 가치관 가중 평균 (0~1)
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
      const equality = 1 - g * 1.4;
      const freedom = lv.freedom;
      const security = clamp(0.35 * publicQuality + 0.35 * lv.safetyNet + 0.3 * clamp(dividend / medDisp * 4, 0, 1), 0, 1);
      const v = p.values;
      const wsum = v.wealth + v.equality + v.freedom + v.security || 1;
      wbRow[i] =
        (v.wealth * wealth + v.equality * clamp(equality, 0, 1) + v.freedom * freedom + v.security * security) / wsum;
    }

    // 성장: 자유·창업 성공은 끌어올리고, 과도한 세금은 끌어내린다.
    // 다음 해 모든 사람의 잠재 소득에 반영.
    const growth =
      0.012 +
      0.015 * (lv.freedom - 0.5) +
      (successes / aliveN) * 2 -
      0.04 * Math.max(0, lv.taxRate - 0.35) -
      0.02 * Math.max(0, lv.profitShare - 0.2) +
      0.01 * publicQuality;
    for (const i of alive) {
      ps[i].base *= 1 + growth + (rand() * 2 - 1) * 0.04;
    }

    // 이민: 현재 사회에서보다 확실히 나빠졌고, 떠날 능력이 있으면
    for (const i of alive) {
      if (!baselineWb) break;
      const p = ps[i];
      const gap = (baselineWb[y - 1]?.[i] ?? wbRow[i]) - wbRow[i];
      if (gap > 0.04 && rand() < p.mobility * (1 - lv.exitBarrier) * (gap - 0.02) * 2.5) {
        p.gone = true;
        gone[i] = y;
        emigrants++;
      }
    }

    const totalGross = alive.reduce((s, i) => s + gross[i], 0);
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
    });
    disposable.push(disp);
    wellbeing.push(wbRow);
  }
  return { stats, disposable, wellbeing, gone, founded, evaded };
}

export function simulateSociety(
  spec: SocietySpec,
  opts: { population?: number; years?: number; seed?: number } = {},
): SocietyResult {
  const population = opts.population ?? 500;
  const years = opts.years ?? 10;
  const seed = opts.seed ?? 42;
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
        // 계층 안에서도 소득은 로그정규에 가깝게 퍼진다
        base: c.income * Math.exp((rand() + rand() + rand() - 1.5) * 0.5),
        capitalShare: jit(c.capitalShare, 0.1),
        base0: 0,
        gone: false,
      });
      names.push(
        SURNAMES[Math.floor(rand() * SURNAMES.length)] + GIVEN[Math.floor(rand() * GIVEN.length)],
      );
    }
  }

  for (const p of people) p.base0 = p.base;
  // 같은 사람들, 같은 운(seed)으로 두 세계를 산다.
  const base = runWorld(spec, spec.baseline, people, years, seed + 1, null);
  const pol = runWorld(spec, spec.policy, people, years, seed + 1, base.wellbeing);

  const citizens: Citizen[] = people.map((p, i) => ({
    id: i,
    name: names[i],
    cls: p.cls.name,
    values: p.values,
    honesty: p.honesty,
    mobility: p.mobility,
    entrepreneurship: p.entrepreneurship,
    income: pol.disposable.map((row) => row[i]),
    wellbeing: pol.wellbeing.map((row) => row[i]),
    baseWellbeing: base.wellbeing.map((row) => row[i]),
    stance: [],
    emigratedYear: pol.gone[i],
    foundedYears: pol.founded[i],
    evadedYears: pol.evaded[i],
    protestYears: [],
  }));

  // 지지/반대: 같은 사람이 현재 사회에서 살았을 때보다 나은가
  for (let y = 1; y <= years; y++) {
    let sup = 0;
    let opp = 0;
    let alive = 0;
    for (const c of citizens) {
      if (c.emigratedYear !== null && c.emigratedYear < y) {
        c.stance.push("oppose");
        continue;
      }
      alive++;
      const d = c.wellbeing[y - 1] - c.baseWellbeing[y - 1];
      const st = d > 0.015 ? "support" : d < -0.015 ? "oppose" : "neutral";
      c.stance.push(st);
      if (st === "support") sup++;
      if (st === "oppose") opp++;
    }
    pol.stats[y - 1].support = sup / Math.max(1, alive);
    pol.stats[y - 1].oppose = opp / Math.max(1, alive);
  }

  // 사건 피드
  const events: SocietyEvent[] = [];
  const push = (e: SocietyEvent) => {
    if (events.length < 90) events.push(e);
  };
  const protestYears = new Set<number>();
  for (const s of pol.stats) if (s.oppose > 0.35) protestYears.add(s.year);
  for (const c of citizens) {
    if (c.emigratedYear !== null && rand() < 0.6) {
      push({
        year: c.emigratedYear,
        citizenId: c.id,
        text: `${c.name}님(${c.cls})이 나라를 떠났어요 — 연소득 약 ${Math.round(c.income[Math.max(0, c.emigratedYear - 2)] ?? 0).toLocaleString()}만원`,
        bubble: "떠날래…",
      });
    }
    for (const y of c.foundedYears.slice(0, 1)) {
      if (rand() < 0.25) {
        push({ year: y, citizenId: c.id, text: `${c.name}님(${c.cls})이 창업했어요`, bubble: "창업!" });
      }
    }
    for (const y of c.evadedYears.slice(0, 1)) {
      if (rand() < 0.12) {
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
    };
  });

  return {
    years,
    citizens,
    policy: pol.stats,
    baseline: base.stats,
    byClass,
    events,
  };
}

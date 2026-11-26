// 가상 시장 시뮬레이션 엔진 — 심즈식 유틸리티 AI.
//
// LLM은 아이디어를 MarketSpec(고객층·욕구·대안)으로 한 번만 변환하고,
// 실제 NPC 행동은 여기 규칙으로 계산한다. 같은 spec + seed면 항상 같은
// 결과가 나오므로 가격·작동 신뢰도 등 변형을 공정하게 비교할 수 있다.

export type Need = { key: string; label: string };

export type Segment = {
  name: string;
  share: number; // 0~1, 합 1
  weights: Record<string, number>; // need key → 0~1 중요도
  budget: number; // 이 카테고리에 월 쓸 수 있는 돈(원)
  priceSensitivity: number; // 0~1
  openness: number; // 0~1, 새 제품을 시도하는 성향
};

export type Offer = {
  name: string;
  price: number; // 원 (1회 구매가)
  benefits: Record<string, number>; // need key → 0~1 충족도
};

export type MarketSpec = {
  productSummary: string;
  needs: Need[];
  segments: Segment[];
  product: Offer & {
    reliability: number; // 0~1, 약속한 효과를 실제로 내는 정도
    reliabilityNote?: string;
  };
  alternatives: Offer[]; // 첫 번째는 "지금 하던 방식"(가격 0)
  adReach: number; // 주당 광고 도달 확률 0~1
};

export type Reason =
  | "몰라서"
  | "예산 초과"
  | "비싸서"
  | "기존 방식으로 충분"
  | "망설이는 중";

export type Npc = {
  id: number;
  name: string;
  segment: string;
  weights: Record<string, number>;
  budget: number;
  priceSensitivity: number;
  openness: number;
  aware: boolean;
  awareWeek: number | null;
  boughtWeek: number | null;
  churnedWeek: number | null;
  viaReferral: boolean;
  satisfaction: number | null; // 구매자만
  reason: Reason | null; // 비구매자만
  // 결정 근거(숫자) — 탭해서 볼 때 사용
  productScore: number;
  bestAltName: string;
  bestAltScore: number;
  pricePenalty: number;
};

export type SimEvent = { week: number; npcId: number; text: string };

export type SimResult = {
  weeks: number;
  population: number;
  weekly: { week: number; owners: number; active: number }[];
  buyers: number;
  active: number;
  churned: number;
  referralBuyers: number;
  bySegment: { name: string; size: number; buyers: number; active: number }[];
  reasons: { reason: Reason; count: number }[];
  events: SimEvent[];
  npcs: Npc[];
};

// --- deterministic RNG (mulberry32) -----------------------------------------
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

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

const SURNAMES = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권"];
const GIVEN = ["민준", "서연", "도윤", "지우", "하준", "서윤", "은우", "하은", "지호", "수아", "현우", "지민", "유진", "예준", "채원", "건우", "다은", "시우", "소율", "주원"];

// LLM 출력은 믿을 수 없으므로 엔진에 넣기 전에 범위·합계를 정규화한다.
export function normalizeSpec(raw: unknown): MarketSpec {
  const r = (raw ?? {}) as Partial<MarketSpec>;
  const needs = (Array.isArray(r.needs) ? r.needs : [])
    .filter((n): n is Need => Boolean(n && n.key && n.label))
    .slice(0, 6);
  if (needs.length === 0) throw new Error("시장 설정에 욕구(needs)가 없습니다");
  const keys = needs.map((n) => n.key);
  const fixMap = (m: unknown) => {
    const src = (m ?? {}) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const k of keys) out[k] = clamp01(Number(src[k]) || 0);
    return out;
  };
  const num = (v: unknown, d: number) =>
    Number.isFinite(Number(v)) ? Number(v) : d;

  let segments = (Array.isArray(r.segments) ? r.segments : [])
    .filter((s) => s && s.name)
    .slice(0, 5)
    .map((s) => ({
      name: String(s.name),
      share: Math.max(0.01, num(s.share, 0.25)),
      weights: fixMap(s.weights),
      budget: Math.max(0, num(s.budget, 50000)),
      priceSensitivity: clamp01(num(s.priceSensitivity, 0.5)),
      openness: clamp01(num(s.openness, 0.5)),
    }));
  if (segments.length === 0) throw new Error("시장 설정에 고객층이 없습니다");
  const total = segments.reduce((a, s) => a + s.share, 0);
  segments = segments.map((s) => ({ ...s, share: s.share / total }));

  const fixOffer = (o: Partial<Offer> | undefined, fallbackName: string): Offer => ({
    name: String(o?.name ?? fallbackName),
    price: Math.max(0, num(o?.price, 0)),
    benefits: fixMap(o?.benefits),
  });
  const p = (r.product ?? {}) as Partial<MarketSpec["product"]>;
  const product = {
    ...fixOffer(p, "새 제품"),
    reliability: clamp01(num(p.reliability, 0.7)),
    reliabilityNote: p.reliabilityNote ? String(p.reliabilityNote) : undefined,
  };
  const alternatives = (Array.isArray(r.alternatives) ? r.alternatives : [])
    .slice(0, 4)
    .map((a, i) => fixOffer(a, i === 0 ? "지금 하던 방식" : `대안 ${i}`));
  if (alternatives.length === 0) {
    alternatives.push({ name: "지금 하던 방식", price: 0, benefits: fixMap({}) });
  }
  return {
    productSummary: String(r.productSummary ?? ""),
    needs,
    segments,
    product,
    alternatives,
    adReach: Math.min(0.5, Math.max(0.01, num(r.adReach, 0.08))),
  };
}

// 효용 = Σ 중요도 × 충족도 (욕구 수로 평균) — 0~1 스케일.
function needScore(weights: Record<string, number>, benefits: Record<string, number>) {
  const ks = Object.keys(weights);
  if (ks.length === 0) return 0;
  let s = 0;
  let w = 0;
  for (const k of ks) {
    s += weights[k] * (benefits[k] ?? 0);
    w += weights[k];
  }
  return w > 0 ? s / w : 0;
}

export function simulate(
  spec: MarketSpec,
  opts: { population?: number; weeks?: number; seed?: number } = {},
): SimResult {
  const population = opts.population ?? 400;
  const weeks = opts.weeks ?? 12;
  const rand = rng(opts.seed ?? 42);
  const jitter = (v: number, amt: number) => clamp01(v + (rand() * 2 - 1) * amt);

  // --- NPC 생성 -------------------------------------------------------------
  const npcs: Npc[] = [];
  let id = 0;
  for (const seg of spec.segments) {
    const n = Math.round(seg.share * population);
    for (let i = 0; i < n; i++) {
      const weights: Record<string, number> = {};
      for (const k of Object.keys(seg.weights)) weights[k] = jitter(seg.weights[k], 0.2);
      npcs.push({
        id: id++,
        name:
          SURNAMES[Math.floor(rand() * SURNAMES.length)] +
          GIVEN[Math.floor(rand() * GIVEN.length)],
        segment: seg.name,
        weights,
        // 예산은 개인차가 크다 — 0.4~1.8배
        budget: seg.budget * (0.4 + rand() * 1.4),
        priceSensitivity: jitter(seg.priceSensitivity, 0.15),
        openness: jitter(seg.openness, 0.2),
        aware: false,
        awareWeek: null,
        boughtWeek: null,
        churnedWeek: null,
        viaReferral: false,
        satisfaction: null,
        reason: null,
        productScore: 0,
        bestAltName: "",
        bestAltScore: 0,
        pricePenalty: 0,
      });
    }
  }

  // --- 각 NPC의 결정 근거(정적) 미리 계산 ------------------------------------
  // 가격 부담은 "연간 카테고리 예산 대비 가격" × 가격 민감도. 대안도 같은 식으로 계산해
  // 순효용끼리 비교한다.
  const pricePen = (npc: Npc, price: number) =>
    npc.priceSensitivity * Math.min(1.5, price / Math.max(1, npc.budget * 12));
  for (const npc of npcs) {
    npc.productScore = needScore(npc.weights, spec.product.benefits);
    npc.pricePenalty = pricePen(npc, spec.product.price);
    let best = -Infinity;
    for (const alt of spec.alternatives) {
      const s = needScore(npc.weights, alt.benefits) - pricePen(npc, alt.price);
      if (s > best) {
        best = s;
        npc.bestAltName = alt.name;
      }
    }
    npc.bestAltScore = best;
  }

  const events: SimEvent[] = [];
  const pushEvent = (week: number, npc: Npc, text: string) => {
    if (events.length < 80) events.push({ week, npcId: npc.id, text });
  };
  const firstBuyBySegment = new Set<string>();
  const weekly: SimResult["weekly"] = [];

  for (let w = 1; w <= weeks; w++) {
    // 1) 인지 — 광고 + 지난주까지 만족한 사용자의 입소문
    const promoters = npcs.filter(
      (n) => n.boughtWeek !== null && n.churnedWeek === null && (n.satisfaction ?? 0) > 0.05,
    );
    const detractors = npcs.filter((n) => n.churnedWeek !== null);
    for (const npc of npcs) {
      if (npc.aware) continue;
      if (rand() < spec.adReach) {
        npc.aware = true;
        npc.awareWeek = w;
      }
    }
    for (const p of promoters) {
      // 만족한 사용자는 주당 평균 0.6명에게 추천
      if (rand() < 0.6) {
        const target = npcs[Math.floor(rand() * npcs.length)];
        if (target.boughtWeek === null) {
          if (!target.aware) {
            target.aware = true;
            target.awareWeek = w;
          }
          // 이미 고민 끝에 안 산 사람도 지인 추천이면 한 번 더 고민한다
          target.viaReferral = true;
          if (target.reason !== "예산 초과") target.reason = "망설이는 중";
          if (rand() < 0.15) pushEvent(w, p, `${p.name}님이 ${target.name}님에게 추천했어요`);
        }
      }
    }
    // 불만 사용자의 악평은 인지자 일부의 기대를 깎는다
    const badBuzz = Math.min(0.3, (detractors.length / Math.max(1, npcs.length)) * 3);

    // 2) 구매 결정 — 인지했고 아직 안 산 사람
    for (const npc of npcs) {
      if (!npc.aware || npc.boughtWeek !== null) continue;
      // 매주 모두가 고민하지는 않는다 — 개방성이 높을수록 자주 고민
      if (rand() > 0.35 + npc.openness * 0.4) {
        npc.reason = npc.reason ?? "망설이는 중";
        continue;
      }
      // 1회 구매가는 반년치 카테고리 지출을 넘으면 못 산다
      if (spec.product.price > npc.budget * 6) {
        npc.reason = "예산 초과";
        continue;
      }
      // 한 번 고민해서 안 산 사람은 추천을 받기 전엔 다시 고민하지 않는다
      if (npc.reason && npc.reason !== "망설이는 중") continue;
      const net =
        npc.productScore -
        npc.pricePenalty -
        badBuzz * 0.2 +
        (npc.viaReferral ? 0.05 : 0);
      // 새 제품은 바꾸는 수고가 있다 — 개방성이 낮을수록 문턱이 높다
      const threshold = npc.bestAltScore + (1 - npc.openness) * 0.08;
      // 로짓 선택: 점수 차가 클수록 확률이 급격히 오르되, 조금 불리해도
      // 일부는 산다(취향·충동의 개인차). τ=0.07
      const pBuy = 1 / (1 + Math.exp(-(net - threshold) / 0.07));
      if (rand() < pBuy) {
        npc.boughtWeek = w;
        npc.reason = null;
        if (!firstBuyBySegment.has(npc.segment)) {
          firstBuyBySegment.add(npc.segment);
          pushEvent(w, npc, `${npc.segment} 첫 구매자 등장 — ${npc.name}님`);
        } else if (rand() < 0.05) {
          pushEvent(w, npc, `${npc.name}님(${npc.segment})이 구매했어요`);
        }
      } else {
        // 가장 큰 이유를 하나 고른다
        npc.reason =
          npc.productScore - npc.bestAltScore < 0.05
            ? "기존 방식으로 충분"
            : "비싸서";
      }
    }

    // 3) 사용 경험 — 구매 다음 주에 실제 효과를 체감
    for (const npc of npcs) {
      if (npc.boughtWeek === null || npc.boughtWeek !== w - 1 || npc.satisfaction !== null) continue;
      const works = rand() < spec.product.reliability;
      const realized = works
        ? npc.productScore * (0.85 + rand() * 0.3)
        : npc.productScore * (0.2 + rand() * 0.3);
      // 기대(제품 점수)에 못 미치거나, 써보니 기존 대안이 낫다고 느끼면 불만
      npc.satisfaction =
        realized -
        npc.productScore * 0.8 -
        Math.max(0, npc.bestAltScore - npc.productScore) * 0.5;
      if (npc.satisfaction < 0) {
        npc.churnedWeek = w;
        pushEvent(
          w,
          npc,
          works
            ? `${npc.name}님이 기대만 못하다며 사용을 그만뒀어요`
            : `${npc.name}님: "광고만큼 작동을 안 해요" — 사용 중단`,
        );
      }
    }

    const owners = npcs.filter((n) => n.boughtWeek !== null).length;
    const active = npcs.filter((n) => n.boughtWeek !== null && n.churnedWeek === null).length;
    weekly.push({ week: w, owners, active });
  }

  for (const npc of npcs) {
    if (npc.boughtWeek === null && !npc.aware) npc.reason = "몰라서";
  }

  const reasonCounts = new Map<Reason, number>();
  for (const npc of npcs) {
    if (npc.reason) reasonCounts.set(npc.reason, (reasonCounts.get(npc.reason) ?? 0) + 1);
  }
  const bySegment = spec.segments.map((s) => {
    const group = npcs.filter((n) => n.segment === s.name);
    return {
      name: s.name,
      size: group.length,
      buyers: group.filter((n) => n.boughtWeek !== null).length,
      active: group.filter((n) => n.boughtWeek !== null && n.churnedWeek === null).length,
    };
  });
  const buyers = npcs.filter((n) => n.boughtWeek !== null);
  return {
    weeks,
    population: npcs.length,
    weekly,
    buyers: buyers.length,
    active: buyers.filter((n) => n.churnedWeek === null).length,
    churned: buyers.filter((n) => n.churnedWeek !== null).length,
    referralBuyers: buyers.filter((n) => n.viaReferral).length,
    bySegment,
    reasons: Array.from(reasonCounts.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    events: events.sort((a, b) => a.week - b.week),
    npcs,
  };
}

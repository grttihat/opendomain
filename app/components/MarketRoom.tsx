"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useIdea } from "../state/IdeaContext";
import { apiPath } from "@/lib/apiPath";
import { simulate, type MarketSpec, type Npc } from "@/lib/sim/market";
import Village2D, { type VillageStatus } from "./Village2D";
import SocietyPanel from "./SocietyPanel";

// 가상 시장 — 아이디어 하나로 NPC 고객 수백 명의 시장을 만들고, 몇 주치
// 구매·사용·이탈·입소문을 빠르게 돌려본다. LLM은 시장 설정을 만들 때 한
// 번만 쓰고, 시뮬레이션은 규칙 엔진이 폰에서 즉시 계산한다.

const won = (n: number) =>
  n >= 10000
    ? `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}만원`
    : `${Math.round(n).toLocaleString()}원`;
const pct = (a: number, b: number) =>
  b > 0 ? `${Math.round((a / b) * 100)}%` : "0%";

export function Bar({
  label,
  value,
  max,
  note,
}: {
  label: string;
  value: number;
  max: number;
  note: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="w-24 shrink-0 truncate text-text-secondary">{label}</span>
      <div className="h-3 flex-1 rounded-full bg-white/[0.06]">
        <div
          className="h-3 rounded-full bg-white/70"
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
      <span className="w-16 shrink-0 text-right text-text-primary">{note}</span>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-white/[0.04] p-4">
      <h3 className="text-[13px] font-medium text-text-primary">{title}</h3>
      {children}
    </section>
  );
}

export default function MarketRoom({
  open,
  onClose,
  initialIdea,
}: {
  open: boolean;
  onClose: () => void;
  initialIdea: string;
}) {
  const { apiHeaders } = useIdea();
  const [idea, setIdea] = useState(initialIdea);
  const [spec, setSpec] = useState<MarketSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // 변형 실험용 조절값 — 기준 spec 대비 배율/덮어쓰기
  const [priceMul, setPriceMul] = useState(1);
  const [reliability, setReliability] = useState<number | null>(null);
  const [pickedWeek, setPickedWeek] = useState<number | null>(null);
  const [npc, setNpc] = useState<Npc | null>(null);
  const [view, setView] = useState<"village" | "report">("village");
  // 가상검증 종류: 제품(수요) / 사회제도
  const [lab, setLab] = useState<"market" | "society">("market");

  useEffect(() => {
    if (open && !spec) setIdea(initialIdea);
  }, [open, initialIdea, spec]);

  const build = async () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(apiPath("/api/market-spec"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ idea }),
      });
      const data = (await res.json()) as { spec?: MarketSpec; error?: string };
      if (!res.ok || !data.spec) throw new Error(data.error ?? `요청 실패 (${res.status})`);
      setSpec(data.spec);
      setPriceMul(1);
      setReliability(null);
      setPickedWeek(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const variant = useMemo<MarketSpec | null>(() => {
    if (!spec) return null;
    return {
      ...spec,
      product: {
        ...spec.product,
        price: Math.round((spec.product.price * priceMul) / 1000) * 1000,
        reliability: reliability ?? spec.product.reliability,
      },
    };
  }, [spec, priceMul, reliability]);

  // 같은 seed라 조절값만 바뀐 비교가 공정하다.
  const result = useMemo(() => (variant ? simulate(variant) : null), [variant]);

  // --- 2D 마을 어댑터 (훅이라 early return 위에 둔다) ----------------------
  const village = useMemo(() => {
    if (!result || !spec) return null;
    const people = result.npcs.map((n) => ({ id: n.id, segment: n.segment }));
    const segments = spec.segments.map((s) => s.name);
    const priorityIds = result.events.map((e) => e.npcId);
    const events = result.events.map((e) => ({
      tick: e.week,
      personId: e.npcId,
      bubble: e.text.includes("첫 구매")
        ? "첫 구매!"
        : e.text.includes("추천")
          ? "이거 좋아!"
          : e.text.includes("작동")
            ? "작동 안 돼…"
            : e.text.includes("기대")
              ? "기대 이하…"
              : "샀어요",
    }));
    return { people, segments, priorityIds, events };
  }, [result, spec]);
  const marketState = useCallback(
    (n: Npc, w: number) =>
      n.churnedWeek !== null && n.churnedWeek <= w
        ? "churned"
        : n.boughtWeek !== null && n.boughtWeek <= w
          ? "using"
          : n.awareWeek !== null && n.awareWeek <= w
            ? "aware"
            : "unaware",
    [],
  );
  const statusAt = useCallback(
    (id: number, w: number): VillageStatus => {
      const n = result?.npcs[id];
      if (!n) return { icon: null };
      const st = marketState(n, w);
      if (st === "unaware") return { icon: null, faded: true };
      if (st === "aware") return { icon: "?", iconColor: "#ffffff" };
      if (st === "using") return { icon: "♥", iconColor: "#4be08a", bag: true };
      return { icon: "✕", iconColor: "#ff5a5a" };
    },
    [result, marketState],
  );
  const visitsAt = useCallback(
    (id: number, w: number) => result?.npcs[id]?.boughtWeek === w,
    [result],
  );
  const legend = useCallback(
    (w: number) => {
      const c = { unaware: 0, aware: 0, using: 0, churned: 0 };
      for (const n of result?.npcs ?? []) c[marketState(n, w)]++;
      return [
        { icon: "·", color: "#8a8a8a", label: "모름", n: c.unaware },
        { icon: "?", color: "#ffffff", label: "알게 됨", n: c.aware },
        { icon: "♥", color: "#4be08a", label: "사용 중", n: c.using },
        { icon: "✕", color: "#ff5a5a", label: "그만둠", n: c.churned },
      ];
    },
    [result, marketState],
  );

  if (!open) return null;

  const maxWeekly = result
    ? Math.max(1, ...result.weekly.map((w) => w.owners))
    : 1;
  const week = pickedWeek ?? result?.weeks ?? 0;
  const weekRow = result?.weekly.find((w) => w.week === week);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <header className="safe-top flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-white/10 hover:text-text-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
            <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2 className="text-[16px] font-medium text-text-primary">가상검증</h2>
      </header>
      <div className="shrink-0 px-4 pb-3">
        <div className="mx-auto flex max-w-[560px] gap-1 rounded-full bg-white/[0.06] p-1">
          {(
            [
              { k: "market", label: "제품 · 시장" },
              { k: "society", label: "사회 · 제도" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              type="button"
              onClick={() => setLab(t.k)}
              className={`flex-1 rounded-full py-2 text-[13px] transition-colors ${
                lab === t.k
                  ? "bg-white/[0.18] text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {lab === "society" ? (
        <SocietyPanel initialIdea={initialIdea} />
      ) : (
      <div className="flex-1 overflow-y-auto px-4 pb-10">
        <div className="mx-auto flex max-w-[560px] flex-col gap-3">
          {/* 아이디어 입력 */}
          <div className="flex flex-col gap-2 rounded-[28px] bg-white/[0.08] p-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              placeholder="검증할 제품·서비스 아이디어를 적어주세요 (예: 앉아서 머리를 넣으면 감겨주는 탁상형 세발기)"
              className="w-full resize-none rounded-2xl bg-black/70 px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={build}
              disabled={!idea.trim() || loading}
              className="rounded-full bg-white/[0.22] py-2.5 text-[14px] font-medium text-text-primary hover:bg-white/[0.3] disabled:opacity-40"
            >
              {loading ? "시장 만드는 중…" : spec ? "시장 다시 만들기" : "시장 만들기"}
            </button>
            {err && <p className="px-2 text-[12px] text-red-300">{err}</p>}
          </div>

          {spec && variant && result && (
            <>
              {/* 시장 설정 요약 */}
              <Section title={spec.product.name}>
                <p className="text-[13px] text-text-secondary">{spec.productSummary}</p>
                <div className="flex flex-wrap gap-1">
                  {spec.segments.map((s) => (
                    <span key={s.name} className="rounded-full bg-white/[0.08] px-3 py-1 text-[12px] text-text-secondary">
                      {s.name} {Math.round(s.share * 100)}%
                    </span>
                  ))}
                </div>
                <p className="text-[12px] text-text-muted">
                  경쟁: {spec.alternatives.map((a) => a.name).join(" · ")}
                </p>
              </Section>

              {/* 변형 실험 */}
              <Section title="조건 바꿔보기">
                <label className="flex flex-col gap-1 text-[12px] text-text-secondary">
                  <span className="flex justify-between">
                    <span>가격</span>
                    <span className="text-text-primary">{won(variant.product.price)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.3}
                    max={2}
                    step={0.05}
                    value={priceMul}
                    onChange={(e) => setPriceMul(Number(e.target.value))}
                    className="accent-white"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-text-secondary">
                  <span className="flex justify-between">
                    <span>실제 작동 신뢰도</span>
                    <span className="text-text-primary">
                      {Math.round(variant.product.reliability * 100)}%
                    </span>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={variant.product.reliability}
                    onChange={(e) => setReliability(Number(e.target.value))}
                    className="accent-white"
                  />
                  {spec.product.reliabilityNote && (
                    <span className="text-[11px] text-text-muted">
                      AI 추정 근거: {spec.product.reliabilityNote}
                    </span>
                  )}
                </label>
              </Section>

              {/* 보기 전환 */}
              <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
                {(
                  [
                    { k: "village", label: "마을" },
                    { k: "report", label: "리포트" },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.k}
                    type="button"
                    onClick={() => setView(t.k)}
                    className={`flex-1 rounded-full py-2 text-[13px] transition-colors ${
                      view === t.k
                        ? "bg-white/[0.18] text-text-primary"
                        : "text-text-muted hover:text-text-primary"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {view === "village" ? (
                village && (
                  <Village2D
                    people={village.people}
                    segments={village.segments}
                    ticks={result.weeks}
                    tickUnit="주차"
                    centerName={spec.product.name}
                    center="shop"
                    statusAt={statusAt}
                    visitsAt={visitsAt}
                    events={village.events}
                    legend={legend}
                    priorityIds={village.priorityIds}
                    onPick={(id) => setNpc(result.npcs[id] ?? null)}
                  />
                )
              ) : (
              <>
              {/* 핵심 숫자 */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { k: "구매", v: `${result.buyers}명`, s: pct(result.buyers, result.population) },
                  { k: `${result.weeks}주 뒤 사용 중`, v: `${result.active}명`, s: pct(result.active, Math.max(1, result.buyers)) + " 유지" },
                  { k: "써보고 그만둠", v: `${result.churned}명`, s: pct(result.churned, Math.max(1, result.buyers)) },
                  { k: "추천으로 구매", v: `${result.referralBuyers}명`, s: pct(result.referralBuyers, Math.max(1, result.buyers)) },
                ].map((t) => (
                  <div key={t.k} className="flex flex-col gap-0.5 rounded-2xl bg-white/[0.04] p-3">
                    <span className="text-[11px] text-text-muted">{t.k}</span>
                    <span className="text-[20px] font-medium text-text-primary">{t.v}</span>
                    <span className="text-[11px] text-text-secondary">{t.s}</span>
                  </div>
                ))}
              </div>

              {/* 주차별 누적 구매 */}
              <Section title={`주차별 누적 구매 (고객 ${result.population}명)`}>
                <div className="flex h-28 items-end gap-[2px]">
                  {result.weekly.map((w) => (
                    <button
                      key={w.week}
                      type="button"
                      onClick={() => setPickedWeek(w.week)}
                      aria-label={`${w.week}주차 누적 구매 ${w.owners}명`}
                      className="flex h-full flex-1 items-end"
                    >
                      <div
                        className={`w-full rounded-t ${w.week === week ? "bg-white" : "bg-white/40"}`}
                        style={{ height: `${Math.max(2, (w.owners / maxWeekly) * 100)}%` }}
                      />
                    </button>
                  ))}
                </div>
                {weekRow && (
                  <p className="text-[12px] text-text-secondary">
                    {weekRow.week}주차 · 누적 구매 <span className="text-text-primary">{weekRow.owners}명</span> · 사용 중{" "}
                    <span className="text-text-primary">{weekRow.active}명</span>
                  </p>
                )}
              </Section>

              {/* 고객층별 */}
              <Section title="고객층별 구매율">
                {result.bySegment.map((s) => (
                  <Bar key={s.name} label={s.name} value={s.buyers} max={Math.max(1, s.size)} note={pct(s.buyers, s.size)} />
                ))}
              </Section>

              {/* 안 산 이유 */}
              <Section title="안 산 이유">
                {result.reasons.map((r) => (
                  <Bar
                    key={r.reason}
                    label={r.reason}
                    value={r.count}
                    max={Math.max(1, result.population - result.buyers)}
                    note={`${r.count}명`}
                  />
                ))}
              </Section>

              {/* 사회 피드 */}
              <Section title="시장 피드">
                {result.events.length === 0 && (
                  <p className="text-[12px] text-text-muted">아직 눈에 띄는 일이 없어요</p>
                )}
                <ul className="flex flex-col">
                  {result.events.map((e, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => setNpc(result.npcs[e.npcId] ?? null)}
                        className="flex w-full gap-3 border-b border-white/[0.06] py-2 text-left text-[13px] last:border-0"
                      >
                        <span className="w-10 shrink-0 text-text-muted">{e.week}주</span>
                        <span className="text-text-secondary">{e.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Section>

              </>
              )}

              <p className="px-2 text-[11px] leading-relaxed text-text-muted">
                AI가 만든 고객은 실제보다 쉽게 사는 경향이 있어요. 구매율 숫자 자체보다
                가격·신뢰도를 바꿨을 때의 차이(비교)를 보세요. 실제 작동성은 별도 검증이 필요해요.
              </p>
            </>
          )}
        </div>
      </div>
      )}

      {/* NPC 상세 */}
      {lab === "market" && npc && variant && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/60" onClick={() => setNpc(null)}>
          <div
            className="safe-bottom w-full rounded-t-[28px] bg-[#141414] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex max-w-[560px] flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-medium text-text-primary">{npc.name}</span>
                <span className="text-[12px] text-text-muted">{npc.segment}</span>
              </div>
              <p className="text-[13px] text-text-secondary">
                {npc.boughtWeek !== null
                  ? npc.churnedWeek !== null
                    ? `${npc.boughtWeek}주차에 샀다가 ${npc.churnedWeek}주차에 그만뒀어요.`
                    : `${npc.boughtWeek}주차에 사서 계속 쓰는 중이에요.${npc.viaReferral ? " (추천으로 알게 됨)" : ""}`
                  : `안 샀어요 — ${npc.reason ?? "망설이는 중"}`}
              </p>
              <div className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.04] p-3 text-[12px]">
                <span className="text-text-muted">결정 근거</span>
                <Bar label="제품이 채워주는 정도" value={npc.productScore} max={1} note={npc.productScore.toFixed(2)} />
                <Bar label="가격 부담" value={npc.pricePenalty} max={1} note={`−${npc.pricePenalty.toFixed(2)}`} />
                <Bar label={`대안: ${npc.bestAltName}`} value={Math.max(0, npc.bestAltScore)} max={1} note={npc.bestAltScore.toFixed(2)} />
                <span className="text-text-muted">
                  한 달 예산 약 {won(npc.budget)} · 새 제품 시도 성향 {Math.round(npc.openness * 100)}%
                </span>
              </div>
              <div className="flex flex-col gap-1 text-[12px]">
                <span className="text-text-muted">이 사람이 중요하게 여기는 것</span>
                {variant.needs.map((n) => (
                  <Bar key={n.key} label={n.label} value={npc.weights[n.key] ?? 0} max={1} note={`${Math.round((npc.weights[n.key] ?? 0) * 100)}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

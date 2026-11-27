"use client";

import { useCallback, useMemo, useState } from "react";
import { useIdea } from "../state/IdeaContext";
import { apiPath } from "@/lib/apiPath";
import {
  LEVER_META,
  VALUE_LABEL,
  simulateSociety,
  type Citizen,
  type Levers,
  type SocietySpec,
  type ValueKey,
} from "@/lib/sim/society";
import Village2D, { type VillageStatus } from "./Village2D";
import { Bar, Section } from "./MarketRoom";

// 가상 사회 — 제도·사상 아이디어를 정책 레버로 옮기고, 같은 시민들이
// "현재 사회"와 "새 제도"에서 각각 10년을 살아본 결과를 비교한다.

const SUPPORT = "#4be08a";
const OPPOSE = "#ff5a5a";
const NEUTRAL = "#9a9a9a";

const fmtMan = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)}억` : `${Math.round(n).toLocaleString()}만`;
const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

type Stance = "support" | "neutral" | "oppose" | "gone";
const stanceAt = (c: Citizen, y: number): Stance =>
  c.emigratedYear !== null && c.emigratedYear <= y ? "gone" : c.stance[y - 1] ?? "neutral";

export default function SocietyPanel({
  initialIdea,
  presetSpec = null,
}: {
  initialIdea: string;
  presetSpec?: SocietySpec | null; // 미리 만든 설정으로 시작 (데모·테스트용)
}) {
  const { apiHeaders } = useIdea();
  const [idea, setIdea] = useState(initialIdea);
  const [spec, setSpec] = useState<SocietySpec | null>(presetSpec);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Levers>>({});
  const [view, setView] = useState<"village" | "report">("village");
  const [citizen, setCitizen] = useState<Citizen | null>(null);

  const build = async () => {
    if (!idea.trim() || loading) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(apiPath("/api/society-spec"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ idea }),
      });
      const data = (await res.json()) as { spec?: SocietySpec; error?: string };
      if (!res.ok || !data.spec) throw new Error(data.error ?? `요청 실패 (${res.status})`);
      setSpec(data.spec);
      setOverrides({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const variant = useMemo<SocietySpec | null>(
    () => (spec ? { ...spec, policy: { ...spec.policy, ...overrides } } : null),
    [spec, overrides],
  );
  const result = useMemo(() => (variant ? simulateSociety(variant) : null), [variant]);

  // --- 2D 마을 어댑터 ---------------------------------------------------------
  const village = useMemo(() => {
    if (!result || !spec) return null;
    return {
      people: result.citizens.map((c) => ({ id: c.id, segment: c.cls })),
      segments: spec.classes.map((c) => c.name),
      priorityIds: result.events.map((e) => e.citizenId),
      events: result.events.map((e) => ({ tick: e.year, personId: e.citizenId, bubble: e.bubble })),
    };
  }, [result, spec]);
  const statusAt = useCallback(
    (id: number, y: number): VillageStatus => {
      const c = result?.citizens[id];
      if (!c) return { icon: null };
      const st = stanceAt(c, y);
      if (st === "gone") return { icon: null, gone: true };
      if (st === "support") return { icon: "+", iconColor: SUPPORT };
      if (st === "oppose") return { icon: "−", iconColor: OPPOSE };
      return { icon: null };
    },
    [result],
  );
  const visitsAt = useCallback(
    (id: number, y: number) => Boolean(result?.citizens[id]?.protestYears.includes(y)),
    [result],
  );
  const legend = useCallback(
    (y: number) => {
      const n = { support: 0, neutral: 0, oppose: 0, gone: 0 };
      for (const c of result?.citizens ?? []) n[stanceAt(c, y)]++;
      return [
        { icon: "+", color: SUPPORT, label: "지지", n: n.support },
        { icon: "·", color: NEUTRAL, label: "중립", n: n.neutral },
        { icon: "−", color: OPPOSE, label: "반대", n: n.oppose },
        { icon: "→", color: "#8fd3ff", label: "떠남", n: n.gone },
      ];
    },
    [result],
  );

  const last = result ? result.years - 1 : 0;
  const P = result?.policy[last];
  const B = result?.baseline[last];

  return (
    <>
      <div className="flex-1 overflow-y-auto px-4 pb-10">
        <div className="mx-auto flex max-w-[560px] flex-col gap-3">
          {/* 아이디어 입력 */}
          <div className="flex flex-col gap-2 rounded-[28px] bg-white/[0.08] p-3">
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              rows={3}
              placeholder="검증할 제도·사상을 적어주세요 (예: 모든 기업 이익의 30%를 시민에게 배당하되, 창업과 경영의 자율은 유지하는 공화제)"
              className="w-full resize-none rounded-2xl bg-black/70 px-4 py-3 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none"
            />
            <button
              type="button"
              onClick={build}
              disabled={!idea.trim() || loading}
              className="rounded-full bg-white/[0.22] py-2.5 text-[14px] font-medium text-text-primary hover:bg-white/[0.3] disabled:opacity-40"
            >
              {loading ? "사회 만드는 중…" : spec ? "사회 다시 만들기" : "사회 만들기"}
            </button>
            {err && <p className="px-2 text-[12px] text-red-300">{err}</p>}
          </div>

          {spec && variant && result && P && B && village && (
            <>
              <Section title={spec.policyName}>
                <p className="text-[13px] text-text-secondary">{spec.policySummary}</p>
                <div className="flex flex-wrap gap-1">
                  {spec.classes.map((c) => (
                    <span key={c.name} className="rounded-full bg-white/[0.08] px-3 py-1 text-[12px] text-text-secondary">
                      {c.name} {Math.round(c.share * 100)}%
                    </span>
                  ))}
                </div>
              </Section>

              {/* 정책 레버 */}
              <Section title="제도 레버 — 현재 사회 대비">
                {LEVER_META.map((m) => {
                  const base = spec.baseline[m.key];
                  const val = variant.policy[m.key];
                  const changed = Math.abs(val - base) > 0.005;
                  return (
                    <label key={m.key} className="flex flex-col gap-1 text-[12px]">
                      <span className="flex justify-between">
                        <span className={changed ? "text-text-primary" : "text-text-muted"}>{m.label}</span>
                        <span className="text-text-secondary">
                          {Math.round(base * 100)}
                          {changed && (
                            <>
                              {" → "}
                              <span className="text-text-primary">{Math.round(val * 100)}</span>
                            </>
                          )}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={m.max}
                        step={0.01}
                        value={val}
                        onChange={(e) =>
                          setOverrides((o) => ({ ...o, [m.key]: Number(e.target.value) }))
                        }
                        className="accent-white"
                      />
                      {spec.leverNotes[m.key] && (
                        <span className="text-[11px] text-text-muted">{spec.leverNotes[m.key]}</span>
                      )}
                    </label>
                  );
                })}
                {Object.keys(overrides).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setOverrides({})}
                    className="self-start rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] text-text-secondary hover:bg-white/[0.16]"
                  >
                    AI 설정으로 되돌리기
                  </button>
                )}
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
                  footnote="반대가 35%를 넘는 해엔 반대하는 시민이 시청 앞에 모여요."
                  onPick={(id) => setCitizen(result.citizens[id] ?? null)}
                />
              ) : (
                <>
                  {/* 핵심 비교 — 10년 뒤, 현재 사회 vs 새 제도 */}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        k: "1인당 생산",
                        b: fmtMan(B.gdpPerCapita),
                        p: fmtMan(P.gdpPerCapita),
                        d: `${signed((P.gdpPerCapita / B.gdpPerCapita - 1) * 100)}%`,
                      },
                      {
                        k: "불평등 (지니)",
                        b: B.gini.toFixed(2),
                        p: P.gini.toFixed(2),
                        d: signed(P.gini - B.gini, 2),
                      },
                      {
                        k: "평균 삶의 만족",
                        b: Math.round(B.wellbeing * 100).toString(),
                        p: Math.round(P.wellbeing * 100).toString(),
                        d: signed((P.wellbeing - B.wellbeing) * 100),
                      },
                      {
                        k: "지지 / 반대",
                        b: "—",
                        p: `${Math.round(P.support * 100)}% / ${Math.round(P.oppose * 100)}%`,
                        d: "",
                      },
                      {
                        k: "떠난 사람 (누적)",
                        b: `${B.emigrants}명`,
                        p: `${P.emigrants}명`,
                        d: signed(P.emigrants - B.emigrants),
                      },
                      {
                        k: "탈세 비율",
                        b: `${(B.evasion * 100).toFixed(1)}%`,
                        p: `${(P.evasion * 100).toFixed(1)}%`,
                        d: "",
                      },
                    ].map((t) => (
                      <div key={t.k} className="flex flex-col gap-0.5 rounded-2xl bg-white/[0.04] p-3">
                        <span className="text-[11px] text-text-muted">{t.k}</span>
                        <span className="text-[18px] font-medium text-text-primary">{t.p}</span>
                        <span className="text-[11px] text-text-secondary">
                          현재 사회 {t.b}
                          {t.d && ` · ${t.d}`}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* 연도별 여론 */}
                  <Section title="연도별 여론">
                    <div className="flex flex-col gap-1">
                      {result.policy.map((s) => {
                        const neu = Math.max(0, 1 - s.support - s.oppose);
                        return (
                          <div key={s.year} className="flex items-center gap-2 text-[11px]">
                            <span className="w-9 shrink-0 text-text-muted">{s.year}년</span>
                            <div className="flex h-3 flex-1 gap-[2px] overflow-hidden rounded-full">
                              <div style={{ width: `${s.support * 100}%`, background: SUPPORT }} />
                              <div style={{ width: `${neu * 100}%`, background: "rgba(255,255,255,0.14)" }} />
                              <div style={{ width: `${s.oppose * 100}%`, background: OPPOSE }} />
                            </div>
                            <span className="w-16 shrink-0 text-right text-text-secondary">
                              {Math.round(s.support * 100)} / {Math.round(s.oppose * 100)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-3 text-[11px] text-text-muted">
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: SUPPORT }} /> 지지
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-white/[0.14]" /> 중립
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: OPPOSE }} /> 반대
                      </span>
                    </div>
                  </Section>

                  {/* 계층별 */}
                  <Section title="계층별로 보면 (10년 뒤, 현재 사회 대비)">
                    {result.byClass.map((c) => (
                      <div key={c.name} className="flex flex-col gap-1 border-b border-white/[0.06] pb-2 last:border-0 last:pb-0">
                        <span className="text-[13px] text-text-primary">{c.name}</span>
                        <span className="text-[12px] text-text-secondary">
                          소득 {signed(c.incomeChange)}% · 삶의 만족 {signed(c.wellbeingChange * 100)} · 지지{" "}
                          {Math.round(c.support * 100)}% · 반대 {Math.round(c.oppose * 100)}%
                          {c.emigrated > 0 && ` · ${c.emigrated}명 떠남`}
                        </span>
                      </div>
                    ))}
                  </Section>

                  {/* 사건 */}
                  <Section title="사회 피드">
                    {result.events.length === 0 && (
                      <p className="text-[12px] text-text-muted">눈에 띄는 일이 없었어요</p>
                    )}
                    <ul className="flex flex-col">
                      {result.events.map((e, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onClick={() => setCitizen(result.citizens[e.citizenId] ?? null)}
                            className="flex w-full gap-3 border-b border-white/[0.06] py-2 text-left text-[13px] last:border-0"
                          >
                            <span className="w-10 shrink-0 text-text-muted">{e.year}년</span>
                            <span className="text-text-secondary">{e.text}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Section>
                </>
              )}

              <p className="px-2 text-[11px] leading-relaxed text-text-muted">
                이 시뮬레이션은 예측이 아니라 단순화된 규칙으로 돌린 사고 실험이에요. 숫자 자체보다
                레버를 바꿨을 때 누가 이득을 보고 누가 떠나는지, 어디서 반발과 악용이 생기는지를 보세요.
              </p>
            </>
          )}
        </div>
      </div>

      {/* 시민 상세 */}
      {citizen && result && (
        <div className="absolute inset-0 z-10 flex items-end bg-black/60" onClick={() => setCitizen(null)}>
          <div
            className="safe-bottom max-h-[80%] w-full overflow-y-auto rounded-t-[28px] bg-[#141414] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto flex max-w-[560px] flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[17px] font-medium text-text-primary">{citizen.name}</span>
                <span className="text-[12px] text-text-muted">{citizen.cls}</span>
              </div>
              <p className="text-[13px] text-text-secondary">
                {citizen.emigratedYear !== null
                  ? `${citizen.emigratedYear}년차에 나라를 떠났어요.`
                  : citizen.stance[last] === "support"
                    ? "새 제도를 지지해요 — 현재 사회에서 살 때보다 나아요."
                    : citizen.stance[last] === "oppose"
                      ? "새 제도에 반대해요 — 현재 사회에서 살 때보다 못해요."
                      : "크게 달라진 게 없다고 느껴요."}
              </p>
              <div className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.04] p-3 text-[12px]">
                <span className="text-text-muted">새 제도에서의 삶 (현재 사회와 비교)</span>
                {(() => {
                  const y = citizen.emigratedYear !== null ? citizen.emigratedYear - 1 : last;
                  const wb = citizen.wellbeing[y] ?? 0;
                  const bw = citizen.baseWellbeing[y] ?? 0;
                  return (
                    <>
                      <Bar label="삶의 만족 (새 제도)" value={wb} max={1} note={Math.round(wb * 100).toString()} />
                      <Bar label="삶의 만족 (현재)" value={bw} max={1} note={Math.round(bw * 100).toString()} />
                      <span className="text-text-secondary">
                        가처분소득 {fmtMan(citizen.income[0] ?? 0)} → {fmtMan(citizen.income[y] ?? 0)}원
                      </span>
                    </>
                  );
                })()}
                {citizen.foundedYears.length > 0 && (
                  <span className="text-text-secondary">창업: {citizen.foundedYears.join(", ")}년차</span>
                )}
                {citizen.evadedYears.length > 0 && (
                  <span className="text-text-secondary">소득 숨김: {citizen.evadedYears.join(", ")}년차</span>
                )}
                {citizen.protestYears.length > 0 && (
                  <span className="text-text-secondary">시위 참여: {citizen.protestYears.join(", ")}년차</span>
                )}
              </div>
              <div className="flex flex-col gap-1 text-[12px]">
                <span className="text-text-muted">이 사람이 중요하게 여기는 것</span>
                {(Object.keys(VALUE_LABEL) as ValueKey[]).map((k) => (
                  <Bar
                    key={k}
                    label={VALUE_LABEL[k]}
                    value={citizen.values[k]}
                    max={1}
                    note={Math.round(citizen.values[k] * 100).toString()}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

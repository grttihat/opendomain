"use client";

import { useMemo, useState } from "react";
import { useIdea } from "../state/IdeaContext";
import { apiPath } from "@/lib/apiPath";
import {
  AI_SPEED,
  LEVER_META,
  VALUE_LABEL,
  type AiSpeed,
  simulateSociety,
  type Citizen,
  type Levers,
  type SocietySpec,
  type ValueKey,
} from "@/lib/sim/society";
import SocietyVillage, { OPPOSE, SUPPORT } from "./SocietyVillage";
import SocietyGame from "./SocietyGame";
import { splitSummary } from "@/lib/sim/societyGame";
import { Bar, Section } from "./MarketRoom";

// 가상 사회 — 제도·사상 아이디어를 정책 레버로 옮기고, 같은 시민들이
// "현재 사회"와 "새 제도"에서 각각 10년을 살아본 결과를 비교한다.

const fmtMan = (n: number) =>
  n >= 10000 ? `${(n / 10000).toFixed(1)}억` : `${Math.round(n).toLocaleString()}만`;
const signed = (n: number, digits = 0) =>
  `${n > 0 ? "+" : ""}${n.toFixed(digits)}`;

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
  const [citizenLast, setCitizenLast] = useState(0); // 시민 상세에서 볼 마지막 해 index
  const [mode, setMode] = useState<"game" | "sandbox">("game");
  const [ai, setAi] = useState<AiSpeed>("normal");
  const [showAllLevers, setShowAllLevers] = useState(false);

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
  const result = useMemo(() => (variant ? simulateSociety(variant, { ai }) : null), [variant, ai]);

  const pick = (c: Citizen, years: number) => {
    setCitizen(c);
    setCitizenLast(years - 1);
  };

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

          {spec && (
            <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
              {(
                [
                  { k: "game", label: "통치 게임" },
                  { k: "sandbox", label: "자유 실험" },
                ] as const
              ).map((t) => (
                <button
                  key={t.k}
                  type="button"
                  onClick={() => setMode(t.k)}
                  className={`flex-1 rounded-full py-2 text-[13px] transition-colors ${
                    mode === t.k ? "bg-white/[0.18] text-text-primary" : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {spec && mode === "game" && <SocietyGame key={JSON.stringify(spec)} spec={spec} onPick={pick} />}

          {spec && mode === "sandbox" && variant && result && P && B && (
            <>
              <Section title={spec.policyName}>
                <p className="text-[13px] text-text-secondary">{splitSummary(spec.policySummary).main}</p>
                {splitSummary(spec.policySummary).missing && (
                  <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-[12px] leading-relaxed text-amber-200/90">
                    ⚠ 이 시뮬레이션이 보지 못하는 것 — {splitSummary(spec.policySummary).missing}
                  </p>
                )}
                <div className="flex flex-wrap gap-1">
                  {spec.classes.map((c) => (
                    <span key={c.name} className="rounded-full bg-white/[0.08] px-3 py-1 text-[12px] text-text-secondary">
                      {c.name} {Math.round(c.share * 100)}%
                    </span>
                  ))}
                </div>
              </Section>

              {/* AI 자동화 시나리오 — 정책이 아니라 두 세계에 똑같이 오는 충격 */}
              <Section title="AI 자동화 속도">
                <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
                  {(Object.keys(AI_SPEED) as AiSpeed[]).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setAi(k)}
                      className={`flex-1 rounded-full py-1.5 text-[13px] transition-colors ${
                        ai === k ? "bg-white/[0.18] text-text-primary" : "text-text-muted hover:text-text-primary"
                      }`}
                    >
                      {AI_SPEED[k].label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-text-muted">
                  {AI_SPEED[ai].desc}. 현재 사회와 새 제도에 똑같이 적용돼요. 정책으로 고를 수 없는 미래예요.
                </p>
              </Section>

              {/* 정책 레버 — 새 제도가 바꾼 것만 펼쳐 보인다 */}
              <Section title="새 제도가 바꾸는 것">
                {(() => {
                  const isChanged = (k: keyof Levers) =>
                    Math.abs(spec.policy[k] - spec.baseline[k]) > 1e-6 || k in overrides;
                  const changed = LEVER_META.filter((m) => isChanged(m.key));
                  const rest = LEVER_META.filter((m) => !isChanged(m.key));
                  const row = (m: (typeof LEVER_META)[number]) => {
                    const base = spec.baseline[m.key];
                    const val = variant.policy[m.key];
                    const diff = Math.abs(val - base) > 1e-6;
                    return (
                      <label key={m.key} className="flex flex-col gap-1 text-[12px]">
                        <span className="flex justify-between gap-2">
                          <span className={diff ? "text-text-primary" : "text-text-muted"}>{m.label}</span>
                          <span className="text-text-secondary">
                            {m.fmt(base)}
                            {diff && (
                              <>
                                {" → "}
                                <span className="text-text-primary">{m.fmt(val)}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <input
                          type="range"
                          min={m.min}
                          max={m.max}
                          step={m.step}
                          value={val}
                          onChange={(e) =>
                            setOverrides((o) => ({ ...o, [m.key]: Number(e.target.value) }))
                          }
                          className="accent-white"
                        />
                        <span className="text-[11px] text-text-muted">{spec.leverNotes[m.key] ?? m.hint}</span>
                      </label>
                    );
                  };
                  return (
                    <>
                      {changed.length === 0 && (
                        <p className="text-[12px] text-text-muted">바뀐 레버가 없어요. 아래에서 직접 움직여 보세요.</p>
                      )}
                      {changed.map(row)}
                      {rest.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAllLevers((v) => !v)}
                          className="self-start text-[12px] text-text-muted hover:text-text-primary"
                        >
                          {showAllLevers ? "접기" : `나머지 ${rest.length}개 — 현재 한국 그대로`}
                        </button>
                      )}
                      {showAllLevers && rest.map(row)}
                    </>
                  );
                })()}
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
                <SocietyVillage spec={spec} result={result} onPick={(c) => pick(c, result.years)} />
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
                        k: "실업률",
                        b: `${(B.unemployment * 100).toFixed(1)}%`,
                        p: `${(P.unemployment * 100).toFixed(1)}%`,
                        d: `${signed((P.unemployment - B.unemployment) * 100, 1)}%p`,
                      },
                      {
                        k: "재정수지 (GDP 대비)",
                        b: `${signed(B.fiscalBalance * 100, 1)}%`,
                        p: `${signed(P.fiscalBalance * 100, 1)}%`,
                        d: P.fiscalBalance < -0.03 ? "적자 — 지속 불가" : "",
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
                          {` · 실업 ${Math.round(c.unemployment * 100)}%`}
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
                            onClick={() => {
                              const c = result.citizens[e.citizenId];
                              if (c) pick(c, result.years);
                            }}
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
      {citizen && (
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
                  : citizen.stance[citizenLast] === "support"
                    ? "새 제도를 지지해요 — 현재 사회에서 살 때보다 나아요."
                    : citizen.stance[citizenLast] === "oppose"
                      ? "새 제도에 반대해요 — 현재 사회에서 살 때보다 못해요."
                      : "크게 달라진 게 없다고 느껴요."}
              </p>
              <div className="flex flex-col gap-1.5 rounded-2xl bg-white/[0.04] p-3 text-[12px]">
                <span className="text-text-muted">새 제도에서의 삶 (현재 사회와 비교)</span>
                {(() => {
                  const y = citizen.emigratedYear !== null ? citizen.emigratedYear - 1 : citizenLast;
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
                <span className="text-text-secondary">
                  AI 대체 위험 {Math.round(citizen.aiExposure * 100)}%
                </span>
                {citizen.aiDisplacedYears.length > 0 && (
                  <span className="text-text-secondary">
                    AI 자동화로 실직: {citizen.aiDisplacedYears.join(", ")}년차
                  </span>
                )}
                {citizen.unemployedYears.length > 0 && (
                  <span className="text-text-secondary">일자리 없음: {citizen.unemployedYears.join(", ")}년차</span>
                )}
                {citizen.reemployedYears.length > 0 && (
                  <span className="text-text-secondary">재취업: {citizen.reemployedYears.join(", ")}년차</span>
                )}
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

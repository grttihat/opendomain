"use client";

import { useMemo, useState } from "react";
import {
  AI_SPEED,
  AI_WAVES,
  LEVER_META,
  simulateSociety,
  type AiSpeed,
  type Citizen,
  type Levers,
  type SocietySpec,
} from "@/lib/sim/society";
import {
  GAME_YEARS,
  MOVES_PER_YEAR,
  checkDefeat,
  endingTitle,
  evalGoals,
  makeCtx,
  movedKeys,
  pickMe,
  riskLabel,
  splitSummary,
  upcomingWave,
  voice,
  type Defeat,
} from "@/lib/sim/societyGame";
import { Section } from "./MarketRoom";
import SocietyVillage from "./SocietyVillage";

// 통치자 게임 — 브리핑(공약·나·AI 물결·아무것도 안 하면) → 해마다 레버 2개 → 엔딩.

const DIFFICULTY: { k: AiSpeed; label: string }[] = [
  { k: "slow", label: "느림" },
  { k: "normal", label: "보통" },
  { k: "fast", label: "빠름" },
];

const WAVE_MARK = ["", "▲", "▲▲", "▲▲▲"];
const man = (n: number) => `${Math.round(n).toLocaleString()}만원`;

export default function SocietyGame({
  spec,
  onPick,
}: {
  spec: SocietySpec;
  onPick: (c: Citizen, years: number) => void;
}) {
  const [phase, setPhase] = useState<"brief" | "play" | "end">("brief");
  const [ai, setAi] = useState<AiSpeed>("normal");
  const [meCls, setMeCls] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Levers[]>([]);
  const [draft, setDraft] = useState<Levers>(spec.baseline);
  const [defeat, setDefeat] = useState<Defeat>(null);
  const [showOther, setShowOther] = useState(false);

  // 아무것도 하지 않은 10년 — 브리핑의 경고와 "활력" 목표의 기준
  const projection = useMemo(
    () => simulateSociety(spec, { ai, schedule: [spec.baseline], years: GAME_YEARS }),
    [spec, ai],
  );
  const ctx = useMemo(() => makeCtx(spec, projection), [spec, projection]);
  const meId = useMemo(() => (meCls ? pickMe(projection, meCls) : null), [projection, meCls]);
  const result = useMemo(
    () =>
      schedule.length > 0
        ? simulateSociety(spec, { ai, schedule, years: schedule.length })
        : null,
    [spec, ai, schedule],
  );
  const goals = useMemo(() => (result ? evalGoals(result, ctx) : null), [result, ctx]);

  const year = schedule.length + 1; // 지금 결정하는 해
  const prev = schedule[schedule.length - 1] ?? spec.baseline;
  const moved = movedKeys(prev, draft);
  const promised = LEVER_META.filter((m) => Math.abs(spec.policy[m.key] - spec.baseline[m.key]) > 1e-6);
  const others = LEVER_META.filter((m) => !promised.includes(m));
  const { main: summary, missing } = splitSummary(spec.policySummary);

  const start = () => {
    setSchedule([]);
    setDraft(spec.baseline);
    setDefeat(null);
    setPhase("play");
  };
  const advance = () => {
    const next = [...schedule, draft];
    setSchedule(next);
    const r = simulateSociety(spec, { ai, schedule: next, years: next.length });
    const d = checkDefeat(r);
    if (d) setDefeat(d);
    if (d || next.length >= GAME_YEARS) setPhase("end");
  };

  // --- 브리핑 -----------------------------------------------------------------
  if (phase === "brief") {
    const P = projection.baseline;
    const last = P[GAME_YEARS - 1];
    const me = meId !== null ? projection.citizens[meId] : null;
    const poorEnd = (() => {
      const g = projection.citizens.filter((c) => c.cls === ctx.poorest && c.emigratedYear === null);
      return g.reduce((s, c) => s + c.baseWellbeing[GAME_YEARS - 1], 0) / Math.max(1, g.length);
    })();
    return (
      <div className="flex flex-col gap-3">
        <Section title={`당신은 「${spec.policyName}」을 공약으로 당선됐습니다`}>
          <p className="text-[13px] leading-relaxed text-text-secondary">{summary}</p>
          {missing && (
            <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-[12px] leading-relaxed text-amber-200/90">
              ⚠ 이 시뮬레이션이 보지 못하는 것 — {missing}
            </p>
          )}
          {promised.length > 0 && (
            <div className="flex flex-col gap-1 text-[12px] text-text-secondary">
              <span className="text-text-muted">공약 (10년 안에 이루어야 할 상태)</span>
              {promised.map((m) => (
                <span key={m.key}>
                  {m.label}: {m.fmt(spec.baseline[m.key])} → <span className="text-text-primary">{m.fmt(spec.policy[m.key])}</span>
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title="당신은 누구인가요?">
          <div className="flex flex-col gap-2">
            {spec.classes.map((c) => {
              const group = projection.citizens.filter((x) => x.cls === c.name);
              const sorted = group.map((x) => x.income[0]).sort((a, b) => a - b);
              const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
              const ratio = c.share >= 0.1 ? `10명 중 ${Math.round(c.share * 10)}명` : `100명 중 ${Math.max(1, Math.round(c.share * 100))}명`;
              const risk = riskLabel(c.aiExposure);
              const on = meCls === c.name;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => setMeCls(c.name)}
                  className={`flex flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition-colors ${
                    on ? "bg-white/[0.18] ring-1 ring-white/40" : "bg-white/[0.05] hover:bg-white/[0.1]"
                  }`}
                >
                  <span className="flex justify-between text-[13px] text-text-primary">
                    <span>{c.name}</span>
                    <span className="text-text-muted">{ratio}</span>
                  </span>
                  <span className="text-[12px] text-text-secondary">
                    월 실수령 약 {man(med / 12)} · AI 대체 위험{" "}
                    <span className={risk === "높음" ? "text-red-300" : risk === "보통" ? "text-amber-200" : "text-emerald-300"}>
                      {risk}
                      {risk === "높음" && " ▲"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section title="다가오는 AI 물결">
          <div className="flex gap-1 rounded-full bg-white/[0.06] p-1">
            {DIFFICULTY.map((d) => (
              <button
                key={d.k}
                type="button"
                onClick={() => setAi(d.k)}
                className={`flex-1 rounded-full py-1.5 text-[13px] transition-colors ${
                  ai === d.k ? "bg-white/[0.18] text-text-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">AI가 얼마나 빨리 오나요? {AI_SPEED[ai].desc} (10년 평균). 빠르면 일자리는 더 흔들리지만, AI가 버는 돈도 커져요. 어느 쪽이 더 어려운지는 당신의 전략에 달렸어요.</p>
          <ul className="flex flex-col gap-2">
            {AI_WAVES.map((w) => (
              <li key={w.year} className="flex items-baseline gap-3 text-[13px]">
                <span className="w-10 shrink-0 text-text-muted">{w.year}년차</span>
                <span className="w-8 shrink-0 text-red-300">{WAVE_MARK[w.power]}</span>
                <span className="flex flex-col">
                  <span className="text-text-primary">{w.name}</span>
                  <span className="text-[11px] text-text-muted">
                    {w.target} 일자리 · 이 사회 {projection.citizens.length}명 중 {P[w.year - 1]?.aiDisplaced ?? 0}명이 그해 일자리를 잃어요
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="아무것도 하지 않으면">
          <ul className="flex flex-col gap-1 text-[13px] text-text-secondary">
            {(() => {
              const fall = P.findIndex((s, i) => i > 0 && s.oppose > 0.5 && P[i - 1].oppose > 0.5);
              return (
                <li>
                  지지율 {Math.round(P[0].support * 100)}% →{" "}
                  {fall >= 0 ? (
                    <span className="text-red-300">{fall + 1}년차 정권 교체</span>
                  ) : (
                    <span>{GAME_YEARS}년차 {Math.round(last.support * 100)}%</span>
                  )}
                </li>
              );
            })()}
            <li>
              실업률 {(P[0].unemployment * 100).toFixed(1)}% →{" "}
              <span className="text-red-300">{GAME_YEARS}년차 {(last.unemployment * 100).toFixed(1)}%</span>
            </li>
            <li>
              불평등(지니) {P[0].gini.toFixed(2)} → <span className="text-red-300">{last.gini.toFixed(2)}</span>
            </li>
            <li>
              {ctx.poorest}의 삶의 만족 {Math.round(ctx.poorestStart * 100)} →{" "}
              <span className={poorEnd < ctx.poorestStart ? "text-red-300" : ""}>{Math.round(poorEnd * 100)}</span>
            </li>
            {me && (
              <li className="mt-1 rounded-xl bg-white/[0.05] px-3 py-2 text-[12px]">
                ★ 당신({me.name}, {me.cls}):{" "}
                {me.aiDisplacedYears.length > 0
                  ? `${me.aiDisplacedYears[0]}년차에 AI 때문에 일자리를 잃어요.`
                  : me.unemployedYears.length > 0
                    ? `${me.unemployedYears[0]}년차에 일자리를 잃어요.`
                    : "일자리는 지켜요."}{" "}
                월 실수령 {man(me.income[0] / 12)} → {man(me.income[GAME_YEARS - 1] / 12)}
              </li>
            )}
          </ul>
        </Section>

        <Section title="승리 조건 — 10년 뒤 네 가지를 모두 지키세요">
          <ul className="flex flex-col gap-1 text-[12px] text-text-secondary">
            {evalGoals(projection, ctx).map((g) => (
              <li key={g.key}>
                <span className="text-text-primary">{g.label}</span> — {g.rule}
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-text-muted">
            한 해에 레버는 {MOVES_PER_YEAR}개까지만 움직일 수 있어요. 반대가 2년 연속 과반이거나 재정 적자가 GDP 10%를
            넘으면 게임이 끝나요.
          </p>
        </Section>

        <button
          type="button"
          onClick={start}
          disabled={!meCls}
          className="rounded-full bg-white/[0.22] py-3 text-[15px] font-medium text-text-primary hover:bg-white/[0.3] disabled:opacity-40"
        >
          {meCls ? "취임하기" : "먼저 당신이 누구인지 골라주세요"}
        </button>
      </div>
    );
  }

  // --- 엔딩 -------------------------------------------------------------------
  if (phase === "end" && result && goals) {
    const ending = defeat ?? endingTitle(goals);
    const me = meId !== null ? result.citizens[meId] : null;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-[28px] bg-white/[0.08] p-5 text-center">
          <span className="text-[12px] text-text-muted">
            {defeat ? `${result.years}년차, 게임 오버` : `${GAME_YEARS}년 임기 종료`} · AI 속도{" "}
            {DIFFICULTY.find((d) => d.k === ai)?.label}
          </span>
          <span className="text-[22px] font-medium text-text-primary">{ending.title}</span>
          <span className="text-[13px] text-text-secondary">{ending.text}</span>
        </div>

        <Section title="승리 조건">
          {goals.map((g) => (
            <div key={g.key} className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className={g.ok ? "text-emerald-300" : "text-red-300"}>
                {g.ok ? "✓" : "✗"} {g.label}
              </span>
              <span className="text-[12px] text-text-secondary">{g.now}</span>
            </div>
          ))}
        </Section>

        {me && (
          <Section title={`★ 당신(${me.name})의 ${result.years}년`}>
            <ul className="flex flex-col gap-1.5">
              {Array.from({ length: result.years }, (_, i) => i + 1).map((y) => (
                <li key={y} className="flex gap-3 text-[12px]">
                  <span className="w-9 shrink-0 text-text-muted">{y}년</span>
                  <span className="text-text-secondary">{voice(me, y)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="당신의 정책 경로">
          <ul className="flex flex-col gap-1 text-[12px]">
            {schedule.map((lv, i) => {
              const before = schedule[i - 1] ?? spec.baseline;
              const ks = movedKeys(before, lv);
              return (
                <li key={i} className="flex gap-3">
                  <span className="w-9 shrink-0 text-text-muted">{i + 1}년</span>
                  <span className="text-text-secondary">
                    {ks.length === 0
                      ? "그대로"
                      : ks
                          .map((k) => {
                            const m = LEVER_META.find((x) => x.key === k)!;
                            return `${m.label} ${m.fmt(before[k])}→${m.fmt(lv[k])}`;
                          })
                          .join(", ")}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="마을에서 다시 보기">
          <SocietyVillage spec={spec} result={result} meId={meId} onPick={(c) => onPick(c, result.years)} />
        </Section>

        <button
          type="button"
          onClick={() => setPhase("brief")}
          className="rounded-full bg-white/[0.22] py-3 text-[15px] font-medium text-text-primary hover:bg-white/[0.3]"
        >
          다시 도전하기
        </button>
      </div>
    );
  }

  // --- 턴 ---------------------------------------------------------------------
  const wave = upcomingWave(year);
  const nextWave = upcomingWave(year + 1);
  const me = result && meId !== null ? result.citizens[meId] : null;
  const lastNews = result ? result.events.filter((e) => e.year === year - 1 && e.citizenId !== meId).slice(0, 2) : [];
  const left = MOVES_PER_YEAR - moved.length;

  const leverRow = (m: (typeof LEVER_META)[number], isPromise: boolean) => {
    const val = draft[m.key];
    const changed = moved.includes(m.key);
    const locked = !changed && left <= 0;
    const target = spec.policy[m.key];
    return (
      <label key={m.key} className={`flex flex-col gap-1 text-[12px] ${locked ? "opacity-40" : ""}`}>
        <span className="flex justify-between gap-2">
          <span className={changed ? "text-text-primary" : "text-text-secondary"}>
            {m.label}
            {changed && " ●"}
          </span>
          <span className="text-text-secondary">
            {changed ? (
              <>
                {m.fmt(prev[m.key])} → <span className="text-text-primary">{m.fmt(val)}</span>
              </>
            ) : (
              m.fmt(val)
            )}
          </span>
        </span>
        <input
          type="range"
          min={m.min}
          max={m.max}
          step={m.step}
          value={val}
          disabled={locked}
          onChange={(e) => setDraft((d) => ({ ...d, [m.key]: Number(e.target.value) }))}
          className="accent-white"
        />
        <span className="text-[11px] text-text-muted">
          {isPromise
            ? Math.abs(val - target) < 1e-6
              ? "✓ 공약 달성"
              : `공약: ${m.fmt(target)}`
            : m.hint}
        </span>
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[20px] font-medium text-text-primary">
          {year}년차 <span className="text-[13px] text-text-muted">/ {GAME_YEARS}</span>
        </span>
        <span className="text-[12px] text-text-secondary">
          정치적 자본 {"●".repeat(left)}
          {"○".repeat(MOVES_PER_YEAR - left)}
        </span>
      </div>

      {wave ? (
        <div className="rounded-2xl bg-red-500/15 px-4 py-3">
          <p className="text-[14px] text-red-200">
            {WAVE_MARK[wave.power]} 올해 AI 물결: {wave.name}
          </p>
          <p className="text-[12px] text-red-200/80">
            {wave.target} 일자리가 크게 흔들려요. 아무것도 안 했다면 이 사회에서 {projection.baseline[year - 1]?.aiDisplaced ?? 0}명이 올해
            일자리를 잃어요.
          </p>
        </div>
      ) : nextWave ? (
        <div className="rounded-2xl bg-amber-400/10 px-4 py-3 text-[12px] text-amber-200/90">
          내년 예고: {WAVE_MARK[nextWave.power]} {nextWave.name} — {nextWave.target} 일자리. 미리 대비할 수 있는 마지막 해예요.
        </div>
      ) : null}

      {goals && (
        <Section title="목표 현황">
          {goals.map((g) => (
            <div key={g.key} className="flex items-baseline justify-between gap-2 text-[12px]">
              <span className={g.ok ? "text-emerald-300" : "text-red-300"}>
                {g.ok ? "✓" : "✗"} {g.label}
              </span>
              <span className="text-text-secondary">{g.now}</span>
            </div>
          ))}
        </Section>
      )}

      {result && (
        <Section title={`지난해(${year - 1}년차) 사람들`}>
          {me && (
            <button
              type="button"
              onClick={() => onPick(me, result.years)}
              className="rounded-xl bg-white/[0.06] px-3 py-2 text-left text-[13px]"
            >
              <span className="text-amber-200">★ {me.name}</span>
              <span className="text-text-muted"> ({me.cls})</span>
              <span className="block text-text-secondary">“{voice(me, year - 1)}”</span>
            </button>
          )}
          {lastNews.map((e, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                const c = result.citizens[e.citizenId];
                if (c) onPick(c, result.years);
              }}
              className="text-left text-[12px] text-text-secondary"
            >
              · {e.text}
            </button>
          ))}
        </Section>
      )}

      <Section title={left > 0 ? `올해 움직일 레버를 고르세요 (${left}개 더)` : "올해 정치적 자본을 다 썼어요"}>
        {promised.map((m) => leverRow(m, true))}
        <button
          type="button"
          onClick={() => setShowOther((v) => !v)}
          className="self-start text-[12px] text-text-muted hover:text-text-primary"
        >
          {showOther ? "다른 레버 접기" : `공약 밖의 레버 ${others.length}개`}
        </button>
        {showOther && others.map((m) => leverRow(m, false))}
        {moved.length > 0 && (
          <button
            type="button"
            onClick={() => setDraft(prev)}
            className="self-start rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] text-text-secondary hover:bg-white/[0.16]"
          >
            올해 결정 되돌리기
          </button>
        )}
      </Section>

      <button
        type="button"
        onClick={advance}
        className="rounded-full bg-white/[0.22] py-3 text-[15px] font-medium text-text-primary hover:bg-white/[0.3]"
      >
        {year}년차 보내기{moved.length === 0 && " (아무것도 바꾸지 않음)"}
      </button>
    </div>
  );
}

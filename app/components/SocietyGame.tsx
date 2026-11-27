"use client";

import { useEffect, useMemo, useState } from "react";
import { useIdea } from "../state/IdeaContext";
import { apiPath } from "@/lib/apiPath";
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
import {
  BASIC_CARDS as BASIC,
  cardFromInvented,
  detectCrises,
  topCrisis,
  yearEndOptions,
  type Card,
  type Crisis,
  type IncomingIdea,
  type InventedCardData,
} from "@/lib/sim/societyCrisis";
import { Section } from "./MarketRoom";
import SocietyVillage from "./SocietyVillage";

// 통치자 게임 — 브리핑(공약·나·AI 물결·아무것도 안 하면) → 해마다 마을을 지켜보고
// 위기에 대응하고 연말에 방향 하나를 고른다 → 엔딩. 레버는 카드 뒤에 숨는다.

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
  onInvent,
  incoming = null,
  onIncomingDone,
}: {
  spec: SocietySpec;
  onPick: (c: Citizen, years: number) => void;
  onInvent?: (q: { crisisTitle: string; problem: string }) => void; // 사고확장기로 가기
  incoming?: IncomingIdea | null; // 사고확장기에서 가져온 아이디어
  onIncomingDone?: () => void;
}) {
  const { apiHeaders } = useIdea();
  const [phase, setPhase] = useState<"brief" | "play" | "end">("brief");
  const [ai, setAi] = useState<AiSpeed>("normal");
  const [meCls, setMeCls] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Levers[]>([]);
  const [lv, setLv] = useState<Levers>(spec.baseline); // 다음 해에 적용될 레버
  const [log, setLog] = useState<{ year: number; title: string; from: Levers; to: Levers }[]>([]);
  const [responded, setResponded] = useState(false); // 올해 위기에 대응했나
  const [yearEndDone, setYearEndDone] = useState(false); // 올해 방향을 골랐나
  const [defeat, setDefeat] = useState<Defeat>(null);
  // 발명한 카드 — 판이 바뀌어도 덱에 남는다
  const [deck, setDeck] = useState<InventedCardData[]>([]);
  const [translating, setTranslating] = useState<string | null>(null);
  const [translateErr, setTranslateErr] = useState<string | null>(null);

  // 사고확장기에서 아이디어를 들고 돌아오면 번역기로 카드를 만든다
  useEffect(() => {
    if (!incoming) return;
    let alive = true;
    setTranslating(incoming.title);
    setTranslateErr(null);
    fetch(apiPath("/api/society-card"), {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        idea: { title: incoming.title, summary: incoming.summary },
        crisis: incoming.crisisTitle,
        problem: incoming.problem,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { card?: InventedCardData; error?: string };
        if (!res.ok || !data.card) throw new Error(data.error ?? `요청 실패 (${res.status})`);
        if (alive) setDeck((d) => [...d, data.card!]);
      })
      .catch((e) => alive && setTranslateErr(e instanceof Error ? e.message : String(e)))
      .finally(() => {
        if (alive) setTranslating(null);
        onIncomingDone?.();
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming]);

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
  const played = schedule.length; // 지나간 해
  const year = played + 1; // 다음에 맞을 해
  const crises = useMemo<Crisis[]>(
    () => (result ? detectCrises(result, spec, played) : []),
    [result, spec, played],
  );
  const crisis = topCrisis(crises);
  const promised = LEVER_META.filter((m) => Math.abs(spec.policy[m.key] - spec.baseline[m.key]) > 1e-6);
  const { main: summary, missing } = splitSummary(spec.policySummary);

  const start = () => {
    setSchedule([]);
    setLv(spec.baseline);
    setLog([]);
    setResponded(false);
    setYearEndDone(false);
    setDefeat(null);
    setPhase("play");
  };
  const choose = (card: Card, source: "crisis" | "yearEnd") => {
    const to = card.apply(lv);
    const title = source === "crisis" && crisis ? `${crisis.title} → ${card.title}` : card.title;
    setLog((l) => [...l, { year, title, from: lv, to }]);
    setLv(to);
    if (source === "crisis") setResponded(true);
    else setYearEndDone(true);
  };
  const advance = () => {
    const next = [...schedule, lv];
    setSchedule(next);
    setResponded(false);
    setYearEndDone(false);
    const r = simulateSociety(spec, { ai, schedule: next, years: next.length });
    // 첫 2년은 배우는 구간 — 위기는 와도 게임 오버는 없다
    const d = next.length >= 3 ? checkDefeat(r) : null;
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
            해마다 마을을 지켜보다가, 위기가 터지면 대응하고 연말에 방향을 하나 고르세요. 위기는 조짐 → 경고 →
            발생 순서로 와요. 반대가 2년 연속 과반이거나 재정 적자가 GDP 10%를 넘으면 게임이 끝나요. 첫 2년은 게임
            오버가 없어요.
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

        <Section title="당신의 결정">
          <ul className="flex flex-col gap-1.5 text-[12px]">
            {log.map((d, i) => {
              const ks = movedKeys(d.from, d.to);
              return (
                <li key={i} className="flex gap-3">
                  <span className="w-9 shrink-0 text-text-muted">{d.year}년</span>
                  <span className="flex flex-col">
                    <span className="text-text-secondary">{d.title}</span>
                    {ks.length > 0 && (
                      <span className="text-[11px] text-text-muted">
                        {ks
                          .map((k) => {
                            const m = LEVER_META.find((x) => x.key === k)!;
                            return `${m.label} ${m.fmt(d.from[k])}→${m.fmt(d.to[k])}`;
                          })
                          .join(", ")}
                      </span>
                    )}
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
  const P = result?.policy[played - 1];
  const B = result?.baseline[played - 1];
  const needCrisis = Boolean(crisis) && !responded;
  const options = yearEndOptions(spec, lv, result, Boolean(wave || nextWave));
  const ready = !needCrisis && yearEndDone;
  const thisYear = log.filter((d) => d.year === year);
  const deckCards = deck.map((d, i) => cardFromInvented(d, i));

  // 사고확장기에 넘길 문제 문장 — 엔진이 아는 사실만으로
  const problemText = (target: Crisis | null) => {
    const parts: string[] = [];
    if (target) parts.push(`${target.title}: ${target.cause}.`);
    else if (goals) {
      const bad = goals.filter((g) => !g.ok).map((g) => `${g.label}(${g.now})`);
      parts.push(bad.length ? `지켜지지 않는 목표: ${bad.join(", ")}.` : "모든 목표를 지키는 중.");
    }
    if (P) {
      parts.push(
        `${played}년차, 실업 ${Math.round(P.unemployment * 100)}%, 재정 ${(P.fiscalBalance * 100).toFixed(1)}%, 지지 ${Math.round(P.support * 100)}%.`,
      );
    }
    const w = upcomingWave(year) ?? upcomingWave(year + 1);
    if (w) parts.push(`곧 AI 물결: ${w.name}(${w.target}).`);
    parts.push("AI가 일자리를 대체하는 사회에서, 금고를 지키면서 이 문제를 풀 해법은?");
    return parts.join(" ");
  };
  const inventButton = (target: Crisis | null) =>
    onInvent ? (
      <button
        type="button"
        onClick={() =>
          onInvent({ crisisTitle: target?.title ?? `${played}년차 방향`, problem: problemText(target) })
        }
        className="rounded-2xl border border-dashed border-amber-300/40 px-4 py-3 text-left text-[13px] text-amber-200 hover:bg-amber-300/10"
      >
        💡 새 해법 발명하기 — 사고확장기로 가서 생각해보기
        <span className="block text-[11px] text-text-muted">게임은 여기서 멈춰 있어요. 아이디어를 들고 돌아오면 카드가 돼요.</span>
      </button>
    ) : null;

  // 게이지 4개 — 흰 줄이 목표선, 넘으면 초록
  const gauges =
    P && B && goals
      ? [
          { label: "지지", v: P.support, line: 0.5, ok: goals[0].ok, now: `${Math.round(P.support * 100)}%` },
          {
            label: "금고",
            v: (P.fiscalBalance + 0.1) / 0.15,
            line: 0.07 / 0.15,
            ok: goals[1].ok,
            now: `${P.fiscalBalance >= 0 ? "+" : ""}${(P.fiscalBalance * 100).toFixed(1)}%`,
          },
          {
            label: "포용",
            v: goals[2].ok ? 0.65 : 0.35,
            line: 0.5,
            ok: goals[2].ok,
            now: goals[2].now.replace("만족 ", ""),
          },
          {
            label: "활력",
            v: (P.gdpPerCapita / B.gdpPerCapita - 0.9) / 0.2,
            line: 0.5,
            ok: goals[3].ok,
            now: goals[3].now,
          },
        ]
      : null;

  // 1년 뒤 예상 — 이 카드를 고른 해와 그냥 버틴 해를 엔진으로 미리 돌려 본다.
  // 경제를 몰라도 "이걸 하면 금고가 얼마나 줄고 지지가 얼마나 오르나"를 알 수 있게.
  const sim1 = (l: Levers) =>
    simulateSociety(spec, { ai, schedule: [...schedule, l], years: played + 1 }).policy[played];
  const holdNext = sim1(lv);
  const preview = (c: Card) => {
    const n = sim1(c.apply(lv));
    const pp = (x: number) => Math.round(x * 1000) / 10;
    return [
      { k: "금고", d: pp(n.fiscalBalance - holdNext.fiscalBalance), good: 1 },
      { k: "지지", d: pp(n.support - holdNext.support), good: 1 },
      { k: "실업", d: pp(n.unemployment - holdNext.unemployment), good: -1 },
    ].filter((x) => Math.abs(x.d) >= 0.5);
  };

  const LEVEL_ICON: Record<Crisis["level"], string> = { omen: "🟡", warn: "🟠", erupt: "🔴", good: "🎉" };

  const cardButton = (c: Card, source: "crisis" | "yearEnd") => (
    <button
      key={c.id}
      type="button"
      onClick={() => choose(c, source)}
      className={`flex flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/[0.14] ${
        c.kind === "promise"
          ? "bg-sky-400/10 ring-1 ring-sky-300/30"
          : c.kind === "invented"
            ? "bg-amber-300/10 ring-1 ring-amber-300/30"
            : "bg-white/[0.06]"
      }`}
    >
      <span className="text-[14px] text-text-primary">
        {c.kind === "promise" && "📜 "}
        {c.kind === "invented" && "🧪 "}
        {c.title}
      </span>
      <span className="text-[12px] leading-relaxed text-text-secondary">{c.desc}</span>
      {c.unmodeled && (
        <span className="text-[11px] text-amber-200/80">⚠ 엔진이 아직 모르는 효과: {c.unmodeled}</span>
      )}
      {c.id !== "hold" && (
        <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
          <span className="text-text-muted">1년 뒤 예상</span>
          {(() => {
            const fx = preview(c);
            if (fx.length === 0) return <span className="text-text-muted">· 큰 변화 없음</span>;
            return fx.map((x) => (
              <span
                key={x.k}
                className={`rounded-full px-1.5 ${
                  x.d * x.good > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"
                }`}
              >
                {x.k} {x.d > 0 ? "+" : ""}
                {x.d}%p
              </span>
            ));
          })()}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[20px] font-medium text-text-primary">
          {played === 0 ? "취임 첫날" : `${played}년차 겨울`}{" "}
          <span className="text-[13px] text-text-muted">/ {GAME_YEARS}년</span>
        </span>
        {played < 2 && <span className="text-[11px] text-emerald-300/80">배우는 구간 · 게임 오버 없음</span>}
      </div>

      {gauges && (
        <div className="grid grid-cols-4 gap-2">
          {gauges.map((g) => (
            <div key={g.label} className="flex flex-col gap-1 rounded-xl bg-white/[0.05] px-2 py-2">
              <span className="flex justify-between text-[11px]">
                <span className="text-text-secondary">{g.label}</span>
                <span className={g.ok ? "text-emerald-300" : "text-red-300"}>{g.ok ? "✓" : "✗"}</span>
              </span>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.1]">
                <div
                  className={`h-full ${g.ok ? "bg-emerald-400" : "bg-red-400"}`}
                  style={{ width: `${Math.max(3, Math.min(100, g.v * 100))}%` }}
                />
                <div className="absolute top-0 h-full w-[2px] bg-white/70" style={{ left: `${g.line * 100}%` }} />
              </div>
              <span className="text-[11px] text-text-primary">{g.now}</span>
            </div>
          ))}
        </div>
      )}

      {result ? (
        <SocietyVillage spec={spec} result={result} meId={meId} live onPick={(c) => onPick(c, result.years)} />
      ) : (
        <div className="rounded-2xl bg-white/[0.04] px-4 py-6 text-center text-[13px] text-text-secondary">
          첫 결정을 내리고 1년을 보내면 마을이 움직이기 시작해요.
        </div>
      )}

      {result && (
        <Section title={`${played}년차에 일어난 일`}>
          {crises.length === 0 && <p className="text-[12px] text-text-muted">조용한 한 해였어요.</p>}
          {crises.map((c) => (
            <div key={c.key} className="flex gap-2 text-[12px]">
              <span>{LEVEL_ICON[c.level]}</span>
              <span className="flex flex-col">
                <span className="text-text-primary">
                  {c.title}
                  {c.level === "omen" && " 조짐"}
                  {c.level === "warn" && " 경고"}
                </span>
                <span className="text-text-muted">{c.cause}</span>
              </span>
            </div>
          ))}
          {me && (
            <button
              type="button"
              onClick={() => onPick(me, result.years)}
              className="mt-1 rounded-xl bg-white/[0.06] px-3 py-2 text-left text-[13px]"
            >
              <span className="text-amber-200">★ {me.name}</span>
              <span className="text-text-muted"> ({me.cls})</span>
              <span className="block text-text-secondary">“{voice(me, played)}”</span>
            </button>
          )}
        </Section>
      )}

      {wave ? (
        <div className="rounded-2xl bg-red-500/15 px-4 py-3">
          <p className="text-[14px] text-red-200">
            {WAVE_MARK[wave.power]} 내년({year}년차)에 AI 물결이 와요: {wave.name}
          </p>
          <p className="text-[12px] text-red-200/80">
            {wave.target} 일자리가 크게 흔들려요. 아무것도 안 했다면 이 사회에서{" "}
            {projection.baseline[year - 1]?.aiDisplaced ?? 0}명이 그해 일자리를 잃어요.
          </p>
        </div>
      ) : nextWave ? (
        <div className="rounded-2xl bg-amber-400/10 px-4 py-3 text-[12px] text-amber-200/90">
          예고: {year + 1}년차에 {WAVE_MARK[nextWave.power]} {nextWave.name} — {nextWave.target} 일자리
        </div>
      ) : null}

      {needCrisis && crisis && (
        <div className="flex flex-col gap-2 rounded-2xl bg-red-500/10 p-4 ring-1 ring-red-400/30">
          <p className="text-[15px] text-red-200">🔴 {crisis.title}</p>
          <p className="text-[12px] text-red-200/80">원인: {crisis.cause}</p>
          <p className="text-[12px] text-text-secondary">어떻게 대응할까요?</p>
          {crisis.options.map((id) => (BASIC[id] ? cardButton(BASIC[id], "crisis") : null))}
          {deckCards.map((c) => cardButton(c, "crisis"))}
          {inventButton(crisis)}
        </div>
      )}

      {!needCrisis && !yearEndDone && (
        <Section title={played === 0 ? "취임 첫 결정 — 어떤 방향으로 시작할까요?" : "올해의 방향 — 하나를 고르세요"}>
          {options.map((c) => cardButton(c, "yearEnd"))}
          {deckCards.map((c) => cardButton(c, "yearEnd"))}
          {inventButton(null)}
        </Section>
      )}

      {translating && (
        <p className="rounded-2xl bg-amber-300/10 px-4 py-3 text-[12px] text-amber-200">
          🧪 「{translating}」을 카드로 번역하는 중… 엔진이 아는 효과만 인정해요.
        </p>
      )}
      {translateErr && <p className="px-1 text-[12px] text-red-300">번역 실패: {translateErr}</p>}

      {thisYear.length > 0 && (
        <p className="px-1 text-[11px] text-text-muted">이번 결정: {thisYear.map((d) => d.title).join(" · ")}</p>
      )}

      {ready && (
        <button
          type="button"
          onClick={advance}
          className="rounded-full bg-white/[0.22] py-3 text-[15px] font-medium text-text-primary hover:bg-white/[0.3]"
        >
          {year}년차 보내기
        </button>
      )}
    </div>
  );
}

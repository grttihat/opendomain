"use client";

import { useEffect, useRef, useState } from "react";
import { principleKey, useIdea } from "../state/IdeaContext";

export type TopMode = "decompose" | "expand" | "verify" | "memo";

const MODES: { key: TopMode; label: string; icon: JSX.Element }[] = [
  {
    key: "decompose",
    label: "분해",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="12" cy="5" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="6" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="18" cy="19" r="2" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 7v4M12 11l-5 6M12 11l5 6"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    key: "expand",
    label: "확장",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "verify",
    label: "증명",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M9 3h6M10 3v6l-5 9c-.6 1 .1 2 1.2 2h11.6c1.1 0 1.8-1 1.2-2l-5-9V3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "memo",
    label: "메모",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M4 20h4L19 9l-4-4L4 16v4z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function TopBar({
  mode,
  onModeChange,
}: {
  mode: TopMode | null;
  onModeChange: (m: TopMode | null) => void;
}) {
  const {
    topicText,
    setTopicText,
    status,
    runDecompose,
    commitPending,
    runDecomposeFacet,
    runVerifyFacet,
    setTopicMode,
    setPrincipleCustomContext,
    principleCustomContext,
    pendingTopic,
    decomposition,
    topicPurposeId,
    selectedLens,
    selectedPrinciple,
    principleLens,
    principleVerifyLens,
    addMemo,
  } = useIdea();

  // Scope hierarchy:
  //   selectedPrinciple > pendingTopic > decomposition?.topicText
  // When a principle is focused the TopBar flips into principle-scope —
  // tag, condition pk, submit action, and the 메모 button all re-target.
  const rootTopic = pendingTopic ?? decomposition?.topicText ?? null;
  const principleScopePk = selectedPrinciple
    ? principleKey(selectedPrinciple.axis, selectedPrinciple.name)
    : null;
  const activeTopic = selectedPrinciple
    ? `[${selectedPrinciple.axis}] ${selectedPrinciple.name}`
    : rootTopic;
  const effectivePk = principleScopePk
    ? principleScopePk
    : rootTopic
      ? `주제::${rootTopic}`
      : null;
  const conditions = effectivePk
    ? (principleCustomContext[effectivePk] ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const [draft, setDraft] = useState("");
  // Queued submit — wait for pendingTopic to materialize after runDecompose
  // (setState is async), then dispatch commitPending/runVerifyFacet.
  const [pendingSubmit, setPendingSubmit] = useState<{
    topic: string;
    mode: TopMode | null;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status === "loading";

  const hasTopic = Boolean(activeTopic);
  const canSubmit = (hasTopic || draft.trim().length > 0) && !busy;

  const addCondition = (text: string) => {
    const t = text.trim();
    if (!t || !effectivePk) return;
    setPrincipleCustomContext(
      effectivePk,
      [...conditions, t].join("\n"),
    );
    setDraft("");
  };
  const removeCondition = (idx: number) => {
    if (!effectivePk) return;
    setPrincipleCustomContext(
      effectivePk,
      conditions.filter((_, i) => i !== idx).join("\n"),
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!draft.trim()) return;
      if (hasTopic) addCondition(draft);
      else {
        // First Enter on home: fire the whole flow via submit to avoid
        // split "stage first, then commit" UX.
        submit();
      }
      return;
    }
    if (e.key === "Backspace" && draft.length === 0) {
      if (hasTopic && conditions.length > 0) {
        removeCondition(conditions.length - 1);
      }
    }
  };

  const submit = () => {
    if (busy) return;
    // Memo is a save action, not a decompose action. Handle it inline
    // and bail before the decompose/verify paths run.
    if (mode === "memo") {
      if (!activeTopic) return;
      const memoText = selectedPrinciple
        ? `[${selectedPrinciple.axis}] ${selectedPrinciple.name}\n${selectedPrinciple.text}`
        : activeTopic;
      addMemo(memoText);
      // Deselect the memo mode so the user has a clear "saved" moment
      // rather than an ambiguous locked state.
      onModeChange(null);
      inputRef.current?.blur();
      return;
    }
    // Principle scope: run the current mode's action against the selected
    // principle (not the root topic). Skip the home-stage flow entirely.
    if (selectedPrinciple) {
      const sp = selectedPrinciple;
      if (mode === "verify") {
        const lens = principleVerifyLens[principleScopePk!] ?? selectedLens;
        void runVerifyFacet(sp.axis, sp.name, sp.text, lens);
      } else {
        // Expand on principle isn't wired as a distinct path yet — fall
        // through to runDecomposeFacet which uses the principle's axis
        // + the per-axis direction/lens/result in facetDirection[...].
        void runDecomposeFacet(sp.axis);
      }
      inputRef.current?.blur();
      return;
    }
    const effectiveTopic = activeTopic ?? draft.trim();
    if (!effectiveTopic) return;
    const effectiveMode = mode;
    setTopicMode(effectiveMode === "verify" ? "verify" : "explore");
    if (!rootTopic) {
      // Fresh home submit — stage topic text + any un-committed conditions,
      // then queue the actual commit. The useEffect below fires once
      // pendingTopic materializes from runDecompose.
      const pk = `주제::${effectiveTopic}`;
      const pendingConditions = draft.trim() ? [draft.trim()] : [];
      if (pendingConditions.length > 0) {
        setPrincipleCustomContext(pk, pendingConditions.join("\n"));
      }
      setTopicText(effectiveTopic);
      setDraft("");
      void runDecompose();
      setPendingSubmit({ topic: effectiveTopic, mode: effectiveMode });
    } else {
      // Topic already staged — commit immediately in the current frame.
      if (effectiveMode === "verify") {
        void runVerifyFacet("주제", rootTopic, rootTopic, selectedLens);
      } else {
        void commitPending(
          topicPurposeId,
          effectiveMode === "expand" ? "expand" : "decompose",
        );
      }
    }
    inputRef.current?.blur();
  };

  // Fire the queued commit once runDecompose has set pendingTopic.
  useEffect(() => {
    if (!pendingSubmit || !pendingTopic) return;
    if (pendingSubmit.topic !== pendingTopic) return;
    const { mode: submitMode } = pendingSubmit;
    setPendingSubmit(null);
    if (submitMode === "verify") {
      void runVerifyFacet(
        "주제",
        pendingTopic,
        pendingTopic,
        selectedLens,
      );
    } else {
      void commitPending(
        topicPurposeId,
        submitMode === "expand" ? "expand" : "decompose",
      );
    }
  }, [
    pendingSubmit,
    pendingTopic,
    commitPending,
    runVerifyFacet,
    topicPurposeId,
    selectedLens,
  ]);

  return (
    <div className="mx-auto flex w-full flex-col gap-2 px-3 md:max-w-[560px] md:px-0">
      <div className="rounded-2xl border border-white/15 bg-white/[0.03] px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 shrink-0 text-text-secondary"
          >
            <path
              d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>

          {activeTopic && (
            <span
              className="inline-flex max-w-full items-center rounded-full bg-white/[0.22] px-3 py-1 text-[13px] font-medium text-text-primary md:text-[12px]"
              title={activeTopic}
            >
              <span className="truncate">{activeTopic}</span>
            </span>
          )}

          {conditions.map((c, i) => (
            <span
              key={`${c}-${i}`}
              className="inline-flex items-center gap-1 rounded-full bg-white/[0.1] py-1 pl-3 pr-1 text-[12px] text-text-primary md:text-[11px]"
              title={c}
            >
              <span className="max-w-[140px] truncate">+ {c}</span>
              <button
                type="button"
                onClick={() => removeCondition(i)}
                aria-label="조건 제거"
                className="rounded-full p-0.5 text-text-muted hover:bg-white/10 hover:text-text-primary"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          ))}

          <input
            ref={inputRef}
            value={hasTopic ? draft : draft || topicText}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!hasTopic) setTopicText(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => document.body.classList.add("inputbar-focused")}
            onBlur={() => document.body.classList.remove("inputbar-focused")}
            placeholder={
              hasTopic ? "추가 조건 입력" : "탐색하고 싶은 주제를 입력하세요"
            }
            className="min-w-[80px] flex-1 bg-transparent py-1 text-[14px] text-text-primary placeholder:text-text-muted focus:outline-none"
          />

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            aria-label="제출"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-text-secondary transition-colors hover:bg-white/[0.16] hover:text-text-primary disabled:opacity-30"
          >
            {busy ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-4 w-4 animate-spin"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeOpacity="0.25"
                />
                <path
                  d="M21 12a9 9 0 0 0-9-9"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M5 12h14M13 5l7 7-7 7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-2xl border border-white/15 bg-white/[0.03] p-1">
        {MODES.map((m) => {
          const active = mode === m.key;
          // 메모 버튼은 저장할 축/주제가 있어야 활성. 홈(아무것도 없음)에서는
          // 비활성 — 유저가 "뭘 저장할지" 모호해지는 걸 방지한다.
          const disabled = m.key === "memo" && !activeTopic;
          return (
            <button
              key={m.key}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onModeChange(active ? null : m.key);
              }}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition-colors ${
                active
                  ? "bg-white/[0.12] text-text-primary"
                  : disabled
                    ? "text-text-muted/40"
                    : "text-text-muted hover:text-text-primary"
              }`}
            >
              {m.icon}
              <span>{m.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

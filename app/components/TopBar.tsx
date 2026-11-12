"use client";

import { useRef, useState } from "react";
import { useIdea } from "../state/IdeaContext";

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
  disableMemo = true,
}: {
  disableMemo?: boolean;
}) {
  const {
    topicText,
    setTopicText,
    status,
    runDecompose,
    setTopicMode,
    setPrincipleCustomContext,
  } = useIdea();
  const [mode, setMode] = useState<TopMode>("decompose");
  // Local draft state for the tag-ified input. First Enter promotes the
  // draft into topicTag; subsequent Enters push into conditions. Submit
  // flushes everything into IdeaContext (topicText + 주제::<topic>
  // custom context) and kicks off runDecompose.
  const [topicTag, setTopicTag] = useState<string | null>(null);
  const [conditions, setConditions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status === "loading";

  const hasTopic = Boolean(topicTag);
  const canSubmit = (hasTopic || draft.trim().length > 0) && !busy;

  const addCondition = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setConditions((cur) => [...cur, t]);
    setDraft("");
  };
  const promoteTopic = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setTopicTag(t);
    setDraft("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!draft.trim()) return;
      if (!hasTopic) promoteTopic(draft);
      else addCondition(draft);
      return;
    }
    if (e.key === "Backspace" && draft.length === 0) {
      // Empty backspace pops the last chip for fast correction.
      if (conditions.length > 0) {
        setConditions((cur) => cur.slice(0, -1));
      } else if (topicTag) {
        setTopicTag(null);
      }
    }
  };

  const submit = () => {
    if (!canSubmit) return;
    // Flush any un-tagged draft into the appropriate slot before firing.
    let effectiveTopic = topicTag;
    let effectiveConditions = conditions;
    const d = draft.trim();
    if (d) {
      if (!effectiveTopic) {
        effectiveTopic = d;
      } else {
        effectiveConditions = [...effectiveConditions, d];
      }
    }
    if (!effectiveTopic) return;

    setTopicText(effectiveTopic);
    const pk = `주제::${effectiveTopic}`;
    setPrincipleCustomContext(pk, effectiveConditions.join("\n"));
    setTopicMode(mode === "verify" ? "verify" : "explore");
    void runDecompose();
    inputRef.current?.blur();
  };

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

          {topicTag && (
            <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-white/[0.22] py-1 pl-3 pr-1 text-[13px] font-medium text-text-primary md:text-[12px]">
              <span className="truncate">{topicTag}</span>
              <button
                type="button"
                onClick={() => setTopicTag(null)}
                aria-label="주제 제거"
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
                onClick={() =>
                  setConditions((cur) => cur.filter((_, idx) => idx !== i))
                }
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
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => document.body.classList.add("inputbar-focused")}
            onBlur={() => document.body.classList.remove("inputbar-focused")}
            placeholder={
              hasTopic
                ? "추가 조건 입력"
                : "탐색하고 싶은 주제를 입력하세요"
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
          const disabled = m.key === "memo" && disableMemo;
          return (
            <button
              key={m.key}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && setMode(m.key)}
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

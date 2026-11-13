"use client";

import { useState } from "react";
import { principleKey, useIdea } from "../state/IdeaContext";
import DirectionChipRow from "./DirectionChipRow";
import FacetLensRow from "./FacetLensRow";
import {
  kIndustryPool,
  kPsychologyPool,
  kObjectPool,
  chipKindLabel,
  type ChipKind,
} from "@/lib/constants";
import type { TopMode } from "./TopBar";

type Axis = "direction" | "lens" | "chip";
type ChipSubTab = "library" | "similar" | "search" | "history";

const AXES: { key: Axis; label: string; icon: JSX.Element }[] = [
  {
    key: "direction",
    label: "사고방향",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 7l3 5-3 5-3-5 3-5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "lens",
    label: "렌즈",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M4 7l8-3 8 3M4 12l8-3 8 3M4 17l8-3 8 3"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "chip",
    label: "칩",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

const CHIP_SUB_TABS: { key: ChipSubTab; label: string }[] = [
  { key: "library", label: "라이브러리" },
  { key: "similar", label: "유사칩" },
  { key: "search", label: "검색" },
  { key: "history", label: "히스토리" },
];

const CHIP_KINDS: ChipKind[] = ["industry", "psychology", "object"];

const POOL_BY_KIND: Record<ChipKind, string[]> = {
  industry: kIndustryPool,
  psychology: kPsychologyPool,
  object: kObjectPool,
};

const CHIP_BASE =
  "shrink-0 rounded-full px-5 py-2 text-[14px] transition-colors whitespace-nowrap md:px-3 md:py-1 md:text-[11px]";
const CHIP_INACTIVE =
  "bg-black text-text-muted hover:bg-white/[0.1] hover:text-text-primary";
const CHIP_ACTIVE = "bg-white/[0.22] text-text-primary";

export default function BottomBar({ mode }: { mode: TopMode | null }) {
  const {
    topicDirectionId,
    setTopicDirectionId,
    topicExpandDirectionId,
    setTopicExpandDirectionId,
    customDirections,
    addCustomDirection,
    removeCustomDirection,
    selectedLens,
    setSelectedLens,
    selectedPrinciple,
    principleDirection,
    setPrincipleDirection,
    principleLens,
    setPrincipleLens,
    setChipPanelOpen,
    setChipPanelFullScreen,
    userChips,
  } = useIdea();
  const [axis, setAxis] = useState<Axis>("direction");
  const [chipSubTab, setChipSubTab] = useState<ChipSubTab>("library");
  const [chipLibCat, setChipLibCat] = useState<ChipKind | null>(null);

  if (mode === null) return null;

  const isExpand = mode === "expand";
  // Scope: selected principle takes over if focused — direction + lens
  // reads/writes become principle-scoped (principleDirection[pk] etc.).
  // Otherwise fall back to the topic-level state.
  const scopePk = selectedPrinciple
    ? principleKey(selectedPrinciple.axis, selectedPrinciple.name)
    : null;
  const currentDirection = scopePk
    ? principleDirection[scopePk] ??
      (isExpand ? topicExpandDirectionId : topicDirectionId)
    : isExpand
      ? topicExpandDirectionId
      : topicDirectionId;
  const onChangeDirection = (id: string) => {
    if (scopePk) setPrincipleDirection(scopePk, id);
    else if (isExpand) setTopicExpandDirectionId(id);
    else setTopicDirectionId(id);
  };
  const currentLens = scopePk ? principleLens[scopePk] ?? selectedLens : selectedLens;
  const onChangeLens = (lens: typeof selectedLens) => {
    if (scopePk) setPrincipleLens(scopePk, lens);
    else setSelectedLens(lens);
  };

  const openFullPanel = () => {
    setChipPanelFullScreen(true);
    setChipPanelOpen(true);
  };

  // Chip axis body: top row (sub-tabs) + a content row per sub-tab.
  // Library gets a hierarchical inline view (kind → chips); the other
  // three sub-tabs show a short hint + a "전체 패널" shortcut (step 1
  // scope — step 4 will inline them fully).
  const renderChipContent = () => {
    if (chipSubTab === "library") {
      if (chipLibCat === null) {
        return (
          <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
            {CHIP_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setChipLibCat(k)}
                className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
              >
                {chipKindLabel[k]}
              </button>
            ))}
          </div>
        );
      }
      const pool = POOL_BY_KIND[chipLibCat];
      const custom = userChips.filter((uc) => uc.kind === chipLibCat);
      return (
        <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            onClick={() => setChipLibCat(null)}
            aria-label="카테고리 뒤로"
            className={`${CHIP_BASE} ${CHIP_ACTIVE}`}
          >
            ‹ {chipKindLabel[chipLibCat]}
          </button>
          {custom.map((uc) => (
            <button
              key={`u-${uc.id}`}
              type="button"
              onClick={openFullPanel}
              className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
              title={uc.definition}
            >
              {uc.name}
            </button>
          ))}
          {pool.map((c) => (
            <button
              key={c}
              type="button"
              onClick={openFullPanel}
              className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
            >
              {c}
            </button>
          ))}
        </div>
      );
    }
    // similar / search / history — minimal placeholder + shortcut
    const hint =
      chipSubTab === "similar"
        ? "원리 선택 후 유사칩이 표시됩니다"
        : chipSubTab === "search"
          ? "키워드·속성·메커니즘으로 칩 검색"
          : "최근 분해한 칩 목록";
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-[12px] text-text-muted md:text-[11px]">
          {hint}
        </span>
        <button
          type="button"
          onClick={openFullPanel}
          className="shrink-0 rounded-full bg-white/[0.08] px-4 py-1.5 text-[12px] text-text-primary hover:bg-white/[0.16] md:text-[11px]"
        >
          전체 패널 열기
        </button>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full flex-col gap-2 px-3 md:max-w-[560px] md:px-0">
      {/* Content area — direction / lens / chip's own composed view */}
      {axis === "chip" ? (
        <div className="flex flex-col gap-1.5">
          {/* chip sub-tab row */}
          <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
            {CHIP_SUB_TABS.map((t) => {
              const active = chipSubTab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setChipSubTab(t.key);
                    if (t.key !== "library") setChipLibCat(null);
                  }}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-[12px] transition-colors whitespace-nowrap md:px-3 md:py-1 md:text-[11px] ${
                    active
                      ? "bg-white/[0.18] text-text-primary"
                      : "bg-white/[0.04] text-text-muted hover:bg-white/[0.1] hover:text-text-primary"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          {/* chip content row */}
          <div className="min-h-[2.5rem]">{renderChipContent()}</div>
        </div>
      ) : (
        <div className="min-h-[2.5rem]">
          {axis === "direction" && (
            <DirectionChipRow
              axis={isExpand ? "expand" : "decompose"}
              currentDirection={currentDirection}
              customDirections={customDirections}
              onChangeDirection={onChangeDirection}
              addCustomDirection={addCustomDirection}
              removeCustomDirection={removeCustomDirection}
              hideLabel
              singleLine
            />
          )}
          {axis === "lens" && (
            <FacetLensRow
              currentLens={currentLens}
              onChangeLens={onChangeLens}
              hideLabel
              singleLine
            />
          )}
        </div>
      )}

      {/* Axis selector */}
      <div className="flex gap-1 rounded-2xl border border-white/15 bg-white/[0.03] p-1">
        {AXES.map((a) => {
          const active = axis === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => setAxis(a.key)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] transition-colors ${
                active
                  ? "bg-white/[0.12] text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {a.icon}
              <span>{a.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

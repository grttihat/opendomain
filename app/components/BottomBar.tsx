"use client";

import { useState } from "react";
import { useIdea } from "../state/IdeaContext";
import DirectionChipRow from "./DirectionChipRow";
import FacetLensRow from "./FacetLensRow";
import {
  kIndustryPool,
  kPsychologyPool,
  kObjectPool,
} from "@/lib/constants";
import type { TopMode } from "./TopBar";

type Axis = "direction" | "lens" | "chip";

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
        <rect
          x="4"
          y="4"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="13"
          y="4"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="4"
          y="13"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect
          x="13"
          y="13"
          width="7"
          height="7"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    ),
  },
];

// Flat chip pool used by the 칩 axis one-line row. Order = industry →
// psychology → object so the user hits the most grounded physical
// examples first.
const CHIP_POOL: { text: string; kind: string }[] = [
  ...kIndustryPool.map((c) => ({ text: c, kind: "industry" })),
  ...kPsychologyPool.map((c) => ({ text: c, kind: "psychology" })),
  ...kObjectPool.map((c) => ({ text: c, kind: "object" })),
];

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
    setChipPanelOpen,
    setChipPanelFullScreen,
  } = useIdea();
  const [axis, setAxis] = useState<Axis>("direction");

  if (mode === null) return null;

  const isExpand = mode === "expand";
  const currentDirection = isExpand ? topicExpandDirectionId : topicDirectionId;
  const onChangeDirection = isExpand
    ? setTopicExpandDirectionId
    : setTopicDirectionId;

  return (
    <div className="mx-auto flex w-full flex-col gap-2 px-3 md:max-w-[560px] md:px-0">
      {/* Row 1: current axis's chips */}
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
            currentLens={selectedLens}
            onChangeLens={setSelectedLens}
            hideLabel
            singleLine
          />
        )}
        {axis === "chip" && (
          <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
            {CHIP_POOL.map((c) => (
              <button
                key={c.text}
                type="button"
                onClick={() => {
                  // Step 1: chip selection on the home topic shell just
                  // opens the full chip panel. Step 4 will wire a real
                  // "stage this chip" action into the topic flow.
                  setChipPanelFullScreen(true);
                  setChipPanelOpen(true);
                }}
                className="shrink-0 rounded-full bg-black px-5 py-2 text-[14px] text-text-muted whitespace-nowrap transition-colors hover:bg-white/[0.1] hover:text-text-primary md:px-3 md:py-1 md:text-[11px]"
              >
                {c.text}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setChipPanelFullScreen(true);
                setChipPanelOpen(true);
              }}
              className="shrink-0 rounded-full bg-white/[0.04] px-5 py-2 text-[14px] text-text-muted hover:bg-white/[0.1] hover:text-text-primary md:px-3 md:py-1 md:text-[11px]"
            >
              모두 보기
            </button>
          </div>
        )}
      </div>

      {/* Row 2: axis selector */}
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

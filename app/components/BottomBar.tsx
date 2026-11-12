"use client";

import { useState } from "react";
import { useIdea } from "../state/IdeaContext";
import DirectionChipRow from "./DirectionChipRow";
import FacetLensRow from "./FacetLensRow";

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

export default function BottomBar() {
  const {
    topicDirectionId,
    setTopicDirectionId,
    customDirections,
    addCustomDirection,
    removeCustomDirection,
    selectedLens,
    setSelectedLens,
    setChipPanelOpen,
    setChipPanelFullScreen,
  } = useIdea();
  const [axis, setAxis] = useState<Axis>("direction");

  return (
    <div className="mx-auto flex w-full flex-col gap-2 px-3 md:max-w-[560px] md:px-0">
      {/* Row 1: current axis's chips (direction / lens) OR chip-panel opener */}
      <div className="min-h-[2.75rem] overflow-x-auto">
        {axis === "direction" && (
          <DirectionChipRow
            axis="decompose"
            currentDirection={topicDirectionId}
            customDirections={customDirections}
            onChangeDirection={setTopicDirectionId}
            addCustomDirection={addCustomDirection}
            removeCustomDirection={removeCustomDirection}
            hideLabel
          />
        )}
        {axis === "lens" && (
          <FacetLensRow
            currentLens={selectedLens}
            onChangeLens={setSelectedLens}
            hideLabel
          />
        )}
        {axis === "chip" && (
          <div className="flex items-center gap-2 py-1">
            <button
              type="button"
              onClick={() => {
                setChipPanelFullScreen(true);
                setChipPanelOpen(true);
              }}
              className="rounded-full bg-white/[0.08] px-4 py-2 text-[12px] text-text-primary hover:bg-white/[0.16]"
            >
              칩 라이브러리 열기
            </button>
            <span className="text-[11px] text-text-muted">
              (주제 입력 후 조합)
            </span>
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

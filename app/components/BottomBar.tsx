"use client";

import { useEffect, useState } from "react";
import { principleKey, useIdea } from "../state/IdeaContext";
import DirectionChipRow from "./DirectionChipRow";
import FacetLensRow from "./FacetLensRow";
import {
  kIndustryPool,
  kPsychologyPool,
  kObjectPool,
  chipKindLabel,
  kBigCategories,
  type BigCategory,
  type ChipKind,
} from "@/lib/constants";
import { chipSearchModeLabel, type ChipSearchMode } from "@/lib/prompts";
import type { SelectedLens } from "@/lib/lenses";
import type { TopMode } from "./TopBar";

type Axis = "direction" | "lens" | "result";
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
    key: "result",
    label: "실행결과",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M5 12l4 4 10-10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M5 20h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

// 상단 모드가 "칩"일 때 하단 탭 줄을 대체하는 하위 카테고리.
const CHIP_SUB_TABS: { key: ChipSubTab; label: string; icon: JSX.Element }[] = [
  {
    key: "library",
    label: "도메인",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <path
          d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.5-1 2 15-3.5 1z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    key: "similar",
    label: "유사칩",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="9" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="15" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    key: "search",
    label: "검색",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    key: "history",
    label: "히스토리",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M12 8v4l3 2"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
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
    selectedAxes,
    facetDirection,
    setFacetDirection,
    facetLens,
    setFacetLens,
    setChipPanelOpen,
    setChipPanelFullScreen,
    userChips,
    chipRecommendations,
    chipStatus,
    runRecommendChips,
    chipSearchQuery,
    setChipSearchQuery,
    chipSearchMode,
    setChipSearchMode,
    chipSearchResults,
    chipSearchStatus,
    runChipSearch,
    chipDecompositions,
    topicResultType,
    setTopicResultType,
    facetResultType,
    setFacetResultType,
    customResultTypes,
    runDecomposeChip,
    chipDecompStatus,
    runCombine,
    combineStatus,
    decomposition,
  } = useIdea();
  const [axis, setAxis] = useState<Axis>("direction");
  const [chipSubTab, setChipSubTab] = useState<ChipSubTab>("library");
  const [chipLibCat, setChipLibCat] = useState<ChipKind | null>(null);
  // 조합 플로우: 칩 선택 → (분해/확장 + 사고방향/렌즈/실행결과 설정) →
  // 펼치기 → 칩 facet 선택 → 조합 실행.
  const [picked, setPicked] = useState<{
    kind: ChipKind | null;
    text: string;
    category?: string;
  } | null>(null);
  const [comboStage, setComboStage] = useState<"config" | "facets">("config");
  const [comboMethod, setComboMethod] = useState<"decompose" | "expand">(
    "decompose",
  );
  const [comboDirection, setComboDirection] = useState<string | null>(null);
  const [comboLens, setComboLens] = useState<SelectedLens | null | undefined>(
    undefined,
  );
  const [comboResult, setComboResult] = useState<
    BigCategory | null | undefined
  >(undefined);

  // Lazy-fetch 유사칩 when the user opens the similar tab with a focused
  // principle and we don't have any recs cached yet. Must stay above the
  // early return — React hook order is fixed across renders.
  useEffect(() => {
    if (
      mode !== "chip" ||
      chipSubTab !== "similar" ||
      !selectedPrinciple
    ) {
      return;
    }
    const pk = principleKey(selectedPrinciple.axis, selectedPrinciple.name);
    if (chipRecommendations[pk] || chipStatus[pk] === "loading") return;
    void runRecommendChips(
      selectedPrinciple.axis,
      selectedPrinciple.name,
      selectedPrinciple.text,
    );
  }, [
    mode,
    chipSubTab,
    selectedPrinciple,
    chipRecommendations,
    chipStatus,
    runRecommendChips,
  ]);

  if (mode === null) return null;

  const isExpand = mode === "expand";
  // Scope hierarchy:
  //   selectedPrinciple → principleDirection/principleLens by pk
  //   focused axis (first in selectedAxes) → facetDirection/facetLens by axis
  //   otherwise → topic-level (topicDirectionId / selectedLens)
  // 이 순서로 떨어지면서 "가장 세분화된 포커스"에 설정이 바인딩된다.
  const scopePk = selectedPrinciple
    ? principleKey(selectedPrinciple.axis, selectedPrinciple.name)
    : null;
  const focusedAxis =
    !scopePk && selectedAxes.size > 0
      ? (selectedAxes.values().next().value as string)
      : null;
  const currentDirection = scopePk
    ? principleDirection[scopePk] ??
      (isExpand ? topicExpandDirectionId : topicDirectionId)
    : focusedAxis
      ? facetDirection[focusedAxis] ??
        (isExpand ? topicExpandDirectionId : topicDirectionId)
      : isExpand
        ? topicExpandDirectionId
        : topicDirectionId;
  const onChangeDirection = (id: string) => {
    if (scopePk) setPrincipleDirection(scopePk, id);
    else if (focusedAxis) setFacetDirection(focusedAxis, id);
    else if (isExpand) setTopicExpandDirectionId(id);
    else setTopicDirectionId(id);
  };
  const currentLens = scopePk
    ? principleLens[scopePk] ?? selectedLens
    : focusedAxis
      ? facetLens[focusedAxis] ?? selectedLens
      : selectedLens;
  const onChangeLens = (lens: typeof selectedLens) => {
    if (scopePk) setPrincipleLens(scopePk, lens);
    else if (focusedAxis) setFacetLens(focusedAxis, lens);
    else setSelectedLens(lens);
  };

  // 실행결과: 원리/축 스코프는 runDecomposeFacet이 읽는 facetResultType[axis]
  // 에, 주제 스코프는 commitPending이 읽는 topicResultType에 바인딩.
  const resultAxis = selectedPrinciple?.axis ?? focusedAxis;
  const currentResultType: BigCategory | null = resultAxis
    ? facetResultType[resultAxis] ?? topicResultType ?? null
    : topicResultType;
  const onChangeResultType = (rt: BigCategory | null) => {
    if (resultAxis) setFacetResultType(resultAxis, rt);
    else setTopicResultType(rt);
  };

  const pickChip = (
    kind: ChipKind | null,
    text: string,
    category?: string,
  ) => {
    setPicked({ kind, text, category });
    setComboStage("config");
    setComboMethod("decompose");
    setComboDirection(null);
    setComboLens(undefined);
    setComboResult(undefined);
    setAxis("direction");
  };
  const resetCombine = () => {
    setPicked(null);
    setComboStage("config");
  };
  // 조합 설정 — 유저가 고르기 전엔 현재 스코프 값을 기본으로 보여준다.
  const comboDirectionId =
    comboDirection ??
    (comboMethod === "expand" ? topicExpandDirectionId : topicDirectionId);
  const comboLensValue = comboLens !== undefined ? comboLens : currentLens;
  const comboResultValue =
    comboResult !== undefined ? comboResult : currentResultType;
  // 조합 대상(주제 쪽 facet): 선택 원리 > 포커스 축의 원리.
  const topicFacet =
    !selectedPrinciple && focusedAxis && decomposition?.axisToPrinciple?.[focusedAxis]
      ? { axis: focusedAxis, principle: decomposition.axisToPrinciple[focusedAxis] }
      : null;
  const pickedKind: ChipKind = picked?.kind ?? "object";
  const pickedKey = picked ? `${pickedKind}::${picked.text}` : null;
  const unfoldChip = () => {
    if (!picked) return;
    setComboStage("facets");
    void runDecomposeChip(
      pickedKind,
      picked.text,
      comboDirectionId,
      comboLensValue ?? null,
      comboResultValue ?? null,
    );
  };
  const combineWith = (chipFacet: { axis: string; principle: string } | null) => {
    if (!picked) return;
    void runCombine({
      chipKind: picked.kind,
      chipCategory: picked.category ?? null,
      chipText: picked.text,
      chipFacet,
      topicFacet,
      lens: comboLensValue ?? null,
    });
    resetCombine();
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
              onClick={() =>
                pickChip(
                  uc.kind === "memo" ? null : uc.kind,
                  uc.name,
                  uc.kind === "memo" ? "메모" : undefined,
                )
              }
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
              onClick={() => pickChip(chipLibCat, c)}
              className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
            >
              {c}
            </button>
          ))}
        </div>
      );
    }
    if (chipSubTab === "similar") {
      if (!selectedPrinciple) {
        return (
          <div className="flex items-center gap-2 py-1 text-[12px] text-text-muted md:text-[11px]">
            원리를 선택하면 유사칩이 자동 표시됩니다
          </div>
        );
      }
      const pk = principleKey(selectedPrinciple.axis, selectedPrinciple.name);
      const recs = chipRecommendations[pk] ?? {};
      const flat: { chipText: string; cat: string }[] = [];
      for (const [cat, arr] of Object.entries(recs)) {
        for (const r of arr) flat.push({ chipText: r.chipText, cat });
      }
      const loading = chipStatus[pk] === "loading";
      if (flat.length === 0) {
        return (
          <div className="flex items-center gap-2 py-1">
            <span className="text-[12px] text-text-muted md:text-[11px]">
              {loading ? "유사칩 추천 중…" : "아직 추천 없음"}
            </span>
            {!loading && (
              <button
                type="button"
                onClick={() =>
                  void runRecommendChips(
                    selectedPrinciple.axis,
                    selectedPrinciple.name,
                    selectedPrinciple.text,
                  )
                }
                className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1 text-[11px] text-text-primary hover:bg-white/[0.16]"
              >
                추천 받기
              </button>
            )}
          </div>
        );
      }
      return (
        <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
          {flat.map((r, i) => (
            <button
              key={`${r.chipText}-${i}`}
              type="button"
              onClick={() => pickChip(null, r.chipText, r.cat)}
              title={r.cat}
              className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
            >
              {r.chipText}
            </button>
          ))}
        </div>
      );
    }
    if (chipSubTab === "search") {
      const searching = chipSearchStatus === "loading";
      return (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
            {(["keyword", "attribute", "mechanism"] as ChipSearchMode[]).map(
              (m) => {
                const active = chipSearchMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setChipSearchMode(m)}
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] transition-colors ${
                      active
                        ? "bg-white/[0.18] text-text-primary"
                        : "bg-white/[0.04] text-text-muted hover:bg-white/[0.1] hover:text-text-primary"
                    }`}
                  >
                    {chipSearchModeLabel[m]}
                  </button>
                );
              },
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (chipSearchQuery.trim()) void runChipSearch();
            }}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.03] px-3 py-1"
          >
            <input
              value={chipSearchQuery}
              onChange={(e) => setChipSearchQuery(e.target.value)}
              placeholder={`${chipSearchModeLabel[chipSearchMode]}로 검색`}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none md:text-[12px]"
            />
            <button
              type="submit"
              disabled={searching || !chipSearchQuery.trim()}
              aria-label="검색"
              className="shrink-0 rounded-full p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M20 20l-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </form>
          {chipSearchResults.length > 0 && (
            <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
              {chipSearchResults.map((r, i) => (
                <button
                  key={`${r}-${i}`}
                  type="button"
                  onClick={() => pickChip(null, r)}
                  className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }
    // history
    const historyKeys = Object.keys(chipDecompositions);
    if (historyKeys.length === 0) {
      return (
        <div className="flex items-center gap-2 py-1 text-[12px] text-text-muted md:text-[11px]">
          아직 분해한 칩이 없습니다
        </div>
      );
    }
    return (
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
        {historyKeys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              const [kind, ...rest] = k.split("::");
              pickChip(kind as ChipKind, rest.join("::"));
            }}
            className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
          >
            {k}
          </button>
        ))}
      </div>
    );
  };

  const isChipMode = mode === "chip";
  // 조합 모드에서 칩을 고른 뒤엔 하단이 그 칩의 분해/확장 설정 화면이 된다.
  const comboActive = isChipMode && picked !== null;
  // 하단 탭 줄: 조합 모드(칩 고르기 전)면 도메인/유사칩/검색/히스토리,
  // 그 외엔 사고방향/렌즈/실행결과. 선택된 탭의 칩들은 위쪽 한 줄에 나열.
  const showChipTabs = isChipMode && !comboActive;
  const tabs: { key: string; label: string; icon: JSX.Element }[] = showChipTabs
    ? CHIP_SUB_TABS
    : AXES;
  const activeTab: string = showChipTabs
    ? chipSubTab
    : comboActive && comboStage === "facets"
      ? ""
      : axis;
  const onTabClick = (key: string) => {
    if (showChipTabs) {
      setChipSubTab(key as ChipSubTab);
      if (key !== "library") setChipLibCat(null);
    } else {
      setAxis(key as Axis);
      // facet 고르는 중에 설정 탭을 누르면 설정 단계로 되돌아간다.
      if (comboActive) setComboStage("config");
    }
  };

  const renderResultRow = (
    value: BigCategory | null,
    onChange: (rt: BigCategory | null) => void,
  ) => (
    <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`${CHIP_BASE} ${value === null ? CHIP_ACTIVE : CHIP_INACTIVE}`}
      >
        없음
      </button>
      {[...kBigCategories, ...customResultTypes].map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat as BigCategory)}
          className={`${CHIP_BASE} ${value === cat ? CHIP_ACTIVE : CHIP_INACTIVE}`}
        >
          {cat}
        </button>
      ))}
    </div>
  );

  // 사고방향/렌즈/실행결과 칩 줄 — 일반 모드는 스코프 값에, 조합 설정
  // 단계는 조합 전용 값에 바인딩.
  const renderSettingRow = (combo: boolean) => {
    if (axis === "direction") {
      const method = combo ? comboMethod : isExpand ? "expand" : "decompose";
      return (
        <DirectionChipRow
          axis={method}
          currentDirection={combo ? comboDirectionId : currentDirection}
          customDirections={customDirections}
          onChangeDirection={combo ? setComboDirection : onChangeDirection}
          addCustomDirection={addCustomDirection}
          removeCustomDirection={removeCustomDirection}
          hideLabel
          singleLine
        />
      );
    }
    if (axis === "lens") {
      return (
        <FacetLensRow
          currentLens={combo ? comboLensValue ?? null : currentLens}
          onChangeLens={combo ? setComboLens : onChangeLens}
          hideLabel
          singleLine
        />
      );
    }
    return combo
      ? renderResultRow(comboResultValue ?? null, setComboResult)
      : renderResultRow(currentResultType, onChangeResultType);
  };

  const BACK_BTN =
    "shrink-0 rounded-full bg-white/[0.08] px-3 py-2 text-[14px] text-text-secondary hover:bg-white/[0.16] hover:text-text-primary md:py-1 md:text-[11px]";
  const SEG_BASE =
    "shrink-0 rounded-full px-4 py-2 text-[14px] transition-colors md:px-3 md:py-1 md:text-[11px]";

  // 조합 헤더: [‹] [칩] [분해|확장] … [펼치기 / 조합 중]
  const renderComboHeader = () => {
    if (!picked) return null;
    const busy = combineStatus === "loading";
    return (
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
        <button
          type="button"
          onClick={() =>
            comboStage === "facets" ? setComboStage("config") : resetCombine()
          }
          className={BACK_BTN}
          aria-label="이전 단계"
        >
          ‹
        </button>
        <span className={`${CHIP_BASE} ${CHIP_ACTIVE}`}>{picked.text}</span>
        <div className="flex shrink-0 gap-0.5 rounded-full bg-white/[0.06] p-0.5">
          {(["decompose", "expand"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setComboMethod(m);
                setComboDirection(null);
                setComboStage("config");
              }}
              className={`${SEG_BASE} ${
                comboMethod === m
                  ? "bg-white/[0.18] text-text-primary"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {m === "expand" ? "확장" : "분해"}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {comboStage === "config" ? (
          <button
            type="button"
            onClick={unfoldChip}
            className="shrink-0 rounded-full bg-white/[0.22] px-4 py-2 text-[14px] font-medium text-text-primary hover:bg-white/[0.3] md:px-3 md:py-1 md:text-[11px]"
          >
            펼치기 →
          </button>
        ) : busy ? (
          <span className="shrink-0 px-2 text-[12px] text-text-muted md:text-[11px]">
            조합 중…
          </span>
        ) : null}
      </div>
    );
  };

  const renderComboFacets = () => {
    const facets = pickedKey ? chipDecompositions[pickedKey] : undefined;
    const loading = pickedKey ? chipDecompStatus[pickedKey] === "loading" : false;
    if (loading || !facets) {
      return (
        <div className="flex items-center py-2 text-[12px] text-text-muted md:text-[11px]">
          {loading ? "칩 펼치는 중…" : "결과 없음"}
        </div>
      );
    }
    return (
      <div className="flex gap-1 overflow-x-auto whitespace-nowrap">
        {Object.entries(facets).map(([ax, principle]) => (
          <button
            key={ax}
            type="button"
            title={principle}
            onClick={() => combineWith({ axis: ax, principle })}
            className={`${CHIP_BASE} ${CHIP_INACTIVE}`}
          >
            {ax}
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full flex-col gap-2 px-3 md:max-w-[560px] md:px-0">
      {comboActive && renderComboHeader()}
      {/* Content row — 선택된 탭의 칩 나열 */}
      <div className="min-h-[2.5rem]">
        {showChipTabs
          ? renderChipContent()
          : comboActive
            ? comboStage === "facets"
              ? renderComboFacets()
              : renderSettingRow(true)
            : renderSettingRow(false)}
      </div>

      {/* Tab selector */}
      <div className="flex gap-1 rounded-[28px] bg-white/[0.08] p-2">
        {tabs.map((a) => {
          const active = activeTab === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => onTabClick(a.key)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-[11px] transition-colors ${
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

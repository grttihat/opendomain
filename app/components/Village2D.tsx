"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// 가상검증 2D 마을 — 외부 엔진 없이 canvas 픽셀아트.
// 계층/고객층마다 동네 하나, 가운데 건물(가게 또는 시청). 시뮬 결과를
// 재생만 하며, 사람의 상태·이동·말풍선은 호출 측이 넘긴 함수로 정한다.
// 그래서 가상시장(주차·구매)과 가상사회(년차·지지/이민) 모두에 쓴다.

const T = 16; // 타일 px (월드 좌표)
const COLS = 18;
const ROWS = 26;
const W = COLS * T;
const H = ROWS * T;
const ROAD_X = 8 * T + T; // 세로 도로 중심
const ROAD_Y = 12 * T + T; // 가로 도로 중심
const SHOP = { x: 10 * T, y: 8 * T, w: 5 * T, h: 4 * T };
const DOOR = { x: SHOP.x + SHOP.w / 2, y: ROAD_Y };
const SAMPLE = 60;
const TICK_MS = 2600;

export type VillagePerson = { id: number; segment: string };
export type VillageStatus = {
  icon: string | null; // 머리 위 아이콘 (모양으로도 구분되게)
  iconColor?: string;
  faded?: boolean; // 반투명 (모름 등)
  bag?: boolean; // 쇼핑백
  gone?: boolean; // 마을을 떠남 (이민 등)
};
export type VillageEvent = { tick: number; personId: number; bubble: string };
export type VillageLegend = { icon: string; color: string; label: string; n: number };

type Rect = { x: number; y: number; w: number; h: number };

// 동네 영역 (타일 단위). 그룹 수에 맞춰 앞에서부터 사용.
function zonesFor(n: number): Rect[] {
  const r = (c0: number, r0: number, c1: number, r1: number): Rect => ({
    x: c0 * T,
    y: r0 * T,
    w: (c1 - c0 + 1) * T,
    h: (r1 - r0 + 1) * T,
  });
  if (n <= 4) {
    return [r(0, 0, 7, 11), r(10, 0, 17, 7), r(0, 14, 7, 25), r(10, 14, 17, 25)];
  }
  return [
    r(0, 0, 7, 11),
    r(10, 0, 17, 7),
    r(0, 14, 7, 25),
    r(10, 14, 17, 19),
    r(10, 20, 17, 25),
  ];
}

// 인구가 많은 그룹부터 넓은 동네에 배정. 남는 동네는 공원.
function assignZones(segments: string[], people: VillagePerson[]) {
  const zones = zonesFor(segments.length);
  const byArea = zones
    .map((z, i) => ({ z, i }))
    .sort((a, b) => b.z.w * b.z.h - a.z.w * a.z.h || a.i - b.i);
  const counts = segments.map((s) => people.filter((p) => p.segment === s).length);
  const bySize = segments
    .map((_, i) => i)
    .sort((a, b) => counts[b] - counts[a] || a - b);
  const segZones: Rect[] = new Array(segments.length);
  bySize.forEach((segIdx, rank) => {
    segZones[segIdx] = byArea[rank].z;
  });
  const used = new Set(segZones);
  return { segZones, parks: zones.filter((z) => !used.has(z)) };
}

// 그룹 정체성 색 (지붕·셔츠). 이름 표지판이 함께 있어 색만으로 구분하지 않는다.
const SEG_COLORS = ["#d9644a", "#4a86d9", "#e0b13a", "#8a5ad6", "#3fae8a"];

type Mode = "wander" | "toCenter" | "atCenter" | "home" | "leaving" | "gone";
type Agent = {
  person: VillagePerson;
  zone: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  path: { x: number; y: number }[];
  mode: Mode;
  wait: number;
  hair: string;
  bubble: { text: string; until: number } | null;
  step: number;
};

function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 정적 지도 (오프스크린에 한 번만 그림) -----------------------------------
function drawMap(
  segNames: string[],
  center: "shop" | "hall",
  segZones: Rect[],
  parks: Rect[],
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;
  const rand = rngFrom(7);
  // 잔디
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      g.fillStyle = (r + col) % 2 === 0 ? "#5aa543" : "#62ad4a";
      g.fillRect(col * T, r * T, T, T);
      if (rand() < 0.25) {
        g.fillStyle = "#4e9639";
        g.fillRect(col * T + Math.floor(rand() * 12), r * T + Math.floor(rand() * 12), 2, 3);
      }
    }
  }
  // 도로
  const road = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = "#d8b878";
    g.fillRect(x, y, w, h);
    g.fillStyle = "#c9a866";
    for (let i = 0; i < (w * h) / 40; i++) {
      g.fillRect(x + Math.floor(rand() * w), y + Math.floor(rand() * h), 2, 1);
    }
  };
  road(8 * T, 0, 2 * T, H);
  road(0, 12 * T, W, 2 * T);
  // 건물 앞 광장
  road(SHOP.x - T, SHOP.y + SHOP.h - T, SHOP.w + 2 * T, T);

  const s = SHOP;
  if (center === "shop") {
    g.fillStyle = "#f2e6c9";
    g.fillRect(s.x, s.y + 1.5 * T, s.w, s.h - 1.5 * T);
    // 줄무늬 차양
    for (let i = 0; i < s.w / 8; i++) {
      g.fillStyle = i % 2 === 0 ? "#e0453a" : "#ffffff";
      g.fillRect(s.x + i * 8, s.y + T, 8, 10);
    }
    g.fillStyle = "#7a4a2a";
    g.fillRect(s.x - 2, s.y, s.w + 4, T);
    g.fillStyle = "#8fd3ff";
    g.fillRect(s.x + 6, s.y + 2.4 * T, 20, 14);
    g.fillRect(s.x + s.w - 26, s.y + 2.4 * T, 20, 14);
  } else {
    // 시청: 돌 건물 + 기둥 + 삼각 지붕 + 깃발
    g.fillStyle = "#e9e4da";
    g.fillRect(s.x, s.y + 1.2 * T, s.w, s.h - 1.2 * T);
    g.fillStyle = "#b9b2a5";
    for (let i = 0; i < s.h / 4; i++) g.fillRect(s.x, s.y + 1.2 * T + i * 6, s.w, 1);
    g.fillStyle = "#8c867b";
    for (let k = 0; k < 6; k++) g.fillRect(s.x + k * 2, s.y + 1.2 * T - k * 3, s.w - k * 4, 3);
    g.fillStyle = "#ffffff";
    for (let k = 0; k < 4; k++) g.fillRect(s.x + 8 + k * 18, s.y + 1.8 * T, 5, s.h - 2.2 * T);
    g.fillStyle = "#6b3e22";
    g.fillRect(s.x + s.w / 2 - 1, s.y - 10, 2, 12);
    g.fillStyle = "#4a86d9";
    g.fillRect(s.x + s.w / 2 + 1, s.y - 10, 9, 6);
  }
  g.fillStyle = "#6b3e22";
  g.fillRect(DOOR.x - 7, s.y + s.h - 22, 14, 22);

  // 동네: 집 2채 + 나무 + 꽃
  segNames.forEach((_, i) => {
    const z = segZones[i];
    const color = SEG_COLORS[i % SEG_COLORS.length];
    const house = (hx: number, hy: number) => {
      g.fillStyle = "#f5ead2";
      g.fillRect(hx + 2, hy + 18, 44, 26);
      g.fillStyle = color;
      for (let k = 0; k < 6; k++) g.fillRect(hx + k * 2, hy + 18 - k * 3, 48 - k * 4, 3);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(hx, hy + 18, 48, 2);
      g.fillStyle = "#6b3e22";
      g.fillRect(hx + 20, hy + 32, 9, 12);
      g.fillStyle = "#8fd3ff";
      g.fillRect(hx + 7, hy + 25, 8, 7);
      g.fillRect(hx + 33, hy + 25, 8, 7);
    };
    house(z.x + 6, z.y + 4);
    if (z.w >= 7 * T) house(z.x + z.w - 54, z.y + 4);
    for (let k = 0; k < 3; k++) {
      const tx = z.x + 8 + Math.floor(rand() * (z.w - 24));
      const ty = z.y + 3.5 * T + Math.floor(rand() * Math.max(8, z.h - 5 * T));
      g.fillStyle = "#6b3e22";
      g.fillRect(tx + 5, ty + 10, 4, 6);
      g.fillStyle = "#2f7a32";
      g.fillRect(tx, ty, 14, 11);
      g.fillStyle = "#3d9440";
      g.fillRect(tx + 2, ty - 3, 10, 6);
    }
    for (let k = 0; k < 6; k++) {
      g.fillStyle = ["#ffd84a", "#ff8fb1", "#ffffff"][k % 3];
      g.fillRect(z.x + 4 + Math.floor(rand() * (z.w - 8)), z.y + 3 * T + Math.floor(rand() * (z.h - 3.5 * T)), 2, 2);
    }
  });
  // 빈 동네는 공원(연못 + 나무)으로
  parks.forEach((z) => {
    const px = z.x + z.w / 2 - 36;
    const py = z.y + z.h / 2 - 24;
    g.fillStyle = "#3f86c9";
    g.fillRect(px + 6, py, 60, 48);
    g.fillRect(px, py + 6, 72, 36);
    g.fillStyle = "#5aa0dd";
    g.fillRect(px + 14, py + 10, 18, 4);
    g.fillRect(px + 40, py + 28, 14, 3);
    for (let k = 0; k < 6; k++) {
      const tx = z.x + 6 + Math.floor(rand() * (z.w - 20));
      const ty = k % 2 === 0 ? z.y + 6 + Math.floor(rand() * 20) : z.y + z.h - 30 + Math.floor(rand() * 12);
      g.fillStyle = "#6b3e22";
      g.fillRect(tx + 5, ty + 10, 4, 6);
      g.fillStyle = "#2f7a32";
      g.fillRect(tx, ty, 14, 11);
      g.fillStyle = "#3d9440";
      g.fillRect(tx + 2, ty - 3, 10, 6);
    }
  });
  return c;
}

const wanderArea = (z: Rect): Rect => ({
  x: z.x + 6,
  y: z.y + 3.5 * T,
  w: Math.max(8, z.w - 12),
  h: Math.max(8, z.h - 4 * T),
});

export default function Village2D({
  people,
  segments,
  ticks,
  tickUnit,
  centerName,
  center,
  statusAt,
  visitsAt,
  events,
  legend,
  priorityIds,
  footnote,
  onPick,
}: {
  people: VillagePerson[];
  segments: string[];
  ticks: number;
  tickUnit: string; // "주차" | "년차"
  centerName: string;
  center: "shop" | "hall";
  statusAt: (id: number, tick: number) => VillageStatus;
  visitsAt: (id: number, tick: number) => boolean; // 이 틱에 가운데 건물로 감
  events: VillageEvent[];
  legend: (tick: number) => VillageLegend[];
  priorityIds: number[]; // 표본에 먼저 넣을 사람 (사건 주인공)
  footnote?: string;
  onPick: (id: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(1);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const tickRef = useRef(tick);
  const playingRef = useRef(playing);
  const speedRef = useRef(speed);
  const statusRef = useRef(statusAt);
  tickRef.current = tick;
  playingRef.current = playing;
  speedRef.current = speed;
  statusRef.current = statusAt;

  // 표본: 사건 주인공을 먼저 넣고, 나머지는 그룹 비율대로.
  const sample = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    const picked = new Map<number, VillagePerson>();
    for (const id of priorityIds) {
      if (picked.size >= SAMPLE / 2) break;
      const p = byId.get(id);
      if (p) picked.set(id, p);
    }
    const rand = rngFrom(11);
    for (const seg of segments) {
      const group = people.filter((p) => p.segment === seg);
      const quota = Math.round((group.length / Math.max(1, people.length)) * SAMPLE);
      const shuffled = [...group].sort(() => rand() - 0.5);
      let have = Array.from(picked.values()).filter((p) => p.segment === seg).length;
      for (const p of shuffled) {
        if (have >= quota) break;
        if (!picked.has(p.id)) {
          picked.set(p.id, p);
          have++;
        }
      }
    }
    return Array.from(picked.values());
  }, [people, segments, priorityIds]);

  const layout = useMemo(() => assignZones(segments, people), [segments, people]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const agentsRef = useRef<Agent[]>([]);
  const mapRef = useRef<HTMLCanvasElement | null>(null);
  const scaleRef = useRef(1);

  // 에이전트 초기화 (결과가 바뀔 때마다)
  useEffect(() => {
    mapRef.current = drawMap(segments, center, layout.segZones, layout.parks);
    const zones = layout.segZones;
    const rand = rngFrom(3);
    const hairs = ["#2b1d14", "#4a2e1a", "#1c1c1c", "#7a4a2a", "#c8a165"];
    agentsRef.current = sample.map((person) => {
      const zi = Math.max(0, segments.indexOf(person.segment));
      const a = wanderArea(zones[zi]);
      const x = a.x + rand() * a.w;
      const y = a.y + rand() * a.h;
      return {
        person,
        zone: zi,
        x,
        y,
        tx: x,
        ty: y,
        path: [],
        mode: "wander" as Mode,
        wait: rand() * 1500,
        hair: hairs[Math.floor(rand() * hairs.length)],
        bubble: null,
        step: 0,
      };
    });
    setTick(1);
    setPlaying(true);
  }, [sample, segments, center, layout]);

  // 틱이 바뀌면: 방문할 사람은 가운데 건물로, 떠날 사람은 마을 밖으로,
  // 그 틱 사건은 말풍선.
  useEffect(() => {
    const now = performance.now();
    const bubbles = new Map<number, string>();
    // 말풍선은 틱당 최대 4개 — 화면이 말풍선으로 덮이지 않게
    for (const e of events) {
      if (e.tick === tick && bubbles.size < 4) bubbles.set(e.personId, e.bubble);
    }
    const zones = layoutRef.current.segZones;
    for (const ag of agentsRef.current) {
      const b = bubbles.get(ag.person.id);
      if (b) ag.bubble = { text: b, until: now + 2400 };
      const st = statusAt(ag.person.id, tick);
      if (st.gone) {
        if (ag.mode !== "leaving" && ag.mode !== "gone") {
          ag.mode = "leaving";
          ag.path = [
            { x: ROAD_X, y: ag.y },
            { x: ROAD_X, y: H + 24 },
          ];
        }
        continue;
      }
      if (ag.mode === "gone" || ag.mode === "leaving") {
        // 슬라이더로 과거로 돌아가면 다시 마을에 나타난다
        const a = wanderArea(zones[ag.zone]);
        ag.x = a.x + Math.random() * a.w;
        ag.y = a.y + Math.random() * a.h;
        ag.tx = ag.x;
        ag.ty = ag.y;
        ag.path = [];
        ag.mode = "wander";
      }
      if (visitsAt(ag.person.id, tick) && ag.mode === "wander") {
        ag.mode = "toCenter";
        ag.path = [
          { x: ROAD_X, y: ag.y },
          { x: ROAD_X, y: DOOR.y },
          { x: DOOR.x + (Math.random() * 2 - 1) * 24, y: DOOR.y + (Math.random() * 2 - 1) * 6 },
        ];
      }
    }
  }, [tick, events, statusAt, visitsAt, segments.length]);

  // 재생 타이머
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setTick((t) => {
        if (t >= ticks) {
          setPlaying(false);
          return t;
        }
        return t + 1;
      });
    }, TICK_MS / speed);
    return () => window.clearInterval(id);
  }, [playing, speed, ticks]);

  // 렌더 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let last = performance.now();
    const zones = layoutRef.current.segZones;

    const resize = () => {
      const cssW = wrap.clientWidth;
      const scale = cssW / W;
      scaleRef.current = scale;
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${H * scale}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(H * scale * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now: number) => {
      const dt = Math.min(64, now - last) * speedRef.current;
      last = now;
      const tk = tickRef.current;
      const moving = playingRef.current;
      const rand = Math.random;

      // 이동
      for (const ag of agentsRef.current) {
        if (ag.mode === "gone") continue;
        const sp = 0.028 * dt; // px/ms
        if (ag.mode === "toCenter" || ag.mode === "home" || ag.mode === "leaving") {
          const p = ag.path[0];
          if (!p) {
            if (ag.mode === "toCenter") {
              ag.mode = "atCenter";
              ag.wait = 1400;
            } else if (ag.mode === "leaving") {
              ag.mode = "gone";
            } else {
              ag.mode = "wander";
            }
          } else {
            const dx = p.x - ag.x;
            const dy = p.y - ag.y;
            const d = Math.hypot(dx, dy);
            if (d < sp) {
              ag.x = p.x;
              ag.y = p.y;
              ag.path.shift();
            } else {
              ag.x += (dx / d) * sp;
              ag.y += (dy / d) * sp;
              ag.step += dt;
            }
          }
        } else if (ag.mode === "atCenter") {
          ag.wait -= dt;
          if (ag.wait <= 0) {
            const a = wanderArea(zones[ag.zone]);
            const hy = a.y + rand() * a.h;
            ag.mode = "home";
            ag.path = [
              { x: ROAD_X, y: DOOR.y },
              { x: ROAD_X, y: hy },
              { x: a.x + rand() * a.w, y: hy },
            ];
          }
        } else if (moving) {
          const d = Math.hypot(ag.tx - ag.x, ag.ty - ag.y);
          if (d < 1) {
            ag.wait -= dt;
            if (ag.wait <= 0) {
              const a = wanderArea(zones[ag.zone]);
              ag.tx = a.x + rand() * a.w;
              ag.ty = a.y + rand() * a.h;
              ag.wait = 600 + rand() * 1800;
            }
          } else {
            const m = Math.min(sp * 0.6, d);
            ag.x += ((ag.tx - ag.x) / d) * m;
            ag.y += ((ag.ty - ag.y) / d) * m;
            ag.step += dt;
          }
        }
      }

      // 그리기
      const scale = scaleRef.current;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (mapRef.current) ctx.drawImage(mapRef.current, 0, 0);

      // 가운데 건물 간판
      ctx.fillStyle = "#3b2414";
      ctx.fillRect(SHOP.x + 6, SHOP.y + 2, SHOP.w - 12, 11);
      ctx.fillStyle = "#ffe9b0";
      ctx.font = "bold 7px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = centerName.length > 9 ? centerName.slice(0, 9) + "…" : centerName;
      ctx.fillText(label, SHOP.x + SHOP.w / 2, SHOP.y + 8);

      // 동네 표지판
      segments.forEach((name, i) => {
        const z = zones[i];
        const text = name.length > 8 ? name.slice(0, 8) + "…" : name;
        ctx.font = "bold 6.5px sans-serif";
        const tw = ctx.measureText(text).width + 8;
        const sx = z.x + z.w / 2;
        const sy = z.y + 3 * T + 2;
        ctx.fillStyle = "rgba(40,24,12,0.85)";
        ctx.fillRect(sx - tw / 2, sy - 5, tw, 10);
        ctx.fillStyle = SEG_COLORS[i % SEG_COLORS.length];
        ctx.fillRect(sx - tw / 2, sy - 5, 3, 10);
        ctx.fillStyle = "#fff6e0";
        ctx.fillText(text, sx + 1, sy);
      });

      // 사람 (y 정렬로 앞뒤)
      const sorted = agentsRef.current
        .filter((a) => a.mode !== "gone")
        .sort((a, b) => a.y - b.y);
      for (const ag of sorted) {
        const st = statusRef.current(ag.person.id, tk);
        const x = Math.round(ag.x);
        const y = Math.round(ag.y);
        const bob = Math.floor(ag.step / 160) % 2;
        ctx.globalAlpha = st.faded ? 0.55 : 1;
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.fillRect(x - 3, y + 1, 7, 2);
        ctx.fillStyle = "#2d2d4a";
        ctx.fillRect(x - 2, y - 3, 2, 3 + (bob ? 0 : -1));
        ctx.fillRect(x + 1, y - 3, 2, 3 + (bob ? -1 : 0));
        ctx.fillStyle = SEG_COLORS[ag.zone % SEG_COLORS.length];
        ctx.fillRect(x - 3, y - 8, 7, 5);
        ctx.fillStyle = "#f6c9a0";
        ctx.fillRect(x - 2, y - 13, 5, 5);
        ctx.fillStyle = ag.hair;
        ctx.fillRect(x - 2, y - 14, 5, 2);
        if (st.bag) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x + 4, y - 7, 3, 4);
          ctx.fillStyle = "#e0453a";
          ctx.fillRect(x + 4, y - 7, 3, 1);
        }
        ctx.globalAlpha = 1;
        if (st.icon) {
          ctx.fillStyle = st.iconColor ?? "#ffffff";
          ctx.font = "bold 7px sans-serif";
          ctx.fillText(st.icon, x + 0.5, y - 19);
        }
      }

      // 말풍선 (맨 위에)
      for (const ag of agentsRef.current) {
        if (!ag.bubble || ag.mode === "gone") continue;
        if (now > ag.bubble.until) {
          ag.bubble = null;
          continue;
        }
        ctx.font = "bold 6.5px sans-serif";
        const tw = ctx.measureText(ag.bubble.text).width + 8;
        const bx = Math.min(W - tw - 2, Math.max(2, ag.x - tw / 2));
        const by = ag.y - 34;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, by, tw, 11);
        ctx.fillRect(ag.x - 1, by + 11, 3, 3);
        ctx.fillStyle = "#1a1a1a";
        ctx.fillText(ag.bubble.text, bx + tw / 2, by + 5.5);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [segments, centerName, layout]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = scaleRef.current;
    const wx = (e.clientX - rect.left) / scale;
    const wy = (e.clientY - rect.top) / scale;
    let best: Agent | null = null;
    let bestD = 14;
    for (const ag of agentsRef.current) {
      if (ag.mode === "gone") continue;
      const d = Math.hypot(ag.x - wx, ag.y - 6 - wy);
      if (d < bestD) {
        bestD = d;
        best = ag;
      }
    }
    if (best) onPick(best.person.id);
  };

  const legendRows = useMemo(() => legend(tick), [legend, tick]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={wrapRef} className="w-full overflow-hidden rounded-2xl">
        <canvas
          ref={canvasRef}
          onPointerUp={onTap}
          className="block touch-manipulation"
          style={{ imageRendering: "pixelated" }}
        />
      </div>

      {/* 재생 컨트롤 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!playing && tick >= ticks) setTick(1);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "일시정지" : "재생"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-text-primary hover:bg-white/[0.2]"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M7 5l12 7-12 7z" />
            </svg>
          )}
        </button>
        <span className="w-12 shrink-0 text-[13px] text-text-primary">
          {tick}
          {tickUnit}
        </span>
        <input
          type="range"
          min={1}
          max={ticks}
          step={1}
          value={tick}
          onChange={(e) => {
            setPlaying(false);
            setTick(Number(e.target.value));
          }}
          className="min-w-0 flex-1 accent-white"
          aria-label={tickUnit}
        />
        <button
          type="button"
          onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
          className="shrink-0 rounded-full bg-white/[0.08] px-3 py-1.5 text-[12px] text-text-secondary hover:bg-white/[0.16]"
        >
          {speed}x
        </button>
      </div>

      {/* 범례 — 전체 인구 기준 */}
      <div
        className="grid gap-1 text-center text-[11px]"
        style={{ gridTemplateColumns: `repeat(${legendRows.length}, minmax(0, 1fr))` }}
      >
        {legendRows.map((l) => (
          <div key={l.label} className="flex flex-col rounded-xl bg-white/[0.04] py-1.5">
            <span className="text-[13px] font-bold" style={{ color: l.color }}>
              {l.icon}
            </span>
            <span className="text-text-secondary">{l.label}</span>
            <span className="text-text-primary">{l.n}명</span>
          </div>
        ))}
      </div>
      <p className="px-1 text-[11px] text-text-muted">
        마을엔 전체 {people.length}명 중 대표 {sample.length}명만 보여요. 주민을 탭하면 이유를 볼 수 있어요.
        {footnote ? ` ${footnote}` : ""}
      </p>
    </div>
  );
}

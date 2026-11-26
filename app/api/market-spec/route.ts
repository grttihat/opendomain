import { NextResponse } from "next/server";
import { callLLM, pickProvider } from "@/lib/llm";
import { modelFor } from "@/lib/constants";
import { normalizeSpec } from "@/lib/sim/market";

export const runtime = "nodejs";

// 아이디어 → 가상 시장 설정(MarketSpec). LLM은 여기서 한 번만 호출되고,
// 실제 NPC 행동은 클라이언트의 규칙 엔진(lib/sim/market.ts)이 계산한다.
const SYSTEM = `너는 시장 조사 설계자다. 사용자의 제품/서비스 아이디어를 읽고, 규칙 기반 소비자 시뮬레이션에 넣을 시장 설정을 JSON으로 만든다.

규칙:
- needs: 이 제품 카테고리에서 고객이 신경 쓰는 욕구 4~6개. key는 영문 snake_case, label은 짧은 한국어. 가격은 욕구에 넣지 마라(별도 계산됨). 설치 공간·사용 수고·배우기 쉬움 같은 부담도 "공간 절약"처럼 긍정형 욕구로 표현하라.
- segments: 현실적인 타깃 고객층 3~4개. share 합계 1. weights는 각 need의 중요도 0~1. budget은 이 카테고리에 한 달에 쓸 수 있는 돈(원). priceSensitivity·openness는 0~1.
- product: 아이디어 제품. price는 현실적인 판매가(원). benefits는 각 need 충족도 0~1 — 과장하지 말고 경쟁 대안과 비교해 냉정하게.
- product.reliability: 이 제품이 약속한 효과를 실제로 낼 확률 0~1. 아직 검증 안 된 기술·메커니즘이 있으면 낮게. reliabilityNote에 그 근거 한 문장.
- alternatives: 고객이 지금 쓰는 방식/경쟁 제품 2~3개. 첫 번째는 반드시 "지금 하던 방식"(price 0). 기존 방식이 의외로 충분히 좋다는 점을 과소평가하지 마라.
- adReach: 주당 광고로 제품을 알게 되는 고객 비율 0.02~0.15.
- productSummary: 제품을 한 문장으로.

출력 형식:
{"productSummary":"...","needs":[{"key":"time_saving","label":"시간 절약"}],"segments":[{"name":"...","share":0.3,"weights":{"time_saving":0.8},"budget":50000,"priceSensitivity":0.5,"openness":0.6}],"product":{"name":"...","price":89000,"benefits":{"time_saving":0.7},"reliability":0.6,"reliabilityNote":"..."},"alternatives":[{"name":"지금 하던 방식","price":0,"benefits":{"time_saving":0.2}}],"adReach":0.06}`;

export async function POST(req: Request) {
  const choice = pickProvider(req.headers.get("x-user-gemini-key"));
  if ("error" in choice) {
    return NextResponse.json({ error: choice.error }, { status: 500 });
  }
  let idea = "";
  try {
    const body = (await req.json()) as { idea?: string };
    idea = body.idea?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!idea) {
    return NextResponse.json({ error: "idea required" }, { status: 400 });
  }

  try {
    const content = await callLLM({
      provider: choice.provider,
      apiKey: choice.apiKey,
      model: modelFor(choice.provider, "pro"),
      temperature: 0.4,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `## 아이디어\n${idea}` },
      ],
    });
    const spec = normalizeSpec(JSON.parse(content));
    return NextResponse.json({ spec });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

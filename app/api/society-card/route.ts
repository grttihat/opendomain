import { NextResponse } from "next/server";
import { callLLM, pickProvider } from "@/lib/llm";
import { modelFor } from "@/lib/constants";
import { normalizeInventedCard } from "@/lib/sim/societyCrisis";

export const runtime = "nodejs";

// 사고확장기에서 발명한 해법 → 통치 게임 카드. 엔진이 아는 7개 레버로
// 번역되는 부분만 효과로 인정하고, 나머지는 "엔진이 모르는 효과"로 남긴다.
// 그래야 무엇이든 해결하는 마법 카드가 나오지 않는다.
const SYSTEM = `너는 정책 번역가다. 사용자가 발명한 해법 아이디어를, 사회 시뮬레이션 엔진이 이해하는 정책 레버 변화로 정직하게 옮긴다.

엔진이 아는 레버 (변화량으로 답한다, 현재 값에 더해짐):
- basicIncome: 전 국민 기본소득, 월 만원
- aiTax: AI·자동화로 늘어난 기업 이익에 매기는 세율, %p
- unemployBenefit: 실업급여 소득대체율, %p
- reskill: 직업 재훈련 예산, GDP 대비 %p (재취업 확률을 높임)
- minLiving: 최저생활 보장선, 월 만원
- taxRate: 소득세 평균 실효세율, %p
- topTax: 연 1억 초과분 추가세율, %p

규칙:
- 아이디어의 메커니즘이 실제로 바꾸는 레버만 고른다. 최대 2개.
- 크기는 현실적으로 작게: 한 번에 basicIncome·minLiving ±30 이내, aiTax·topTax·unemployBenefit ±20 이내, taxRate ±5 이내, reskill ±1 이내.
- 돈이 드는 해법이면 그 돈이 레버에 드러나야 한다(재훈련 예산 증가 등). 비용을 숨기지 마라.
- 레버로 옮겨지지 않는 효과(심리, 제도 설계, 문화 등)는 억지로 레버에 넣지 말고 unmodeled에 한 문장으로 적어라. 없으면 빈 문자열.
- title: 카드 이름 (12자 이내, 생활 언어). desc: 무엇을 하고 무엇을 감수하는지 한두 문장, 전문 용어 없이.

출력 형식:
{"title":"...","desc":"...","deltas":{"reskill":0.5,"aiTax":5},"unmodeled":"..."}`;

type Body = {
  idea?: { title?: string; summary?: string };
  crisis?: string | null;
  problem?: string | null;
};

export async function POST(req: Request) {
  const choice = pickProvider(req.headers.get("x-user-gemini-key"));
  if ("error" in choice) {
    return NextResponse.json({ error: choice.error }, { status: 500 });
  }
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const title = body.idea?.title?.trim() ?? "";
  const summary = body.idea?.summary?.trim() ?? "";
  if (!title && !summary) {
    return NextResponse.json({ error: "idea required" }, { status: 400 });
  }

  const user = [
    body.crisis ? `## 이 해법이 풀려는 위기\n${body.crisis}` : "",
    body.problem ? `## 문제 상황\n${body.problem}` : "",
    `## 발명한 해법\n${title}\n${summary}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const content = await callLLM({
      provider: choice.provider,
      apiKey: choice.apiKey,
      model: modelFor(choice.provider, "flash"),
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    });
    const card = normalizeInventedCard(JSON.parse(content), title);
    return NextResponse.json({ card });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { callLLM, pickProvider } from "@/lib/llm";
import { modelFor } from "@/lib/constants";
import { normalizeSocietySpec } from "@/lib/sim/society";

export const runtime = "nodejs";

// 제도·사상 아이디어 → 가상 사회 설정(SocietySpec). LLM은 여기서 한 번만
// 호출되고, 시민들의 행동은 클라이언트 규칙 엔진(lib/sim/society.ts)이 계산.
const SYSTEM = `너는 제도 설계 분석가다. 사용자의 사회제도·정책·사상 아이디어를 읽고, 규칙 기반 사회 시뮬레이션에 넣을 설정을 JSON으로 만든다. 특정 이념을 편들지 말고, 제도가 실제로 바꾸는 것만 냉정하게 수치로 옮겨라.

시뮬레이션은 AI 자동화로 일자리가 줄어드는 사회를 다룬다. 아래 7개 정책 수단만 이해한다. 모두 실제 단위다:
- basicIncome: 전 국민 기본소득, 월 만원 (0~200)
- aiTax: AI·자동화로 늘어난 기업 이익에 매기는 세율, % (0~60)
- unemployBenefit: 실업급여 소득대체율, % (0~90, 최대 2년)
- reskill: 직업 재훈련 예산, GDP 대비 % (0~3. 덴마크가 약 0.5)
- minLiving: 최저생활 보장선, 월 만원 (0~200). 가처분소득이 이보다 낮으면 채워준다.
- taxRate: 소득세 평균 실효세율, % (0~50)
- topTax: 연소득 1억 초과분 추가세율, %p (0~40)

규칙:
- baseline: 현재 한국. 사용자가 다른 나라를 말하지 않으면 반드시 이 값을 그대로 써라: {"taxRate":18,"topTax":15,"basicIncome":0,"minLiving":75,"unemployBenefit":60,"reskill":0.1,"aiTax":0}
- policy: 아이디어가 적용된 사회. 아이디어가 직접 말하는 수단만 바꾸고, 나머지는 baseline 값 그대로 둬라. 재원 마련 방법을 아이디어가 말하지 않았다면 세금을 임의로 올리지 마라 — 재정 적자도 시뮬레이션이 보여줄 결과다.
- 아이디어가 7개 수단으로 옮겨지지 않는 부분(예: 노동시간 단축, 국유화)은 가장 가까운 수단으로 억지로 옮기지 말고 policySummary에 "시뮬레이션에 반영되지 않음: ..."이라고 적어라.
- leverNotes: policy에서 baseline과 달라진 수단마다, 아이디어의 어떤 부분 때문에 그 값이 됐는지 한 문장.
- classes: 이 제도에 이해관계가 다른 계층 3~5개. share 합계 1. income은 세전 연소득(만원). capitalShare는 소득 중 사업·자본 비중. aiExposure는 그 계층의 일이 AI로 대체될 수 있는 정도 0~1(사무·상담·번역은 높고, 돌봄·현장 기술직은 낮음). values는 그 계층이 중시하는 가치(wealth 부, equality 평등, freedom 자유, security 안정) 0~1. honesty, mobility(해외로 떠날 능력), entrepreneurship 0~1.
- policyName: 짧은 이름. policySummary: 제도를 한두 문장으로.

출력 형식:
{"policyName":"...","policySummary":"...","classes":[{"name":"...","share":0.35,"income":3600,"capitalShare":0.02,"aiExposure":0.7,"values":{"wealth":0.7,"equality":0.8,"freedom":0.4,"security":0.9},"honesty":0.75,"mobility":0.05,"entrepreneurship":0.1}],"baseline":{...},"policy":{...},"leverNotes":{"basicIncome":"..."}}`;

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
      temperature: 0.3,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `## 제도·사상 아이디어\n${idea}` },
      ],
    });
    const spec = normalizeSocietySpec(JSON.parse(content));
    return NextResponse.json({ spec });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

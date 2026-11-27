import { NextResponse } from "next/server";
import { callLLM, pickProvider } from "@/lib/llm";
import { modelFor } from "@/lib/constants";
import { normalizeSocietySpec } from "@/lib/sim/society";

export const runtime = "nodejs";

// 제도·사상 아이디어 → 가상 사회 설정(SocietySpec). LLM은 여기서 한 번만
// 호출되고, 시민들의 행동은 클라이언트 규칙 엔진(lib/sim/society.ts)이 계산.
const SYSTEM = `너는 제도 설계 분석가다. 사용자의 사회제도·정책·사상 아이디어를 읽고, 규칙 기반 사회 시뮬레이션에 넣을 설정을 JSON으로 만든다. 특정 이념을 편들지 말고, 제도가 실제로 바꾸는 것만 냉정하게 수치로 옮겨라.

시뮬레이션은 아래 8개 정책 레버만 이해한다. 아이디어를 이 레버들로 번역하라:
- taxRate: 평균 소득세율 0~0.7
- progressivity: 누진성 0~1
- dividendShare: 세수 중 전 국민 균등 배당(기본소득 등) 비율 0~1. 나머지는 공공서비스.
- profitShare: 기업·자본 이익 중 사회로 환원되어 균등 배당되는 비율 0~0.8
- freedom: 경제·개인 자율성 0~1 (계획경제·강한 규제면 낮음)
- enforcement: 법 집행·탈세 단속 강도 0~1
- safetyNet: 최저 생활 보장 강도 0~1
- exitBarrier: 이민·이탈 장벽 0~1

규칙:
- baseline: 아이디어가 적용되기 전 "현재 사회" (특별한 언급 없으면 한국과 비슷하게: taxRate 0.22, progressivity 0.5, dividendShare 0.03, profitShare 0.03, freedom 0.7, enforcement 0.6, safetyNet 0.4, exitBarrier 0.5).
- policy: 아이디어가 적용된 사회. 아이디어가 건드리지 않는 레버는 baseline과 같게 둬라.
- leverNotes: policy에서 baseline과 달라진 레버마다, 아이디어의 어떤 부분 때문에 그 값이 됐는지 한 문장.
- classes: 이 제도에 이해관계가 다른 계층 3~5개. share 합계 1. income은 연 가처분 전 소득(만원). capitalShare는 소득 중 사업·자본 비중. values는 그 계층이 중시하는 가치(wealth 부, equality 평등, freedom 자유, security 안정) 0~1. honesty, mobility(해외로 떠날 능력), entrepreneurship 0~1.
- policyName: 짧은 이름. policySummary: 제도를 한두 문장으로.

출력 형식:
{"policyName":"...","policySummary":"...","classes":[{"name":"...","share":0.35,"income":2400,"capitalShare":0.02,"values":{"wealth":0.7,"equality":0.8,"freedom":0.4,"security":0.9},"honesty":0.75,"mobility":0.05,"entrepreneurship":0.1}],"baseline":{"taxRate":0.22,...},"policy":{"taxRate":0.25,...},"leverNotes":{"profitShare":"..."}}`;

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

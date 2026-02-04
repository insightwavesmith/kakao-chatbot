// 카카오 오픈빌더 스킬 API - 강의 내용 기반 RAG 챗봇
// POST /api/chat

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 카카오 스킬 응답 포맷 헬퍼
function kakaoResponse(text) {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: { text },
        },
      ],
    },
  };
}

// Gemini 임베딩 생성
async function getEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "models/text-embedding-004",
      content: { parts: [{ text }] },
    }),
  });

  if (!res.ok) {
    throw new Error(`Embedding API error: ${res.status}`);
  }

  const data = await res.json();
  return data.embedding.values;
}

// Supabase 벡터 검색
async function searchChunks(embedding) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/search_lecture_chunks`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify({
      query_embedding: embedding,
      match_count: 5,
    }),
  });

  if (!res.ok) {
    throw new Error(`Supabase search error: ${res.status}`);
  }

  return res.json();
}

// Gemini 답변 생성
async function generateAnswer(question, chunks) {
  const context = chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.source_file ? `(${c.source_file}) ` : ""}${c.content}`
    )
    .join("\n\n");

  const systemPrompt = `당신은 '자사몰사관학교' 메타 광고 강의 도우미입니다.

아래 강의 내용을 참고하여 수강생의 질문에 답변해주세요.

## 답변 원칙
- 한국어로 존댓말 사용
- 친절하지만 간결하게
- 실용적이고 구체적으로 답변 (추상적 조언 X)
- 강의 내용에 없는 질문이면 솔직하게 "강의에서 다룬 내용 중 관련 내용을 찾지 못했습니다"라고 답변
- 메타 광고 전문 지식 기반으로 정확하게 답변

## 참고 강의 내용
${context}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: question }],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini generate error: ${res.status}`);
  }

  const data = await res.json();
  const answer =
    data.candidates?.[0]?.content?.parts?.[0]?.text ||
    "답변을 생성하지 못했습니다.";
  return answer;
}

export default async function handler(req, res) {
  // POST만 허용
  if (req.method !== "POST") {
    return res.status(405).json(kakaoResponse("허용되지 않는 요청입니다."));
  }

  try {
    const utterance = req.body?.userRequest?.utterance;

    if (!utterance || utterance.trim() === "") {
      return res.status(200).json(kakaoResponse("질문을 입력해주세요."));
    }

    // 1. 임베딩 생성
    const embedding = await getEmbedding(utterance);

    // 2. 벡터 검색
    const chunks = await searchChunks(embedding);

    if (!chunks || chunks.length === 0) {
      return res
        .status(200)
        .json(
          kakaoResponse(
            "관련 강의 내용을 찾지 못했습니다. 다른 질문을 해주세요."
          )
        );
    }

    // 3. 답변 생성
    const answer = await generateAnswer(utterance, chunks);

    return res.status(200).json(kakaoResponse(answer));
  } catch (error) {
    console.error("Error:", error.message, error.stack);
    return res
      .status(200)
      .json(kakaoResponse("죄송합니다, 잠시 후 다시 시도해주세요."));
  }
}

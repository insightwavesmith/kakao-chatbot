const { createClient } = require('@supabase/supabase-js');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function kakaoResponse(text) {
  return {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
}

async function getEmbedding(text) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.embedding.values;
}

async function searchChunks(embedding) {
  const { data, error } = await supabase.rpc('search_lecture_chunks', {
    query_embedding: embedding,
    match_count: 5,
  });
  if (error) throw new Error(`Supabase RPC error: ${error.message}`);
  return data || [];
}

async function generateAnswer(question, chunks) {
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.content}`)
    .join('\n\n');

  const systemPrompt = `당신은 "자사몰사관학교"의 메타 광고 전문 교육 AI 어시스턴트입니다.

아래 강의 내용을 기반으로 수강생의 질문에 답변하세요.

답변 원칙:
- 한국어, 존댓말 사용
- 친절하지만 간결하게 답변
- 실용적이고 구체적으로 답변 (추상적 조언 X)
- 강의 내용에 없는 질문이면 솔직하게 "해당 질문과 관련된 강의 내용을 찾지 못했습니다. 보다 정확한 답변을 위해 질문을 구체적으로 남겨주시면 강사님이 직접 답변드리겠습니다." 라고 안내
- 답변은 카카오톡 메시지에 적합한 길이로 (너무 길지 않게)`;

  const userPrompt = `[강의 내용]
${context}

[수강생 질문]
${question}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    throw new Error('No response from Gemini');
  }
  return candidate.content.parts[0].text;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json(kakaoResponse('Method not allowed'));
  }

  try {
    const utterance = req.body?.userRequest?.utterance;
    if (!utterance || utterance.trim().length === 0) {
      return res.status(200).json(kakaoResponse('질문을 입력해 주세요.'));
    }

    console.log('[chat] question:', utterance);

    // 1. 임베딩 생성
    const embedding = await getEmbedding(utterance);
    console.log('[chat] embedding done, dim:', embedding.length);

    // 2. 벡터 검색
    const chunks = await searchChunks(embedding);
    console.log('[chat] chunks found:', chunks.length);

    if (chunks.length === 0) {
      return res.status(200).json(
        kakaoResponse('해당 질문과 관련된 강의 내용을 찾지 못했습니다. 보다 정확한 답변을 위해 질문을 구체적으로 남겨주시면 강사님이 직접 답변드리겠습니다.')
      );
    }

    // 3. Gemini로 답변 생성
    const answer = await generateAnswer(utterance, chunks);
    console.log('[chat] answer generated, length:', answer.length);

    return res.status(200).json(kakaoResponse(answer));
  } catch (err) {
    console.error('[chat] Error:', err.message);
    return res
      .status(200)
      .json(kakaoResponse('죄송합니다, 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'));
  }
};

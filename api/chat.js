import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

// 환경변수 확인
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// 클라이언트 초기화
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// 임베딩 모델
const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });

// 답변 생성 모델
const chatModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-05-20" });

// 카카오 스킬 응답 포맷
function createKakaoResponse(text) {
  return {
    version: "2.0",
    template: {
      outputs: [
        {
          simpleText: {
            text: text
          }
        }
      ]
    }
  };
}

// 에러 응답
function createErrorResponse() {
  return createKakaoResponse("죄송합니다, 잠시 후 다시 시도해주세요.");
}

// 임베딩 생성
async function generateEmbedding(text) {
  try {
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('임베딩 생성 에러:', error);
    throw error;
  }
}

// 벡터 검색
async function searchLectureChunks(embedding) {
  try {
    const { data, error } = await supabase.rpc('search_lecture_chunks', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 5
    });

    if (error) {
      console.error('벡터 검색 에러:', error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error('Supabase 검색 에러:', error);
    throw error;
  }
}

// 답변 생성
async function generateAnswer(question, context) {
  try {
    const contextText = context.map(chunk => chunk.content).join('\n\n');
    
    const prompt = `당신은 자사몰사관학교의 메타 광고 전문가입니다. 아래 강의 내용을 바탕으로 질문에 답변해주세요.

강의 내용:
${contextText}

질문: ${question}

답변 원칙:
- 한국어로 존댓말을 사용하세요
- 친절하지만 간결하게 답변하세요
- 강의 내용에서 찾을 수 없는 정보는 "관련 내용을 찾지 못했습니다"라고 솔직히 말하세요
- 실용적이고 구체적인 조언을 제공하세요
- 추상적인 조언은 피하세요
- 자사몰사관학교의 메타 광고 전문 지식을 기반으로 답변하세요

답변:`;

    const result = await chatModel.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('답변 생성 에러:', error);
    throw error;
  }
}

// 메인 핸들러
export default async function handler(req, res) {
  // POST 메서드만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    // 요청 파싱
    const { userRequest } = req.body;
    
    if (!userRequest || !userRequest.utterance) {
      return res.status(400).json(createErrorResponse());
    }

    const question = userRequest.utterance.trim();
    
    // 빈 질문 체크
    if (!question) {
      return res.json(createKakaoResponse("질문을 입력해주세요."));
    }

    console.log(`질문 받음: ${question}`);

    // RAG 파이프라인 실행
    // 1. 임베딩 생성
    const embedding = await generateEmbedding(question);
    console.log('임베딩 생성 완료');

    // 2. 벡터 검색
    const searchResults = await searchLectureChunks(embedding);
    console.log(`벡터 검색 완료: ${searchResults.length}개 결과`);

    // 3. 답변 생성
    if (searchResults.length === 0) {
      return res.json(createKakaoResponse("관련된 강의 내용을 찾지 못했습니다. 다른 질문을 시도해보세요."));
    }

    const answer = await generateAnswer(question, searchResults);
    console.log('답변 생성 완료');

    // 카카오 스킬 응답 반환
    return res.json(createKakaoResponse(answer));

  } catch (error) {
    console.error('API 에러:', error);
    return res.status(500).json(createErrorResponse());
  }
}

// OPTIONS 요청 처리 (CORS preflight)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
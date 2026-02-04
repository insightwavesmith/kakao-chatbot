# Kakao Chatbot with RAG

카카오톡 채널에서 강의 내용 기반 RAG(Retrieval-Augmented Generation)로 자동 답변하는 봇입니다.

## 기능

- 카카오 i 오픈빌더 스킬 API 지원
- Gemini 임베딩을 사용한 의미 검색
- Supabase 벡터 데이터베이스 활용
- Gemini 2.5 Flash로 자연어 답변 생성
- 자사몰사관학교 메타 광고 전문 지식 기반

## 배포

이 프로젝트는 Vercel에 배포됩니다.

### 환경변수

다음 환경변수들이 필요합니다:

- `GEMINI_API_KEY`: Google Gemini API 키
- `SUPABASE_URL`: Supabase 프로젝트 URL
- `SUPABASE_SERVICE_KEY`: Supabase 서비스 역할 키

### API 엔드포인트

- `POST /api/chat`: 카카오 스킬 API 엔드포인트

### 카카오 오픈빌더 설정

1. 카카오 i 오픈빌더에서 새 스킬 생성
2. 스킬 URL에 배포된 주소 입력: `https://your-domain.vercel.app/api/chat`
3. 스킬을 시나리오에 연결

## 응답 시간

카카오 스킬은 5초 타임아웃이 있습니다. 이 프로젝트는 Gemini Flash 모델을 사용하여 빠른 응답을 보장합니다.

## 라이센스

MIT
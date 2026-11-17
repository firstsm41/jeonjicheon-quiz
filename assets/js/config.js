// ─────────────────────────────────────────────────────────────
//  Supabase 연결 설정
//  아래 두 값을 본인 프로젝트 값으로 바꾸세요.
//  Supabase 대시보드 → Project Settings → API 에서 확인 가능합니다.
//
//  anon key 는 브라우저에 공개되는 것이 정상입니다.
//  (Row Level Security 정책으로 보호합니다 — schema.sql 참고)
// ─────────────────────────────────────────────────────────────

window.APP_CONFIG = {
  SUPABASE_URL: 'https://auctigvvtklbppskwaaf.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1Y3RpZ3Z2dGtsYnBwc2t3YWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NjIzNjAsImV4cCI6MjEwMDEzODM2MH0.5-cjtX-idz5zi1z14kZ7vzAPCwo1hX7DKeDebdSldBI',

  // 설문 회차 구분용. 새 기수/새 모임마다 값을 바꾸면 통계가 분리됩니다.
  QUIZ_SESSION: '2026-summer',
};

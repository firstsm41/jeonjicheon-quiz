# 이단 예방 퀴즈

강의 중 청중이 QR로 접속해 5문항을 풀면, **문항별로 사람들이 어떻게 답했는지**
실시간으로 모아 보여주는 웹앱입니다. 정적 사이트 + Supabase 조합이라 서버 관리가 필요 없습니다.

> **개인 점수는 매기지 않습니다.** 몇 개 맞혔는지, 등수가 어떻게 되는지는 어디에도 나오지
> 않습니다. 목적이 전체 인지도 파악이라 문항별 응답 분포만 집계합니다.
> 참여자는 답을 고르면 정답만 확인하고 넘어갑니다.

- **퀴즈 페이지** — `index.html`
- **QR 안내 포스터** (인쇄 · 빔프로젝터용) — `qr.html`
- **QR 이미지** — `qr.png`, `qr.svg`

모바일 화면 기준으로 만들었습니다. 휴대폰 브라우저에서 **홈 화면에 추가**하면
주소창 없이 앱처럼 전체 화면으로 열립니다 (`manifest.json`, `icon-*.png`).
아이콘을 바꾸려면 `icon-180/192/512.png` 세 장을 교체하면 됩니다.

---

## 1. Supabase 설정 (5분)

1. [supabase.com](https://supabase.com) 가입 → **New project** 생성
2. 왼쪽 메뉴 **SQL Editor** → `schema.sql` 내용을 붙여넣고 **Run**
3. **Project Settings → API** 에서 두 값을 복사
   - `Project URL`
   - `anon` `public` 키
4. `config.js` 를 열어 붙여넣기

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGci...',
  QUIZ_SESSION: '2026-summer',
};
```

> `anon` 키는 브라우저에 공개되는 것이 정상입니다.
> `schema.sql` 의 Row Level Security 정책이 읽기·쓰기만 허용하고 삭제는 막습니다.

**`QUIZ_SESSION`** 은 회차 구분용입니다. 새 모임마다 값을 바꾸면 통계가 분리되어
지난 기수 데이터와 섞이지 않습니다.

설정 전에도 앱은 동작합니다 — 다만 답안이 브라우저에만 저장되는 **오프라인 모드**가 되어
여러 명 누적 통계는 나오지 않습니다.

---

## 2. GitHub Pages 배포

```bash
git init
git add -A
git commit -m "이단 예방 퀴즈"
gh repo create <저장소이름> --public --source=. --push
```

GitHub 저장소 → **Settings → Pages** → Source 를 `main` 브랜치 `/ (root)` 로 지정합니다.

---

## 3. 전지천.com 연결

`CNAME` 파일에 도메인이 이미 들어 있습니다 (한글 도메인의 퓨니코드 표기):

```
xn--ly5bu5a00d.com
```

도메인 등록 기관(가비아 등) DNS 설정에서 아래 레코드를 추가하세요.

| 타입  | 호스트 | 값                     |
| ----- | ------ | ---------------------- |
| A     | @      | 185.199.108.153        |
| A     | @      | 185.199.109.153        |
| A     | @      | 185.199.110.153        |
| A     | @      | 185.199.111.153        |
| CNAME | www    | `<사용자명>.github.io.` |

그다음 **Settings → Pages → Custom domain** 에 `xn--ly5bu5a00d.com` 을 입력하고
**Enforce HTTPS** 를 켭니다. 인증서 발급까지 보통 10분~1시간 걸립니다.

---

## 문항 수정하기

`questions.js` 만 고치면 됩니다. `answer` 는 **0부터 시작하는** 인덱스입니다.

```js
{
  q: '질문 내용',
  options: ['①번 선택지', '②번 선택지', '③번', '④번'],
  answer: 1,           // ②번이 정답이라는 뜻
}
```

문항 개수는 자유롭게 늘리거나 줄일 수 있고, 선택지도 4개가 아니어도 됩니다.
단, 문항을 바꿨다면 `QUIZ_SESSION` 값도 함께 바꿔야 이전 응답과 섞이지 않습니다.

## QR 코드 다시 만들기

도메인이 바뀌었다면:

```bash
pip install segno
python3 -c "
import segno
q = segno.make('https://xn--ly5bu5a00d.com/', error='h')
q.save('qr.svg', scale=1, border=2, dark='#1a1030', light=None)
q.save('qr.png', scale=16, border=3, dark='#1a1030', light='#ffffff')
"
```

## 로컬에서 확인

```bash
python3 -m http.server 4321
# http://localhost:4321
```

## 결과 데이터 내려받기

Supabase 대시보드 → **Table Editor → responses** 에서 CSV 로 내보낼 수 있습니다.

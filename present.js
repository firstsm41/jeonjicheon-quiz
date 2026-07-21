/* ─────────────────────────────────────────────
   전체 결과 발표 페이지 — 강당 화면(빔프로젝터)용

   config.js / questions.js 를 그대로 재사용합니다.
   한 번에 한 문항씩 큰 화면으로 보여주고, 방향키나 화면 좌우
   클릭으로 넘깁니다. 새 응답은 실시간으로 반영됩니다.
   ───────────────────────────────────────────── */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const QUESTIONS = window.QUESTIONS || [];
  const SESSION = CFG.QUIZ_SESSION || 'default';

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const numMark = (i) => ['①', '②', '③', '④', '⑤', '⑥'][i] || i + 1 + '.';
  const isText = (q) => q && q.type === 'text';
  const norm = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  const rateColor = (r) =>
    r >= 70 ? 'var(--good)' : r >= 40 ? 'var(--accent-2)' : 'var(--bad)';
  function isAccepted(q, value) {
    const v = norm(value);
    if (!v) return false;
    return [q.answer, ...(q.accept || [])].map(norm).includes(v);
  }

  const configured =
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
    !CFG.SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');
  const db =
    configured && window.supabase
      ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
      : null;

  let rows = [];
  let page = 0; // 0 = 표지, 1..N = 문항
  const PAGES = QUESTIONS.length + 1;

  // ── 데이터 ────────────────────────────────────────────
  async function fetchRows() {
    if (!db) {
      rows = JSON.parse(localStorage.getItem('jjc-quiz-local') || '[]');
      return;
    }
    let { data, error } = await db
      .from('responses')
      .select('answers, open_answers')
      .eq('session', SESSION)
      .limit(5000);
    if (error) {
      ({ data, error } = await db
        .from('responses')
        .select('answers')
        .eq('session', SESSION)
        .limit(5000));
    }
    if (error) {
      console.error('[present] 조회 실패', error.message || error);
      return;
    }
    rows = data || [];
  }

  // ── 렌더 ──────────────────────────────────────────────
  function render() {
    $('total').textContent = rows.length;
    renderDots();

    const slide = $('slide');
    slide.innerHTML = '';
    slide.classList.remove('turn');
    void slide.offsetWidth;
    slide.classList.add('turn');

    if (page === 0) slide.appendChild(coverSlide());
    else slide.appendChild(questionSlide(QUESTIONS[page - 1], page - 1));

    $('prev').disabled = page === 0;
    $('next').disabled = page === PAGES - 1;
  }

  function renderDots() {
    const box = $('dots');
    box.innerHTML = '';
    for (let i = 0; i < PAGES; i++) {
      const d = el('i', i === page ? 'on' : '');
      box.appendChild(d);
    }
  }

  function coverSlide() {
    const wrap = el('div', 'cover');
    const big = el('div', 'big');
    big.textContent = rows.length;
    const cap = el('div', 'cap');
    cap.textContent = '명이 참여했습니다';
    const sub = el('div', 'sub');
    sub.textContent = '지금부터 문항별 응답 결과를 함께 보겠습니다';
    wrap.append(big, cap, sub);
    return wrap;
  }

  function questionSlide(q, i) {
    const wrap = el('div');

    const head = el('div', 'q-head');
    const tag = el('div', 'q-tag');
    tag.textContent = 'Q' + (i + 1) + (isText(q) ? ' · 주관식' : '');
    const title = el('div', 'q-title');
    title.textContent = q.q;
    head.append(tag, title);

    if (isText(q)) {
      const { rate } = tallyText(q, i);
      head.appendChild(rateBadge(rate));
      wrap.appendChild(head);
      wrap.appendChild(textBody(q, i));
    } else {
      const { rate } = tallyChoice(q, i);
      head.appendChild(rateBadge(rate));
      wrap.appendChild(head);
      wrap.appendChild(choiceBody(q, i));
    }
    return wrap;
  }

  function rateBadge(rate) {
    const box = el('div', 'q-rate');
    const b = el('b');
    b.textContent = Math.round(rate) + '%';
    b.style.color = rateColor(rate);
    const s = el('span');
    s.textContent = '정답률';
    box.append(b, s);
    return box;
  }

  // 객관식 집계 · 본문
  function tallyChoice(q, i) {
    const counts = Array(q.options.length).fill(0);
    let answered = 0;
    rows.forEach((r) => {
      const a = (r.answers || [])[i];
      if (a != null && a >= 0 && a < counts.length) {
        counts[a]++;
        answered++;
      }
    });
    const rate = answered ? (counts[q.answer] / answered) * 100 : 0;
    const max = counts.reduce((m, c) => Math.max(m, c), 0);
    return { counts, answered, rate, max };
  }

  function choiceBody(q, i) {
    const { counts, max } = tallyChoice(q, i);
    const opts = el('div', 'opts');
    q.options.forEach((text, k) => {
      const row = el('div', 'opt-row' + (k === q.answer ? ' is-answer' : ''));
      const fill = el('div', 'fillbar');
      fill.style.width = (max ? (counts[k] / max) * 100 : 0) + '%';
      const key = el('div', 'opt-key');
      key.textContent = k + 1;
      const t = el('div', 'opt-text');
      t.textContent = text;
      const c = el('div', 'opt-count');
      c.textContent = counts[k] + '명';
      row.append(fill, key, t, c);
      opts.appendChild(row);
    });
    return opts;
  }

  // 주관식 집계 · 본문
  function tallyText(q, i) {
    const groups = new Map();
    let answered = 0;
    let correct = 0;
    rows.forEach((r) => {
      const raw = (r.open_answers || {})[i];
      const v = norm(raw);
      if (!v) return;
      answered++;
      const ok = isAccepted(q, raw);
      if (ok) correct++;
      const key = ok ? '__answer__' : v;
      if (!groups.has(key)) {
        groups.set(key, { label: ok ? q.answer : raw.toString().trim(), count: 0, ok });
      }
      groups.get(key).count++;
    });
    const list = [...groups.values()].sort((a, b) => b.count - a.count);
    const rate = answered ? (correct / answered) * 100 : 0;
    return { list, answered, rate };
  }

  function textBody(q, i) {
    const { list } = tallyText(q, i);
    const wrap = el('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = 'clamp(14px,2vh,26px)';
    wrap.style.minHeight = '0';

    const ans = el('div', 'subj-answer');
    const k = el('span', 'k');
    k.textContent = '정답 · ';
    const b = el('b');
    b.textContent = q.answer;
    ans.append(k, b);
    wrap.appendChild(ans);

    if (list.length === 0) {
      const empty = el('div', 'subj-empty');
      empty.textContent = '아직 응답이 없습니다.';
      wrap.appendChild(empty);
      return wrap;
    }

    const listBox = el('div', 'subj-list');
    list.slice(0, 24).forEach((g) => {
      const chip = el('div', 'chip' + (g.ok ? ' ok' : ''));
      const label = el('span');
      label.textContent = (g.ok ? '✓ ' : '') + g.label;
      const n = el('span', 'n');
      n.textContent = g.count;
      chip.append(label, n);
      listBox.appendChild(chip);
    });
    wrap.appendChild(listBox);
    return wrap;
  }

  // ── 내비게이션 ────────────────────────────────────────
  function go(p) {
    page = Math.max(0, Math.min(PAGES - 1, p));
    render();
  }
  $('prev').addEventListener('click', () => go(page - 1));
  $('next').addEventListener('click', () => go(page + 1));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') go(page + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(page - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(PAGES - 1);
  });

  // 화면 좌/우 절반을 누르면 이전/다음 (내비 버튼 클릭은 제외)
  $('slide').addEventListener('click', (e) => {
    const x = e.clientX / window.innerWidth;
    go(x < 0.5 ? page - 1 : page + 1);
  });

  // 안내 문구는 잠시 뒤 사라짐
  setTimeout(() => $('hint').classList.add('gone'), 6000);

  // ── 실시간 ────────────────────────────────────────────
  function subscribe() {
    if (!db) return;
    db.channel('present-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        () => fetchRows().then(render)
      )
      .subscribe();
    // 안전망
    setInterval(() => fetchRows().then(render), 15000);
  }

  // ── 시작 ──────────────────────────────────────────────
  if (!configured) {
    console.warn('[present] Supabase 미설정 — 이 기기의 로컬 응답만 표시합니다.');
  }
  fetchRows().then(() => {
    go(0);
    subscribe();
  });
})();

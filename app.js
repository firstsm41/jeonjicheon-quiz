/* ─────────────────────────────────────────────
   전지천 이단 예방 퀴즈 — 앱 로직
   ───────────────────────────────────────────── */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const QUESTIONS = window.QUESTIONS || [];
  const TOTAL = QUESTIONS.length;
  const KEY_ROW = 'jjc-quiz-row-' + (CFG.QUIZ_SESSION || 'default');

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };

  // ── Supabase 연결 (설정이 비어 있으면 오프라인 모드) ──────────
  const configured =
    CFG.SUPABASE_URL &&
    CFG.SUPABASE_ANON_KEY &&
    !CFG.SUPABASE_URL.includes('YOUR-PROJECT-REF') &&
    !CFG.SUPABASE_ANON_KEY.includes('YOUR-ANON-KEY');

  const db =
    configured && window.supabase
      ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
      : null;

  // ── 상태 ──────────────────────────────────────────────
  let idx = 0; // 현재 문항
  let picked = null; // 현재 선택지
  let locked = false; // 채점 완료 여부
  let answers = []; // 사용자의 답안 (인덱스 배열)
  let rows = []; // 서버에서 받은 전체 응답
  let statsOpen = false;

  // ── 화면 전환 ─────────────────────────────────────────
  function show(name) {
    document
      .querySelectorAll('.screen')
      .forEach((s) => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    statsOpen = name === 'stats';
    if (statsOpen) refreshStats();
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ── 퀴즈 렌더링 ───────────────────────────────────────
  function renderQuestion() {
    const q = QUESTIONS[idx];
    picked = null;
    locked = false;

    $('q-now').textContent = idx + 1;
    $('q-total').textContent = TOTAL;
    $('q-score').textContent = '맞힌 개수 ' + correctCount(answers);
    $('q-bar').style.width = (idx / TOTAL) * 100 + '%';
    $('q-text').textContent = q.q;
    $('q-feedback').innerHTML = '';

    const box = $('q-options');
    box.innerHTML = '';
    q.options.forEach((text, i) => {
      const b = el('button', 'opt');
      b.type = 'button';
      const num = el('span', 'num');
      num.textContent = i + 1;
      const label = el('span');
      label.textContent = text;
      b.append(num, label);
      b.addEventListener('click', () => choose(i));
      box.appendChild(b);
    });

    const next = $('btn-next');
    next.disabled = true;
    next.textContent = '답안 확인';
  }

  function choose(i) {
    if (locked) return;
    picked = i;
    [...$('q-options').children].forEach((n, k) =>
      n.classList.toggle('selected', k === i)
    );
    $('btn-next').disabled = false;
  }

  function grade() {
    const q = QUESTIONS[idx];
    locked = true;
    answers[idx] = picked;

    [...$('q-options').children].forEach((n, k) => {
      n.classList.add('locked');
      n.classList.remove('selected');
      if (k === q.answer) n.classList.add('correct');
      else if (k === picked) n.classList.add('wrong');
    });

    const ok = picked === q.answer;
    const fb = el('div', 'feedback ' + (ok ? 'ok' : 'no'));
    const v = el('span', 'verdict');
    v.textContent = ok ? '✓ 정답입니다' : '✗ 다시 살펴볼까요';
    const p = el('p');
    p.textContent = q.explain;
    fb.append(v, p);
    $('q-feedback').innerHTML = '';
    $('q-feedback').appendChild(fb);

    $('q-score').textContent = '맞힌 개수 ' + correctCount(answers);
    $('q-bar').style.width = ((idx + 1) / TOTAL) * 100 + '%';
    $('btn-next').textContent = idx + 1 < TOTAL ? '다음 문항 →' : '결과 확인하기';
  }

  function correctCount(list) {
    return QUESTIONS.reduce((n, q, i) => n + (list[i] === q.answer ? 1 : 0), 0);
  }

  $('btn-next').addEventListener('click', () => {
    if (!locked) {
      grade();
      return;
    }
    if (idx + 1 < TOTAL) {
      idx++;
      renderQuestion();
    } else {
      finish();
    }
  });

  // ── 결과 ──────────────────────────────────────────────
  const TIERS = [
    { min: 5, title: '완벽합니다! 🎉', desc: '이단의 핵심 특징을 정확히 분별하고 계십니다. 이제 곁에 있는 친구에게도 알려주세요.' },
    { min: 4, title: '든든합니다 👏', desc: '기본기가 탄탄합니다. 놓친 한 문항의 해설을 한 번만 더 읽어보면 완벽해요.' },
    { min: 3, title: '절반은 넘었어요 🙂', desc: '방향은 맞습니다. 아래 해설을 차분히 읽으며 헷갈린 부분을 정리해 봅시다.' },
    { min: 1, title: '지금이 배울 때 📖', desc: '모르는 것은 부끄러운 일이 아닙니다. 해설을 읽고 공동체에서 함께 나눠보세요.' },
    { min: 0, title: '함께 시작해요 🌱', desc: '오늘이 첫걸음입니다. 해설을 천천히 읽고, 궁금한 점은 목회자에게 물어보세요.' },
  ];

  function finish() {
    const score = correctCount(answers);

    // 점수 링
    const r = 52;
    const c = 2 * Math.PI * r;
    const ring = $('score-ring');
    ring.style.strokeDasharray = c;
    ring.style.strokeDashoffset = c;
    $('score-num').textContent = score;
    $('score-den').textContent = '/ ' + TOTAL + ' 문항';
    requestAnimationFrame(() =>
      setTimeout(() => {
        ring.style.strokeDashoffset = c * (1 - score / TOTAL);
      }, 120)
    );

    const tier = TIERS.find((t) => score >= t.min);
    $('score-title').textContent = tier.title;
    $('score-desc').textContent = tier.desc;

    // 문항별 해설
    const box = $('review');
    box.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
      const ok = answers[i] === q.answer;
      const item = el('div', 'review-item');

      const head = el('div', 'head');
      const badge = el('span', 'badge ' + (ok ? 'ok' : 'no'));
      badge.textContent = ok ? '✓' : '✗';
      const ht = el('span');
      ht.textContent = 'Q' + (i + 1);
      head.append(badge, ht);

      const qt = el('div', 'q');
      qt.textContent = q.q;

      const ans = el('div', 'ans');
      if (ok) {
        const k = el('span', 'k');
        k.textContent = '내 답 · ';
        const right = el('span', 'right');
        right.textContent = numMark(q.answer) + ' ' + q.options[q.answer];
        ans.append(k, right);
      } else {
        const k1 = el('span', 'k');
        k1.textContent = '내 답 · ';
        const mine = el('span', 'mine');
        mine.textContent =
          answers[i] == null
            ? '무응답'
            : numMark(answers[i]) + ' ' + q.options[answers[i]];
        const br = el('br');
        const k2 = el('span', 'k');
        k2.textContent = '정답 · ';
        const right = el('span', 'right');
        right.textContent = numMark(q.answer) + ' ' + q.options[q.answer];
        ans.append(k1, mine, br, k2, right);
      }

      const why = el('p', 'why');
      why.textContent = q.explain;

      item.append(head, qt, ans, why);
      box.appendChild(item);
    });

    show('result');
    submit(score);
  }

  function numMark(i) {
    return ['①', '②', '③', '④', '⑤', '⑥'][i] || i + 1 + '.';
  }

  // ── 서버 저장 ─────────────────────────────────────────
  async function submit(score) {
    const payload = {
      session: CFG.QUIZ_SESSION || 'default',
      answers: answers.map((a) => (a == null ? -1 : a)),
      score,
    };

    if (!db) {
      // 오프라인 모드: 브라우저에만 저장
      const local = JSON.parse(localStorage.getItem('jjc-quiz-local') || '[]');
      local.push({ ...payload, created_at: new Date().toISOString() });
      localStorage.setItem('jjc-quiz-local', JSON.stringify(local));
      return;
    }

    try {
      const prev = localStorage.getItem(KEY_ROW);
      if (prev) {
        // 같은 기기에서 다시 풀면 기존 기록을 갱신 (인원 중복 방지)
        const { error } = await db.from('responses').update(payload).eq('id', prev);
        if (error) throw error;
      } else {
        const { data, error } = await db
          .from('responses')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        localStorage.setItem(KEY_ROW, data.id);
      }
    } catch (e) {
      console.error('[quiz] 저장 실패', e);
      toast('결과 저장에 실패했어요. 통계에 반영되지 않을 수 있습니다.');
    }
  }

  // ── 통계 ──────────────────────────────────────────────
  async function fetchRows() {
    if (!db) {
      rows = JSON.parse(localStorage.getItem('jjc-quiz-local') || '[]');
      return;
    }
    const { data, error } = await db
      .from('responses')
      .select('answers, score')
      .eq('session', CFG.QUIZ_SESSION || 'default')
      .limit(5000);
    if (error) {
      console.error('[quiz] 통계 조회 실패', error);
      return;
    }
    rows = data || [];
  }

  async function refreshStats() {
    await fetchRows();
    renderStats();
  }

  let lastTotal = -1;

  function renderStats() {
    const n = rows.length;
    $('intro-count').textContent = n;

    const body = $('stats-body');
    if (n === 0) {
      body.innerHTML =
        '<div class="card empty"><span class="big">🫧</span>아직 참여한 사람이 없습니다.<br />첫 번째로 퀴즈를 풀어보세요!</div>';
      lastTotal = 0;
      return;
    }
    // 빈 화면이었다면 원래 마크업 복구
    if (!$('s-total')) {
      body.innerHTML = STATS_MARKUP;
    }

    const scores = rows.map((r) => r.score || 0);
    const sum = scores.reduce((a, b) => a + b, 0);
    const perfect = scores.filter((s) => s === TOTAL).length;

    $('s-total').textContent = n;
    $('s-avg').textContent = (sum / n).toFixed(1);
    $('s-perfect').textContent = perfect;

    if (lastTotal >= 0 && n > lastTotal) {
      const b = $('s-total');
      b.classList.remove('bump');
      void b.offsetWidth;
      b.classList.add('bump');
    }
    lastTotal = n;

    // 점수 분포
    const buckets = Array(TOTAL + 1).fill(0);
    scores.forEach((s) => {
      if (s >= 0 && s <= TOTAL) buckets[s]++;
    });
    const peak = Math.max(...buckets);
    const dist = $('dist');
    const labels = $('dist-labels');
    dist.innerHTML = '';
    labels.innerHTML = '';
    buckets.forEach((v, s) => {
      const col = el('div', 'col' + (v === peak && v > 0 ? ' peak' : ''));
      const num = el('span', 'n');
      num.textContent = v || '';
      const bar = el('div', 'bar');
      bar.style.height = peak ? Math.max(4, (v / peak) * 88) + '%' : '4px';
      col.append(num, bar);
      dist.appendChild(col);

      const lb = el('span');
      lb.textContent = s + '점';
      labels.appendChild(lb);
    });

    // 문항별 정답률
    const box = $('qstats');
    box.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
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

      const card = el('div', 'qstat');

      const top = el('div', 'top');
      const label = el('div', 'label');
      const tag = el('i');
      tag.textContent = 'Q' + (i + 1);
      label.appendChild(tag);
      label.appendChild(document.createTextNode(q.q));
      const rt = el('div', 'rate');
      rt.textContent = Math.round(rate) + '%';
      rt.style.color = rate >= 70 ? 'var(--good)' : rate >= 40 ? 'var(--accent-2)' : 'var(--bad)';
      top.append(label, rt);

      const meter = el('div', 'meter');
      const fill = el('i');
      fill.style.width = rate + '%';
      fill.style.background =
        rate >= 70
          ? 'linear-gradient(90deg,#4ade80,#86efac)'
          : rate >= 40
          ? 'linear-gradient(90deg,#f0b23f,#fcd34d)'
          : 'linear-gradient(90deg,#fb7185,#fda4af)';
      meter.appendChild(fill);

      const bd = el('div', 'breakdown');
      counts.forEach((c, k) => {
        const pct = answered ? (c / answered) * 100 : 0;
        const row = el('div', 'brow' + (k === q.answer ? ' is-answer' : ''));
        const key = el('span', 'k');
        key.textContent = k + 1;
        const track = el('div', 'track');
        const ti = el('i');
        ti.style.width = pct + '%';
        track.appendChild(ti);
        const v = el('span', 'v');
        v.textContent = c + '명';
        row.append(key, track, v);
        bd.appendChild(row);
      });

      card.append(top, meter, bd);
      box.appendChild(card);
    });
  }

  // 빈 상태에서 복구하기 위해 원본 마크업을 보관
  const STATS_MARKUP = $('stats-body').innerHTML;

  // ── 실시간 구독 ───────────────────────────────────────
  function subscribe() {
    if (!db) {
      $('live-badge').style.display = 'none';
      return;
    }
    db.channel('responses-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        () => {
          if (statsOpen) refreshStats();
          else fetchRows().then(() => ($('intro-count').textContent = rows.length));
        }
      )
      .subscribe();

    // 실시간이 끊겼을 때를 대비한 안전망
    setInterval(() => {
      if (statsOpen) refreshStats();
    }, 20000);
  }

  // ── 버튼 배선 ─────────────────────────────────────────
  $('btn-start').addEventListener('click', () => {
    idx = 0;
    answers = [];
    renderQuestion();
    show('quiz');
  });

  $('btn-retry').addEventListener('click', () => {
    idx = 0;
    answers = [];
    renderQuestion();
    show('quiz');
  });

  $('btn-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    const data = { title: '이단 예방 퀴즈', text: '나도 한번 풀어볼래?', url };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(url);
        toast('링크를 복사했습니다');
      }
    } catch (_) {
      /* 사용자가 취소한 경우 */
    }
  });

  document.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => show(b.dataset.goto))
  );

  // ── 시작 ──────────────────────────────────────────────
  if (!configured) {
    console.warn('[quiz] config.js 에 Supabase 정보가 없어 오프라인 모드로 동작합니다.');
  }
  fetchRows().then(renderStats);
  subscribe();
})();

/* ─────────────────────────────────────────────
   이단 예방 퀴즈 — 앱 로직

   점수를 매기는 앱이 아닙니다. 강의 중 청중의 전체 인지도를
   빠르게 파악하는 것이 목적이라, 개인 점수는 어디에도 표시하지 않고
   문항별 응답 분포만 모아서 보여줍니다.
   ───────────────────────────────────────────── */
(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const QUESTIONS = window.QUESTIONS || [];
  const TOTAL = QUESTIONS.length;
  const KEY_ROW = 'jjc-quiz-row-' + (CFG.QUIZ_SESSION || 'default');
  const KEY_LOCAL = 'jjc-quiz-local';

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const numMark = (i) => ['①', '②', '③', '④', '⑤', '⑥'][i] || i + 1 + '.';

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
  let locked = false; // 정답 공개 여부
  let answers = []; // 이번 참여자의 답안
  let rows = []; // 전체 응답
  let statsOpen = false;

  // ── 화면 전환 ─────────────────────────────────────────
  function show(name) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
    window.scrollTo(0, 0);
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

  // ── 퀴즈 ──────────────────────────────────────────────
  function renderQuestion() {
    const q = QUESTIONS[idx];
    picked = null;
    locked = false;

    $('q-now').textContent = idx + 1;
    $('q-total').textContent = TOTAL;
    $('q-bar').style.width = (idx / TOTAL) * 100 + '%';
    $('q-text').textContent = q.q;

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
    next.textContent = '정답 확인';
  }

  function choose(i) {
    if (locked) return;
    picked = i;
    [...$('q-options').children].forEach((n, k) =>
      n.classList.toggle('selected', k === i)
    );
    $('btn-next').disabled = false;
  }

  // 정답만 표시합니다. 해설이나 맞고 틀림에 대한 문구는 두지 않습니다.
  function reveal() {
    const q = QUESTIONS[idx];
    locked = true;
    answers[idx] = picked;

    [...$('q-options').children].forEach((n, k) => {
      n.classList.add('locked');
      n.classList.remove('selected');
      if (k === q.answer) n.classList.add('correct');
      else if (k === picked) n.classList.add('wrong');
    });

    $('q-bar').style.width = ((idx + 1) / TOTAL) * 100 + '%';
    $('btn-next').textContent = idx + 1 < TOTAL ? '다음 문항 →' : '제출하기';
  }

  $('btn-next').addEventListener('click', () => {
    if (!locked) {
      reveal();
      return;
    }
    if (idx + 1 < TOTAL) {
      idx++;
      renderQuestion();
    } else {
      finish();
    }
  });

  // ── 제출 · 정답 목록 ──────────────────────────────────
  function finish() {
    const box = $('review');
    box.innerHTML = '';
    QUESTIONS.forEach((q, i) => {
      const item = el('div', 'review-item');

      const head = el('div', 'head');
      head.textContent = 'Q' + (i + 1);

      const qt = el('div', 'q');
      qt.textContent = q.q;

      const ans = el('div', 'ans');
      const k = el('span', 'k');
      k.textContent = '정답 · ';
      const right = el('span', 'right');
      right.textContent = numMark(q.answer) + ' ' + q.options[q.answer];
      ans.append(k, right);

      item.append(head, qt, ans);
      box.appendChild(item);
    });

    show('result');
    submit();
  }

  async function submit() {
    const payload = {
      session: CFG.QUIZ_SESSION || 'default',
      answers: answers.map((a) => (a == null ? -1 : a)),
    };

    if (!db) {
      // 오프라인 모드: 브라우저에만 저장
      const local = JSON.parse(localStorage.getItem(KEY_LOCAL) || '[]');
      local.push(payload);
      localStorage.setItem(KEY_LOCAL, JSON.stringify(local));
      return;
    }

    try {
      const prev = localStorage.getItem(KEY_ROW);
      if (prev) {
        // 같은 기기에서 다시 풀면 인원이 중복되지 않도록 기존 기록을 갱신
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
      toast('응답 저장에 실패했어요. 통계에 반영되지 않을 수 있습니다.');
    }
  }

  // ── 전체 응답 현황 ────────────────────────────────────
  async function fetchRows() {
    if (!db) {
      rows = JSON.parse(localStorage.getItem(KEY_LOCAL) || '[]');
      return;
    }
    const { data, error } = await db
      .from('responses')
      .select('answers')
      .eq('session', CFG.QUIZ_SESSION || 'default')
      .limit(5000);
    if (error) {
      console.error('[quiz] 응답 조회 실패', error);
      return;
    }
    rows = data || [];
  }

  async function refreshStats() {
    await fetchRows();
    renderStats();
  }

  const STATS_MARKUP = $('stats-body').innerHTML;
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
    if (!$('s-total')) body.innerHTML = STATS_MARKUP; // 빈 화면이었다면 복구

    $('s-total').textContent = n;
    if (lastTotal >= 0 && n > lastTotal) {
      const b = $('s-total');
      b.classList.remove('bump');
      void b.offsetWidth;
      b.classList.add('bump');
    }
    lastTotal = n;

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
      rt.style.color =
        rate >= 70 ? 'var(--good)' : rate >= 40 ? 'var(--accent-2)' : 'var(--bad)';
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

      // 선택지별 응답 분포 — 어느 오답으로 많이 몰렸는지 보이는 부분
      const bd = el('div', 'breakdown');
      counts.forEach((c, k) => {
        const pct = answered ? (c / answered) * 100 : 0;
        const row = el('div', 'brow' + (k === q.answer ? ' is-answer' : ''));
        const key = el('span', 'k');
        key.textContent = k + 1;
        const text = el('span', 'otext');
        text.textContent = q.options[k];
        const track = el('div', 'track');
        const ti = el('i');
        ti.style.width = pct + '%';
        track.appendChild(ti);
        const v = el('span', 'v');
        v.textContent = c + '명';
        row.append(key, text, v, track); // 그리드 배치 순서: 글 → 인원 → 막대
        bd.appendChild(row);
      });

      card.append(top, meter, bd);
      box.appendChild(card);
    });
  }

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

    // 실시간 연결이 끊겼을 때를 대비한 안전망
    setInterval(() => {
      if (statsOpen) refreshStats();
    }, 20000);
  }

  // ── 버튼 배선 ─────────────────────────────────────────
  function start() {
    idx = 0;
    answers = [];
    renderQuestion();
    show('quiz');
  }
  $('btn-start').addEventListener('click', start);
  $('btn-retry').addEventListener('click', start);

  $('btn-share').addEventListener('click', async () => {
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: '이단 예방 퀴즈', url });
      } else {
        await navigator.clipboard.writeText(url);
        toast('링크를 복사했습니다');
      }
    } catch (_) {
      /* 사용자가 취소한 경우 */
    }
  });

  document
    .querySelectorAll('[data-goto]')
    .forEach((b) => b.addEventListener('click', () => show(b.dataset.goto)));

  // ── 시작 ──────────────────────────────────────────────
  if (!configured) {
    console.warn('[quiz] config.js 에 Supabase 정보가 없어 오프라인 모드로 동작합니다.');
  }
  fetchRows().then(renderStats);
  subscribe();
})();

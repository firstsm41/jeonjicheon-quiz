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
  const SESSION = CFG.QUIZ_SESSION || 'default';

  const KEY_LOCAL = 'jjc-quiz-local';
  const KEY_DONE = 'jjc-done-' + SESSION; // 이 기기에서 제출을 마쳤는지
  const KEY_ADMIN = 'jjc-admin'; // 진행자 모드 해제 여부
  const KEY_SHOW = 'jjc-show-' + SESSION; // 오프라인 모드용 공개 설정

  const ADMIN_PIN = '2345';
  const LONG_PRESS_MS = 800;

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  };
  const numMark = (i) => ['①', '②', '③', '④', '⑤', '⑥'][i] || i + 1 + '.';
  const isText = (q) => q && q.type === 'text';

  // 주관식 답 비교·묶음을 위한 정규화 (공백 제거 + 소문자)
  const norm = (s) => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase();
  function isAcceptedText(q, value) {
    const v = norm(value);
    if (!v) return false;
    const pool = [q.answer, ...(q.accept || [])].map(norm);
    return pool.includes(v);
  }

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
  let answers = []; // 이번 참여자의 선택지 답안 (주관식은 -1)
  let openAnswers = {}; // 이번 참여자의 주관식 답안 {문항인덱스: '입력'}
  let rows = []; // 전체 응답
  let statsOpen = false;

  let isAdmin = localStorage.getItem(KEY_ADMIN) === '1'; // 진행자 기기 여부
  let hasSubmitted = localStorage.getItem(KEY_DONE) === '1'; // 제출 완료 여부
  let showResults = false; // 참여자에게 결과를 공개할지 (진행자가 제어)
  let settingsTableOk = true; // settings 테이블 사용 가능 여부

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

  // ── 진행자 모드 · 결과 공개 제어 ──────────────────────
  //
  // 참여자에게 '결과 보기'가 보이는 조건은 두 가지를 모두 만족할 때입니다.
  //   1) 이 기기에서 퀴즈를 끝까지 풀고 제출했을 것
  //   2) 진행자가 결과 공개 토글을 켰을 것
  // 진행자 본인은 조건과 무관하게 언제든 볼 수 있습니다.
  function canSeeResults() {
    return isAdmin || (hasSubmitted && showResults);
  }

  function applyVisibility() {
    const allowed = canSeeResults();
    document
      .querySelectorAll('.results-gate')
      .forEach((n) => (n.hidden = !allowed));

    $('admin-bar').hidden = !isAdmin;
    $('toggle-results').checked = showResults;
    $('toggle-desc').textContent = showResults
      ? '참여자도 결과 화면을 볼 수 있습니다'
      : '지금은 진행자만 결과를 볼 수 있습니다';

    // 공개가 꺼졌는데 참여자가 결과 화면에 머물러 있으면 돌려보냅니다
    if (!allowed && statsOpen) {
      show('intro');
      toast('진행자가 결과 공개를 종료했습니다');
    }
  }

  async function loadSettings() {
    if (!db) {
      showResults = localStorage.getItem(KEY_SHOW) === '1';
      return;
    }
    const { data, error } = await db
      .from('settings')
      .select('show_results')
      .eq('session', SESSION)
      .maybeSingle();

    if (error) {
      // settings 테이블이 아직 없는 경우 — 기기 로컬 설정으로 대체합니다
      settingsTableOk = false;
      showResults = localStorage.getItem(KEY_SHOW) === '1';
      console.warn('[quiz] settings 테이블을 읽지 못했습니다. schema-settings.sql 을 실행하세요.', error.message);
      return;
    }
    showResults = !!(data && data.show_results);
  }

  async function setShowResults(next) {
    showResults = next;
    localStorage.setItem(KEY_SHOW, next ? '1' : '0');
    applyVisibility();

    if (!db || !settingsTableOk) {
      toast(next ? '이 기기에서만 공개됩니다' : '결과 공개를 껐습니다');
      return;
    }
    const { error } = await db.from('settings').upsert({
      session: SESSION,
      show_results: next,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[quiz] 설정 저장 실패', error);
      toast('설정을 저장하지 못했습니다');
      return;
    }
    toast(next ? '참여자에게 결과를 공개했습니다' : '결과 공개를 종료했습니다');
  }

  function enterAdmin() {
    isAdmin = true;
    localStorage.setItem(KEY_ADMIN, '1');
    applyVisibility();
    toast('진행자 모드로 전환되었습니다');
  }

  function exitAdmin() {
    isAdmin = false;
    localStorage.removeItem(KEY_ADMIN);
    applyVisibility();
    toast('진행자 모드를 종료했습니다');
  }

  // 비밀번호 모달
  const pwModal = $('pw-modal');
  function openPw() {
    $('pw-input').value = '';
    $('pw-err').hidden = true;
    pwModal.hidden = false;
    setTimeout(() => $('pw-input').focus(), 50);
  }
  function closePw() {
    pwModal.hidden = true;
  }
  function submitPw() {
    if ($('pw-input').value.trim() === ADMIN_PIN) {
      closePw();
      enterAdmin();
    } else {
      $('pw-err').hidden = false;
      $('pw-input').value = '';
      $('pw-input').focus();
    }
  }
  $('pw-ok').addEventListener('click', submitPw);
  $('pw-cancel').addEventListener('click', closePw);
  $('pw-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPw();
    if (e.key === 'Escape') closePw();
  });
  pwModal.addEventListener('click', (e) => {
    if (e.target === pwModal) closePw();
  });

  $('btn-admin-exit').addEventListener('click', exitAdmin);
  $('toggle-results').addEventListener('change', (e) =>
    setShowResults(e.target.checked)
  );

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

    if (isText(q)) {
      // 주관식: 입력창 하나
      const wrap = el('div', 'text-answer');
      const input = el('input');
      input.type = 'text';
      input.id = 'q-input';
      input.autocomplete = 'off';
      input.placeholder = q.placeholder || '답을 입력하세요';
      input.value = openAnswers[idx] || '';
      input.addEventListener('input', () => {
        if (locked) return;
        $('btn-next').disabled = input.value.trim() === '';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !$('btn-next').disabled) $('btn-next').click();
      });
      wrap.appendChild(input);
      box.appendChild(wrap);
      setTimeout(() => input.focus(), 50);
    } else {
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
    }

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

    if (isText(q)) {
      const input = $('q-input');
      const value = input.value.trim();
      openAnswers[idx] = value;
      answers[idx] = -1;

      input.disabled = true;
      const ok = isAcceptedText(q, value);
      input.classList.add(ok ? 'correct' : 'wrong');

      // 정답 문자열을 입력창 아래에 표시
      const hint = el('div', 'answer-hint');
      hint.innerHTML = '';
      const k = el('span', 'k');
      k.textContent = '정답 · ';
      const strong = el('b');
      strong.textContent = q.answer;
      hint.append(k, strong);
      $('q-options').appendChild(hint);
    } else {
      answers[idx] = picked;
      [...$('q-options').children].forEach((n, k) => {
        n.classList.add('locked');
        n.classList.remove('selected');
        if (k === q.answer) n.classList.add('correct');
        else if (k === picked) n.classList.add('wrong');
      });
    }

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
      right.textContent = isText(q)
        ? q.answer
        : numMark(q.answer) + ' ' + q.options[q.answer];
      ans.append(k, right);

      item.append(head, qt, ans);
      box.appendChild(item);
    });

    show('result');
    submit();
  }

  // 제출할 때마다 새 행을 추가합니다 — 다시 풀면 참여 인원이 그만큼 누적됩니다.
  async function submit() {
    const payload = {
      session: SESSION,
      answers: answers.map((a) => (a == null ? -1 : a)),
      open_answers: openAnswers,
    };

    hasSubmitted = true;
    localStorage.setItem(KEY_DONE, '1');
    applyVisibility();

    if (!db) {
      const local = JSON.parse(localStorage.getItem(KEY_LOCAL) || '[]');
      local.push(payload);
      localStorage.setItem(KEY_LOCAL, JSON.stringify(local));
      return;
    }

    let { error } = await db.from('responses').insert(payload);

    // open_answers 컬럼이 아직 없으면 그 필드를 빼고 다시 저장합니다
    if (error) {
      const { open_answers, ...rest } = payload;
      ({ error } = await db.from('responses').insert(rest));
    }
    if (error) {
      console.error('[quiz] 저장 실패', error.message || error);
      toast('응답 저장에 실패했어요. 통계에 반영되지 않을 수 있습니다.');
    }
  }

  // ── 전체 응답 현황 ────────────────────────────────────
  async function fetchRows() {
    if (!db) {
      rows = JSON.parse(localStorage.getItem(KEY_LOCAL) || '[]');
      return;
    }
    let { data, error } = await db
      .from('responses')
      .select('answers, open_answers')
      .eq('session', SESSION)
      .limit(5000);

    // open_answers 컬럼이 아직 없는(마이그레이션 전) 경우 객관식만이라도 불러옵니다
    if (error) {
      ({ data, error } = await db
        .from('responses')
        .select('answers')
        .eq('session', SESSION)
        .limit(5000));
    }
    if (error) {
      console.error('[quiz] 응답 조회 실패', error.message || error);
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
      box.appendChild(isText(q) ? textStatCard(q, i) : choiceStatCard(q, i));
    });
  }

  // 객관식 문항 한 장
  function choiceStatCard(q, i) {
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
      row.append(key, text, v, track);
      bd.appendChild(row);
    });

    card.append(top, meter, bd);
    return card;
  }

  // 주관식 문항 한 장 — 같은 답끼리 묶어 많이 나온 순으로 보여줍니다
  function textStatCard(q, i) {
    const groups = new Map(); // 정규화값 → {label, count, ok}
    let answered = 0;
    let correct = 0;
    rows.forEach((r) => {
      const raw = (r.open_answers || {})[i];
      const v = norm(raw);
      if (!v) return;
      answered++;
      const ok = isAcceptedText(q, raw);
      if (ok) correct++;
      const key = ok ? '__answer__' : v;
      if (!groups.has(key)) {
        groups.set(key, { label: ok ? q.answer : raw.toString().trim(), count: 0, ok });
      }
      groups.get(key).count++;
    });

    const list = [...groups.values()].sort((a, b) => b.count - a.count);
    const rate = answered ? (correct / answered) * 100 : 0;
    const max = list.reduce((m, g) => Math.max(m, g.count), 0);

    const card = el('div', 'qstat');

    const top = el('div', 'top');
    const label = el('div', 'label');
    const tag = el('i');
    tag.textContent = 'Q' + (i + 1) + ' · 주관식';
    label.appendChild(tag);
    label.appendChild(document.createTextNode(q.q));
    const rt = el('div', 'rate');
    rt.textContent = Math.round(rate) + '%';
    rt.style.color =
      rate >= 70 ? 'var(--good)' : rate >= 40 ? 'var(--accent-2)' : 'var(--bad)';
    top.append(label, rt);

    const bd = el('div', 'breakdown');
    if (list.length === 0) {
      const empty = el('div', 'otext');
      empty.style.color = 'var(--text-faint)';
      empty.textContent = '아직 응답이 없습니다.';
      bd.appendChild(empty);
    }
    list.forEach((g) => {
      const pct = max ? (g.count / max) * 100 : 0;
      const row = el('div', 'brow' + (g.ok ? ' is-answer' : ''));
      const key = el('span', 'k');
      key.textContent = g.ok ? '✓' : '·';
      const text = el('span', 'otext');
      text.textContent = g.label;
      const track = el('div', 'track');
      const ti = el('i');
      ti.style.width = pct + '%';
      track.appendChild(ti);
      const v = el('span', 'v');
      v.textContent = g.count + '명';
      row.append(key, text, v, track);
      bd.appendChild(row);
    });

    card.append(top, bd);
    return card;
  }

  // ── 실시간 구독 ───────────────────────────────────────
  function subscribe() {
    if (!db) {
      $('live-badge').style.display = 'none';
      return;
    }
    db.channel('quiz-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'responses' },
        () => {
          if (statsOpen) refreshStats();
          else fetchRows().then(() => ($('intro-count').textContent = rows.length));
        }
      )
      // 진행자가 토글을 바꾸면 참여자 화면에 즉시 반영됩니다
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settings' },
        (payload) => {
          if (payload.new && payload.new.session === SESSION) {
            showResults = !!payload.new.show_results;
            applyVisibility();
          }
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
    openAnswers = {};
    renderQuestion();
    show('quiz');
  }

  // '퀴즈 시작하기'를 길게 누르면 진행자 비밀번호 창이 열립니다.
  // 짧게 누르면 평소대로 퀴즈가 시작됩니다.
  const startBtn = $('btn-start');
  let pressTimer = null;
  let longFired = false;

  function pressBegin() {
    longFired = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longFired = true;
      startBtn.classList.remove('holding');
      if (navigator.vibrate) navigator.vibrate(15);
      openPw();
    }, LONG_PRESS_MS);
    startBtn.classList.add('holding');
  }
  function pressCancel() {
    clearTimeout(pressTimer);
    startBtn.classList.remove('holding');
  }

  startBtn.addEventListener('pointerdown', pressBegin);
  startBtn.addEventListener('pointerup', pressCancel);
  startBtn.addEventListener('pointerleave', pressCancel);
  startBtn.addEventListener('pointercancel', pressCancel);
  startBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  startBtn.addEventListener('click', () => {
    if (longFired) {
      longFired = false; // 길게 누른 경우엔 퀴즈를 시작하지 않습니다
      return;
    }
    start();
  });

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
  applyVisibility();
  loadSettings().then(applyVisibility);
  fetchRows().then(renderStats);
  subscribe();
})();

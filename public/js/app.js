import { renderLecture, collectFigureCredits, esc } from './render.js';

const $app = document.getElementById('app');

// ---------- 공통 ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
}
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }) : '');
const minutes = (m) => (m ? (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60 ? (m % 60) + '분' : ''}` : `${m}분`) : '');

function statChips(stats, issues = []) {
  const errs = issues.filter((i) => i.level === 'error').length;
  const warns = issues.filter((i) => i.level === 'warn').length;
  const chips = [
    `<span class="chip">본문 ${stats.chars.toLocaleString()}자</span>`,
    stats.figures && `<span class="chip">사진·자료 ${stats.figures}</span>`,
    stats.tables && `<span class="chip">표 ${stats.tables}</span>`,
    stats.timelines && `<span class="chip">연표 ${stats.timelines}</span>`,
    stats.diagrams && `<span class="chip">도식 ${stats.diagrams}</span>`,
    stats.charts && `<span class="chip">차트 ${stats.charts}</span>`,
    errs ? `<span class="chip err">오류 ${errs}</span>` : '',
    warns ? `<span class="chip warn">주의 ${warns}</span>` : '',
    !errs && !warns ? `<span class="chip ok">점검 통과</span>` : '',
  ];
  return `<div class="chips">${chips.filter(Boolean).join('')}</div>`;
}
function coverStyle(cover) {
  return cover?.src ? `style="background-image:url('${esc(cover.src).replace(/'/g, '%27')}')"` : '';
}
function emptyState(title, text, action = '') {
  return `<div class="empty-state"><h2>${title}</h2><p>${text}</p>${action}</div>`;
}
async function refreshBadge() {
  try {
    const o = await api('/overview');
    const b = document.getElementById('inbox-badge');
    b.hidden = !o.inbox; b.textContent = o.inbox;
    return o;
  } catch { return null; }
}
function modal(html, onMount) {
  const d = document.createElement('dialog');
  d.className = 'modal';
  d.innerHTML = html;
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  onMount?.(d);
  d.showModal();
  return d;
}
function courseForm(c = {}) {
  return `
    <div class="field"><label>강좌 제목 *</label><input name="title" required value="${esc(c.title)}" placeholder="예: 일본근대사"></div>
    <div class="field"><label>부제</label><input name="subtitle" value="${esc(c.subtitle)}" placeholder="예: 개국에서 패전까지, 1853–1945"></div>
    <div class="field"><label>소개</label><textarea name="description" placeholder="강좌에서 다루는 범위와 목표">${esc(c.description)}</textarea></div>
    <div class="field"><label>표지 이미지 주소 (실제 사진·사료)</label><input name="coverSrc" value="${esc(c.cover?.src)}" placeholder="https://upload.wikimedia.org/..."></div>
    <div class="field"><label>표지 출처 표기</label><input name="coverCredit" value="${esc(c.cover?.credit)}" placeholder="작가, 연도 · 라이선스 · 출처"></div>`;
}
function readCourseForm(root) {
  const v = (n) => root.querySelector(`[name="${n}"]`)?.value.trim() || '';
  return {
    title: v('title'), subtitle: v('subtitle'), description: v('description'),
    cover: v('coverSrc') ? { src: v('coverSrc'), credit: v('coverCredit') } : null,
  };
}

// ---------- 라이트박스 ----------
const lightbox = document.getElementById('lightbox');
lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.close(); });
document.addEventListener('click', (e) => {
  const frame = e.target.closest('.figure .frame:not(.broken)');
  if (!frame) return;
  const img = frame.querySelector('img');
  const cap = frame.parentElement.querySelector('figcaption');
  lightbox.querySelector('img').src = img.currentSrc || img.src;
  lightbox.querySelector('img').alt = img.alt;
  lightbox.querySelector('.lightbox-caption').innerHTML = cap ? cap.innerHTML : '';
  lightbox.showModal();
});

// ---------- 테마 ----------
const themeBtn = document.getElementById('theme-toggle');
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
themeBtn.addEventListener('click', () => {
  const dark = getComputedStyle(document.documentElement).getPropertyValue('color-scheme').trim() === 'dark';
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
  route(); // 차트·도식 색을 다시 그림
});

// ---------- 화면: 강좌 목록 ----------
async function viewLibrary() {
  const [courses, o] = await Promise.all([api('/courses'), refreshBadge()]);
  $app.innerHTML = `
    <div class="page-head">
      <div><h1>강좌</h1><p>승인된 강의가 강좌별로 1강부터 차례대로 쌓입니다.</p></div>
      <button class="btn primary" id="new-course">＋ 새 강좌</button>
    </div>
    ${o ? `<div class="stats-row">
      <div class="stat"><b>${o.courses}</b><span>강좌</span></div>
      <div class="stat"><b>${o.lectures}</b><span>게시된 강의</span></div>
      <a class="stat ${o.inbox ? 'alert' : ''}" href="#/inbox"><b>${o.inbox}</b><span>검토 대기</span></a>
      <a class="stat" href="#/rejected"><b>${o.rejected}</b><span>반려</span></a>
    </div>` : ''}
    ${courses.length ? `<div class="grid">${courses.map((c) => `
      <a class="card course-card" href="#/course/${c.id}">
        <div class="course-cover ${c.cover?.src ? '' : 'empty'}" ${coverStyle(c.cover)}>${c.cover?.src ? '' : esc(c.title.slice(0, 2))}</div>
        <div class="course-body">
          <h3>${esc(c.title)}</h3>
          <p>${esc(c.subtitle || c.description)}</p>
          <div class="course-meta"><span>강의 ${c.lectureCount}개</span>${c.totalMinutes ? `<span>약 ${minutes(c.totalMinutes)}</span>` : ''}</div>
        </div>
      </a>`).join('')}</div>`
    : emptyState('아직 강좌가 없습니다', '검토함에서 강의를 승인하면서 새 강좌를 만들거나, 여기서 먼저 강좌를 만들 수 있습니다.',
      `<p><a class="btn" href="#/inbox">검토함 보기</a></p>`)}`;
  document.getElementById('new-course').addEventListener('click', () => {
    modal(`<h2>새 강좌</h2><form method="dialog">${courseForm()}
      <div class="modal-actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary">만들기</button></div></form>`, (d) => {
      d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { const c = await api('/courses', { method: 'POST', body: readCourseForm(d) }); d.close(); location.hash = `#/course/${c.id}`; }
        catch (err) { toast(err.message); }
      });
    });
  });
}

// ---------- 화면: 강좌 상세 ----------
async function viewCourse(cid) {
  const c = await api(`/courses/${cid}`);
  document.title = `${c.title} · 강의 서재`;
  const total = c.lectures.reduce((s, l) => s + (Number(l.estimatedMinutes) || 0), 0);
  $app.innerHTML = `
    <div class="eyebrow"><a href="#/">강좌</a> ›</div>
    <section class="course-hero">
      <div>
        <div class="course-cover ${c.cover?.src ? '' : 'empty'}" ${coverStyle(c.cover)}>${c.cover?.src ? '' : esc(c.title.slice(0, 2))}</div>
        ${c.cover?.credit ? `<div class="cover-credit">표지: ${esc(c.cover.credit)}</div>` : ''}
      </div>
      <div>
        <h1>${esc(c.title)}</h1>
        ${c.subtitle ? `<p class="sub" style="font-size:18px;color:var(--ink-2);margin:0 0 12px">${esc(c.subtitle)}</p>` : ''}
        <p class="lead">${esc(c.description)}</p>
        <p class="muted">강의 ${c.lectures.length}개${total ? ` · 약 ${minutes(total)}` : ''} · 갱신 ${fmtDate(c.updatedAt)}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${c.lectures.length ? `<a class="btn primary" href="#/course/${c.id}/${c.lectures[0].id}">1강부터 보기</a>` : ''}
          <button class="btn" id="edit-course">강좌 정보 수정</button>
          ${c.lectures.length ? '' : '<button class="btn danger" id="del-course">강좌 삭제</button>'}
        </div>
      </div>
    </section>
    <h2 style="font-size:22px">강의 목록</h2>
    ${c.lectures.length ? `<ol class="lecture-list">${c.lectures.map((l, i) => `
      <li class="lecture-item">
        <div class="lecture-no">${i + 1}<small>강</small></div>
        <div>
          <h3><a href="#/course/${c.id}/${l.id}">${esc(l.title)}</a></h3>
          ${l.subtitle || l.summary ? `<p>${esc(l.subtitle || l.summary)}</p>` : ''}
          ${statChips(l.stats, l.issues)}
        </div>
        <div class="lecture-tools">
          <button class="btn small" data-move="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="위로">↑</button>
          <button class="btn small" data-move="${i}" data-dir="1" ${i === c.lectures.length - 1 ? 'disabled' : ''} aria-label="아래로">↓</button>
          <button class="btn small danger" data-unpublish="${l.id}">빼기</button>
        </div>
      </li>`).join('')}</ol>`
    : emptyState('아직 강의가 없습니다', '검토함에서 강의를 승인해 이 강좌에 넣으세요.', `<p><a class="btn" href="#/inbox">검토함 보기</a></p>`)}`;

  $app.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', async () => {
    const i = Number(b.dataset.move), j = i + Number(b.dataset.dir);
    const order = c.lectures.map((l) => l.id);
    [order[i], order[j]] = [order[j], order[i]];
    try { await api(`/courses/${cid}/order`, { method: 'PUT', body: { order } }); viewCourse(cid); }
    catch (e) { toast(e.message); }
  }));
  $app.querySelectorAll('[data-unpublish]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('이 강의를 강좌에서 빼서 검토함으로 되돌릴까요?')) return;
    try { await api(`/courses/${cid}/lectures/${b.dataset.unpublish}/unpublish`, { method: 'POST' }); toast('검토함으로 되돌렸습니다.'); viewCourse(cid); refreshBadge(); }
    catch (e) { toast(e.message); }
  }));
  document.getElementById('edit-course').addEventListener('click', () => {
    modal(`<h2>강좌 정보 수정</h2><form method="dialog">${courseForm(c)}
      <div class="modal-actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary">저장</button></div></form>`, (d) => {
      d.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api(`/courses/${cid}`, { method: 'PATCH', body: readCourseForm(d) }); d.close(); viewCourse(cid); }
        catch (err) { toast(err.message); }
      });
    });
  });
  document.getElementById('del-course')?.addEventListener('click', async () => {
    if (!confirm(`'${c.title}' 강좌를 삭제할까요?`)) return;
    try { await api(`/courses/${cid}`, { method: 'DELETE' }); location.hash = '#/'; } catch (e) { toast(e.message); }
  });
}

// ---------- 강의 본문 공통 ----------
function lectureHeadHTML(meta, label) {
  const objectives = Array.isArray(meta.objectives) && meta.objectives.length
    ? `<div class="objectives"><b>이 강의에서 배울 것</b><ul>${meta.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : '';
  const line = [meta.period && `다루는 시기 ${esc(meta.period)}`, meta.estimatedMinutes && `읽는 시간 약 ${minutes(meta.estimatedMinutes)}`]
    .filter(Boolean).map((s) => `<span>${s}</span>`).join('');
  return `<header class="lecture-head">
    ${label ? `<div class="no">${label}</div>` : ''}
    <h1>${esc(meta.title)}</h1>
    ${meta.subtitle ? `<p class="sub">${esc(meta.subtitle)}</p>` : ''}
    ${line ? `<div class="meta-line">${line}</div>` : ''}
    ${meta.summary ? `<p style="margin:14px 0 0;color:var(--ink-2)">${esc(meta.summary)}</p>` : ''}
    ${objectives}
  </header>`;
}
function referencesHTML(meta) {
  const refs = Array.isArray(meta.references) ? meta.references : [];
  if (!refs.length) return '';
  return `<section class="references"><h2>참고문헌</h2><ol>${refs.map((r) => {
    if (typeof r === 'string') return `<li>${esc(r)}</li>`;
    const text = [r.author, r.year && `(${r.year})`, r.title && `『${r.title}』`, r.publisher].filter(Boolean).map(esc).join(' ');
    return `<li>${text}${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">링크</a>` : ''}${r.note ? ` — ${esc(r.note)}` : ''}</li>`;
  }).join('')}</ol><div class="figure-credits-slot"></div></section>`;
}
async function mountLecture(root, data) {
  const prose = root.querySelector('.prose');
  const toc = await renderLecture(prose, data);
  const tocEl = root.querySelector('.toc');
  if (tocEl) {
    tocEl.innerHTML = toc.length ? `<b>목차</b>${toc.map((t) => `<a href="#${t.id}" class="h${t.level}" data-target="${t.id}">${esc(t.text)}</a>`).join('')}` : '';
    tocEl.querySelectorAll('a').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById(a.dataset.target)?.scrollIntoView({ behavior: 'smooth' });
    }));
  }
  const credits = collectFigureCredits(prose);
  const slot = root.querySelector('.figure-credits-slot') || root.querySelector('.references');
  if (credits.length) {
    const html = `<details class="figure-credits"><summary>이미지 출처 ${credits.length}건</summary><ul>${credits.map((c) => `<li><b>${esc(c.no)}</b> ${esc(c.caption)} — ${c.credit}</li>`).join('')}</ul></details>`;
    if (slot) slot.innerHTML = html; else prose.insertAdjacentHTML('afterend', `<section class="references">${html}</section>`);
  }
  return toc;
}
function trackReading(toc) {
  const bar = document.getElementById('read-progress');
  const links = [...document.querySelectorAll('.toc a')];
  const onScroll = () => {
    const h = document.documentElement;
    bar.style.width = Math.min(100, (h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight)) * 100) + '%';
    let current = null;
    for (const t of toc) { const el = document.getElementById(t.id); if (el && el.getBoundingClientRect().top < 120) current = t.id; }
    links.forEach((a) => a.classList.toggle('on', a.dataset.target === current));
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  cleanup = () => { window.removeEventListener('scroll', onScroll); bar.style.width = '0'; };
}

// ---------- 화면: 강의 읽기 ----------
async function viewLecture(cid, lid) {
  const d = await api(`/courses/${cid}/lectures/${lid}`);
  document.title = `${d.number}강 ${d.meta.title} · ${d.course.title}`;
  $app.innerHTML = `
    <div class="reader">
      <aside class="toc"></aside>
      <article>
        <div class="eyebrow"><a href="#/">강좌</a> › <a href="#/course/${cid}">${esc(d.course.title)}</a></div>
        ${lectureHeadHTML(d.meta, `제${d.number}강 / 전 ${d.course.total}강`)}
        <div class="prose"></div>
        ${referencesHTML(d.meta)}
        <nav class="lecture-nav">
          ${d.prev ? `<a class="prev" href="#/course/${cid}/${d.prev.id}"><small>← 이전 ${d.prev.number}강</small>${esc(d.prev.title)}</a>` : ''}
          ${d.next ? `<a class="next" href="#/course/${cid}/${d.next.id}"><small>다음 ${d.next.number}강 →</small>${esc(d.next.title)}</a>` : ''}
        </nav>
      </article>
    </div>`;
  trackReading(await mountLecture($app, d));
}

// ---------- 화면: 검토함 ----------
async function viewInbox() {
  const [items, courses] = await Promise.all([api('/inbox'), api('/courses'), refreshBadge()]);
  $app.innerHTML = `
    <div class="page-head"><div><h1>검토함</h1><p>새로 생성된 강의입니다. 읽어 보고 강좌에 넣을지, 반려할지 결정하세요.</p></div></div>
    ${items.length ? `<div class="stack">${items.map((it) => {
      const sc = it.suggestedCourse;
      const exists = sc && courses.find((c) => c.id === sc.id);
      return `<div class="card inbox-item">
        <div>
          <div class="eyebrow">${sc ? `제안: ${esc(sc.title || sc.id)}${it.suggestedOrder ? ` ${it.suggestedOrder}강` : ''}${exists ? '' : ' (새 강좌)'}` : '강좌 미지정'} · ${fmtDate(it.createdAt)}</div>
          <h3><a href="#/inbox/${it.id}">${esc(it.title)}</a></h3>
          <p>${esc(it.subtitle || it.summary)}</p>
          ${statChips(it.stats, it.issues)}
        </div>
        <a class="btn primary" href="#/inbox/${it.id}">검토하기</a>
      </div>`;
    }).join('')}</div>`
    : emptyState('검토할 강의가 없습니다', '새 강의가 생성되면 이곳에 나타납니다.')}`;
}

async function viewDraft(did, { rejected = false } = {}) {
  const base = rejected ? '/rejected' : '/inbox';
  const [d, courses] = await Promise.all([api(`${base}/${did}`), api('/courses')]);
  document.title = `검토: ${d.meta.title} · 강의 서재`;
  const sc = d.meta.suggestedCourse || {};
  const target = courses.find((c) => c.id === sc.id);
  const errs = d.report.issues.filter((i) => i.level === 'error');
  const s = d.report.stats;

  const panel = rejected ? `
    <h2>반려된 강의</h2>
    <p class="muted" style="font-size:14px">${fmtDate(d.meta.rejection?.at)} 반려</p>
    ${d.meta.rejection?.reason ? `<div class="callout warn"><div class="callout-title">반려 사유</div>${esc(d.meta.rejection.reason)}</div>` : ''}
    <div style="display:grid;gap:8px">
      <button class="btn primary" id="restore">검토함으로 복원</button>
      <button class="btn danger" id="purge">완전히 삭제</button>
    </div>` : `
    <h2>넣을지 결정하기</h2>
    <div class="seg" role="tablist">
      <button type="button" data-mode="existing" ${courses.length ? '' : 'disabled'}>기존 강좌</button>
      <button type="button" data-mode="new">새 강좌</button>
    </div>
    <div data-pane="existing">
      <div class="field"><label>강좌</label><select name="courseId">${courses.map((c) =>
        `<option value="${c.id}" data-count="${c.lectureCount}" ${c.id === sc.id ? 'selected' : ''}>${esc(c.title)} (${c.lectureCount}강)</option>`).join('')}</select></div>
    </div>
    <div data-pane="new">
      <div class="field"><label>새 강좌 제목 *</label><input name="newTitle" value="${esc(target ? '' : sc.title || '')}" placeholder="예: 일본근대사"></div>
      <div class="field"><label>부제</label><input name="newSubtitle" value="${esc(target ? '' : sc.subtitle || '')}"></div>
      <input type="hidden" name="newId" value="${esc(target ? '' : sc.id || '')}">
    </div>
    <div class="field"><label>몇 강으로 넣을까요?</label><select name="position"></select></div>
    <div class="field"><label>검토 메모 (선택)</label><textarea name="note" placeholder="수정 요청 등"></textarea></div>
    <div style="display:grid;gap:8px">
      <button class="btn primary" id="approve">✓ 승인하고 강좌에 넣기</button>
      <button class="btn danger" id="reject">반려</button>
    </div>`;

  $app.innerHTML = `
    <div class="eyebrow"><a href="#${base}">${rejected ? '반려함' : '검토함'}</a> ›</div>
    <div class="review-layout">
      <div class="reader"><article>
        <div class="preview-banner">${rejected ? '반려된 강의 미리보기' : '미리보기 — 아직 게시되지 않은 강의입니다'}${sc.title ? ` · 제안 위치: ${esc(sc.title)} ${d.meta.suggestedOrder ? d.meta.suggestedOrder + '강' : ''}` : ''}</div>
        ${lectureHeadHTML(d.meta, '')}
        <div class="prose"></div>
        ${referencesHTML(d.meta)}
      </article></div>
      <aside class="card review-panel">
        ${panel}
        <hr>
        <h2>자동 점검</h2>
        <div class="stat-grid">
          <div><b>${s.chars.toLocaleString()}</b>글자</div><div><b>${s.headings}</b>소단원</div><div><b>${s.figures}</b>사진·자료</div>
          <div><b>${s.tables}</b>표</div><div><b>${s.timelines}</b>연표</div><div><b>${s.diagrams + s.charts}</b>도식·차트</div>
        </div>
        ${d.report.issues.length ? `<ul class="issue-list">${d.report.issues.map((i) => `<li class="${i.level}">${i.level === 'error' ? '오류' : '주의'} · ${esc(i.message)}</li>`).join('')}</ul>`
          : '<p class="chip ok" style="display:inline-block">문제 없음</p>'}
      </aside>
    </div>`;

  mountLecture($app, d);

  if (rejected) {
    document.getElementById('restore').addEventListener('click', async () => {
      try { const r = await api(`/rejected/${did}/restore`, { method: 'POST' }); toast('검토함으로 복원했습니다.'); location.hash = `#/inbox/${r.draftId}`; }
      catch (e) { toast(e.message); }
    });
    document.getElementById('purge').addEventListener('click', async () => {
      if (!confirm('이 강의 파일을 완전히 삭제할까요? 되돌릴 수 없습니다.')) return;
      try { await api(`/rejected/${did}`, { method: 'DELETE' }); toast('삭제했습니다.'); location.hash = '#/rejected'; }
      catch (e) { toast(e.message); }
    });
    return;
  }

  // 승인 패널 동작
  const panelEl = $app.querySelector('.review-panel');
  const q = (n) => panelEl.querySelector(`[name="${n}"]`);
  let mode = target || (courses.length && !sc.id) ? 'existing' : 'new';
  const fillPositions = () => {
    const count = mode === 'existing' ? Number(q('courseId').selectedOptions[0]?.dataset.count || 0) : 0;
    const suggested = d.meta.suggestedOrder;
    const opts = [];
    for (let i = 1; i <= count + 1; i++) opts.push(`<option value="${i}">${i}강${i === count + 1 ? ' (맨 뒤)' : ''}</option>`);
    q('position').innerHTML = opts.join('');
    q('position').value = String(suggested && suggested <= count + 1 ? suggested : count + 1);
  };
  const setMode = (m) => {
    mode = m;
    panelEl.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    panelEl.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== m; });
    fillPositions();
  };
  panelEl.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  q('courseId')?.addEventListener('change', fillPositions);
  setMode(mode);

  document.getElementById('approve').addEventListener('click', async () => {
    if (errs.length && !confirm(`자동 점검 오류가 ${errs.length}건 있습니다. 그래도 승인할까요?`)) return;
    const body = { position: Number(q('position').value), reviewNote: q('note').value.trim() };
    if (mode === 'existing') body.courseId = q('courseId').value;
    else {
      if (!q('newTitle').value.trim()) return toast('새 강좌 제목을 입력하세요.');
      body.newCourse = { id: q('newId').value || undefined, title: q('newTitle').value.trim(), subtitle: q('newSubtitle').value.trim(),
        description: sc.description || '' };
    }
    try {
      const r = await api(`/inbox/${did}/approve`, { method: 'POST', body });
      toast(`${r.number}강으로 게시했습니다.`);
      refreshBadge();
      location.hash = `#/course/${r.courseId}/${r.lectureId}`;
    } catch (e) { toast(e.message); }
  });
  document.getElementById('reject').addEventListener('click', () => {
    modal(`<h2>반려</h2><form method="dialog">
      <div class="field"><label>반려 사유 (다음 생성 때 참고합니다)</label><textarea name="reason" placeholder="예: 사진이 부족함, 메이지 유신 서술이 얕음"></textarea></div>
      <div class="modal-actions"><button class="btn" type="button" data-close>취소</button><button class="btn danger">반려하기</button></div></form>`, (m) => {
      m.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api(`/inbox/${did}/reject`, { method: 'POST', body: { reason: m.querySelector('[name=reason]').value.trim() } });
          m.close(); toast('반려함으로 옮겼습니다.'); refreshBadge(); location.hash = '#/inbox';
        } catch (err) { toast(err.message); }
      });
    });
  });
}

// ---------- 화면: 반려함 ----------
async function viewRejected() {
  const items = await api('/rejected');
  $app.innerHTML = `
    <div class="page-head"><div><h1>반려함</h1><p>반려한 강의는 삭제되지 않고 이곳에 보관됩니다. 언제든 검토함으로 복원할 수 있습니다.</p></div></div>
    ${items.length ? `<div class="stack">${items.map((it) => `
      <div class="card inbox-item">
        <div>
          <div class="eyebrow">${fmtDate(it.rejection?.at)} 반려</div>
          <h3><a href="#/rejected/${it.id}">${esc(it.title)}</a></h3>
          <p>${it.rejection?.reason ? '사유: ' + esc(it.rejection.reason) : '사유 없음'}</p>
        </div>
        <a class="btn" href="#/rejected/${it.id}">보기</a>
      </div>`).join('')}</div>`
    : emptyState('반려한 강의가 없습니다', '')}`;
}

// ---------- 화면: 작성 규격 ----------
async function viewGuide() {
  const { text } = await api('/guide');
  $app.innerHTML = `<div class="reader"><aside class="toc"></aside><article class="guide"><div class="prose"></div></article></div>`;
  trackReading(await mountLecture($app, { body: text, assetBase: '' }));
}

// ---------- 라우터 ----------
let cleanup = null;
async function route() {
  cleanup?.(); cleanup = null;
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const nav = { '': 'library', course: 'library', inbox: 'inbox', rejected: 'rejected', guide: 'guide' }[parts[0] || ''];
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
  document.title = '강의 서재';
  window.scrollTo(0, 0);
  $app.innerHTML = '<p class="muted">불러오는 중…</p>';
  try {
    if (!parts.length) await viewLibrary();
    else if (parts[0] === 'course' && parts[2]) await viewLecture(parts[1], parts[2]);
    else if (parts[0] === 'course') await viewCourse(parts[1]);
    else if (parts[0] === 'inbox' && parts[1]) await viewDraft(parts[1]);
    else if (parts[0] === 'inbox') await viewInbox();
    else if (parts[0] === 'rejected' && parts[1]) await viewDraft(parts[1], { rejected: true });
    else if (parts[0] === 'rejected') await viewRejected();
    else if (parts[0] === 'guide') await viewGuide();
    else $app.innerHTML = emptyState('페이지를 찾을 수 없습니다', '', '<p><a class="btn" href="#/">강좌로</a></p>');
  } catch (e) {
    $app.innerHTML = emptyState('불러오지 못했습니다', esc(e.message), '<p><a class="btn" href="#/">강좌로</a></p>');
  }
  refreshBadge();
}
window.addEventListener('hashchange', route);
route();

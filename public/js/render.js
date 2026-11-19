// 강의 본문 렌더러: Markdown + 특수 블록(figure/gallery/timeline/chart/mermaid/compare)
import { parseFigure, parseGallery, parseTimeline, parseCompare } from './blocks.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isUrl = (s) => /^https?:\/\//i.test(s);
const resolveSrc = (src, base) => (!src || /^([a-z]+:|\/)/i.test(src) ? src : base + src.replace(/^\.\//, ''));

const PALETTE = ['#2f6b4f', '#b5532f', '#3d5a99', '#a3842a', '#7b4b94', '#3f8a8a', '#8a3d5c', '#5c6b2f'];
const CALLOUTS = {
  note: ['note', '참고'], 참고: ['note', '참고'],
  key: ['key', '핵심'], 핵심: ['key', '핵심'], important: ['key', '핵심'],
  warn: ['warn', '주의'], warning: ['warn', '주의'], 주의: ['warn', '주의'], caution: ['warn', '주의'],
  source: ['source', '사료'], 사료: ['source', '사료'], quote: ['source', '사료'],
  tip: ['key', '더 알아보기'], 더알아보기: ['key', '더 알아보기'],
};

function figureHTML(fig, base, cls = '') {
  const src = resolveSrc(fig.src, base);
  const width = ['wide', 'narrow', 'full'].includes(fig.width) ? fig.width : '';
  const creditBits = [fig.credit, fig.license].filter(Boolean).map(esc).join(' · ');
  const sourceLink = fig.source ? (isUrl(fig.source) ? ` · <a href="${esc(fig.source)}" target="_blank" rel="noopener">원본</a>` : ` · ${esc(fig.source)}`) : '';
  return `<figure class="figure ${width} ${cls}" data-figure>
    <div class="frame"><img src="${esc(src)}" alt="${esc(fig.alt)}" loading="lazy" referrerpolicy="no-referrer"></div>
    <figcaption><span class="no"></span>${esc(fig.caption)}
      <span class="credit">${creditBits}${sourceLink}</span></figcaption>
  </figure>`;
}

function blockHTML(lang, text, base, store) {
  switch (lang) {
    case 'figure': return figureHTML(parseFigure(text), base);
    case 'gallery': return `<div class="gallery">${parseGallery(text).map((f) => figureHTML(f, base)).join('')}</div>`;
    case 'timeline':
      return `<div class="timeline">${parseTimeline(text).map((e) => `
        <div class="tl-item"><div class="tl-date">${esc(e.date)}</div>
        <div class="tl-title">${esc(e.title)}</div>${e.desc ? `<div class="tl-desc">${esc(e.desc)}</div>` : ''}</div>`).join('')}</div>`;
    case 'compare': {
      const { head, rows } = parseCompare(text);
      const n = Math.max(head.length, ...rows.map((r) => r.length));
      const cols = `style="grid-template-columns: minmax(90px, .7fr) repeat(${Math.max(n - 1, 1)}, 1fr)"`;
      const row = (cells, cls = '') => `<div class="compare-row ${cls}" ${cols}>${Array.from({ length: n }, (_, i) => `<div>${esc(cells[i] ?? '')}</div>`).join('')}</div>`;
      return `<div class="compare">${row(head, 'head')}${rows.map((r) => row(r)).join('')}</div>`;
    }
    case 'chart': {
      const id = store.push({ type: 'chart', text }) - 1;
      let caption = '';
      try { caption = JSON.parse(text).caption || ''; } catch {}
      return `<figure class="viz" data-viz="${id}"><div class="chart-box"><canvas></canvas></div>
        <figcaption><span class="no"></span>${esc(caption)}</figcaption></figure>`;
    }
    case 'mermaid': {
      const id = store.push({ type: 'mermaid', text }) - 1;
      const cap = text.match(/^%%\s*caption:\s*(.+)$/m);
      return `<figure class="viz" data-viz="${id}"><div class="mermaid-box"></div>
        <figcaption><span class="no"></span>${esc(cap ? cap[1] : '')}</figcaption></figure>`;
    }
    default: return null;
  }
}

/** 강의 본문을 container에 그립니다. 반환값: 목차 항목 배열 */
export async function renderLecture(container, { body, assetBase = '' }) {
  const store = [];
  const md = new window.marked.Marked({ gfm: true, breaks: false });
  md.use({
    renderer: {
      code({ text, lang }) {
        return blockHTML(String(lang || '').trim().toLowerCase(), text, assetBase, store) ?? false;
      },
      // 한국어의 범위 표기(6~7%)가 취소선이 되지 않도록: ~~두 개~~만 취소선
      del(token) {
        const inner = this.parser.parseInline(token.tokens);
        return String(token.raw).startsWith('~~') ? `<del>${inner}</del>` : `~${inner}~`;
      },
      image({ href, title, text }) {
        return `<img src="${esc(resolveSrc(href, assetBase))}" alt="${esc(text)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy">`;
      },
    },
  });
  container.innerHTML = md.parse(body || '');

  // 표 감싸기 + "표:" 캡션
  let tableNo = 0;
  container.querySelectorAll('table').forEach((t) => {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.replaceWith(wrap); wrap.append(t);
    tableNo++;
    const next = wrap.nextElementSibling;
    if (next?.tagName === 'P' && /^(표|Table)\s*[:：]/.test(next.textContent)) {
      next.className = 'table-caption';
      next.innerHTML = `<b>표 ${tableNo}.</b> ` + next.innerHTML.replace(/^(표|Table)\s*[:：]\s*/, '');
    }
  });

  // 콜아웃: > [!핵심] 제목
  container.querySelectorAll('blockquote').forEach((bq) => {
    const p = bq.querySelector('p');
    const m = p?.innerHTML.match(/^\[!([^\]\s]+)\]\s*([^\n<]*)(?:\n|<br>)?/);
    if (!m) return;
    const [cls, label] = CALLOUTS[m[1].toLowerCase()] || ['note', m[1]];
    p.innerHTML = p.innerHTML.slice(m[0].length).trim();
    if (!p.innerHTML) p.remove();
    const div = document.createElement('div');
    div.className = `callout ${cls}`;
    div.innerHTML = `<div class="callout-title">${esc(m[2].trim() || label)}</div>` + bq.innerHTML;
    bq.replaceWith(div);
  });

  // 그림 번호
  let figNo = 0;
  container.querySelectorAll('[data-figure], [data-viz]').forEach((f) => {
    const no = f.querySelector('figcaption .no');
    figNo++;
    if (no) no.textContent = `그림 ${figNo}.`;
  });

  // 깨진 이미지 처리
  container.querySelectorAll('.figure img').forEach((img) => {
    img.addEventListener('error', () => {
      const frame = img.parentElement;
      frame.classList.add('broken');
      frame.textContent = `이미지를 불러오지 못했습니다 (${img.getAttribute('src')})`;
    }, { once: true });
  });

  // 제목 id + 목차
  const toc = [];
  const used = new Set();
  container.querySelectorAll('h2, h3').forEach((h, i) => {
    let id = 's-' + (h.textContent.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || i);
    while (used.has(id)) id += '-' + i;
    used.add(id);
    h.id = id;
    toc.push({ id, level: h.tagName === 'H2' ? 2 : 3, text: h.textContent });
  });

  await hydrateViz(container, store);
  return toc;
}

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const isDark = () => css('color-scheme') === 'dark';

let mermaidSeq = 0;
async function hydrateViz(container, store) {
  if (window.Chart) {
    window.Chart.defaults.font.family = css('--sans') || 'sans-serif';
    window.Chart.defaults.color = css('--ink-2');
    window.Chart.defaults.borderColor = css('--line');
  }
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'neutral',
      fontFamily: css('--sans'),
    });
  }
  for (const el of container.querySelectorAll('[data-viz]')) {
    const item = store[Number(el.dataset.viz)];
    try {
      if (item.type === 'chart') {
        const cfg = JSON.parse(item.text);
        delete cfg.caption;
        if (cfg.height) { el.querySelector('.chart-box').style.height = cfg.height + 'px'; delete cfg.height; }
        const multi = (cfg.data?.datasets || []).length > 1 || ['line', 'bar', 'scatter', 'radar'].includes(cfg.type);
        (cfg.data?.datasets || []).forEach((ds, i) => {
          const c = PALETTE[i % PALETTE.length];
          if (!ds.backgroundColor) ds.backgroundColor = multi ? c + (cfg.type === 'line' ? '33' : 'cc') : PALETTE;
          if (!ds.borderColor) ds.borderColor = multi ? c : css('--surface');
        });
        cfg.options = { responsive: true, maintainAspectRatio: false, ...(cfg.options || {}) };
        new window.Chart(el.querySelector('canvas'), cfg);
      } else if (item.type === 'mermaid') {
        const { svg } = await window.mermaid.render(`mmd-${Date.now()}-${mermaidSeq++}`, item.text);
        el.querySelector('.mermaid-box').innerHTML = svg;
      }
    } catch (e) {
      el.insertAdjacentHTML('afterbegin', `<div class="callout warn"><div class="callout-title">시각자료 오류</div>${esc(e.message || e)}</div>`);
    }
  }
}

/** 본문 속 그림의 출처 목록 */
export function collectFigureCredits(container) {
  return [...container.querySelectorAll('[data-figure]')].map((f) => ({
    no: f.querySelector('.no')?.textContent || '',
    caption: f.querySelector('figcaption')?.childNodes[1]?.textContent?.trim() || '',
    credit: f.querySelector('.credit')?.innerHTML || '',
  }));
}

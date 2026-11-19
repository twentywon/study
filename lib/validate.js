// 강의 품질 점검: 시각자료 사용량 집계 + 출처/라이선스 누락 등 문제 탐지
import { extractFences, parseFigure, parseGallery, parseTimeline } from '../public/js/blocks.js';

// AI 생성 이미지를 의심할 만한 표기 (요구사항: AI 생성 그림 금지)
const AI_HINTS = /(midjourney|dall[\s·-]?e|stable\s*diffusion|firefly|imagen|ai[\s-]?generated|generated\s+by\s+ai|AI\s*생성|인공지능\s*생성|생성형)/i;

export function validateLecture(meta = {}, body = '') {
  const issues = [];
  const add = (level, message) => issues.push({ level, message });

  if (!meta.title) add('error', 'meta.json에 title(강의 제목)이 없습니다.');
  if (!meta.summary) add('warn', 'meta.json에 summary(강의 요약)가 없습니다.');
  if (!body.trim()) add('error', 'lecture.md 본문이 비어 있습니다.');

  const fences = extractFences(body);
  const figures = [];
  let timelines = 0, charts = 0, diagrams = 0, compares = 0, timelineEvents = 0;
  for (const f of fences) {
    if (f.lang === 'figure') figures.push(parseFigure(f.text));
    else if (f.lang === 'gallery') figures.push(...parseGallery(f.text));
    else if (f.lang === 'timeline') { timelines++; timelineEvents += parseTimeline(f.text).length; }
    else if (f.lang === 'chart') {
      charts++;
      try { JSON.parse(f.text); } catch { add('error', `chart 블록 JSON 오류 (${lineOf(body, f.index)}번째 줄)`); }
    } else if (f.lang === 'mermaid') diagrams++;
    else if (f.lang === 'compare') compares++;
  }

  figures.forEach((fig, i) => {
    const label = `그림 ${i + 1}${fig.caption ? ` “${fig.caption.slice(0, 24)}”` : ''}`;
    if (!fig.src) add('error', `${label}: src(이미지 주소)가 없습니다.`);
    if (!fig.source) add('error', `${label}: source(원본 출처 URL)가 없습니다. 실제 자료임을 확인할 수 있어야 합니다.`);
    if (!fig.license) add('error', `${label}: license(이용 허락 조건)가 없습니다.`);
    if (!fig.credit) add('warn', `${label}: credit(작가·소장처·연도)이 없습니다.`);
    if (!fig.caption) add('warn', `${label}: caption(설명)이 없습니다.`);
    if (AI_HINTS.test([fig.credit, fig.source, fig.license, fig.caption].join(' '))) {
      add('error', `${label}: AI 생성 이미지로 보이는 표기가 있습니다. 실제 사진·사료로 교체하세요.`);
    }
  });

  // 출처 표기가 없는 일반 마크다운 이미지
  const bareImages = (stripFences(body).match(/!\[[^\]]*\]\([^)]+\)/g) || []).length;
  if (bareImages) add('warn', `출처 없는 일반 이미지 ${bareImages}개: figure 블록으로 바꿔 출처·라이선스를 표기하세요.`);

  const plain = stripFences(body);
  const tables = (plain.match(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm) || []).length;
  const headings = (plain.match(/^#{2,3}\s+/gm) || []).length;
  const chars = plain.replace(/[#>*_`|\-\s]/g, '').length;

  const visuals = figures.length + tables + timelines + charts + diagrams + compares;
  if (body.trim() && visuals < 3) add('warn', `시각자료가 ${visuals}개뿐입니다. 사진·도표·연표 등을 더 활용하세요.`);
  if (body.trim() && chars < 3000) add('warn', `본문이 짧습니다(약 ${chars.toLocaleString()}자). 더 자세한 서술이 필요합니다.`);

  const refs = Array.isArray(meta.references) ? meta.references.length : 0;
  if (!refs) add('warn', 'meta.json에 references(참고문헌)가 없습니다.');

  return {
    issues,
    stats: {
      chars, headings, figures: figures.length, tables, timelines, timelineEvents,
      charts, diagrams, compares, visuals, references: refs,
    },
  };
}

function stripFences(md) { return String(md).replace(/^(```+|~~~+)[\s\S]*?^\1[ \t]*$/gm, ''); }
function lineOf(text, index) { return text.slice(0, index).split('\n').length; }

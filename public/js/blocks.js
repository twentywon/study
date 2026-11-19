// 강의 마크다운의 특수 블록 파서 (브라우저·서버 공용)
//
// 지원 블록(코드펜스 언어명):
//   figure   : 사진/자료 1장       (key: value 줄)
//   gallery  : 사진 여러 장         (--- 줄로 항목 구분)
//   timeline : 연표                 ("연도 | 제목 | 설명" 줄)
//   chart    : 차트                 (Chart.js 설정 JSON)
//   mermaid  : 도식(흐름도·관계도 등)
//   compare  : 비교표 카드          (첫 줄 머리글 "A | B", 이후 "항목 | A값 | B값")

export const SPECIAL_BLOCKS = ['figure', 'gallery', 'timeline', 'chart', 'mermaid', 'compare'];

// "key: value" 줄들 → 객체. 값 안의 ':'는 보존합니다(URL 등).
export function parseKV(text) {
  const out = {};
  let last = null;
  for (const raw of String(text).split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z][\w-]*)\s*:\s?(.*)$/);
    if (m && !/^\s/.test(line)) { last = m[1].toLowerCase(); out[last] = m[2].trim(); }
    else if (last) out[last] += ' ' + line.trim(); // 들여쓴 줄은 이전 값에 이어붙임
  }
  return out;
}

export function parseFigure(text) {
  const f = parseKV(text);
  return {
    src: f.src || '',
    alt: f.alt || f.caption || '',
    caption: f.caption || '',
    credit: f.credit || '',         // 작가/촬영자/소장처, 제작연도
    license: f.license || '',       // Public Domain, CC BY-SA 4.0 등
    source: f.source || '',         // 원본 페이지 URL (위키미디어 공용 파일 페이지 등)
    width: f.width || '',           // full | wide | narrow
    kind: f.kind || 'photo',        // photo | map | document | painting | chart-image ...
  };
}

export function parseGallery(text) {
  return String(text).split(/^\s*---\s*$/m).map((s) => s.trim()).filter(Boolean).map(parseFigure);
}

export function parseTimeline(text) {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [date = '', title = '', ...rest] = l.split('|').map((s) => s.trim());
    return { date, title, desc: rest.join(' | ') };
  });
}

export function parseCompare(text) {
  const rows = String(text).split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split('|').map((s) => s.trim()));
  const [head = [], ...body] = rows;
  return { head, rows: body };
}

// 마크다운 본문에서 코드펜스 블록 추출
export function extractFences(md) {
  const out = [];
  const re = /^(```+|~~~+)[ \t]*([\w-]*)[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm;
  let m;
  while ((m = re.exec(md))) out.push({ lang: m[2].toLowerCase(), text: m[3], index: m.index });
  return out;
}

// 강의 검토·게시 플랫폼 서버
// - 외부 프레임워크 없이 Node 내장 http 모듈만 사용합니다.
// - 데이터는 content/ 폴더의 파일(JSON + Markdown)로 저장합니다.
import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLecture } from './lib/validate.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(ROOT, 'content');
const DIRS = {
  courses: path.join(CONTENT, 'courses'),
  inbox: path.join(CONTENT, 'inbox'),
  rejected: path.join(CONTENT, 'rejected'),
};
const PUBLIC = path.join(ROOT, 'public');
const VENDOR = {
  'marked.js': 'node_modules/marked/lib/marked.umd.js',
  'mermaid.js': 'node_modules/mermaid/dist/mermaid.min.js',
  'chart.js': 'node_modules/chart.js/dist/chart.umd.js',
};
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8',
};

// ---------- 파일 유틸 ----------
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const isSlug = (s) => typeof s === 'string' && SLUG_RE.test(s);

async function readJSON(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (fallback !== undefined && e.code === 'ENOENT') return fallback; throw e; }
}
async function writeJSON(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  await fs.rename(tmp, file);
}
async function listDirs(dir) {
  try {
    const ents = await fs.readdir(dir, { withFileTypes: true });
    return ents.filter((e) => e.isDirectory() && isSlug(e.name)).map((e) => e.name).sort();
  } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}
async function uniqueDir(parent, base) {
  let name = base, i = 2;
  while (existsSync(path.join(parent, name))) name = `${base}-${i++}`;
  return name;
}
function slugify(text) {
  const ascii = String(text || '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return ascii || `course-${Date.now().toString(36)}`;
}
const now = () => new Date().toISOString();

// ---------- 강의(초안/게시) 읽기 ----------
async function loadLectureDir(dir) {
  const meta = await readJSON(path.join(dir, 'meta.json'), {});
  let body = '';
  try { body = await fs.readFile(path.join(dir, 'lecture.md'), 'utf8'); } catch {}
  return { meta, body };
}
function summarize(id, meta, body) {
  const report = validateLecture(meta, body);
  return {
    id,
    title: meta.title || id,
    subtitle: meta.subtitle || '',
    summary: meta.summary || '',
    estimatedMinutes: meta.estimatedMinutes || null,
    suggestedCourse: meta.suggestedCourse || null,
    suggestedOrder: meta.suggestedOrder ?? null,
    createdAt: meta.createdAt || null,
    stats: report.stats,
    issues: report.issues,
    rejection: meta.rejection || null,
  };
}

// ---------- 강좌 ----------
const courseFile = (id) => path.join(DIRS.courses, id, 'course.json');

async function loadCourse(id) {
  if (!isSlug(id)) return null;
  const c = await readJSON(courseFile(id), null);
  if (!c) return null;
  c.id = id;
  c.lectures = Array.isArray(c.lectures) ? c.lectures : [];
  return c;
}
async function saveCourse(c) {
  c.updatedAt = now();
  await writeJSON(courseFile(c.id), c);
}
async function courseWithLectures(c) {
  const lectures = [];
  for (const lid of c.lectures) {
    const dir = path.join(DIRS.courses, c.id, 'lectures', lid);
    if (!existsSync(dir)) continue;
    const { meta, body } = await loadLectureDir(dir);
    lectures.push(summarize(lid, meta, body));
  }
  return { ...c, lectures };
}
async function createCourse({ id, title, subtitle, description, cover }) {
  if (!title || !String(title).trim()) throw httpError(400, '강좌 제목이 필요합니다.');
  let cid = id && isSlug(id) ? id : slugify(title);
  if (existsSync(path.join(DIRS.courses, cid))) {
    if (id) throw httpError(409, `이미 같은 ID의 강좌가 있습니다: ${cid}`);
    cid = await uniqueDir(DIRS.courses, cid);
  }
  await fs.mkdir(path.join(DIRS.courses, cid, 'lectures'), { recursive: true });
  const c = {
    id: cid, title: String(title).trim(), subtitle: subtitle || '',
    description: description || '', cover: cover || null,
    createdAt: now(), updatedAt: now(), lectures: [],
  };
  await writeJSON(courseFile(cid), c);
  return c;
}

// ---------- 오류/응답 ----------
function httpError(status, message) { const e = new Error(message); e.status = status; return e; }
function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}
async function readBody(req) {
  const chunks = []; let size = 0;
  for await (const ch of req) {
    size += ch.length;
    if (size > 2 * 1024 * 1024) throw httpError(413, '요청이 너무 큽니다.');
    chunks.push(ch);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, 'JSON 형식이 잘못되었습니다.'); }
}
async function serveFile(res, file, req) {
  try {
    const st = await fs.stat(file);
    if (!st.isFile()) throw new Error();
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch { send(res, 404, { error: '파일을 찾을 수 없습니다.' }); }
}
// base 밖으로 나가는 경로(../ 등)를 차단
function safeJoin(base, rel) {
  const p = path.resolve(base, '.' + path.sep + rel);
  return p === base || p.startsWith(base + path.sep) ? p : null;
}

// ---------- 라우팅 ----------
const routes = [];
const route = (method, pattern, handler) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, re, keys, handler });
};

// 대시보드 요약
route('GET', '/api/overview', async () => {
  const courses = await listDirs(DIRS.courses);
  let lectures = 0;
  for (const id of courses) { const c = await loadCourse(id); if (c) lectures += c.lectures.length; }
  return {
    courses: courses.length, lectures,
    inbox: (await listDirs(DIRS.inbox)).length,
    rejected: (await listDirs(DIRS.rejected)).length,
  };
});

// 강의 작성 규격 문서
route('GET', '/api/guide', async () => ({ text: await fs.readFile(path.join(ROOT, 'docs', 'LECTURE_FORMAT.md'), 'utf8') }));

// 강좌 목록
route('GET', '/api/courses', async () => {
  const out = [];
  for (const id of await listDirs(DIRS.courses)) {
    const c = await loadCourse(id);
    if (!c) continue;
    let minutes = 0;
    for (const lid of c.lectures) {
      const m = await readJSON(path.join(DIRS.courses, id, 'lectures', lid, 'meta.json'), {});
      minutes += Number(m.estimatedMinutes) || 0;
    }
    out.push({ id, title: c.title, subtitle: c.subtitle, description: c.description,
      cover: c.cover, lectureCount: c.lectures.length, totalMinutes: minutes, updatedAt: c.updatedAt });
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return out;
});
route('POST', '/api/courses', async ({ body }) => createCourse(body));
route('GET', '/api/courses/:cid', async ({ cid }) => {
  const c = await loadCourse(cid);
  if (!c) throw httpError(404, '강좌가 없습니다.');
  return courseWithLectures(c);
});
route('PATCH', '/api/courses/:cid', async ({ cid, body }) => {
  const c = await loadCourse(cid);
  if (!c) throw httpError(404, '강좌가 없습니다.');
  for (const k of ['title', 'subtitle', 'description', 'cover']) if (k in body) c[k] = body[k];
  if (!String(c.title || '').trim()) throw httpError(400, '강좌 제목은 비울 수 없습니다.');
  await saveCourse(c);
  return courseWithLectures(c);
});
route('DELETE', '/api/courses/:cid', async ({ cid }) => {
  const c = await loadCourse(cid);
  if (!c) throw httpError(404, '강좌가 없습니다.');
  if (c.lectures.length) throw httpError(409, '강의가 남아 있는 강좌는 삭제할 수 없습니다. 먼저 강의를 검토함으로 되돌리세요.');
  await fs.rm(path.join(DIRS.courses, cid), { recursive: true, force: true });
  return { ok: true };
});
// 강의 순서 변경
route('PUT', '/api/courses/:cid/order', async ({ cid, body }) => {
  const c = await loadCourse(cid);
  if (!c) throw httpError(404, '강좌가 없습니다.');
  const order = body.order;
  if (!Array.isArray(order) || order.length !== c.lectures.length ||
      [...order].sort().join() !== [...c.lectures].sort().join()) {
    throw httpError(400, '순서 목록이 현재 강의 목록과 일치하지 않습니다.');
  }
  c.lectures = order;
  await saveCourse(c);
  return courseWithLectures(c);
});
// 게시된 강의 읽기
route('GET', '/api/courses/:cid/lectures/:lid', async ({ cid, lid }) => {
  const c = await loadCourse(cid);
  if (!c || !c.lectures.includes(lid)) throw httpError(404, '강의가 없습니다.');
  const { meta, body } = await loadLectureDir(path.join(DIRS.courses, cid, 'lectures', lid));
  const idx = c.lectures.indexOf(lid);
  const neighbor = async (i) => {
    if (i < 0 || i >= c.lectures.length) return null;
    const m = await readJSON(path.join(DIRS.courses, cid, 'lectures', c.lectures[i], 'meta.json'), {});
    return { id: c.lectures[i], number: i + 1, title: m.title || c.lectures[i] };
  };
  return {
    id: lid, number: idx + 1, meta, body,
    course: { id: cid, title: c.title, total: c.lectures.length },
    prev: await neighbor(idx - 1), next: await neighbor(idx + 1),
    assetBase: `/files/courses/${cid}/lectures/${lid}/`,
    report: validateLecture(meta, body),
  };
});
// 게시 취소 → 검토함으로 되돌림
route('POST', '/api/courses/:cid/lectures/:lid/unpublish', async ({ cid, lid }) => {
  const c = await loadCourse(cid);
  if (!c || !c.lectures.includes(lid)) throw httpError(404, '강의가 없습니다.');
  const src = path.join(DIRS.courses, cid, 'lectures', lid);
  const name = await uniqueDir(DIRS.inbox, lid);
  const meta = await readJSON(path.join(src, 'meta.json'), {});
  meta.suggestedCourse = { id: cid, title: c.title };
  meta.suggestedOrder = c.lectures.indexOf(lid) + 1;
  delete meta.publishedAt;
  await writeJSON(path.join(src, 'meta.json'), meta);
  await fs.rename(src, path.join(DIRS.inbox, name));
  c.lectures = c.lectures.filter((x) => x !== lid);
  await saveCourse(c);
  return { ok: true, draftId: name };
});

// 검토함(초안)
route('GET', '/api/inbox', async () => {
  const out = [];
  for (const id of await listDirs(DIRS.inbox)) {
    const { meta, body } = await loadLectureDir(path.join(DIRS.inbox, id));
    out.push(summarize(id, meta, body));
  }
  out.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return out;
});
route('GET', '/api/inbox/:did', async ({ did }) => {
  if (!isSlug(did) || !existsSync(path.join(DIRS.inbox, did))) throw httpError(404, '초안이 없습니다.');
  const { meta, body } = await loadLectureDir(path.join(DIRS.inbox, did));
  return { id: did, meta, body, assetBase: `/files/inbox/${did}/`, report: validateLecture(meta, body) };
});
// 승인: 강좌에 넣기
route('POST', '/api/inbox/:did/approve', async ({ did, body }) => {
  const src = isSlug(did) && path.join(DIRS.inbox, did);
  if (!src || !existsSync(src)) throw httpError(404, '초안이 없습니다.');
  let c;
  if (body.newCourse) c = await createCourse(body.newCourse);
  else {
    c = await loadCourse(body.courseId);
    if (!c) throw httpError(400, '넣을 강좌를 선택하세요.');
  }
  const lecturesDir = path.join(DIRS.courses, c.id, 'lectures');
  await fs.mkdir(lecturesDir, { recursive: true });
  const lid = await uniqueDir(lecturesDir, did);
  const meta = await readJSON(path.join(src, 'meta.json'), {});
  meta.publishedAt = now();
  if (body.reviewNote) meta.reviewNote = String(body.reviewNote);
  delete meta.rejection;
  await writeJSON(path.join(src, 'meta.json'), meta);
  await fs.rename(src, path.join(lecturesDir, lid));
  // 위치: 1부터 시작하는 강 번호. 없거나 범위를 넘으면 맨 뒤.
  let pos = Number(body.position);
  if (!Number.isInteger(pos) || pos < 1 || pos > c.lectures.length + 1) pos = c.lectures.length + 1;
  c.lectures.splice(pos - 1, 0, lid);
  await saveCourse(c);
  return { ok: true, courseId: c.id, lectureId: lid, number: pos };
});
// 반려
route('POST', '/api/inbox/:did/reject', async ({ did, body }) => {
  const src = isSlug(did) && path.join(DIRS.inbox, did);
  if (!src || !existsSync(src)) throw httpError(404, '초안이 없습니다.');
  const meta = await readJSON(path.join(src, 'meta.json'), {});
  meta.rejection = { reason: String(body.reason || ''), at: now() };
  await writeJSON(path.join(src, 'meta.json'), meta);
  const name = await uniqueDir(DIRS.rejected, did);
  await fs.mkdir(DIRS.rejected, { recursive: true });
  await fs.rename(src, path.join(DIRS.rejected, name));
  return { ok: true };
});

// 반려함
route('GET', '/api/rejected', async () => {
  const out = [];
  for (const id of await listDirs(DIRS.rejected)) {
    const { meta, body } = await loadLectureDir(path.join(DIRS.rejected, id));
    out.push(summarize(id, meta, body));
  }
  out.sort((a, b) => String(b.rejection?.at).localeCompare(String(a.rejection?.at)));
  return out;
});
route('GET', '/api/rejected/:did', async ({ did }) => {
  if (!isSlug(did) || !existsSync(path.join(DIRS.rejected, did))) throw httpError(404, '반려된 강의가 없습니다.');
  const { meta, body } = await loadLectureDir(path.join(DIRS.rejected, did));
  return { id: did, meta, body, assetBase: `/files/rejected/${did}/`, report: validateLecture(meta, body) };
});
route('POST', '/api/rejected/:did/restore', async ({ did }) => {
  const src = isSlug(did) && path.join(DIRS.rejected, did);
  if (!src || !existsSync(src)) throw httpError(404, '반려된 강의가 없습니다.');
  const meta = await readJSON(path.join(src, 'meta.json'), {});
  delete meta.rejection;
  await writeJSON(path.join(src, 'meta.json'), meta);
  const name = await uniqueDir(DIRS.inbox, did);
  await fs.rename(src, path.join(DIRS.inbox, name));
  return { ok: true, draftId: name };
});
route('DELETE', '/api/rejected/:did', async ({ did }) => {
  const src = isSlug(did) && path.join(DIRS.rejected, did);
  if (!src || !existsSync(src)) throw httpError(404, '반려된 강의가 없습니다.');
  await fs.rm(src, { recursive: true, force: true });
  return { ok: true };
});

// ---------- 서버 ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname.startsWith('/api/')) {
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = pathname.match(r.re);
        if (!m) continue;
        const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));
        for (const k of ['cid', 'lid', 'did']) {
          if (params[k] !== undefined && !isSlug(params[k])) throw httpError(400, '잘못된 ID입니다.');
        }
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
        return send(res, 200, await r.handler({ ...params, body }));
      }
      throw httpError(404, '알 수 없는 API입니다.');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw httpError(405, '허용되지 않는 요청입니다.');
    // 강의 자료(사진 등): content/ 아래 파일. meta.json·lecture.md 외 자료와 함께 제공
    if (pathname.startsWith('/files/')) {
      const file = safeJoin(CONTENT, pathname.slice('/files/'.length));
      if (!file) throw httpError(403, '접근할 수 없는 경로입니다.');
      return serveFile(res, file, req);
    }
    if (pathname.startsWith('/vendor/')) {
      const rel = VENDOR[pathname.slice('/vendor/'.length)];
      if (!rel) throw httpError(404, '없는 라이브러리입니다.');
      return serveFile(res, path.join(ROOT, rel), req);
    }
    const file = safeJoin(PUBLIC, pathname === '/' ? 'index.html' : pathname.slice(1));
    if (!file) throw httpError(403, '접근할 수 없는 경로입니다.');
    if (!existsSync(file)) return serveFile(res, path.join(PUBLIC, 'index.html'), req);
    return serveFile(res, file, req);
  } catch (e) {
    if (!e.status) console.error(e);
    send(res, e.status || 500, { error: e.status ? e.message : '서버 오류가 발생했습니다.' });
  }
});

await Promise.all(Object.values(DIRS).map((d) => fs.mkdir(d, { recursive: true })));
server.listen(PORT, HOST, () => {
  console.log(`강의 플랫폼 실행 중: http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

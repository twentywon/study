// content/inbox/<id>/ 의 강의를 강의 서재 앱(artifact) 저장소 문서로 변환합니다.
// 사용: node scripts/export-for-artifact.js <출력폴더> [강의ID ...]
//   <출력폴더>/lectures/<id>.json  → lectures 컬렉션 문서 (status: inbox)
//   <출력폴더>/bodies/<id>.json    → bodies 컬렉션 문서 ({ body })
//   <출력폴더>/seed.json           → 모든 문서를 한데 모은 것(시험용)
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLecture } from '../lib/validate.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const INBOX = path.join(ROOT, 'content', 'inbox');
const [out, ...only] = process.argv.slice(2);
if (!out) { console.error('출력 폴더를 지정하세요.'); process.exit(1); }

const ids = only.length ? only : (await fs.readdir(INBOX, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
const seed = { lectures: {}, bodies: {} };
await fs.mkdir(path.join(out, 'lectures'), { recursive: true });
await fs.mkdir(path.join(out, 'bodies'), { recursive: true });
for (const id of ids) {
  const dir = path.join(INBOX, id);
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8'));
  const body = await fs.readFile(path.join(dir, 'lecture.md'), 'utf8');
  const { stats, issues } = validateLecture(meta, body);
  const lecture = { ...meta, status: 'inbox', courseId: null, stats };
  delete lecture.rejection; delete lecture.publishedAt;
  await fs.writeFile(path.join(out, 'lectures', `${id}.json`), JSON.stringify(lecture, null, 2));
  await fs.writeFile(path.join(out, 'bodies', `${id}.json`), JSON.stringify({ body }, null, 2));
  seed.lectures[id] = lecture; seed.bodies[id] = { body };
  const errs = issues.filter((i) => i.level === 'error');
  console.log(`${id}: ${Buffer.byteLength(body)}바이트, 오류 ${errs.length}건${errs.length ? ' — ' + errs.map((e) => e.message).join(' / ') : ''}`);
}
await fs.writeFile(path.join(out, 'seed.json'), JSON.stringify(seed));

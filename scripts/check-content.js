// 모든 강의(검토함·강좌·반려함)를 점검해 오류/주의를 출력합니다. 오류가 있으면 종료 코드 1.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateLecture } from '../lib/validate.js';

const CONTENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'content');
const dirs = async (d) => (await fs.readdir(d, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => path.join(d, e.name));

const targets = [...await dirs(path.join(CONTENT, 'inbox'))];
for (const c of await dirs(path.join(CONTENT, 'courses'))) targets.push(...await dirs(path.join(c, 'lectures')));

let errors = 0;
for (const dir of targets) {
  const meta = JSON.parse(await fs.readFile(path.join(dir, 'meta.json'), 'utf8').catch(() => '{}'));
  const body = await fs.readFile(path.join(dir, 'lecture.md'), 'utf8').catch(() => '');
  const { issues, stats } = validateLecture(meta, body);
  const rel = path.relative(CONTENT, dir);
  console.log(`\n■ ${rel} — ${meta.title || '(제목 없음)'}`);
  console.log(`  글자 ${stats.chars} · 그림 ${stats.figures} · 표 ${stats.tables} · 연표 ${stats.timelines} · 도식 ${stats.diagrams} · 차트 ${stats.charts} · 참고문헌 ${stats.references}`);
  for (const i of issues) console.log(`  ${i.level === 'error' ? '✗ 오류' : '△ 주의'} ${i.message}`);
  if (!issues.length) console.log('  ✓ 문제 없음');
  errors += issues.filter((i) => i.level === 'error').length;
}
console.log(`\n강의 ${targets.length}편 점검, 오류 ${errors}건`);
process.exit(errors ? 1 : 0);

# 강의 서재 — 강의 검토·게시 플랫폼

Claude가 생성한 강의를 **검토함**에서 읽어 보고, 마음에 들면 강좌에 **N강으로 넣고**, 아니면 **반려**하는 개인용 학습 플랫폼입니다.

## 바로 쓰기 (링크)

claude.ai 아티팩트로 게시된 단일 HTML 앱: https://claude.ai/artifact/H4FC3VRkyrYLXzgtWNhiek

- 원본 파일: [artifact/study.html](artifact/study.html)
- 강좌·강의는 아티팩트 저장소(db)에 저장됩니다: `courses`, `lectures`(정보·상태), `bodies`(본문)
- 사진은 아티팩트 자료 저장소에 올리고 본문에서 `src: asset:<ID>`로 씁니다
- 새 강의 넣기: `content/inbox/<ID>/`에 작성 → `node scripts/export-for-artifact.js <출력폴더> <ID>` → 저장소에 기록

## 로컬 서버판 실행 (선택)

```bash
npm install
npm start
```

브라우저에서 http://localhost:4173 을 엽니다. (포트 변경: `PORT=5000 npm start`)

## 화면

| 메뉴 | 하는 일 |
|---|---|
| 강좌 | 강좌 목록 → 강좌별 1강, 2강 … 목록 → 강의 읽기(목차·이전/다음 강) |
| 검토함 | 새로 생성된 강의 미리보기 + 자동 점검 + **승인(강좌·몇 강 선택) / 반려** |
| 반려함 | 반려한 강의 보관, 검토함으로 복원 또는 완전 삭제 |
| 작성 규격 | 강의 파일 형식 안내 ([docs/LECTURE_FORMAT.md](docs/LECTURE_FORMAT.md)) |

강좌 화면에서는 강의 순서를 ↑↓로 바꾸거나, 강의를 빼서 검토함으로 되돌릴 수 있습니다.

## 데이터 구조

모든 데이터는 `content/` 아래 파일로 저장되므로 git으로 그대로 버전 관리됩니다.

```
content/
├── inbox/<강의ID>/            검토 대기 (meta.json, lecture.md, assets/)
├── courses/<강좌ID>/
│   ├── course.json            강좌 정보 + 강의 순서
│   └── lectures/<강의ID>/     게시된 강의
└── rejected/<강의ID>/         반려된 강의
```

## 강의 품질 기준

- 시각자료: 실제 사진·사료·지도(**AI 생성 그림 금지**, 모든 그림에 출처·라이선스 필수), 표, 연표, 도식, 차트
- 내용: 최대한 자세히
- `npm run check`로 모든 강의의 출처 누락·분량·시각자료 수를 점검합니다.

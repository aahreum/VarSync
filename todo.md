# ✅ Figma Variables Sync - ToDo List

## 1단계: 환경 설정 및 기초 조사

- [x] Figma Plugin API에서 `Variables` 읽어오는 방법 분석 (`figma.variables.getLocalVariables()`)
- [x] GitHub API(Octokit) 연동 테스트 (간단한 파일 생성 테스트)
- [x] `ui.html`에 필요한 입력창 구성 (GitHub URL, Token, Branch명)

## 2단계: 데이터 가공 로직 구현

- [x] 피그마 변수 데이터를 JSON 구조로 변환하는 함수 작성
- [ ] Primitive와 Semantics 그룹을 필터링하는 로직 구현
- [ ] 변수 내보내기 시 파일 두 개(`primitive.json`, `semantics.json`)로 분기 처리

## 3단계: GitHub 연동 로직 (핵심)

- [ ] 사용자가 입력한 기준 브랜치(Base)에서 새 브랜치 생성 로직 구현
- [ ] 변수 JSON 데이터를 파일로 커밋(Commit)
- [ ] GitHub Pull Request 생성 API 연동

## 4단계: UI/UX 고도화

- [ ] 성공/실패 토스트 알림 메시지 추가
- [ ] GitHub Token을 매번 입력하지 않도록 로컬 저장 (`figma.clientStorage`)
- [ ] 진행 상황 표시 (로딩 스피너)

## 5단계: 테스트 및 배포

- [ ] 다양한 변수 타입(Color, Float, String) 정상 변환 테스트
- [ ] 실제 GitHub 레포지토리에 PR 생성 테스트
- [ ] (선택 사항) README.md 작성 및 배포 준비

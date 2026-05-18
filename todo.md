# VarSync v1.1 - Figma Styles → GitHub Sync

## 배경 (Context)

v1.0에서 Variables(변수) 동기화는 완성됨.
v1.1 목표: **Figma Styles**(Paint/Text/Effect) 도 Variables와 동일한 방식으로 GitHub에 JSON PR로 내보내기.

Figma Styles API:
- `figma.getLocalPaintStyles()` → 컬러 스타일
- `figma.getLocalTextStyles()` → 타이포그래피 스타일
- `figma.getLocalEffectStyles()` → 이펙트 스타일 (shadow, blur)

---

## Phase 1: Styles 데이터 추출 (code.ts)

- [ ] `figma.getLocalPaintStyles()`로 Paint 스타일 읽기 → DTCG `color` 토큰으로 변환
  - SolidPaint → `{ value: "#hex", type: "color" }`
  - GradientPaint → 일단 `"gradient"` 문자열로 폴백 처리
- [ ] `figma.getLocalTextStyles()`로 Text 스타일 읽기 → 타이포그래피 토큰으로 변환
  - `fontSize`, `fontName.family`, `fontName.style`, `letterSpacing`, `lineHeight` 포함
  - DTCG composite 방식: 각 속성을 하위 키로 분리
- [ ] `figma.getLocalEffectStyles()`로 Effect 스타일 읽기 → shadow 토큰으로 변환
  - `DROP_SHADOW`, `INNER_SHADOW` 값만 처리 (`color`, `offset`, `radius`)
  - BLUR 타입은 `{ value: { blur: radius }, type: "blur" }` 형태
- [ ] 스타일 이름을 `/` 기준으로 분리해 `setNestedToken`과 동일한 중첩 구조 생성
- [ ] 결과물 파일명: `styles/colors.json`, `styles/typography.json`, `styles/effects.json`

## Phase 2: UI - Styles 선택 UI 추가 (ui.html)

- [ ] Step 2 화면에 "Styles" 섹션을 Variables 컬렉션 목록 아래에 별도 추가
  - 체크박스 3개: Paint (Colors), Text (Typography), Effects
  - 각 체크박스 옆에 스타일 개수 표시 (예: `Colors (12)`)
- [ ] Styles 섹션 헤더를 Variables 섹션과 시각적으로 구분 (divider + 레이블)
- [ ] 스타일 선택 상태를 `syncStyles: { paint: boolean, text: boolean, effect: boolean }` 형태로 관리

## Phase 3: 메시지 연동 (code.ts ↔ ui.html)

- [ ] `request-styles` 메시지 타입 추가 → `PluginMessage` 유니온에 포함
  - payload: `{ includeStyles: { paint: boolean, text: boolean, effect: boolean } }`
- [ ] `sendStyles()` 함수 구현: 선택된 스타일 타입별 개수를 UI에 먼저 전송
  - 메시지 타입: `styles-count-loaded`
- [ ] 기존 `request-variables` 처리 로직과 함께 Styles도 수집 후 `variables-data` 페이로드에 포함
  - 또는 별도 `styles-data` 메시지로 분리 (파일 목록을 합산해 GitHub에 올림)

## Phase 4: GitHub 업로드 통합 (ui.html)

- [ ] 기존 `syncToGitHub()` 함수가 Variables 파일 + Styles 파일을 함께 커밋하도록 수정
  - Variables: `tokens/{kebab-collection-name}.json`
  - Styles: `styles/colors.json`, `styles/typography.json`, `styles/effects.json`
- [ ] PR 본문에 업로드된 파일 목록 자동 포함 (Variables N개, Styles M개)
- [ ] 아무것도 선택되지 않았을 때(Variables도 Styles도 0개) 동기화 버튼 비활성화

## Phase 5: 버전 업 및 배포

- [x] `package.json` version → `1.1.0` 으로 bump
- [x] `npm run build`로 `code.js` 재빌드
- [ ] Figma 데스크탑 앱 > 플러그인 우클릭 > **Publish new version**
  - 릴리즈 노트 예시: "✨ Figma Styles(Color/Typography/Effect) GitHub 동기화 지원"

---

## 완료 기준 (Definition of Done)

- Paint/Text/Effect 스타일 각각 체크박스로 선택 가능
- 선택된 스타일이 `styles/*.json`으로 Variables와 함께 단일 PR에 포함
- 아무 스타일도 없는 파일은 커밋되지 않음
- 기존 Variables 동기화 기능 회귀 없음

---

## 참고

- Figma Styles API 공식 문서: `figma.getLocalPaintStyles()` 등 Plugin API typings 참조
- 기존 Variables 변환 로직: `buildTokensByCollection()` 함수 참고
- DTCG 표준: `{ value, type, description? }` 구조 유지

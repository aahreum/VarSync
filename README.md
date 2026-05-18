# VarSync

Figma Variables & Styles를 GitHub PR로 자동 동기화하는 Figma 플러그인입니다.

디자인 시스템의 Variables(Color, Spacing, Typography 등)와 Styles(Paint/Text/Effect)를 JSON 토큰 파일로 변환하여 GitHub 레포지토리에 PR을 자동 생성합니다.

## 주요 기능

- **Variables & Styles to JSON**: Figma Variables와 Styles를 DTCG 표준 JSON 토큰 파일로 변환
- **GitHub PR 자동 생성**: 변환된 파일을 GitHub에 브랜치 생성 + 커밋 + PR까지 자동화
- **탭 대시보드 미리보기**: Variables / Styles 탭 전환으로 내보낼 항목을 시각적으로 확인
  - Variables: 컬렉션별 컬러칩 그리드 / 값 테이블
  - Styles: 컬러 스와치 그리드 (Colors) / 타이포그래피 테이블 (Typography) / 이펙트 테이블 (Effects)
- **그룹별 내보내기**: 변수 경로 기준으로 내보낼 항목 선택
- **Alias Resolve**: 참조(alias) 변수의 실제 값을 자동으로 추적하여 표시
- **토큰 저장**: GitHub Access Token을 로컬에 안전하게 저장
- **PR 통계**: 컬렉션 및 Styles별 토큰 건수를 PR 본문에 자동 포함

## 출력 파일 구조

```
{저장 폴더}/
├── {collection-name}.json        # Variables 컬렉션별 파일
├── styles/
│   ├── colors.json               # Paint Styles (color 토큰)
│   ├── typography.json           # Text Styles (typography 토큰)
│   └── effects.json              # Effect Styles (shadow/blur 토큰)
```

모든 파일은 [DTCG(W3C Design Token Community Group)](https://tr.designtokens.org/) 표준을 따르며 Style Dictionary v4와 호환됩니다.

## 설치 방법

### 릴리즈 다운로드 (권장)

1. [Releases](https://github.com/aahreum/VarSync/releases) 페이지에서 `VarSync-plugin.zip` 다운로드
2. 압축 해제
3. Figma 데스크톱 앱 실행
4. **Plugins** > **Development** > **Import plugin from manifest...**
5. 압축 해제한 폴더의 `manifest.json` 선택

### 소스에서 빌드

```bash
git clone https://github.com/aahreum/VarSync.git
cd VarSync
npm install
npm run build
```

이후 Figma에서 `manifest.json`을 import하여 사용합니다.

## 사용 방법

1. **Step 1**: GitHub Repository URL, Access Token, Base Branch 입력
2. **Step 2 — Variables 탭**: 내보낼 컬렉션 및 그룹 선택
3. **Step 2 — Styles 탭**: 내보낼 Styles 선택 (Colors / Typography / Effects)
4. **Sync to GitHub** 클릭 → 브랜치 생성 + 파일 커밋 + PR 자동 생성

## 기술 스택

- **Figma Plugin API** (TypeScript)
- **GitHub REST API** (Contents API, Git Refs API, Pulls API)

## Changelog

### v1.1.0
- Figma Styles(Paint/Text/Effect) GitHub 동기화 지원
- Step 2에 Variables / Styles 탭 전환 UI 추가
- Styles 리치 미리보기: 컬러 스와치 그리드, 타이포그래피 테이블, 이펙트 테이블

### v1.0.1
- manifest.json version 필드 제거 (Figma API 호환)

### v1.0.0
- 최초 릴리즈
- Figma Variables → GitHub PR 자동 동기화
- 컬렉션별 대시보드 미리보기, 그룹별 내보내기, Alias Resolve

## Agentic Coding

이 프로젝트는 **에이전틱 코딩(Agentic Coding)** 방식으로 개발되었습니다.
[Claude Code](https://claude.ai/claude-code)를 활용하여 기능 구현, 버그 수정, 코드 리뷰, PR 생성까지 AI 에이전트와 협업하며 진행했습니다.

## License

MIT

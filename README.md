# VarSync

Figma Variables를 GitHub PR로 자동 동기화하는 Figma 플러그인입니다.

디자인 시스템의 변수(Color, Spacing, Typography 등)를 JSON으로 변환하여 GitHub 레포지토리에 PR을 자동 생성합니다.

## 주요 기능

- **Variables to JSON**: Figma Variables를 JSON 토큰 파일로 변환
- **GitHub PR 자동 생성**: 변환된 파일을 GitHub에 브랜치 생성 + 커밋 + PR까지 자동화
- **대시보드 미리보기**: 컬렉션별 변수를 시각적으로 확인 (컬러칩 그리드 / 값 테이블)
- **그룹별 내보내기**: 변수 경로 기준(color, spacing 등)으로 내보낼 항목 선택
- **Alias Resolve**: 참조(alias) 변수의 실제 값을 자동으로 추적하여 표시
- **토큰 저장**: GitHub Access Token을 로컬에 안전하게 저장
- **PR 통계**: 컬렉션별 타입(Color, Number, String, Boolean) 건수를 PR 본문에 자동 포함

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
2. **Step 2**: 내보낼 컬렉션 및 그룹 선택 후 **Sync to GitHub** 클릭

## 기술 스택

- **Figma Plugin API** (TypeScript)
- **GitHub REST API** (Contents API, Git Refs API, Pulls API)

## Agentic Coding

이 프로젝트는 **에이전틱 코딩(Agentic Coding)** 방식으로 개발되었습니다.
[Claude Code](https://claude.ai/claude-code)를 활용하여 기능 구현, 버그 수정, 코드 리뷰, PR 생성까지 AI 에이전트와 협업하며 진행했습니다.

## License

MIT

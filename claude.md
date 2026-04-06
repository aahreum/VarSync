# 프로젝트: Figma Variables to GitHub Sync

## 1. 개요 (Overview)

- **목적**: 피그마의 Variables(변수) 데이터를 GitHub 레포지토리에 JSON 형태의 PR(Pull Request)로 자동 내보내기.
- **주요 타겟**: 피그마 디자인 시스템을 코드로 자동화하고자 하는 디자이너 및 프런트엔드 개발자.

## 2. 주요 기능 (Core Features)

### 2.1 GitHub 연동 설정

- GitHub Repository URL 및 Access Token 설정.
- 기준 브랜치(Base Branch) 입력: 예) `main`, `dev` 등 사용자 지정.
- 대상 브랜치(Target Branch) 자동 생성: 변수 업데이트를 위한 신규 브랜치 생성 및 PR 생성.

### 2.2 Variables 데이터 처리

- **Primitive (기본)**: 원색, 기본 간격 등 기초 변수 파일 생성.
- **Semantics (의미론적)**: 상황에 맞춰 사용되는(예: background-primary) 변수 파일 생성.
- 사용자가 두 파일을 개별적으로 혹은 동시에 내보낼 수 있도록 설정.

### 2.3 UI/UX (Figma Plugin UI)

- GitHub 정보 입력 폼 (URL, Token, Branch).
- 내보낼 변수 그룹 선택 체크박스.
- PR 메시지 작성 기능.

## 3. 기술 스택 (Technical Stack)

- **Framework**: Figma Plugin API
- **Language**: TypeScript, React (Figma UI 사용 시)
- **API**: GitHub REST API (Octokit 권장)
- **Data Format**: JSON (Tailwind CSS나 Style Dictionary와 호환 가능한 구조)

---

## Workflow

You MUST follow todo.md.

1. Read todo.md
2. Select ONE task
3. Explain briefly why you chose it
4. Implement minimal code
5. Update todo.md

---

## Validation (Harness)

Before implementing:

- Check expected behavior

After implementing:

- Verify result
- Consider edge cases

If none:

- Suggest simple test cases

---

## Git (MANDATORY)

Before starting:

- create issue (gh issue create)

After completing:

- branch: feature/{task}
- commit: feat: {task}
- push
- create PR (gh pr create)
- link PR to issue

---

## Sub Agents

Use when needed:

- code-reviewer: PR review

After PR:

- Use code-reviewer to review

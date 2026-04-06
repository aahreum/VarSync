# GitHub API 연동 분석

> 1단계 작업: GitHub API를 통한 파일 커밋 및 PR 생성 방법 분석

---

## 아키텍처: 왜 Octokit 대신 fetch인가

이 프로젝트는 **번들러(webpack/rollup) 없이 TypeScript 직접 컴파일** 구성이다.  
Octokit은 npm 패키지로 번들링이 필요하기 때문에 현재 환경에서 main 코드(`code.ts`)에서 사용할 수 없다.

또한 Figma Plugin의 실행 구조상 **네트워크 요청은 UI(iframe)에서만 가능하다**:

```
[Figma Plugin 실행 구조]

┌─────────────────────────────────┐
│  Main Thread (code.ts)          │
│  - figma.* API 접근 가능         │
│  - fetch 사용 불가               │
│  - DOM/window 접근 불가          │
└──────────┬──────────────────────┘
           │ postMessage
           ▼
┌─────────────────────────────────┐
│  UI Thread (ui.html)            │
│  - fetch / XMLHttpRequest 가능   │
│  - figma.* 직접 접근 불가         │
│  - manifest allowedDomains 적용  │
└─────────────────────────────────┘
```

**결론**: GitHub API 호출은 `ui.html`의 `<script>`에서 `fetch`로 처리한다.

---

## manifest.json 설정

GitHub API 호출을 허용하려면 `networkAccess.allowedDomains`에 도메인을 추가해야 한다.

```json
"networkAccess": {
  "allowedDomains": [
    "https://api.github.com"
  ]
}
```

---

## 전체 동작 흐름

```
1. 사용자가 UI에 GitHub 정보 입력 (repo, token, base branch)
2. "Sync" 클릭 → UI → postMessage → Plugin Main
3. Plugin Main이 figma.variables로 변수 읽기
4. Plugin Main → postMessage → UI (변수 데이터 전달)
5. UI가 GitHub API 순차 호출:
   a. base 브랜치의 최신 SHA 조회
   b. 새 브랜치 생성
   c. primitive.json / semantics.json 파일 커밋
   d. Pull Request 생성
6. UI가 결과(PR URL)를 화면에 표시
```

---

## 필요한 GitHub API 엔드포인트

Base URL: `https://api.github.com`  
인증: `Authorization: Bearer {token}` 헤더

### 1. base 브랜치 SHA 조회

```
GET /repos/{owner}/{repo}/git/ref/heads/{branch}
```

```ts
const res = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`,
  { headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } }
);
const { object: { sha } } = await res.json();
```

### 2. 새 브랜치 생성

```
POST /repos/{owner}/{repo}/git/refs
```

```ts
await fetch(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    ref: `refs/heads/${newBranch}`,
    sha: baseSha,
  }),
});
```

### 3. 파일 생성/업데이트 (커밋)

```
PUT /repos/{owner}/{repo}/contents/{path}
```

```ts
// content는 Base64 인코딩 필요
const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

await fetch(
  `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
  {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      message: 'chore: sync figma variables',
      content,
      branch: newBranch,
      sha: existingFileSha, // 파일이 이미 있을 경우 필요, 없으면 생략
    }),
  }
);
```

### 4. Pull Request 생성

```
POST /repos/{owner}/{repo}/pulls
```

```ts
const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  },
  body: JSON.stringify({
    title: 'chore: sync figma variables',
    head: newBranch,
    base: baseBranch,
    body: 'Figma Variables Sync 플러그인에 의해 자동 생성된 PR입니다.',
  }),
});
const { html_url } = await res.json();
```

---

## 파일 존재 여부 확인 (기존 파일 SHA 조회)

파일을 업데이트할 때 기존 파일의 SHA가 필요하다. 파일이 없으면 `sha`를 생략한다.

```ts
async function getFileSha(
  owner: string, repo: string, path: string, branch: string, token: string
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
    { headers: { Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' } }
  );
  if (res.status === 404) return null;
  const data = await res.json();
  return data.sha;
}
```

---

## GitHub 토큰 권한 (Scope)

Personal Access Token(Classic) 또는 Fine-grained PAT 사용 가능.

| 권한 | 설명 |
|------|------|
| `repo` (classic) | 전체 저장소 접근 (private 포함) |
| `Contents: Read & Write` (fine-grained) | 파일 읽기/쓰기 |
| `Pull requests: Read & Write` (fine-grained) | PR 생성 |

---

## 입력값 파싱 유틸리티

UI에서 GitHub URL을 파싱해 owner/repo를 추출하는 함수:

```ts
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // https://github.com/owner/repo 또는 owner/repo 형식 모두 지원
  const match = url.match(/(?:github\.com\/)?([^/]+)\/([^/\s]+?)(?:\.git)?$/);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}
```

---

## 연동 테스트 체크리스트

- [ ] `Authorization` 헤더로 토큰 인증 성공 확인
- [ ] 존재하는 레포지토리에서 브랜치 SHA 조회 성공
- [ ] 새 브랜치 생성 확인 (GitHub 웹에서 직접 확인)
- [ ] 테스트 파일(`test.json`) 커밋 후 파일 생성 확인
- [ ] PR 생성 및 `html_url` 반환 확인

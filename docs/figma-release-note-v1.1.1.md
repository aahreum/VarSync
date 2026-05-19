# VarSync 업데이트 노트 — v1.1.1

## 버그 수정 3건

### 1. 스타일 이름이 마지막 단어만 보이던 문제 수정
Typography / Effects 미리보기와 내보낸 JSON 모두에서 스타일의 전체 경로가 표시됩니다.

**변경 전**
- Figma 스타일 이름: `heading/xl`
- 표시되던 이름: `xl`

**변경 후**
- 표시되는 이름: `heading-xl`

### 2. lineHeight 부동소수점 오류 수정
Figma 내부 부동소수점 오차로 인해 `139.9999976158142%` 같은 값이 JSON에 출력되던 문제를 수정했습니다. 이제 `140%`처럼 깔끔한 값으로 출력됩니다.

### 3. Variables를 참조하는 스타일 속성이 raw value로 출력되던 문제 수정
Typography / Colors 스타일이 Figma Variables를 참조하고 있을 때, 기존에는 실제 숫자/색상값이 그대로 출력됐습니다. 이제 변수 경로를 `{font.size.48}` 형태의 참조값으로 출력합니다.

**변경 전**
```json
"fontSize": 48,
"lineHeight": "139.9999976158142%"
```

**변경 후**
```json
"fontSize": "{font.size.48}",
"lineHeight": "140%"
```

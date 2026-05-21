# VarSync 업데이트 노트 — v1.1.2

## 버그 수정 1건

### 라이브러리 변수 바인딩 시 raw value로 출력되던 문제 수정

팀 라이브러리 등 외부 컬렉션에서 가져온 변수를 스타일에 바인딩한 경우에도 `{path.to.variable}` 참조 형태로 올바르게 출력됩니다.

**변경 전**
```json
"fontStyle": "7 Bold",
"fontSize": 48
```

**변경 후**
```json
"fontStyle": "{font.weight.bold}",
"fontSize": "{font.size.48}"
```

> 로컬 변수 바인딩은 기존과 동일하게 동작합니다.

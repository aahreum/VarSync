# Figma Variables API 분석

> 1단계 작업: `figma.variables.getLocalVariablesAsync()`를 통한 Variables 읽기 방법 분석

---

## 개요

Figma Plugin API의 Variables 기능은 `figma.variables` 네임스페이스를 통해 접근한다.  
플러그인 manifest에 `"documentAccess": "dynamic-page"`가 설정된 경우(이 프로젝트 포함), **반드시 Async 메서드**를 사용해야 한다. 동기 메서드를 호출하면 예외가 발생한다.

---

## 핵심 API: 로컬 변수 읽기

### `figma.variables.getLocalVariablesAsync(type?)`

현재 파일의 모든 로컬 변수를 배열로 반환한다.

```ts
const variables: Variable[] = await figma.variables.getLocalVariablesAsync();

// 특정 타입만 필터링
const colorVars = await figma.variables.getLocalVariablesAsync('COLOR');
const floatVars = await figma.variables.getLocalVariablesAsync('FLOAT');
```

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `type` | `VariableResolvedDataType` (선택) | 필터링할 변수 타입. 생략 시 전체 반환 |

**`VariableResolvedDataType`** 가능 값:
```ts
type VariableResolvedDataType = 'BOOLEAN' | 'COLOR' | 'FLOAT' | 'STRING'
```

---

### `figma.variables.getLocalVariableCollectionsAsync()`

현재 파일의 모든 로컬 변수 컬렉션을 배열로 반환한다.

```ts
const collections: VariableCollection[] =
  await figma.variables.getLocalVariableCollectionsAsync();
```

---

### `figma.variables.getVariableByIdAsync(id)`

ID로 특정 변수 하나를 조회한다. 없으면 `null` 반환.

```ts
const variable = await figma.variables.getVariableByIdAsync('VariableId:1:1');
```

---

## Variable 타입 상세

```ts
interface Variable {
  // 읽기 전용
  readonly id: string                          // 고유 식별자
  readonly remote: boolean                     // 외부 라이브러리 변수 여부
  readonly variableCollectionId: string        // 속한 컬렉션의 ID
  readonly key: string                         // 라이브러리 import용 키
  readonly resolvedType: VariableResolvedDataType  // 'BOOLEAN' | 'COLOR' | 'FLOAT' | 'STRING'
  readonly valuesByMode: { [modeId: string]: VariableValue }  // 모드별 값 (alias 미해석)
  readonly codeSyntax: { [platform in CodeSyntaxPlatform]?: string }

  // 읽기/쓰기
  name: string
  description: string
  hiddenFromPublishing: boolean
  scopes: Array<VariableScope>

  // 메서드
  setValueForMode(modeId: string, newValue: VariableValue): void
  resolveForConsumer(consumer: SceneNode): { value: VariableValue; resolvedType: VariableResolvedDataType }
  remove(): void
  setVariableCodeSyntax(platform: CodeSyntaxPlatform, value: string): void
  removeVariableCodeSyntax(platform: CodeSyntaxPlatform): void
  valuesByModeForCollectionAsync(collection: VariableCollection): Promise<{ [modeId: string]: VariableValue }>
  removeOverrideForMode(extendedModeId: string): void
  getPublishStatusAsync(): Promise<PublishStatus>
}
```

### VariableValue 타입

```ts
type VariableValue = boolean | string | number | RGB | RGBA | VariableAlias

interface VariableAlias {
  type: 'VARIABLE_ALIAS'
  id: string  // 참조하는 변수의 ID
}
```

- `COLOR` 변수의 값은 `RGB` 또는 `RGBA` 객체
- `FLOAT` 변수의 값은 `number`
- `STRING` 변수의 값은 `string`
- `BOOLEAN` 변수의 값은 `boolean`
- 다른 변수를 참조하는 경우 `VariableAlias` 객체 (alias 체인)

### VariableScope 타입

변수가 Figma UI의 어떤 필드 피커에 표시될지를 결정한다.

```ts
type VariableScope =
  | 'ALL_SCOPES'
  | 'TEXT_CONTENT'
  | 'CORNER_RADIUS'
  | 'WIDTH_HEIGHT'
  | 'GAP'
  | 'ALL_FILLS'
  | 'FRAME_FILL'
  | 'SHAPE_FILL'
  | 'TEXT_FILL'
  | 'STROKE_COLOR'
  | 'STROKE_FLOAT'
  | 'EFFECT_FLOAT'
  | 'EFFECT_COLOR'
  | 'OPACITY'
  | 'FONT_FAMILY'
  | 'FONT_STYLE'
  | 'FONT_WEIGHT'
  | 'FONT_SIZE'
  | 'LINE_HEIGHT'
  | 'LETTER_SPACING'
  | 'PARAGRAPH_SPACING'
  | 'PARAGRAPH_INDENT'
```

---

## VariableCollection 타입 상세

```ts
interface VariableCollection {
  // 읽기 전용
  readonly id: string
  readonly remote: boolean
  readonly isExtension: boolean
  readonly modes: Array<{ modeId: string; name: string }>
  readonly variableIds: string[]    // 컬렉션에 속한 Variable ID 목록
  readonly defaultModeId: string
  readonly key: string

  // 읽기/쓰기
  name: string
  hiddenFromPublishing: boolean

  // 메서드
  addMode(name: string): string        // 새 모드 추가, 모드 ID 반환
  removeMode(modeId: string): void
  renameMode(modeId: string, newName: string): void
  remove(): void                       // 컬렉션과 모든 변수 삭제
  extend(name: string): ExtendedVariableCollection  // Enterprise only
  getPublishStatusAsync(): Promise<PublishStatus>
}
```

---

## 전체 변수 읽기 패턴 (VarSync 플러그인 기준)

아래는 이 프로젝트에서 변수를 읽어오는 기본 흐름이다.

```ts
async function readAllVariables() {
  // 1. 모든 컬렉션 가져오기
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  for (const collection of collections) {
    console.log(`컬렉션: ${collection.name}`);
    console.log(`  모드: ${collection.modes.map(m => m.name).join(', ')}`);

    // 2. 컬렉션에 속한 변수 ID로 각 변수 조회
    for (const varId of collection.variableIds) {
      const variable = await figma.variables.getVariableByIdAsync(varId);
      if (!variable) continue;

      console.log(`  변수: ${variable.name} (${variable.resolvedType})`);

      // 3. 모드별 값 읽기
      for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
        const modeName = collection.modes.find(m => m.modeId === modeId)?.name;
        console.log(`    [${modeName}]: ${JSON.stringify(value)}`);
      }
    }
  }
}
```

또는 `getLocalVariablesAsync()`로 한 번에 전체를 가져온 후 `variableCollectionId`로 분류할 수도 있다:

```ts
async function readVariablesFlat() {
  const allVariables = await figma.variables.getLocalVariablesAsync();

  // 컬렉션 ID 기준으로 그룹핑
  const grouped = allVariables.reduce<Record<string, Variable[]>>((acc, v) => {
    const key = v.variableCollectionId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});

  return grouped;
}
```

---

## 변수 이름의 그룹 구조

Figma에서 변수 이름에 `/`를 사용하면 계층 그룹을 표현한다.  
예: `"Primitive/Blue/100"`, `"Semantics/Background/Primary"`

이 프로젝트(VarSync)에서는 이 네이밍 규칙을 기반으로 **Primitive**와 **Semantics**를 분류한다.

```ts
function isPrimitive(variable: Variable): boolean {
  return variable.name.startsWith('Primitive/');
}

function isSemantics(variable: Variable): boolean {
  return variable.name.startsWith('Semantics/');
}
```

---

## Alias(참조) 변수 처리

`valuesByMode`의 값이 `VariableAlias`인 경우, 실제 값을 얻으려면 해당 변수를 재귀적으로 조회해야 한다.

```ts
async function resolveValue(value: VariableValue): Promise<VariableValue> {
  if (
    typeof value === 'object' &&
    'type' in value &&
    value.type === 'VARIABLE_ALIAS'
  ) {
    const referenced = await figma.variables.getVariableByIdAsync(value.id);
    if (!referenced) return value;
    const defaultModeId = /* 컬렉션의 defaultModeId */;
    return resolveValue(referenced.valuesByMode[defaultModeId]);
  }
  return value;
}
```

---

## 주의사항

1. **manifest 설정**: 이 프로젝트는 `"documentAccess": "dynamic-page"`이므로 반드시 Async API(`getLocalVariablesAsync`, `getLocalVariableCollectionsAsync`)를 사용해야 한다.
2. **`valuesByMode`는 alias를 해석하지 않는다.** 실제 값이 필요하면 `resolveForConsumer()` 또는 직접 재귀 조회해야 한다.
3. **`variableIds` 순서**: 컬렉션의 `variableIds` 순서는 Figma UI 표시 순서와 유사하지만 그룹 구조는 반영되지 않는다.
4. **플랜 제한**: 모드 추가(`addMode`)는 플랜별 개수 제한이 있고, `extend()`는 Enterprise 전용이다.

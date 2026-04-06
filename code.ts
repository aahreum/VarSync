// VarSync - Figma Variables → GitHub PR Sync Plugin
// docs/01-figma-variables-api.md 참고

figma.showUI(__html__, { width: 332, height: 340 });

// ── 메시지 타입 ───────────────────────────────────────────

type PluginMessage =
  // token은 UI에서 보관 — Main으로 전달하지 않음
  | { type: 'request-variables'; payload: { owner: string; repo: string; baseBranch: string } }
  | { type: 'close' };

// ── UI 메시지 수신 ────────────────────────────────────────

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'request-variables') {
    try {
      const tokens = await buildDesignTokens();
      // 변수 JSON만 전달 — 민감한 token은 UI에서 자체 관리
      figma.ui.postMessage({
        type: 'variables-data',
        payload: {
          primitiveJson: JSON.stringify(tokens.primitive, null, 2),
          semanticsJson: JSON.stringify(tokens.semantics, null, 2),
        },
      });
    } catch (e) {
      figma.ui.postMessage({
        type: 'error',
        message: e instanceof Error ? e.message : '변수를 읽는 중 오류가 발생했습니다.',
      });
    }
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// ── DTCG(W3C Design Token Community Group) 타입 정의 ─────
// Style Dictionary v4 / Tailwind CSS 등과 호환되는 표준 형식

interface DesignToken {
  $value: string | number | boolean;
  $type: 'color' | 'number' | 'string' | 'boolean';
  $description?: string;
}

// 중첩 토큰 그룹: 리프 노드가 DesignToken, 중간 노드가 TokenGroup
interface TokenGroup {
  [key: string]: TokenGroup | DesignToken;
}

// resolvedType → DTCG $type 매핑
const DTCG_TYPE: Record<VariableResolvedDataType, DesignToken['$type']> = {
  COLOR:   'color',
  FLOAT:   'number',
  STRING:  'string',
  BOOLEAN: 'boolean',
};

// 분류 대상 그룹 — 확장 시 이 배열에만 추가
const COLLECTION_GROUPS = ['primitive', 'semantics'] as const;
type GroupKey = (typeof COLLECTION_GROUPS)[number];

// ── 메인 변환 함수 ────────────────────────────────────────

async function buildDesignTokens(): Promise<Record<GroupKey, TokenGroup>> {
  // dynamic-page 환경이므로 반드시 Async API 사용
  const [collections, allVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  // collectionId → defaultModeId 매핑 ($value에 사용할 기본 모드)
  const defaultModeMap: Record<string, string> = {};
  for (const col of collections) {
    defaultModeMap[col.id] = col.defaultModeId;
  }

  // Pass 1: variableId → 경로 세그먼트 매핑 (alias 참조 해석용)
  // "Primitive/Color/Blue/100" → ["Color", "Blue", "100"]  (prefix 1개 제거)
  const idToPath: Record<string, string[]> = {};
  for (const v of allVariables) {
    const parts = v.name.split('/');
    idToPath[v.id] = parts.slice(1); // prefix(예: "Primitive") 제거
  }

  // Pass 2: 그룹별 TokenGroup 구성
  const result: Record<GroupKey, TokenGroup> = { primitive: {}, semantics: {} };

  for (const variable of allVariables) {
    const lowerName = variable.name.toLowerCase();
    // 변수 이름 prefix로 그룹 분류 ("Primitive/..." → "primitive")
    const groupKey = COLLECTION_GROUPS.find((g) => lowerName.startsWith(`${g}/`));
    if (!groupKey) continue;

    // 기본 모드 값을 $value로 사용
    const defaultModeId = defaultModeMap[variable.variableCollectionId];
    const rawValue = variable.valuesByMode[defaultModeId];
    if (rawValue === undefined) continue;

    const token: DesignToken = {
      $value: toTokenValue(rawValue, variable.resolvedType, idToPath),
      $type:  DTCG_TYPE[variable.resolvedType],
    };
    if (variable.description) {
      token.$description = variable.description;
    }

    // "Primitive/Color/Blue/100" → prefix 제거 후 ["Color", "Blue", "100"]
    // 이 경로로 result[groupKey]에 중첩 삽입
    const PREFIX_SEGMENT_COUNT = 1; // "Primitive" 또는 "Semantics" 1개 제거
    const pathSegments = variable.name.split('/').slice(PREFIX_SEGMENT_COUNT);
    setNestedToken(result[groupKey], pathSegments, token);
  }

  return result;
}

// ── 헬퍼 함수 ────────────────────────────────────────────

/**
 * VariableValue를 DTCG $value로 변환
 * - VariableAlias → "{Path.To.Token}" (Style Dictionary 참조 표기)
 * - COLOR         → "#rrggbb" or "rgba(r,g,b,a)"
 * - 나머지        → 원시값 그대로
 */
function toTokenValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  idToPath: Record<string, string[]>,
): DesignToken['$value'] {
  // VariableAlias: Style Dictionary 참조 형식 "{Color.Blue.100}"
  if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
    const refPath = idToPath[value.id];
    return refPath ? `{${refPath.join('.')}}` : `{${value.id}}`;
  }

  // COLOR: 0~1 범위 RGB(A) → hex / rgba 문자열
  if (
    resolvedType === 'COLOR' &&
    typeof value === 'object' &&
    'r' in value && 'g' in value && 'b' in value
  ) {
    const r = Math.round((value as RGB).r * 255);
    const g = Math.round((value as RGB).g * 255);
    const b = Math.round((value as RGB).b * 255);
    const a = 'a' in value ? (value as RGBA).a : 1;
    if (a === 1) {
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // FLOAT / STRING / BOOLEAN: 원시값 그대로
  return value as string | number | boolean;
}

/**
 * 중첩 경로에 DesignToken을 삽입
 * ["Color", "Blue", "100"], token → root.Color.Blue["100"] = token
 */
function setNestedToken(root: TokenGroup, path: string[], token: DesignToken): void {
  let node: TokenGroup = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    // 이미 DesignToken이 있는 자리면 그룹으로 교체 (드문 충돌 방지)
    if (!(key in node) || '$value' in (node[key] as object)) {
      node[key] = {};
    }
    node = node[key] as TokenGroup;
  }
  node[path[path.length - 1]] = token;
}

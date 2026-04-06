// VarSync - Figma Variables → GitHub PR Sync Plugin
// docs/01-figma-variables-api.md 참고

figma.showUI(__html__, { width: 332, height: 340 });

// ── 상수 ─────────────────────────────────────────────────

// "Primitive" / "Semantics" prefix 세그먼트 수
const PREFIX_SEGMENT_COUNT = 1;

// 분류 대상 그룹 — 확장 시 이 배열에만 추가
const COLLECTION_GROUPS = ['primitive', 'semantics'] as const;
type GroupKey = (typeof COLLECTION_GROUPS)[number];

// resolvedType → DTCG $type 매핑
const DTCG_TYPE: Record<VariableResolvedDataType, DesignToken['$type']> = {
  COLOR:   'color',
  FLOAT:   'number',
  STRING:  'string',
  BOOLEAN: 'boolean',
};

// UI 창 크기 제한
const UI_MIN_WIDTH  = 280;
const UI_MIN_HEIGHT = 280;
const UI_MAX_WIDTH  = 800;
const UI_MAX_HEIGHT = 800;

// ── 메시지 타입 ───────────────────────────────────────────

type PluginMessage =
  // token은 UI에서 보관 — Main으로 전달하지 않음
  | { type: 'request-variables'; payload: { owner: string; repo: string; baseBranch: string } }
  | { type: 'resize'; width: number; height: number }
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

  if (msg.type === 'resize') {
    // 범위를 벗어난 값은 클램핑
    const w = Math.min(Math.max(Math.round(msg.width),  UI_MIN_WIDTH),  UI_MAX_WIDTH);
    const h = Math.min(Math.max(Math.round(msg.height), UI_MIN_HEIGHT), UI_MAX_HEIGHT);
    figma.ui.resize(w, h);
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

// ── 타입 가드 ─────────────────────────────────────────────

function isDesignToken(node: TokenGroup | DesignToken): node is DesignToken {
  return '$value' in node;
}

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
  // "Primitive/Color/Blue/100" → ["Color", "Blue", "100"] (prefix 1개 제거)
  const idToPath: Record<string, string[]> = {};
  for (const v of allVariables) {
    idToPath[v.id] = v.name.split('/').slice(PREFIX_SEGMENT_COUNT);
  }

  // Pass 2: 그룹별 TokenGroup 구성
  const result: Record<GroupKey, TokenGroup> = { primitive: {}, semantics: {} };

  for (const variable of allVariables) {
    const lowerName = variable.name.toLowerCase();
    // 변수 이름 prefix로 그룹 분류 ("Primitive/..." → "primitive")
    const groupKey = COLLECTION_GROUPS.find((g) => lowerName.startsWith(`${g}/`));
    if (!groupKey) {
      console.warn(`[VarSync] 분류 외 변수 skip: "${variable.name}"`);
      continue;
    }

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

    // Pass 1에서 구성한 경로 재사용 (중복 계산 제거)
    const pathSegments = idToPath[variable.id];
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

  // FLOAT / STRING / BOOLEAN: 원시값 — typeof 가드로 안전하게 반환
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // 논리적으로 도달 불가능하지만 예상치 못한 타입에 대한 방어적 폴백
  return String(value);
}

/**
 * 중첩 경로에 DesignToken을 삽입
 * ["Color", "Blue", "100"], token → root.Color.Blue["100"] = token
 */
function setNestedToken(root: TokenGroup, path: string[], token: DesignToken): void {
  let node: TokenGroup = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    // isDesignToken 가드로 리프 노드 충돌 감지 — 그룹으로 교체 (드문 케이스)
    if (!(key in node) || isDesignToken(node[key])) {
      node[key] = {};
    }
    node = node[key] as TokenGroup;
  }
  node[path[path.length - 1]] = token;
}

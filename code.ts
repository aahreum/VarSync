// VarSync - Figma Variables → GitHub PR Sync Plugin
// docs/01-figma-variables-api.md 참고

figma.showUI(__html__, { width: 332, height: 510 });

// ── 상수 ─────────────────────────────────────────────────

const DTCG_TYPE: Record<VariableResolvedDataType, DesignToken["$type"]> = {
  COLOR: "color",
  FLOAT: "number",
  STRING: "string",
  BOOLEAN: "boolean",
};

const UI_MIN_WIDTH = 280;
const UI_MIN_HEIGHT = 280;
const UI_MAX_WIDTH = 800;
const UI_MAX_HEIGHT = 800;

// ── DTCG 타입 정의 ────────────────────────────────────────
// W3C Design Token Community Group 표준 (Style Dictionary v4 호환)

interface DesignToken {
  $value: string | number | boolean;
  $type: "color" | "number" | "string" | "boolean";
  $description?: string;
}

interface TokenGroup {
  [key: string]: TokenGroup | DesignToken;
}

interface CollectionFilePayload {
  collectionName: string;
  tokensJson: string; // JSON.stringify된 TokenGroup
}

// ── 타입 가드 ─────────────────────────────────────────────

function isDesignToken(node: TokenGroup | DesignToken): node is DesignToken {
  return "$value" in node;
}

// ── 메시지 타입 ───────────────────────────────────────────

type PluginMessage =
  | { type: "request-variables"; payload: { selectedCollectionIds: string[] } }
  | { type: "save-token"; payload: { encrypted: string } }
  | { type: "clear-token" }
  | { type: "resize"; width: number; height: number }
  | { type: "close" };

// ── 시작: 컬렉션 목록 + 저장된 토큰을 UI로 전송 ─────────

(async () => {
  // 컬렉션 목록 전송
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    figma.ui.postMessage({
      type: "collections-loaded",
      payload: {
        collections: collections
          .filter((c) => !c.remote) // 로컬 컬렉션만
          .map((c) => ({
            id: c.id,
            name: c.name,
            variableCount: c.variableIds.length,
          })),
      },
    });
  } catch (e) {
    figma.ui.postMessage({
      type: "error",
      message:
        e instanceof Error ? e.message : "컬렉션 목록을 불러오지 못했습니다.",
    });
  }

  // 저장된 암호화 토큰 전송 (없으면 null)
  try {
    const encrypted =
      (await figma.clientStorage.getAsync("enc-token")) ?? null;
    figma.ui.postMessage({ type: "stored-token", payload: { encrypted } });
  } catch {
    figma.ui.postMessage({ type: "stored-token", payload: { encrypted: null } });
  }
})();

// ── UI 메시지 수신 ────────────────────────────────────────

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "request-variables") {
    try {
      const files = await buildTokensByCollection(
        msg.payload.selectedCollectionIds,
      );
      figma.ui.postMessage({
        type: "variables-data",
        payload: { files },
      });
    } catch (e) {
      figma.ui.postMessage({
        type: "error",
        message:
          e instanceof Error
            ? e.message
            : "변수를 읽는 중 오류가 발생했습니다.",
      });
    }
  }

  if (msg.type === "resize") {
    const w = Math.min(
      Math.max(Math.round(msg.width), UI_MIN_WIDTH),
      UI_MAX_WIDTH,
    );
    const h = Math.min(
      Math.max(Math.round(msg.height), UI_MIN_HEIGHT),
      UI_MAX_HEIGHT,
    );
    figma.ui.resize(w, h);
  }

  if (msg.type === "save-token") {
    await figma.clientStorage.setAsync("enc-token", msg.payload.encrypted);
  }

  if (msg.type === "clear-token") {
    await figma.clientStorage.deleteAsync("enc-token");
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// ── 메인 변환 함수: 컬렉션 기준 ──────────────────────────

async function buildTokensByCollection(
  selectedCollectionIds: string[],
): Promise<CollectionFilePayload[]> {
  const [collections, allVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  const selectedSet = new Set(selectedCollectionIds); // O(1) 조회
  const collectionMap = new Map(collections.map((c) => [c.id, c]));

  // Pass 1: variableId → 경로 세그먼트 (alias 참조 "{Color.Blue.100}" 생성용)
  // Figma 변수 이름 예: "Color/Blue/100" → ["Color", "Blue", "100"]
  const idToPath: Record<string, string[]> = {};
  // dangling alias 감지용: variableId → 속한 collectionId
  const varIdToCollectionId: Record<string, string> = {};
  for (const v of allVariables) {
    idToPath[v.id] = v.name.split("/");
    varIdToCollectionId[v.id] = v.variableCollectionId;
  }

  // Pass 2: 선택된 컬렉션별 TokenGroup 구성
  const result: CollectionFilePayload[] = [];

  for (const collectionId of selectedCollectionIds) {
    const collection = collectionMap.get(collectionId);
    if (!collection) continue;

    const defaultModeId = collection.defaultModeId;
    const tokens: TokenGroup = {};

    const collectionVariables = allVariables.filter(
      (v) => v.variableCollectionId === collectionId,
    );

    for (const variable of collectionVariables) {
      const rawValue = variable.valuesByMode[defaultModeId];
      if (rawValue === undefined) continue;

      // dangling alias 경고: alias 대상이 미선택 컬렉션에 있으면 warn
      if (
        typeof rawValue === "object" &&
        "type" in rawValue &&
        rawValue.type === "VARIABLE_ALIAS"
      ) {
        const refColId = varIdToCollectionId[rawValue.id];
        if (refColId && !selectedSet.has(refColId)) {
          console.warn(
            `[VarSync] dangling alias: "${variable.name}" → 미선택 컬렉션의 변수 (id: ${rawValue.id})`,
          );
        }
      }

      const token: DesignToken = {
        $value: toTokenValue(rawValue, variable.resolvedType, idToPath),
        $type: DTCG_TYPE[variable.resolvedType],
      };
      if (variable.description) {
        token.$description = variable.description;
      }

      // 변수 이름 그대로 경로 세그먼트로 사용 (prefix 제거 없음)
      const segments = variable.name.split("/");
      setNestedToken(tokens, segments, token);
    }

    result.push({
      collectionName: collection.name,
      tokensJson: JSON.stringify(tokens, null, 2),
    });
  }

  return result;
}

// ── 헬퍼 함수 ────────────────────────────────────────────

function toTokenValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  idToPath: Record<string, string[]>,
): DesignToken["$value"] {
  // VariableAlias → "{Color.Blue.100}" Style Dictionary 참조 표기
  if (
    typeof value === "object" &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  ) {
    const refPath = idToPath[value.id];
    return refPath ? `{${refPath.join(".")}}` : `{${value.id}}`;
  }

  // COLOR: 0~1 범위 RGB(A) → hex / rgba 문자열
  if (
    resolvedType === "COLOR" &&
    typeof value === "object" &&
    "r" in value &&
    "g" in value &&
    "b" in value
  ) {
    const r = Math.round((value as RGB).r * 255);
    const g = Math.round((value as RGB).g * 255);
    const b = Math.round((value as RGB).b * 255);
    const a = Math.round(("a" in value ? (value as RGBA).a : 1) * 1000) / 1000;
    if (a === 1) {
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // FLOAT / STRING / BOOLEAN: typeof 가드 후 반환
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  return String(value); // 방어적 폴백
}

function setNestedToken(
  root: TokenGroup,
  path: string[],
  token: DesignToken,
): void {
  let node: TokenGroup = root;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!(key in node) || isDesignToken(node[key])) {
      if (isDesignToken(node[key])) {
        console.warn(
          `[VarSync] 경로 충돌: "${path.slice(0, i + 1).join("/")}"가 토큰과 그룹 모두에 사용됨`,
        );
      }
      node[key] = {};
    }
    node = node[key] as TokenGroup;
  }
  node[path[path.length - 1]] = token;
}

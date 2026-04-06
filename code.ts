// VarSync - Figma Variables → GitHub PR Sync Plugin
// docs/01-figma-variables-api.md 참고

figma.showUI(__html__, { width: 332, height: 510 });

// ── 상수 ─────────────────────────────────────────────────

const DTCG_TYPE: Record<VariableResolvedDataType, DesignToken["type"]> = {
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
  value: string | number | boolean;
  type: "color" | "number" | "string" | "boolean";
  description?: string;
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
  return node != null && typeof node === "object" && "value" in node;
}

// ── 메시지 타입 ───────────────────────────────────────────

type PluginMessage =
  | {
      type: "request-variables";
      payload: {
        selectedCollectionIds: string[];
        excludedGroups?: Record<string, string[]>;
      };
    }
  | { type: "request-collections" }
  | { type: "save-token"; payload: { encrypted: string } }
  | { type: "clear-token" }
  | { type: "save-repo"; payload: { repo: string } }
  | { type: "resize"; width: number; height: number }
  | { type: "close" };

// ── 컬렉션 목록 전송 (시작 시 + 재요청 시 공통 사용) ──────

interface VariablePreview {
  name: string;
  type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  value: string;
  colorHex?: string; // COLOR 타입일 때 swatch용
}

async function sendCollections(): Promise<void> {
  try {
    const collections =
      await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();

    const localCollections = collections.filter((c) => !c.remote);

    // 변수 ID → 변수 매핑 (alias resolve용)
    const varById = new Map(allVariables.map((v) => [v.id, v]));
    // 컬렉션 ID → defaultModeId 매핑
    const collectionModeMap = new Map(
      collections.map((c) => [c.id, c.defaultModeId]),
    );

    const payload = localCollections.map((c) => {
      const defaultModeId = c.defaultModeId;
      const vars = allVariables.filter(
        (v) => v.variableCollectionId === c.id,
      );

      const variables: VariablePreview[] = [];
      for (const v of vars) {
        const raw = v.valuesByMode[defaultModeId];
        if (raw == null) continue;

        // alias인 경우 resolved 값 추적
        const resolved = resolveValue(raw, v.resolvedType, varById, collectionModeMap);

        const preview: VariablePreview = {
          name: v.name,
          type: v.resolvedType,
          value: formatPreviewValue(resolved, v.resolvedType),
        };

        if (
          v.resolvedType === "COLOR" &&
          resolved != null &&
          typeof resolved === "object" &&
          "r" in resolved
        ) {
          const r = Math.round((resolved as RGB).r * 255);
          const g = Math.round((resolved as RGB).g * 255);
          const b = Math.round((resolved as RGB).b * 255);
          preview.colorHex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        }

        variables.push(preview);
      }

      return {
        id: c.id,
        name: c.name,
        variableCount: c.variableIds.length,
        variables,
      };
    });

    figma.ui.postMessage({
      type: "collections-loaded",
      payload: { collections: payload },
    });
  } catch (e) {
    figma.ui.postMessage({
      type: "error",
      message:
        e instanceof Error ? e.message : "컬렉션 목록을 불러오지 못했습니다.",
    });
  }
}

/** alias를 재귀적으로 따라가서 실제 값을 반환 (최대 10단계) */
function resolveValue(
  value: VariableValue,
  resolvedType: VariableResolvedDataType,
  varById: Map<string, Variable>,
  collectionModeMap: Map<string, string>,
  depth = 0,
): VariableValue {
  if (depth > 10) return value; // 무한 루프 방지
  if (
    value != null &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  ) {
    const target = varById.get(value.id);
    if (!target) return value;
    const modeId = collectionModeMap.get(target.variableCollectionId);
    if (!modeId) return value;
    const targetValue = target.valuesByMode[modeId];
    if (targetValue == null) return value;
    return resolveValue(targetValue, resolvedType, varById, collectionModeMap, depth + 1);
  }
  return value;
}

function formatPreviewValue(
  value: VariableValue,
  type: VariableResolvedDataType,
): string {
  if (
    type === "COLOR" &&
    value != null &&
    typeof value === "object" &&
    "r" in value
  ) {
    const r = Math.round((value as RGB).r * 255);
    const g = Math.round((value as RGB).g * 255);
    const b = Math.round((value as RGB).b * 255);
    const a = "a" in value ? (value as RGBA).a : 1;
    if (a === 1) {
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
  }
  return String(value);
}

// ── 시작: 컬렉션 목록 + 저장된 토큰을 UI로 전송 ─────────

(async () => {
  await sendCollections();

  // 저장된 암호화 토큰 전송 (없으면 null)
  try {
    const stored = await figma.clientStorage.getAsync("enc-token");
    const encrypted = stored !== undefined ? stored : null;
    figma.ui.postMessage({ type: "stored-token", payload: { encrypted } });
  } catch (_e) {
    figma.ui.postMessage({ type: "stored-token", payload: { encrypted: null } });
  }

  // 저장된 repo URL 전송 (없으면 null)
  try {
    const storedRepo = await figma.clientStorage.getAsync("repo-url");
    figma.ui.postMessage({ type: "stored-repo", payload: { repo: storedRepo ?? null } });
  } catch (_e) {
    figma.ui.postMessage({ type: "stored-repo", payload: { repo: null } });
  }
})();

// ── UI 메시지 수신 ────────────────────────────────────────

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "request-variables") {
    try {
      const files = await buildTokensByCollection(
        msg.payload.selectedCollectionIds,
        msg.payload.excludedGroups ?? {},
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

  if (msg.type === "request-collections") {
    await sendCollections();
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
    try {
      await figma.clientStorage.setAsync("enc-token", msg.payload.encrypted);
      figma.ui.postMessage({ type: "token-saved", payload: { success: true } });
    } catch (_e) {
      figma.ui.postMessage({ type: "token-saved", payload: { success: false } });
    }
  }

  if (msg.type === "save-repo") {
    try {
      await figma.clientStorage.setAsync("repo-url", msg.payload.repo);
    } catch (_e) {
      // 저장 실패는 무시 (다음에 다시 입력하면 됨)
    }
  }

  if (msg.type === "clear-token") {
    try {
      await figma.clientStorage.deleteAsync("enc-token");
      figma.ui.postMessage({ type: "token-cleared", payload: { success: true } });
    } catch (_e) {
      figma.ui.postMessage({ type: "token-cleared", payload: { success: false } });
    }
  }

  if (msg.type === "close") {
    figma.closePlugin();
  }
};

// ── 메인 변환 함수: 컬렉션 기준 ──────────────────────────

async function buildTokensByCollection(
  selectedCollectionIds: string[],
  excludedGroups: Record<string, string[]>,
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

    const excluded = new Set(excludedGroups[collectionId] ?? []);

    for (const variable of collectionVariables) {
      // 그룹 필터링: 변수 경로의 첫 세그먼트가 제외 목록에 있으면 건너뜀
      const firstSegment = variable.name.split("/")[0];
      if (excluded.has(firstSegment)) continue;

      const rawValue = variable.valuesByMode[defaultModeId];
      if (rawValue == null) continue;

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
        value: toTokenValue(rawValue, variable.resolvedType, idToPath),
        type: DTCG_TYPE[variable.resolvedType],
      };
      if (variable.description) {
        token.description = variable.description;
      }

      // 변수 이름 그대로 경로 세그먼트로 사용 (prefix 제거 없음)
      const segments = variable.name.split("/");
      setNestedToken(tokens, segments, token);
    }

    // 그룹 필터링으로 모든 변수가 제외된 빈 컬렉션은 건너뜀
    if (Object.keys(tokens).length === 0) continue;

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
): DesignToken["value"] {
  // VariableAlias → "{Color.Blue.100}" Style Dictionary 참조 표기
  if (
    value != null &&
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
    value != null &&
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

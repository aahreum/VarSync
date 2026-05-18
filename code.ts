// VarSync - Figma Variables & Styles → GitHub PR Sync Plugin
// docs/01-figma-variables-api.md 참고

figma.showUI(__html__, { width: 392, height: 510 });

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

interface TypographyValue {
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  letterSpacing: string | number;
  lineHeight: string | number;
}

interface ShadowValue {
  type: "drop" | "inset";
  color: string;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
}

interface DesignToken {
  value: string | number | boolean | TypographyValue | ShadowValue;
  type: "color" | "number" | "string" | "boolean" | "typography" | "shadow" | "blur";
  description?: string;
}

interface TokenGroup {
  [key: string]: TokenGroup | DesignToken;
}

interface CollectionFilePayload {
  collectionName: string;
  tokensJson: string; // JSON.stringify된 TokenGroup
}

interface StylesInclude {
  paint: boolean;
  text: boolean;
  effect: boolean;
}

interface StyleFilePayload {
  fileName: string; // e.g. "styles/colors.json"
  tokensJson: string;
  styleKey: "paint" | "text" | "effect";
}

interface PaintStylePreview {
  name: string;
  color: string;
}

interface TextStylePreview {
  name: string;
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
}

interface EffectStylePreview {
  name: string;
  effectType: string;
  preview: string;
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
        includeStyles?: StylesInclude;
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
    // 컬렉션 ID → 변수 목록 매핑 (O(M) 그룹핑)
    const varsByCollection = new Map<string, Variable[]>();
    for (const v of allVariables) {
      const list = varsByCollection.get(v.variableCollectionId);
      if (list) list.push(v);
      else varsByCollection.set(v.variableCollectionId, [v]);
    }

    const payload = localCollections.map((c) => {
      const defaultModeId = c.defaultModeId;
      const vars = varsByCollection.get(c.id) ?? [];

      const variables: VariablePreview[] = [];
      for (const v of vars) {
        const raw = v.valuesByMode[defaultModeId];
        if (raw == null) continue;

        // alias인 경우 resolved 값 추적
        const resolved = resolveValue(raw, varById, collectionModeMap);

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
          preview.colorHex = rgbToCss(resolved as RGBA);
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

    const [paintStyles, textStyles, effectStyles] = await Promise.all([
      figma.getLocalPaintStylesAsync(),
      figma.getLocalTextStylesAsync(),
      figma.getLocalEffectStylesAsync(),
    ]);

    const paintPreviews: PaintStylePreview[] = paintStyles
      .filter((s) => s.paints.some((p) => p.type === "SOLID"))
      .map((s) => {
        const solid = s.paints.find((p): p is SolidPaint => p.type === "SOLID")!;
        return { name: s.name, color: rgbToCss({ ...solid.color, a: solid.opacity ?? 1 }) };
      });

    const textPreviews: TextStylePreview[] = textStyles.map((s) => ({
      name: s.name,
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
    }));

    const effectPreviews: EffectStylePreview[] = effectStyles.map((s) => {
      const shadow = s.effects.find(
        (e): e is DropShadowEffect | InnerShadowEffect =>
          e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW",
      );
      const blur = s.effects.find(
        (e): e is BlurEffect =>
          e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR",
      );
      if (shadow) {
        const label = shadow.type === "INNER_SHADOW" ? "Inner Shadow" : "Drop Shadow";
        return { name: s.name, effectType: label, preview: `${shadow.offset.x}px ${shadow.offset.y}px ${shadow.radius}px` };
      }
      if (blur) {
        const label = blur.type === "BACKGROUND_BLUR" ? "Background Blur" : "Layer Blur";
        return { name: s.name, effectType: label, preview: `${blur.radius}px` };
      }
      return { name: s.name, effectType: "Unknown", preview: "" };
    });

    figma.ui.postMessage({
      type: "collections-loaded",
      payload: {
        collections: payload,
        stylesCounts: {
          paint: paintStyles.length,
          text: textStyles.length,
          effect: effectStyles.length,
        },
        stylesData: {
          paint: paintPreviews,
          text: textPreviews,
          effect: effectPreviews,
        },
      },
    });
  } catch (e) {
    figma.ui.postMessage({
      type: "error",
      message:
        e instanceof Error ? e.message : "컬렉션 목록을 불러오지 못했습니다.",
    });
  }
}

// ── RGB 헬퍼 ──────────────────────────────────────────────

/** 0~255 정수 RGB를 hex 문자열로 변환 */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Figma 0~1 범위 RGB(A) → CSS 색상 문자열 */
function rgbToCss(value: RGB | RGBA): string {
  const r = Math.round(value.r * 255);
  const g = Math.round(value.g * 255);
  const b = Math.round(value.b * 255);
  const a = "a" in value ? (value as RGBA).a : 1;
  if (a === 1) return rgbToHex(r, g, b);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/** alias를 재귀적으로 따라가서 실제 값을 반환 (최대 10단계) */
function resolveValue(
  value: VariableValue,
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
    return resolveValue(targetValue, varById, collectionModeMap, depth + 1);
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
    return rgbToCss(value as RGBA);
  }
  if (typeof value === "number") {
    return String(parseFloat(value.toPrecision(6)));
  }
  // 미해결 alias 방어
  if (
    value != null &&
    typeof value === "object" &&
    "type" in value &&
    value.type === "VARIABLE_ALIAS"
  ) {
    return "(unresolved alias)";
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
      const variableFiles = await buildTokensByCollection(
        msg.payload.selectedCollectionIds,
        msg.payload.excludedGroups ?? {},
      );
      const styleFiles = await buildStyleFiles(msg.payload.includeStyles ?? { paint: false, text: false, effect: false });
      figma.ui.postMessage({
        type: "variables-data",
        payload: { files: variableFiles, styleFiles },
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
  // 컬렉션 ID → 변수 목록 매핑 (O(M) 그룹핑)
  const varsByCollection = new Map<string, Variable[]>();
  for (const v of allVariables) {
    idToPath[v.id] = v.name.split("/");
    varIdToCollectionId[v.id] = v.variableCollectionId;
    const list = varsByCollection.get(v.variableCollectionId);
    if (list) list.push(v);
    else varsByCollection.set(v.variableCollectionId, [v]);
  }

  // Pass 2: 선택된 컬렉션별 TokenGroup 구성
  const result: CollectionFilePayload[] = [];

  for (const collectionId of selectedCollectionIds) {
    const collection = collectionMap.get(collectionId);
    if (!collection) continue;

    const defaultModeId = collection.defaultModeId;
    const tokens: TokenGroup = {};

    const collectionVariables = varsByCollection.get(collectionId) ?? [];

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
    return rgbToCss(value as RGBA);
  }

  // FLOAT: 부동소수점 오차 보정 (Figma 32비트 float → 깔끔한 값)
  if (typeof value === "number") {
    return parseFloat(value.toPrecision(6));
  }

  // STRING / BOOLEAN
  if (typeof value === "string" || typeof value === "boolean") {
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

// ── Styles 추출 함수 ──────────────────────────────────────

async function buildStyleFiles(include: StylesInclude): Promise<StyleFilePayload[]> {
  const result: StyleFilePayload[] = [];

  if (include.paint) {
    const tokens = await buildPaintTokens();
    if (Object.keys(tokens).length > 0) {
      result.push({ fileName: "styles/colors.json", tokensJson: JSON.stringify(tokens, null, 2), styleKey: "paint" });
    }
  }

  if (include.text) {
    const tokens = await buildTextTokens();
    if (Object.keys(tokens).length > 0) {
      result.push({ fileName: "styles/typography.json", tokensJson: JSON.stringify(tokens, null, 2), styleKey: "text" });
    }
  }

  if (include.effect) {
    const tokens = await buildEffectTokens();
    if (Object.keys(tokens).length > 0) {
      result.push({ fileName: "styles/effects.json", tokensJson: JSON.stringify(tokens, null, 2), styleKey: "effect" });
    }
  }

  return result;
}

async function buildPaintTokens(): Promise<TokenGroup> {
  const root: TokenGroup = {};
  for (const style of await figma.getLocalPaintStylesAsync()) {
    const solid = style.paints.find((p): p is SolidPaint => p.type === "SOLID");
    if (!solid) {
      console.warn(
        `[VarSync] Paint style "${style.name}" skipped — type "${style.paints[0]?.type ?? "empty"}" is not SOLID`,
      );
      continue;
    }
    const token: DesignToken = {
      value: rgbToCss({ ...solid.color, a: solid.opacity ?? 1 }),
      type: "color",
    };
    if (style.description) token.description = style.description;
    setNestedToken(root, style.name.split("/"), token);
  }
  return root;
}

async function buildTextTokens(): Promise<TokenGroup> {
  const root: TokenGroup = {};
  for (const style of await figma.getLocalTextStylesAsync()) {
    const lh = style.lineHeight;
    const ls = style.letterSpacing;

    let letterSpacing: string | number;
    if (ls.unit === "PERCENT") {
      letterSpacing = `${ls.value}%`;
    } else if (ls.unit === "PIXELS") {
      letterSpacing = ls.value;
    } else {
      console.warn(`[VarSync] Text style "${style.name}" has unexpected letterSpacing unit — defaulting to 0`);
      letterSpacing = 0;
    }

    const value: TypographyValue = {
      fontFamily: style.fontName.family,
      fontStyle: style.fontName.style,
      fontSize: style.fontSize,
      letterSpacing,
      lineHeight:
        lh.unit === "AUTO"
          ? "auto"
          : lh.unit === "PERCENT"
            ? `${lh.value}%`
            : lh.value,
    };

    const token: DesignToken = { value, type: "typography" };
    if (style.description) token.description = style.description;
    setNestedToken(root, style.name.split("/"), token);
  }
  return root;
}

async function buildEffectTokens(): Promise<TokenGroup> {
  const root: TokenGroup = {};
  for (const style of await figma.getLocalEffectStylesAsync()) {
    const shadowEffects = style.effects.filter(
      (e): e is DropShadowEffect | InnerShadowEffect =>
        e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW",
    );
    const blurEffects = style.effects.filter(
      (e): e is BlurEffect => e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR",
    );

    let token: DesignToken | null = null;

    if (shadowEffects.length > 0) {
      if (blurEffects.length > 0) {
        console.warn(
          `[VarSync] Effect style "${style.name}" has both shadow and blur — only shadow is exported`,
        );
      }
      const s = shadowEffects[0];
      const { r, g, b, a } = s.color;
      const cr = Math.round(r * 255);
      const cg = Math.round(g * 255);
      const cb = Math.round(b * 255);
      const ca = Math.round(a * 1000) / 1000;
      const value: ShadowValue = {
        type: s.type === "INNER_SHADOW" ? "inset" : "drop",
        color: `rgba(${cr}, ${cg}, ${cb}, ${ca})`,
        offsetX: s.offset.x,
        offsetY: s.offset.y,
        blur: s.radius,
        spread: ("spread" in s ? s.spread : undefined) ?? 0,
      };
      token = { value, type: "shadow" };
    } else if (blurEffects.length > 0) {
      token = { value: blurEffects[0].radius, type: "blur" };
    }

    if (!token) continue;
    if (style.description) token.description = style.description;
    setNestedToken(root, style.name.split("/"), token);
  }
  return root;
}

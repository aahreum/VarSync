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
      const variables = await readVariables();
      // 변수 JSON만 전달 — 민감한 token은 UI에서 자체 관리
      figma.ui.postMessage({
        type: 'variables-data',
        payload: {
          primitiveJson: JSON.stringify(variables.primitive, null, 2),
          semanticsJson: JSON.stringify(variables.semantics, null, 2),
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

// ── 변수 읽기 및 JSON 변환 ────────────────────────────────

interface VariableOutput {
  [group: string]: {
    [name: string]: {
      type: string;
      values: { [mode: string]: unknown };
    };
  };
}

// 분류 대상 컬렉션 그룹 — 확장 시 이 배열에만 추가
const COLLECTION_GROUPS = ['primitive', 'semantics'] as const;
type GroupKey = (typeof COLLECTION_GROUPS)[number];

async function readVariables(): Promise<Record<GroupKey, VariableOutput>> {
  // dynamic-page 환경이므로 반드시 Async API 사용
  const [collections, allVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  // collectionId → { modeId → modeName } 매핑
  const modeMap: Record<string, Record<string, string>> = {};
  for (const col of collections) {
    modeMap[col.id] = Object.fromEntries(col.modes.map((m) => [m.modeId, m.name]));
  }

  const result: Record<GroupKey, VariableOutput> = { primitive: {}, semantics: {} };

  for (const variable of allVariables) {
    const lowerName = variable.name.toLowerCase();
    // "Primitive/Color/Blue/100" 형태에서 prefix(예: "primitive") 추출
    const groupKey = COLLECTION_GROUPS.find((g) => lowerName.startsWith(`${g}/`));
    if (!groupKey) continue;

    const target = result[groupKey];
    const modesForCollection = modeMap[variable.variableCollectionId] ?? {};

    // prefix 1개 세그먼트를 제외하고, 마지막 세그먼트를 name으로, 나머지를 group으로 사용
    // 예: "Primitive/Color/Blue/100" → group: "Color/Blue", name: "100"
    const PREFIX_SEGMENT_COUNT = 1;
    const parts = variable.name.split('/');
    const name = parts[parts.length - 1];
    const group = parts.slice(PREFIX_SEGMENT_COUNT, -1).join('/') || 'default';

    if (!target[group]) target[group] = {};

    const values: Record<string, unknown> = {};
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = modesForCollection[modeId] ?? modeId;
      values[modeName] = serializeValue(value);
    }

    target[group][name] = { type: variable.resolvedType, values };
  }

  return result;
}

function serializeValue(value: VariableValue): unknown {
  // VariableAlias: 참조 변수 ID 반환
  if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
    return { $alias: value.id };
  }

  // RGB/RGBA color: r, g, b 세 채널 모두 존재하는지 확인 후 변환
  // VariableAlias 처리 후 object 타입에 r/g/b가 있으면 RGB | RGBA
  if (
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

  return value;
}

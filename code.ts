// VarSync - Figma Variables → GitHub PR Sync Plugin
// docs/01-figma-variables-api.md 참고

figma.showUI(__html__, { width: 332, height: 340 });

// UI로부터 메시지 수신
figma.ui.onmessage = async (msg: {
  type: string;
  payload?: {
    owner: string;
    repo: string;
    token: string;
    baseBranch: string;
  };
}) => {
  if (msg.type === 'request-variables') {
    if (!msg.payload) return;

    try {
      const variables = await readVariables();
      figma.ui.postMessage({
        type: 'variables-data',
        payload: {
          ...msg.payload,
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

async function readVariables(): Promise<{ primitive: VariableOutput; semantics: VariableOutput }> {
  // dynamic-page 환경이므로 반드시 Async API 사용
  const [collections, allVariables] = await Promise.all([
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);

  // collectionId → modes 매핑 (modeId → modeName 변환용)
  const modeMap: { [collectionId: string]: { [modeId: string]: string } } = {};
  for (const col of collections) {
    modeMap[col.id] = {};
    for (const mode of col.modes) {
      modeMap[col.id][mode.modeId] = mode.name;
    }
  }

  const primitive: VariableOutput = {};
  const semantics: VariableOutput = {};

  for (const variable of allVariables) {
    const isPrimitive = variable.name.toLowerCase().startsWith('primitive/');
    const isSemantics = variable.name.toLowerCase().startsWith('semantics/');
    if (!isPrimitive && !isSemantics) continue;

    const target = isPrimitive ? primitive : semantics;
    const modesForCollection = modeMap[variable.variableCollectionId] ?? {};

    // "Primitive/Color/Blue/100" → group: "Color/Blue", name: "100"
    const parts = variable.name.split('/');
    const name = parts[parts.length - 1];
    const group = parts.slice(1, -1).join('/') || 'default';

    if (!target[group]) target[group] = {};

    // 모드별 값 수집 (VariableAlias는 id 문자열로 표현)
    const values: { [mode: string]: unknown } = {};
    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = modesForCollection[modeId] ?? modeId;
      values[modeName] = serializeValue(value);
    }

    target[group][name] = {
      type: variable.resolvedType,
      values,
    };
  }

  return { primitive, semantics };
}

function serializeValue(value: VariableValue): unknown {
  if (value === null || value === undefined) return value;

  // VariableAlias
  if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
    return { $alias: value.id };
  }

  // RGBA color
  if (typeof value === 'object' && 'r' in value) {
    const color = value as RGB | RGBA;
    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);
    const a = 'a' in color ? color.a : 1;
    if (a === 1) {
      return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return value;
}

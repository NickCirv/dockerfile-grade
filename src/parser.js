/**
 * Dockerfile parser — extracts instructions, args, and build stages
 */

export function parseDockerfile(content) {
  const lines = content.split('\n');
  const instructions = [];
  const stages = [];
  const args = [];
  let currentStage = null;
  let stageIndex = -1;
  let continuationBuffer = '';
  let continuationStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines and comments (when not in continuation)
    if (!continuationBuffer && (trimmed === '' || trimmed.startsWith('#'))) {
      instructions.push({
        type: 'COMMENT',
        raw: rawLine,
        lineNumber: i + 1,
        value: trimmed,
      });
      continue;
    }

    // Handle line continuations
    if (trimmed.endsWith('\\')) {
      if (!continuationBuffer) {
        continuationStartLine = i + 1;
      }
      continuationBuffer += trimmed.slice(0, -1) + ' ';
      continue;
    }

    const fullLine = continuationBuffer ? continuationBuffer + trimmed : trimmed;
    continuationBuffer = '';
    const startLine = continuationBuffer ? continuationStartLine : i + 1;

    if (!fullLine) continue;

    const spaceIdx = fullLine.indexOf(' ');
    if (spaceIdx === -1) {
      instructions.push({
        type: fullLine.toUpperCase(),
        raw: rawLine,
        lineNumber: startLine,
        value: '',
      });
      continue;
    }

    const instruction = fullLine.slice(0, spaceIdx).toUpperCase();
    const value = fullLine.slice(spaceIdx + 1).trim();

    const parsed = {
      type: instruction,
      raw: rawLine,
      lineNumber: i + 1,
      value,
    };

    // Track FROM stages
    if (instruction === 'FROM') {
      stageIndex++;
      const parts = value.split(/\s+/);
      const image = parts[0];
      const asIdx = parts.findIndex(p => p.toLowerCase() === 'as');
      const stageName = asIdx !== -1 ? parts[asIdx + 1] : null;

      currentStage = {
        index: stageIndex,
        name: stageName,
        image,
        startLine: i + 1,
        instructions: [],
      };
      stages.push(currentStage);
      parsed.image = image;
      parsed.stageName = stageName;
    }

    // Track ARG instructions
    if (instruction === 'ARG') {
      const eqIdx = value.indexOf('=');
      args.push({
        name: eqIdx !== -1 ? value.slice(0, eqIdx) : value,
        defaultValue: eqIdx !== -1 ? value.slice(eqIdx + 1) : null,
        lineNumber: i + 1,
      });
      parsed.argName = eqIdx !== -1 ? value.slice(0, eqIdx) : value;
    }

    if (currentStage) {
      currentStage.instructions.push(parsed);
    }

    instructions.push(parsed);
  }

  // Close stage end lines
  for (let i = 0; i < stages.length; i++) {
    stages[i].endLine = i + 1 < stages.length ? stages[i + 1].startLine - 1 : lines.length;
  }

  return {
    raw: content,
    lines,
    instructions,
    stages,
    args,
    isMultiStage: stages.length > 1,
    stageCount: stages.length,
    hasComments: instructions.some(i => i.type === 'COMMENT' && !i.value.startsWith('#!')),
  };
}

export function getInstructionsByType(parsed, type) {
  return parsed.instructions.filter(i => i.type === type.toUpperCase());
}

export function extractImageInfo(fromValue) {
  // Remove digest (@sha256:...)
  const withoutDigest = fromValue.split('@')[0];
  const colonIdx = withoutDigest.lastIndexOf(':');
  const slashIdx = withoutDigest.lastIndexOf('/');

  if (colonIdx === -1 || colonIdx < slashIdx) {
    return { name: withoutDigest, tag: 'latest' };
  }

  return {
    name: withoutDigest.slice(0, colonIdx),
    tag: withoutDigest.slice(colonIdx + 1),
  };
}

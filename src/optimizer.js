/**
 * Generates optimized Dockerfile suggestions from issues
 */

import { getInstructionsByType, extractImageInfo } from './parser.js';

export function generateOptimizedDockerfile(parsed, issues) {
  const lines = [...parsed.lines];
  const suggestions = [];
  const quickFixes = [];

  // Collect quick-fix suggestions (line-level)
  for (const issue of issues) {
    if (issue.lineNumber && issue.fix) {
      quickFixes.push({
        lineNumber: issue.lineNumber,
        original: parsed.lines[issue.lineNumber - 1]?.trim(),
        suggestion: issue.fix,
        issueId: issue.id,
      });
    }
  }

  // Generate full optimized Dockerfile
  const optimized = buildOptimizedDockerfile(parsed, issues);

  return {
    quickFixes,
    optimizedDockerfile: optimized,
    changeCount: quickFixes.length,
  };
}

function buildOptimizedDockerfile(parsed, issues) {
  const issueIds = new Set(issues.map(i => i.id));
  const originalLines = [...parsed.lines];
  let result = [];

  // Add LABELs if missing
  const needsLabel = issueIds.has('no-label');
  const needsWorkdir = issueIds.has('no-workdir');
  const needsUser = issueIds.has('no-user') || issueIds.has('user-root');
  const needsHealthcheck = issueIds.has('no-healthcheck');
  const fixLatest = issueIds.has('latest-tag');
  const fixExecForm = issueIds.has('shell-form-cmd') || issueIds.has('shell-form-entrypoint');

  // Track what we've inserted
  let labelInserted = false;
  let workdirInserted = false;
  let userInserted = false;
  let healthInserted = false;

  const froms = getInstructionsByType(parsed, 'FROM');

  for (let i = 0; i < originalLines.length; i++) {
    const line = originalLines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Fix :latest tags
    if (fixLatest && trimmed.startsWith('FROM ')) {
      const fromValue = trimmed.slice(5).trim();
      const { name, tag } = extractImageInfo(fromValue);
      if (tag === 'latest') {
        const suggestedTag = getSuggestedTag(name);
        result.push(`FROM ${name}:${suggestedTag}`);
        result.push(`# ↑ Pinned from :latest to :${suggestedTag}`);
        continue;
      }
    }

    // Insert LABEL after first FROM
    if (!labelInserted && needsLabel && trimmed.startsWith('FROM ')) {
      result.push(line);
      result.push('');
      result.push('LABEL maintainer="Your Name <you@example.com>" \\');
      result.push('      org.opencontainers.image.description="Your app description"');
      labelInserted = true;
      continue;
    }

    // Insert WORKDIR before first COPY
    if (!workdirInserted && needsWorkdir && trimmed.startsWith('COPY ')) {
      result.push('WORKDIR /app');
      result.push('');
      workdirInserted = true;
    }

    // Fix exec form for CMD/ENTRYPOINT
    if (fixExecForm && (trimmed.startsWith('CMD ') || trimmed.startsWith('ENTRYPOINT '))) {
      const type = trimmed.startsWith('CMD') ? 'CMD' : 'ENTRYPOINT';
      const value = trimmed.slice(type.length + 1).trim();
      if (!value.startsWith('[')) {
        const parts = value.split(' ');
        const execForm = `${type} [${parts.map(p => `"${p}"`).join(', ')}]`;

        // Insert HEALTHCHECK and USER before CMD if missing
        if (!healthInserted && needsHealthcheck) {
          result.push('');
          result.push('HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\');
          result.push('  CMD curl -f http://localhost:3000/health || exit 1');
          healthInserted = true;
        }

        if (!userInserted && needsUser) {
          result.push('');
          result.push('USER node');
          userInserted = true;
        }

        result.push('');
        result.push(execForm);
        result.push(`# ↑ Changed from shell form to exec form (better signal handling)`);
        continue;
      }
    }

    // Insert USER + HEALTHCHECK before CMD/ENTRYPOINT if not already fixed
    if ((trimmed.startsWith('CMD ') || trimmed.startsWith('ENTRYPOINT ')) && !userInserted) {
      if (!healthInserted && needsHealthcheck) {
        result.push('');
        result.push('HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\');
        result.push('  CMD curl -f http://localhost:3000/health || exit 1');
        healthInserted = true;
      }

      if (needsUser) {
        result.push('');
        result.push('USER node');
        userInserted = true;
      }
    }

    result.push(line);
  }

  // If we haven't inserted USER yet (no CMD/ENTRYPOINT)
  if (needsUser && !userInserted) {
    result.push('');
    result.push('USER node');
  }

  if (needsHealthcheck && !healthInserted) {
    result.push('');
    result.push('HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\');
    result.push('  CMD curl -f http://localhost:3000/health || exit 1');
  }

  return result.join('\n');
}

function getSuggestedTag(imageName) {
  const suggestions = {
    node: '20-alpine',
    python: '3.12-slim',
    golang: '1.22-alpine',
    rust: '1.76-slim',
    nginx: '1.25-alpine',
    ubuntu: '22.04',
    debian: 'bookworm-slim',
    alpine: '3.19',
    java: '21-jre-slim',
    ruby: '3.3-alpine',
    php: '8.3-fpm-alpine',
  };

  for (const [key, tag] of Object.entries(suggestions)) {
    if (imageName.includes(key)) return tag;
  }

  return '1.0.0';
}

export function formatQuickFixes(quickFixes, parsed) {
  if (quickFixes.length === 0) return [];

  return quickFixes.map(fix => ({
    line: fix.lineNumber,
    original: fix.original,
    suggestion: fix.suggestion,
  }));
}

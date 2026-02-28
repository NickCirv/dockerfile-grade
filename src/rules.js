/**
 * 25+ grading rules across 5 categories
 */

import { getInstructionsByType, extractImageInfo } from './parser.js';

const SECRET_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /api[_-]?key/i,
  /auth[_-]?token/i,
  /private[_-]?key/i,
  /aws[_-]?access/i,
  /aws[_-]?secret/i,
  /database[_-]?url/i,
  /db[_-]?pass/i,
  /credentials/i,
  /client[_-]?secret/i,
];

const SLIM_IMAGES = ['alpine', 'slim', 'distroless', 'scratch', 'busybox'];

const UNNECESSARY_PORTS = [22, 23, 21, 8080, 8443];

// ── Security Rules ────────────────────────────────────────────────────────────

function checkRunAsRoot(parsed) {
  const userInstructions = getInstructionsByType(parsed, 'USER');
  if (userInstructions.length === 0) {
    return {
      id: 'no-user',
      category: 'security',
      severity: 'error',
      penalty: 15,
      message: 'No USER instruction — container runs as root',
      fix: 'Add USER instruction before CMD/ENTRYPOINT (e.g. USER node or USER 1000)',
      lineNumber: null,
    };
  }

  const lastUser = userInstructions[userInstructions.length - 1];
  if (lastUser.value === 'root' || lastUser.value === '0') {
    return {
      id: 'user-root',
      category: 'security',
      severity: 'error',
      penalty: 15,
      message: 'USER is explicitly set to root',
      fix: 'Change USER to a non-root user (e.g. USER node)',
      lineNumber: lastUser.lineNumber,
    };
  }

  return null;
}

function checkLatestTag(parsed) {
  const issues = [];
  for (const stage of parsed.stages) {
    const { tag } = extractImageInfo(stage.image);
    if (tag === 'latest') {
      issues.push({
        id: 'latest-tag',
        category: 'security',
        severity: 'error',
        penalty: 10,
        message: `Using :latest tag on base image (${stage.image})`,
        fix: `Pin to a specific version (e.g. ${stage.image.split(':')[0]}:20-alpine)`,
        lineNumber: stage.startLine,
      });
    }
  }
  return issues;
}

function checkSecretEnv(parsed) {
  const envInstructions = getInstructionsByType(parsed, 'ENV');
  const issues = [];

  for (const env of envInstructions) {
    const pairs = env.value.split(/\s+/);
    for (const pair of pairs) {
      const key = pair.split('=')[0];
      if (SECRET_PATTERNS.some(p => p.test(key))) {
        issues.push({
          id: 'secret-in-env',
          category: 'security',
          severity: 'error',
          penalty: 20,
          message: `Possible secret in ENV instruction: ${key}`,
          fix: 'Use build secrets (--secret flag) or runtime env vars instead of baking secrets into the image',
          lineNumber: env.lineNumber,
        });
      }
    }
  }
  return issues;
}

function checkAddVsCopy(parsed) {
  const addInstructions = getInstructionsByType(parsed, 'ADD');
  const issues = [];

  for (const add of addInstructions) {
    const src = add.value.split(/\s+/)[0];
    const isUrl = src.startsWith('http://') || src.startsWith('https://');
    const isTarball = /\.(tar|tar\.gz|tgz|tar\.bz2|tar\.xz)$/.test(src);

    if (!isUrl && !isTarball) {
      issues.push({
        id: 'add-vs-copy',
        category: 'security',
        severity: 'warning',
        penalty: 5,
        message: 'ADD used instead of COPY (prefer COPY for simple file operations)',
        fix: `Replace ADD with COPY: COPY ${add.value}`,
        lineNumber: add.lineNumber,
      });
    }
  }
  return issues;
}

function checkUnnecessaryPorts(parsed) {
  const exposeInstructions = getInstructionsByType(parsed, 'EXPOSE');
  const issues = [];

  for (const expose of exposeInstructions) {
    const ports = expose.value.split(/\s+/).map(p => parseInt(p, 10)).filter(Boolean);
    for (const port of ports) {
      if (UNNECESSARY_PORTS.includes(port)) {
        issues.push({
          id: 'unnecessary-port',
          category: 'security',
          severity: 'warning',
          penalty: 5,
          message: `Potentially unnecessary port exposed: ${port}`,
          fix: `Remove EXPOSE ${port} if not required`,
          lineNumber: expose.lineNumber,
        });
      }
    }
  }
  return issues;
}

function checkHealthcheck(parsed) {
  const healthchecks = getInstructionsByType(parsed, 'HEALTHCHECK');
  if (healthchecks.length === 0) {
    return {
      id: 'no-healthcheck',
      category: 'security',
      severity: 'warning',
      penalty: 5,
      message: 'No HEALTHCHECK defined',
      fix: 'Add HEALTHCHECK instruction (e.g. HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1)',
      lineNumber: null,
    };
  }
  return null;
}

function checkSudo(parsed) {
  const runInstructions = getInstructionsByType(parsed, 'RUN');
  const issues = [];

  for (const run of runInstructions) {
    if (/\bsudo\b/.test(run.value)) {
      issues.push({
        id: 'sudo-usage',
        category: 'security',
        severity: 'error',
        penalty: 10,
        message: 'sudo used in RUN instruction',
        fix: 'Use USER root temporarily if elevated permissions are needed, then switch back to non-root',
        lineNumber: run.lineNumber,
      });
    }
  }
  return issues;
}

// ── Size Rules ────────────────────────────────────────────────────────────────

function checkMultiStage(parsed) {
  if (parsed.isMultiStage) return null;

  const froms = getInstructionsByType(parsed, 'FROM');
  if (froms.length === 0) return null;

  const { name } = extractImageInfo(froms[0].image);
  const buildToolHints = ['golang', 'rust', 'maven', 'gradle', 'node', 'python', 'dotnet'];
  const usesBuildTool = buildToolHints.some(t => name.includes(t));

  if (usesBuildTool) {
    return {
      id: 'no-multi-stage',
      category: 'size',
      severity: 'error',
      penalty: 15,
      message: 'Not using multi-stage build — build tools end up in production image',
      fix: 'Use multi-stage build: separate builder and runtime stages to reduce final image size',
      lineNumber: froms[0].lineNumber,
    };
  }
  return null;
}

function checkAlpineBase(parsed) {
  const issues = [];

  for (const stage of parsed.stages) {
    const isLastStage = stage.index === parsed.stages.length - 1;
    if (!isLastStage && parsed.isMultiStage) continue;

    const { name, tag } = extractImageInfo(stage.image);
    const isSlim = SLIM_IMAGES.some(s => name.includes(s) || tag.includes(s));

    if (!isSlim && name !== 'scratch') {
      issues.push({
        id: 'no-slim-base',
        category: 'size',
        severity: 'warning',
        penalty: 10,
        message: `Base image is not alpine/slim/distroless: ${stage.image}`,
        fix: `Switch to a smaller base (e.g. ${name}:${tag}-alpine or ${name}:${tag}-slim)`,
        lineNumber: stage.startLine,
      });
    }
  }
  return issues;
}

function checkCombinedRun(parsed) {
  const runInstructions = getInstructionsByType(parsed, 'RUN');
  const issues = [];
  let consecutive = 0;
  let firstLine = null;

  for (let i = 0; i < runInstructions.length; i++) {
    const run = runInstructions[i];
    const prevIdx = parsed.instructions.indexOf(run);
    const prev = parsed.instructions[prevIdx - 1];

    if (prev && prev.type === 'RUN') {
      consecutive++;
      if (!firstLine) firstLine = prev.lineNumber;
    } else {
      if (consecutive >= 2) {
        issues.push({
          id: 'uncombined-run',
          category: 'size',
          severity: 'warning',
          penalty: 10,
          message: `Multiple consecutive RUN commands create unnecessary layers (lines ${firstLine}–${run.lineNumber})`,
          fix: 'Combine RUN commands with && to reduce layer count',
          lineNumber: firstLine,
        });
      }
      consecutive = 1;
      firstLine = run.lineNumber;
    }
  }
  return issues;
}

function checkCacheCleanup(parsed) {
  const runInstructions = getInstructionsByType(parsed, 'RUN');
  const issues = [];

  for (const run of runInstructions) {
    const hasAptGet = /apt-get\s+install/.test(run.value) || /apt\s+install/.test(run.value);
    const hasApkAdd = /apk\s+add/.test(run.value);
    const cleansApt = /rm\s+-rf\s+\/var\/lib\/apt/.test(run.value) || /apt-get\s+clean/.test(run.value);
    const cleansApk = /--no-cache/.test(run.value) || /rm\s+-rf\s+\/var\/cache\/apk/.test(run.value);

    if (hasAptGet && !cleansApt) {
      issues.push({
        id: 'apt-no-clean',
        category: 'size',
        severity: 'warning',
        penalty: 10,
        message: 'apt-get install without cleaning cache',
        fix: 'Add && rm -rf /var/lib/apt/lists/* to the same RUN command',
        lineNumber: run.lineNumber,
      });
    }

    if (hasApkAdd && !cleansApk) {
      issues.push({
        id: 'apk-no-cache',
        category: 'size',
        severity: 'warning',
        penalty: 10,
        message: 'apk add without --no-cache flag',
        fix: 'Use apk add --no-cache to avoid storing package index',
        lineNumber: run.lineNumber,
      });
    }
  }
  return issues;
}

function checkDevDependencies(parsed) {
  const runInstructions = getInstructionsByType(parsed, 'RUN');

  for (const run of runInstructions) {
    const hasNpmInstall = /npm\s+install(?!\s+--production|\s+-P|\s+--omit=dev)/.test(run.value);
    const hasDevFlag = /--include=dev|--dev/.test(run.value);

    if (hasNpmInstall && !hasDevFlag && parsed.stageCount === 1) {
      return {
        id: 'dev-dependencies',
        category: 'size',
        severity: 'warning',
        penalty: 10,
        message: 'npm install may include dev dependencies in production image',
        fix: 'Use npm ci --omit=dev or npm install --production for production builds',
        lineNumber: run.lineNumber,
      };
    }
  }
  return null;
}

// ── Speed Rules ───────────────────────────────────────────────────────────────

function checkLayerOrdering(parsed) {
  const issues = [];

  for (const stage of parsed.stages) {
    const instructions = stage.instructions;
    let hasCopyDot = false;
    let hasDepInstall = false;
    let copyDotLine = null;
    let depLine = null;

    for (const inst of instructions) {
      if (inst.type === 'COPY') {
        const src = inst.value.split(/\s+/)[0];
        if (src === '.' || src === './') {
          if (!hasCopyDot) {
            hasCopyDot = true;
            copyDotLine = inst.lineNumber;
          }
        } else if (/package.*\.json|requirements\.txt|go\.mod|Gemfile|pom\.xml|build\.gradle/.test(src)) {
          hasDepInstall = true;
          depLine = inst.lineNumber;
        }
      }

      if (inst.type === 'RUN') {
        const isDepInstall = /npm\s+(ci|install)|pip\s+install|bundle\s+install|go\s+mod\s+download|mvn\s+.*dependency|gradle\s+.*dependency/.test(inst.value);
        if (isDepInstall) {
          hasDepInstall = true;
          depLine = inst.lineNumber;
        }
      }
    }

    if (hasCopyDot && !hasDepInstall) {
      issues.push({
        id: 'copy-before-deps',
        category: 'speed',
        severity: 'error',
        penalty: 15,
        message: 'COPY . . before dependency install invalidates cache on every code change',
        fix: 'Copy dependency manifests first (e.g. COPY package*.json ./), run install, then COPY . .',
        lineNumber: copyDotLine,
      });
    }
  }
  return issues;
}

function checkCacheMount(parsed) {
  const runInstructions = getInstructionsByType(parsed, 'RUN');

  for (const run of runInstructions) {
    const isDepInstall = /npm\s+(ci|install)|pip\s+install|apt-get\s+install/.test(run.value);
    const hasCacheMount = /--mount=type=cache/.test(run.value);

    if (isDepInstall && !hasCacheMount) {
      return {
        id: 'no-cache-mount',
        category: 'speed',
        severity: 'info',
        penalty: 5,
        message: 'Consider using BuildKit cache mounts for package installs',
        fix: 'Add --mount=type=cache,target=/root/.npm to npm install commands',
        lineNumber: run.lineNumber,
      };
    }
  }
  return null;
}

function checkUnnecessarySteps(parsed) {
  const issues = [];
  const runInstructions = getInstructionsByType(parsed, 'RUN');

  for (const run of runInstructions) {
    if (/apt-get\s+update\s*$/.test(run.value)) {
      issues.push({
        id: 'update-without-install',
        category: 'speed',
        severity: 'warning',
        penalty: 5,
        message: 'apt-get update without install creates a useless layer',
        fix: 'Combine apt-get update && apt-get install in the same RUN command',
        lineNumber: run.lineNumber,
      });
    }
  }
  return issues;
}

// ── Best Practices Rules ──────────────────────────────────────────────────────

function checkLabel(parsed) {
  const labels = getInstructionsByType(parsed, 'LABEL');
  if (labels.length === 0) {
    return {
      id: 'no-label',
      category: 'best-practices',
      severity: 'info',
      penalty: 5,
      message: 'No LABEL instruction (maintainer info missing)',
      fix: 'Add LABEL maintainer="name <email>" and/or org.opencontainers.image.* labels',
      lineNumber: null,
    };
  }
  return null;
}

function checkDockerignore(parsed, options) {
  if (!options.hasDockerignore) {
    return {
      id: 'no-dockerignore',
      category: 'best-practices',
      severity: 'error',
      penalty: 10,
      message: 'No .dockerignore file found',
      fix: 'Create .dockerignore to exclude node_modules, .git, build artifacts, and sensitive files',
      lineNumber: null,
    };
  }
  return null;
}

function checkWorkdir(parsed) {
  const workdirs = getInstructionsByType(parsed, 'WORKDIR');
  if (workdirs.length === 0) {
    return {
      id: 'no-workdir',
      category: 'best-practices',
      severity: 'warning',
      penalty: 5,
      message: 'No WORKDIR set — files will land in filesystem root',
      fix: 'Add WORKDIR /app (or appropriate path) before COPY and RUN instructions',
      lineNumber: null,
    };
  }
  return null;
}

function checkExecForm(parsed) {
  const issues = [];
  const toCheck = ['CMD', 'ENTRYPOINT'];

  for (const type of toCheck) {
    const instructions = getInstructionsByType(parsed, type);
    for (const inst of instructions) {
      if (!inst.value.trim().startsWith('[')) {
        issues.push({
          id: `shell-form-${type.toLowerCase()}`,
          category: 'best-practices',
          severity: 'warning',
          penalty: 10,
          message: `${type} uses shell form — prefer exec form for signal handling`,
          fix: `Change ${type} ${inst.value} to ${type} ["${inst.value.split(' ')[0]}", ${inst.value.split(' ').slice(1).map(a => `"${a}"`).join(', ')}]`,
          lineNumber: inst.lineNumber,
        });
      }
    }
  }
  return issues;
}

function checkDeprecated(parsed) {
  const issues = [];
  const deprecated = ['MAINTAINER'];

  for (const type of deprecated) {
    const found = getInstructionsByType(parsed, type);
    for (const inst of found) {
      issues.push({
        id: `deprecated-${type.toLowerCase()}`,
        category: 'best-practices',
        severity: 'warning',
        penalty: 10,
        message: `${type} instruction is deprecated`,
        fix: type === 'MAINTAINER' ? 'Replace with LABEL maintainer="..."' : `Remove deprecated ${type}`,
        lineNumber: inst.lineNumber,
      });
    }
  }
  return issues;
}

// ── Documentation Rules ───────────────────────────────────────────────────────

function checkComments(parsed) {
  const totalRun = getInstructionsByType(parsed, 'RUN').length;
  const comments = parsed.instructions.filter(
    i => i.type === 'COMMENT' && i.value.length > 1 && !i.value.startsWith('#!')
  );

  if (totalRun > 3 && comments.length === 0) {
    return {
      id: 'no-comments',
      category: 'documentation',
      severity: 'info',
      penalty: 5,
      message: 'No comments explaining non-obvious build steps',
      fix: 'Add comments (# ) to explain complex RUN commands and build stages',
      lineNumber: null,
    };
  }
  return null;
}

function checkArgUsage(parsed) {
  if (parsed.args.length === 0) {
    const runInstructions = getInstructionsByType(parsed, 'RUN');
    const hasConfigurableValues = runInstructions.some(r =>
      /VERSION|version|PORT|port|\d+\.\d+\.\d+/.test(r.value)
    );

    if (hasConfigurableValues) {
      return {
        id: 'no-arg',
        category: 'documentation',
        severity: 'info',
        penalty: 5,
        message: 'Hardcoded versions/ports found — consider using ARG for configurability',
        fix: 'Use ARG NODE_VERSION=20 and reference as $NODE_VERSION',
        lineNumber: null,
      };
    }
  }
  return null;
}

// ── Rule Runner ───────────────────────────────────────────────────────────────

export function runAllRules(parsed, options = {}) {
  const issues = [];

  const addIssues = (...results) => {
    for (const r of results) {
      if (!r) continue;
      if (Array.isArray(r)) issues.push(...r.filter(Boolean));
      else issues.push(r);
    }
  };

  // Security
  addIssues(
    checkRunAsRoot(parsed),
    ...checkLatestTag(parsed),
    ...checkSecretEnv(parsed),
    ...checkAddVsCopy(parsed),
    ...checkUnnecessaryPorts(parsed),
    checkHealthcheck(parsed),
    ...checkSudo(parsed)
  );

  // Size
  addIssues(
    checkMultiStage(parsed),
    ...checkAlpineBase(parsed),
    ...checkCombinedRun(parsed),
    ...checkCacheCleanup(parsed),
    checkDevDependencies(parsed)
  );

  // Speed
  addIssues(
    ...checkLayerOrdering(parsed),
    checkCacheMount(parsed),
    ...checkUnnecessarySteps(parsed)
  );

  // Best Practices
  addIssues(
    checkLabel(parsed),
    checkDockerignore(parsed, options),
    checkWorkdir(parsed),
    ...checkExecForm(parsed),
    ...checkDeprecated(parsed)
  );

  // Documentation
  addIssues(
    checkComments(parsed),
    checkArgUsage(parsed)
  );

  return issues;
}

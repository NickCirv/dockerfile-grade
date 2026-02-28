/**
 * Beautiful terminal grade card renderer
 */

import chalk from 'chalk';
import {
  colorByGrade,
  scoreBar,
  severityIcon,
  categoryColor,
  header,
  boxLine,
} from './formatter.js';
import { getCategoryMeta } from './grader.js';

const CATEGORY_META = getCategoryMeta();

export function renderReport(parsed, issues, gradeResult, optimizerResult, options = {}) {
  if (options.json) {
    renderJson(parsed, issues, gradeResult, optimizerResult);
    return;
  }

  const lines = [];
  const { grade, overallScore, categoryScores } = gradeResult;

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push(chalk.dim('  DOCKERFILE-GRADE') + '  ' + chalk.gray('v1.0.0'));
  lines.push('');
  lines.push(chalk.dim('  Analyzing Dockerfile...'));
  lines.push('');

  // ── Grade Box ───────────────────────────────────────────────────────────────
  lines.push(chalk.dim('  ╔══════════════════════════════════════════╗'));
  lines.push(chalk.dim('  ║') + '           ' + chalk.dim('GRADE:') + '  ' + colorByGrade(grade, `${grade}`) + '  ' + chalk.dim(`(${overallScore}/100)`) + '           ' + chalk.dim('║'));
  lines.push(chalk.dim('  ╚══════════════════════════════════════════╝'));
  lines.push('');

  // ── Category Scores ─────────────────────────────────────────────────────────
  for (const [key, meta] of Object.entries(CATEGORY_META)) {
    const score = categoryScores[key];
    const bar = scoreBar(score);
    const label = meta.label.padEnd(16);
    const scoreStr = chalk.bold(`${score}/100`);
    lines.push(`  ${chalk.bold(label)} ${bar}  ${scoreStr}`);
  }
  lines.push('');

  // ── Issues Found ─────────────────────────────────────────────────────────────
  if (issues.length > 0) {
    lines.push('  ' + header('Issues Found'));

    // Sort: errors first, then warnings, then info
    const sorted = [...issues].sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });

    for (const issue of sorted) {
      const icon = severityIcon(issue.severity);
      const cat = chalk.dim(`[${issue.category.toUpperCase().replace(/-/g, ' ')}]`);
      const msg = issue.message.padEnd(48);
      lines.push(`  ${icon}  ${msg} ${cat}`);
    }
    lines.push('');
  } else {
    lines.push('  ' + header('Issues Found'));
    lines.push('  ' + chalk.green('✓') + '  Perfect! No issues found.');
    lines.push('');
  }

  // ── Quick Fixes ──────────────────────────────────────────────────────────────
  if (optimizerResult.quickFixes.length > 0) {
    lines.push('  ' + header('Quick Fixes'));

    // Deduplicate by lineNumber+issueId to avoid repeat entries
    const seen = new Set();
    const dedupedFixes = optimizerResult.quickFixes.filter(fix => {
      const key = `${fix.lineNumber}-${fix.issueId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const fix of dedupedFixes.slice(0, 6)) {
      if (fix.original) {
        lines.push(`  ${chalk.dim(`Line ${fix.lineNumber}:`)}  ${chalk.red(fix.original)}`);
        lines.push(`         → ${chalk.green.dim(truncate(fix.suggestion, 60))}`);
      } else {
        lines.push(`  ${chalk.dim('Add:')}     ${chalk.green.dim(truncate(fix.suggestion, 60))}`);
      }
    }
    lines.push('');
  }

  // ── Fix Prompt ───────────────────────────────────────────────────────────────
  if (!options.fix && issues.length > 0) {
    lines.push('  ' + chalk.dim('Run with') + ' ' + chalk.cyan('--fix') + chalk.dim(' for full optimized Dockerfile'));
    lines.push('');
  }

  // ── Full Optimized Dockerfile ─────────────────────────────────────────────────
  if (options.fix && optimizerResult.optimizedDockerfile) {
    lines.push('  ' + header('Optimized Dockerfile'));
    lines.push('');
    const dfLines = optimizerResult.optimizedDockerfile.split('\n');
    for (const line of dfLines) {
      if (line.includes('# ↑')) {
        lines.push('  ' + chalk.green(line));
      } else if (line.trim().startsWith('#')) {
        lines.push('  ' + chalk.dim(line));
      } else {
        lines.push('  ' + line);
      }
    }
    lines.push('');
  }

  // ── Summary Line ─────────────────────────────────────────────────────────────
  const errCount = gradeResult.errorCount;
  const warnCount = gradeResult.warningCount;
  const infoCount = gradeResult.infoCount;

  const parts = [];
  if (errCount > 0) parts.push(chalk.red(`${errCount} error${errCount > 1 ? 's' : ''}`));
  if (warnCount > 0) parts.push(chalk.yellow(`${warnCount} warning${warnCount > 1 ? 's' : ''}`));
  if (infoCount > 0) parts.push(chalk.cyan(`${infoCount} suggestion${infoCount > 1 ? 's' : ''}`));

  if (parts.length > 0) {
    lines.push('  ' + chalk.dim('Found: ') + parts.join(chalk.dim(', ')));
    lines.push('');
  }

  console.log(lines.join('\n'));
}

function renderJson(parsed, issues, gradeResult, optimizerResult) {
  const output = {
    grade: gradeResult.grade,
    score: gradeResult.overallScore,
    categoryScores: gradeResult.categoryScores,
    summary: {
      errors: gradeResult.errorCount,
      warnings: gradeResult.warningCount,
      info: gradeResult.infoCount,
      total: gradeResult.issueCount,
    },
    issues: issues.map(i => ({
      id: i.id,
      category: i.category,
      severity: i.severity,
      penalty: i.penalty,
      message: i.message,
      fix: i.fix,
      lineNumber: i.lineNumber,
    })),
    quickFixes: optimizerResult.quickFixes,
  };
  console.log(JSON.stringify(output, null, 2));
}

function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

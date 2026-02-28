/**
 * Barrel exports + main gradeDockerfile orchestrator
 */

export { parseDockerfile, getInstructionsByType, extractImageInfo } from './parser.js';
export { runAllRules } from './rules.js';
export { calculateGrade, getGradeColor, getCategoryMeta, getGradeScale } from './grader.js';
export { generateOptimizedDockerfile, formatQuickFixes } from './optimizer.js';
export { renderReport } from './reporter.js';

import { parseDockerfile } from './parser.js';
import { runAllRules } from './rules.js';
import { calculateGrade } from './grader.js';
import { generateOptimizedDockerfile } from './optimizer.js';
import { renderReport } from './reporter.js';

/**
 * Grade a Dockerfile from its string content
 *
 * @param {string} content - Raw Dockerfile content
 * @param {object} options - Options (hasDockerignore, fix, json, noColor)
 * @returns {{ grade, score, issues, categoryScores }}
 */
export async function gradeDockerfile(content, options = {}) {
  const parsed = parseDockerfile(content);
  const issues = runAllRules(parsed, options);
  const gradeResult = calculateGrade(issues);
  const optimizerResult = generateOptimizedDockerfile(parsed, issues);

  renderReport(parsed, issues, gradeResult, optimizerResult, options);

  return {
    grade: gradeResult.grade,
    score: gradeResult.overallScore,
    issues,
    categoryScores: gradeResult.categoryScores,
    gradeResult,
    optimizerResult,
  };
}

/**
 * Applies rules, calculates category scores and overall grade
 */

const CATEGORIES = {
  security: { weight: 0.30, label: 'Security' },
  size: { weight: 0.25, label: 'Size' },
  speed: { weight: 0.20, label: 'Speed' },
  'best-practices': { weight: 0.15, label: 'Best Practices' },
  documentation: { weight: 0.10, label: 'Documentation' },
};

const GRADE_SCALE = [
  { min: 95, grade: 'A+' },
  { min: 90, grade: 'A' },
  { min: 85, grade: 'A-' },
  { min: 80, grade: 'B+' },
  { min: 75, grade: 'B' },
  { min: 70, grade: 'B-' },
  { min: 65, grade: 'C+' },
  { min: 60, grade: 'C' },
  { min: 55, grade: 'C-' },
  { min: 45, grade: 'D' },
  { min: 0, grade: 'F' },
];

export function calculateGrade(issues) {
  // Start each category at 100, deduct penalties
  const categoryScores = {};

  for (const [key] of Object.entries(CATEGORIES)) {
    const categoryIssues = issues.filter(i => i.category === key);
    const totalPenalty = categoryIssues.reduce((sum, i) => sum + (i.penalty || 0), 0);
    categoryScores[key] = Math.max(0, 100 - totalPenalty);
  }

  // Weighted overall score
  let overallScore = 0;
  for (const [key, meta] of Object.entries(CATEGORIES)) {
    overallScore += categoryScores[key] * meta.weight;
  }
  overallScore = Math.round(overallScore);

  const grade = GRADE_SCALE.find(g => overallScore >= g.min)?.grade || 'F';

  return {
    categoryScores,
    overallScore,
    grade,
    issueCount: issues.length,
    errorCount: issues.filter(i => i.severity === 'error').length,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    infoCount: issues.filter(i => i.severity === 'info').length,
  };
}

export function getGradeColor(grade) {
  if (grade.startsWith('A')) return 'green';
  if (grade.startsWith('B')) return 'blue';
  if (grade.startsWith('C')) return 'yellow';
  return 'red';
}

export function getCategoryMeta() {
  return CATEGORIES;
}

export function getGradeScale() {
  return GRADE_SCALE;
}

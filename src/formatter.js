/**
 * Chalk formatting utilities
 */

import chalk from 'chalk';

export function colorByGrade(grade, text) {
  if (grade.startsWith('A')) return chalk.green.bold(text);
  if (grade.startsWith('B')) return chalk.hex('#3B82F6').bold(text);
  if (grade.startsWith('C')) return chalk.yellow.bold(text);
  return chalk.red.bold(text);
}

export function scoreBar(score, width = 10) {
  const filled = Math.round((score / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

export function severityIcon(severity) {
  switch (severity) {
    case 'error': return chalk.red('✗');
    case 'warning': return chalk.yellow('~');
    case 'info': return chalk.cyan('·');
    default: return chalk.gray('-');
  }
}

export function categoryColor(category) {
  const colors = {
    security: chalk.red,
    size: chalk.magenta,
    speed: chalk.cyan,
    'best-practices': chalk.blue,
    documentation: chalk.gray,
  };
  return (colors[category] || chalk.white)(category.toUpperCase().replace(/-/g, ' '));
}

export function dimLine() {
  return chalk.dim('─'.repeat(50));
}

export function header(text) {
  return chalk.dim('── ') + chalk.bold(text) + ' ' + chalk.dim('─'.repeat(Math.max(0, 44 - text.length)));
}

export function boxLine(text, width = 44) {
  const pad = Math.max(0, width - text.length);
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return '  ║' + ' '.repeat(left) + text + ' '.repeat(right) + '║';
}

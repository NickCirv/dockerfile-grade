#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

program
  .name('dockerfile-grade')
  .description('Grade your Dockerfile A+ to F')
  .version(pkg.version)
  .argument('<path>', 'Path to Dockerfile or directory containing one')
  .option('--fix', 'Show full optimized Dockerfile suggestions')
  .option('--json', 'Output results as JSON')
  .option('--strict', 'Exit with code 1 if grade is C or below (CI mode)')
  .option('--no-color', 'Disable colored output')
  .action(async (inputPath, options) => {
    const { gradeDockerfile } = await import('../src/index.js');

    let dockerfilePath;
    const resolvedPath = resolve(process.cwd(), inputPath);

    // If the path itself is a file that exists, use it directly
    if (existsSync(resolvedPath) && !resolvedPath.endsWith('/')) {
      const stat = (await import('fs')).statSync(resolvedPath);
      if (stat.isFile()) {
        dockerfilePath = resolvedPath;
      }
    }

    if (!dockerfilePath) {
      // Look for Dockerfile in directory
      if (existsSync(join(resolvedPath, 'Dockerfile'))) {
        dockerfilePath = join(resolvedPath, 'Dockerfile');
      } else {
        const candidates = ['Dockerfile.prod', 'Dockerfile.production', 'Dockerfile.dev'];
        const found = candidates.find(c => existsSync(join(resolvedPath, c)));
        if (found) {
          dockerfilePath = join(resolvedPath, found);
        } else {
          console.error(`No Dockerfile found at: ${resolvedPath}`);
          process.exit(1);
        }
      }
    }

    const dockerignorePath = join(dirname(dockerfilePath), '.dockerignore');
    const hasDockerignore = existsSync(dockerignorePath);

    try {
      const content = readFileSync(dockerfilePath, 'utf8');
      const result = await gradeDockerfile(content, {
        hasDockerignore,
        dockerfilePath,
        fix: options.fix,
        json: options.json,
        noColor: options.noColor,
      });

      if (options.strict) {
        const passingGrades = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];
        if (!passingGrades.includes(result.grade)) {
          process.exit(1);
        }
      }
    } catch (err) {
      console.error(`Error reading Dockerfile: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();

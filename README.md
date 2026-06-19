<div align="center">

# dockerfile-grade

**Letter-grade your Dockerfile — security, size, speed, and best practices in one command**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue?labelColor=0B0A09)](LICENSE)
[![Node >=18](https://img.shields.io/badge/Node-%3E%3D18-green?labelColor=0B0A09)](https://nodejs.org)

</div>

## Install

```bash
npx github:NickCirv/dockerfile-grade
```

## Usage

```bash
# Grade the Dockerfile in the current directory
npx github:NickCirv/dockerfile-grade .

# Grade a specific file and show a full optimized rewrite
npx github:NickCirv/dockerfile-grade path/to/Dockerfile --fix
```

| Flag | Description |
|------|-------------|
| `--fix` | Print a full optimized Dockerfile with issues resolved |
| `--json` | Output results as JSON (for scripts and CI) |
| `--strict` | Exit code 1 if grade is C or below (CI gate) |
| `--no-color` | Disable colored output |

## What it does

Reads a Dockerfile and scores it across five weighted categories — Security (30%), Size (25%), Speed (20%), Best Practices (15%), and Documentation (10%) — then outputs a letter grade from A+ to F with per-category breakdowns. Each issue includes a specific line-level fix suggestion. Use `--strict` to gate CI on grade: the exit code is non-zero if the Dockerfile scores a C or lower.

---
<sub>Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>

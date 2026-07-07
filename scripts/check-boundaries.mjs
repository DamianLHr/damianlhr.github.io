// Enforces the content ⇄ theme decoupling as a build failure, not a convention
// (TECHNOLOGY.md §3.2, PLAN §3):
//   content/**   → may import only content/**
//   shared/**    → shared/**, content/** (types)
//   themes/<x>/** → content/**, shared/**, its own folder
//   themes/registry.ts → shared/** + dynamic-import any theme folder (the one sanctioned point)
//   shell/**     → content/**, shared/**, themes/registry (never a theme folder)
//   main.tsx     → anything except theme folders
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, posix, relative, sep } from 'node:path'

const SRC = join(process.cwd(), 'src')
const IMPORT_RE = /(?:from\s+|import\s+|import\s*\(\s*)['"]([^'"]+)['"]/g

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|tsx|mts|cts)$/.test(name) ? [full] : []
  })
}

/** Resolve a relative specifier to a src-relative posix path (no extension). */
function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null // package import — not our concern
  const fromDir = posix.dirname(relative(SRC, fromFile).split(sep).join('/'))
  return posix.normalize(posix.join(fromDir, spec))
}

const inArea = (p, area) => p === area || p.startsWith(area + '/')

/** Theme folder name, or null for registry/contract-level files under themes/. */
function themeFolder(srcRelPath) {
  const m = /^themes\/([^/]+)/.exec(srcRelPath)
  if (!m) return null
  const name = m[1].replace(/\.(ts|tsx|mts|cts)$/, '')
  return name === 'registry' ? null : name
}

function allowed(fromRel, to) {
  const from = fromRel.split(sep).join('/')
  const toTheme = themeFolder(to)

  if (inArea(from, 'content')) return inArea(to, 'content')
  if (inArea(from, 'shared')) return inArea(to, 'shared') || inArea(to, 'content')
  if (from === 'themes/registry.ts') {
    return inArea(to, 'shared') || inArea(to, 'content') || toTheme !== null
  }
  if (inArea(from, 'themes')) {
    const ownTheme = themeFolder(from)
    return (
      inArea(to, 'content') ||
      inArea(to, 'shared') ||
      (toTheme !== null && toTheme === ownTheme)
    )
  }
  if (inArea(from, 'shell')) {
    return (
      inArea(to, 'content') ||
      inArea(to, 'shared') ||
      inArea(to, 'shell') ||
      to === 'themes/registry'
    )
  }
  // main.tsx and anything top-level: everything except reaching into a theme folder
  return toTheme === null
}

const violations = []
for (const file of walk(SRC)) {
  const fromRel = relative(SRC, file)
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(IMPORT_RE)) {
    const target = resolveSpecifier(file, match[1])
    if (target === null) continue
    if (!allowed(fromRel, target)) {
      violations.push(`${fromRel.split(sep).join('/')} → ${match[1]}`)
    }
  }
}

if (violations.length > 0) {
  console.error('Import-boundary violations (content ⇄ theme decoupling):')
  for (const v of violations) console.error(`  ✗ ${v}`)
  process.exit(1)
}
console.log('boundaries: OK (content/shared/themes/shell separation holds)')

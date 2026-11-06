#!/usr/bin/env node
/**
 * Classify a git diff for CI: which expensive jobs must run?
 * Fail-safe: empty list or any unrecognized path -> run everything.
 */
import { fileURLToPath } from 'node:url'

/** Paths that cannot affect Postgres RLS / RPC behavior. */
function isDbSafe(file) {
  if (file.endsWith('.css')) return true
  if (file.startsWith('src/components/')) return true
  if (file.startsWith('src/features/')) return true
  if (file.startsWith('src/hooks/')) return true
  if (file.startsWith('docs/')) return true
  if (file.endsWith('.md')) return true
  if (file.startsWith('public/')) return true
  if (file.startsWith('.cursor/')) return true
  if (file.startsWith('site/')) return true
  return false
}

/** Docs-only (or marketing-site-only) changes cannot affect app or e2e behavior. */
function isDocsOnly(file) {
  if (file === 'LICENSE') return true
  if (file.endsWith('.md')) return true
  if (file.startsWith('docs/')) return true
  if (file.startsWith('.cursor/')) return true
  if (file.startsWith('site/')) return true
  return false
}

/**
 * @param {string[]} files
 * @returns {{ runDb: boolean; runE2e: boolean }}
 */
export function classifyChangedFiles(files) {
  if (files.length === 0) {
    return { runDb: true, runE2e: true }
  }
  return {
    runDb: files.some((f) => !isDbSafe(f)),
    runE2e: files.some((f) => !isDocsOnly(f)),
  }
}

function formatGithubOutput({ runDb, runE2e }) {
  return `run_db=${runDb}\nrun_e2e=${runE2e}\n`
}

const isMain =
  process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  const stdin = await new Promise((resolve, reject) => {
    const chunks = []
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
  const files = stdin
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  process.stdout.write(formatGithubOutput(classifyChangedFiles(files)))
}

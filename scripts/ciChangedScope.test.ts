import { describe, expect, it } from 'vitest'
import { classifyChangedFiles } from './ciChangedScope.mjs'

describe('classifyChangedFiles', () => {
  it('runs both when the file list is empty (fail-safe)', () => {
    expect(classifyChangedFiles([])).toEqual({ runDb: true, runE2e: true })
  })

  it('skips db but runs e2e for pure UI changes', () => {
    expect(
      classifyChangedFiles([
        'src/features/buckets/BucketsPage.tsx',
        'src/components/ui/Sheet.tsx',
      ]),
    ).toEqual({ runDb: false, runE2e: true })
  })

  it('skips both for docs-only changes', () => {
    expect(
      classifyChangedFiles(['README.md', 'docs/BRAND.md', '.cursor/rules/foo.mdc']),
    ).toEqual({ runDb: false, runE2e: false })
  })

  it('skips both for marketing-site-only changes', () => {
    expect(
      classifyChangedFiles(['site/src/pages/index.astro', 'site/package.json']),
    ).toEqual({ runDb: false, runE2e: false })
  })

  it('runs db when src/lib changes (db tests import lib constants)', () => {
    expect(classifyChangedFiles(['src/lib/buckets.ts'])).toEqual({
      runDb: true,
      runE2e: true,
    })
  })

  it('runs db when generated types change', () => {
    expect(classifyChangedFiles(['src/types/database.ts'])).toEqual({
      runDb: true,
      runE2e: true,
    })
  })

  it('runs both when supabase migrations change', () => {
    expect(
      classifyChangedFiles(['supabase/migrations/00000000000001_foo.sql']),
    ).toEqual({ runDb: true, runE2e: true })
  })

  it('runs both when workflow or classifier changes', () => {
    expect(
      classifyChangedFiles([
        '.github/workflows/ci.yml',
        'scripts/ciChangedScope.mjs',
      ]),
    ).toEqual({ runDb: true, runE2e: true })
  })

  it('runs e2e when UI and docs are mixed', () => {
    expect(
      classifyChangedFiles(['src/features/buckets/BucketsPage.tsx', 'README.md']),
    ).toEqual({ runDb: false, runE2e: true })
  })

  it('runs db when tests/db changes even if only test files', () => {
    expect(classifyChangedFiles(['tests/db/rls.test.ts'])).toEqual({
      runDb: true,
      runE2e: true,
    })
  })
})

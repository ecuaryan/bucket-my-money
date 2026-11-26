// Formats query.sql's JSON (stdin) as the GitHub issue comment (stdout).
// Everything a report carries goes inside code fences, so nothing in it can
// render as a link, a mention or markup in the public issue.
import { readFileSync } from 'node:fs'

const rows = JSON.parse(readFileSync(0, 'utf8') || '[]')
const day = process.argv[2] ?? ''
const fence = (text) => '```\n' + String(text ?? '').replaceAll('```', "'''") + '\n```'
const inline = (text) => '`' + String(text ?? '—').replaceAll('`', "'") + '`'

if (rows.length === 0) process.exit(0)

const total = rows.reduce((sum, r) => sum + r.count, 0)
const fresh = rows.filter((r) => r.is_new).length
const lines = [
  `**${day}:** ${total} report${total === 1 ? '' : 's'} of ${rows.length} error${rows.length === 1 ? '' : 's'}` +
    (fresh ? `, ${fresh} new` : '') +
    '.',
  '',
]
for (const r of rows) {
  lines.push(
    `### ${r.is_new ? '🆕 ' : ''}${r.count}× ${r.kind}`,
    '',
    fence(r.message),
    '',
    `Screen ${inline(r.route)} · version ${inline(r.app_version)} · ${inline(r.browser)}`,
    '',
  )
  if (r.stack) {
    const top = r.stack.split('\n').slice(0, 12).join('\n')
    lines.push('<details><summary>Stack</summary>', '', fence(top), '', '</details>', '')
  }
}
process.stdout.write(lines.join('\n'))

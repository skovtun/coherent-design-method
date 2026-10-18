/**
 * Environment-identity leak detector.
 *
 * Coding agents read `git config user.name/email` and the OS user while
 * scaffolding, and paste them into mock UI (observed: plain Claude Code put the
 * founder's real name in the sidebar and real email in the sign-in field).
 * Generated apps get screenshotted and published, so this is a hard check.
 */
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { homedir, userInfo } from 'os'
import { join } from 'path'
import type { ProjectGraph } from './graph.js'

export interface Identity {
  kind: 'email' | 'name' | 'first-name' | 'username' | 'home-path'
  value: string
  severity: 'error' | 'warning'
}

export interface Leak {
  file: string
  line: number
  identity: Identity
  excerpt: string
}

function git(root: string, key: string): string {
  try {
    return execFileSync('git', ['config', '--get', key], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

export function collectIdentities(root: string): Identity[] {
  const out: Identity[] = []
  const email = git(root, 'user.email')
  const name = git(root, 'user.name')
  if (email) out.push({ kind: 'email', value: email, severity: 'error' })
  if (name) {
    out.push({ kind: 'name', value: name, severity: 'error' })
    const first = name.split(/\s+/)[0]
    if (first && first.length >= 3 && first !== name)
      out.push({ kind: 'first-name', value: first, severity: 'warning' })
  }
  try {
    const u = userInfo().username
    if (u && u.length >= 4) out.push({ kind: 'username', value: u, severity: 'warning' })
  } catch {
    /* no passwd entry in some containers */
  }
  out.push({ kind: 'home-path', value: homedir(), severity: 'error' })
  return out
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function scanLeaks(graph: ProjectGraph, identities: Identity[] = collectIdentities(graph.root)): Leak[] {
  const leaks: Leak[] = []
  const matchers = identities.map(id => ({
    id,
    re:
      id.kind === 'email' || id.kind === 'home-path'
        ? new RegExp(escapeRe(id.value), 'i')
        : new RegExp(`\\b${escapeRe(id.value)}\\b`, 'i'),
  }))
  for (const node of Object.values(graph.nodes)) {
    if (node.kind === 'style') continue
    const lines = readFileSync(join(graph.root, node.id), 'utf-8').split('\n')
    lines.forEach((text, i) => {
      const hits = matchers.filter(m => m.re.test(text)).map(m => m.id)
      // "Ada" inside "ada@example.dev" is the same leak, not a second one.
      const own = hits.filter(h => !hits.some(o => o !== h && o.value.toLowerCase().includes(h.value.toLowerCase())))
      for (const identity of own)
        leaks.push({ file: node.id, line: i + 1, identity, excerpt: text.trim().slice(0, 120) })
    })
  }
  return leaks
}

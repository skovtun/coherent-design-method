/**
 * Hand-rolled robots.txt parser + check. Honors User-agent groups, Disallow,
 * Allow, longest-match-wins (Allow wins on tie), and `*` / `$` wildcards.
 *
 * Fail-open by design (RFC 9309 §2.4): any fetch failure (network error, 4xx,
 * timeout, malformed body) is treated as "no robots.txt published" → allowed.
 * Blocking on robots.txt unavailability would let any flaky origin DoS our
 * extraction by simply not serving robots.txt.
 *
 * Scope limits (intentional):
 * - User-agent matching is case-insensitive substring on the FIRST token only;
 *   wildcards in UA tokens are not parsed.
 * - Crawl-delay, Sitemap, Host directives are ignored (not relevant to extract).
 * - Specific UA group, when matched, FULLY OVERRIDES the * group per RFC
 *   §2.2.1 (most-specific group wins). When no specific match, falls back to *.
 */

export interface RobotsCheckOptions {
  /** UA string used to match groups in robots.txt. Default: 'CoherentExtractBot'. */
  userAgent?: string
  /** SSRF guard applied to the robots.txt URL itself. Default: noop. */
  ssrfGuard?: (url: string) => Promise<void> | void
  /** Override fetch (for tests). Default: globalThis.fetch. */
  fetchImpl?: (
    url: string,
    init?: { signal?: AbortSignal; redirect?: 'manual' | 'follow' | 'error' },
  ) => Promise<Response>
  /** Fetch timeout. Default: 5000ms. */
  timeoutMs?: number
}

export interface RobotsCheckResult {
  allowed: boolean
  reason: 'no-robots-txt' | 'allowed-by-rule' | 'disallowed-by-rule' | 'fetch-failed'
  matchedRule?: string
}

const DEFAULT_USER_AGENT = 'CoherentExtractBot'
const DEFAULT_TIMEOUT_MS = 5000

export async function defaultRobotsCheck(targetUrl: string, opts: RobotsCheckOptions = {}): Promise<RobotsCheckResult> {
  const ua = opts.userAgent ?? DEFAULT_USER_AGENT
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch

  let parsed: URL
  try {
    parsed = new URL(targetUrl)
  } catch {
    return { allowed: true, reason: 'no-robots-txt' }
  }
  const robotsUrl = `${parsed.origin}/robots.txt`

  if (opts.ssrfGuard) {
    try {
      await opts.ssrfGuard(robotsUrl)
    } catch {
      // SSRF guard rejected robots.txt URL — origin itself is unreachable,
      // so the navigation will also fail. Fail-open here; caller's own SSRF
      // guard will catch the navigation.
      return { allowed: true, reason: 'fetch-failed' }
    }
  }

  let body: string
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    // `redirect: 'manual'` is a security control, not a nicety. The SSRF guard
    // above only vetted `robotsUrl`; without this, a hostile server can answer
    // the robots.txt request with a 302 to http://169.254.169.254/… (cloud
    // metadata) or an internal host, and the default `redirect: 'follow'` would
    // chase it — an unguarded SSRF on every extract. Manual mode returns the
    // redirect response instead of following it; a non-2xx is treated as
    // no-robots-txt (fail-open per RFC 9309), which is the safe outcome.
    const res = await fetchImpl(robotsUrl, { signal: ctrl.signal, redirect: 'manual' })
    if (!res.ok) {
      return { allowed: true, reason: 'no-robots-txt' }
    }
    body = await res.text()
  } catch {
    return { allowed: true, reason: 'fetch-failed' }
  } finally {
    clearTimeout(timer)
  }

  const rules = parseRobots(body, ua)
  return matchPath(parsed.pathname + parsed.search, rules)
}

interface Rule {
  kind: 'allow' | 'disallow'
  pattern: string
}

/** Parse robots.txt body into rules for the matching UA group. */
export function parseRobots(body: string, ua: string): Rule[] {
  const lines = body
    .split(/\r?\n/)
    .map(l => l.replace(/#.*$/, '').trim())
    .filter(Boolean)

  const groups: { agents: string[]; rules: Rule[] }[] = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  let collectingAgents = false

  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const key = line.slice(0, colon).trim().toLowerCase()
    const value = line.slice(colon + 1).trim()

    if (key === 'user-agent') {
      if (!collectingAgents || !current) {
        current = { agents: [], rules: [] }
        groups.push(current)
        collectingAgents = true
      }
      current.agents.push(value.toLowerCase())
      continue
    }

    collectingAgents = false
    if (!current) continue
    if (key === 'disallow') {
      current.rules.push({ kind: 'disallow', pattern: value })
    } else if (key === 'allow') {
      current.rules.push({ kind: 'allow', pattern: value })
    }
  }

  const uaLower = ua.toLowerCase()
  const specific = groups.find(g => g.agents.some(a => a !== '*' && uaLower.includes(a)))
  if (specific) return specific.rules
  const wildcard = groups.find(g => g.agents.includes('*'))
  return wildcard ? wildcard.rules : []
}

/** Apply rules to path. Longest match wins; on tie, allow wins (RFC 9309 §2.2.2). */
export function matchPath(path: string, rules: Rule[]): RobotsCheckResult {
  let best: { rule: Rule; len: number } | null = null
  for (const rule of rules) {
    if (rule.pattern === '' && rule.kind === 'disallow') continue // Disallow: (empty) = allow all
    if (!patternMatches(path, rule.pattern)) continue
    const len = rule.pattern.length
    if (best === null || len > best.len || (len === best.len && rule.kind === 'allow')) {
      best = { rule, len }
    }
  }
  if (!best) return { allowed: true, reason: 'allowed-by-rule' }
  if (best.rule.kind === 'allow') {
    return { allowed: true, reason: 'allowed-by-rule', matchedRule: `Allow: ${best.rule.pattern}` }
  }
  return { allowed: false, reason: 'disallowed-by-rule', matchedRule: `Disallow: ${best.rule.pattern}` }
}

/** Path-pattern match per Google/RFC robots.txt: `*` matches any sequence, `$` anchors end. */
export function patternMatches(path: string, pattern: string): boolean {
  if (pattern === '' || pattern === '/') return pattern === '/' ? path.startsWith('/') : true
  // Escape regex metachars except * and $; rewrite * → .*; rewrite trailing $ → end anchor.
  const escaped = pattern.replace(/[.+?^=!:${}()|[\]\\]/g, m => (m === '$' ? '$' : '\\' + m))
  const withWildcards = escaped.replace(/\*/g, '.*')
  const anchored = withWildcards.endsWith('$') ? `^${withWildcards}` : `^${withWildcards}`
  try {
    return new RegExp(anchored).test(path)
  } catch {
    return false
  }
}

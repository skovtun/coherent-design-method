import type { AiProvider, GenerateOptions } from './ai-provider.js'

export interface MockGenerateCall {
  prompt: string
  options?: GenerateOptions
}

/**
 * Deterministic {@link AiProvider} for tests + the parity harness.
 *
 * Two resolution modes, checked in order:
 *  1. **Matcher mode** — `push(match, response)` queues a (prompt→response)
 *     entry. A substring or RegExp matcher lets tests assert "phase plan
 *     fires with prompt containing X" without depending on exact wording.
 *     Matchers are one-shot: consumed on first successful match.
 *  2. **Queue mode** — if no matcher hits, the first unconsumed entry from
 *     `enqueue(response)` is returned in FIFO order.
 *
 * If both queues are empty, `generate()` throws. Tests catching that error
 * are missing a response — which is the signal you wanted.
 *
 * Every call is recorded on `calls`, so tests can assert prompt shape +
 * option propagation after the fact.
 */
export class MockProvider implements AiProvider {
  readonly calls: MockGenerateCall[] = []
  private matchers: Array<{ match: string | RegExp; response: string }> = []
  private queue: string[] = []

  /** Register a (matcher → response) pair. Consumed on first match. */
  push(match: string | RegExp, response: string): this {
    this.matchers.push({ match, response })
    return this
  }

  /** Append a response to the FIFO fallback queue. */
  enqueue(response: string): this {
    this.queue.push(response)
    return this
  }

  /** Drop all recorded calls + pending responses. */
  reset(): void {
    this.calls.length = 0
    this.matchers = []
    this.queue = []
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    this.calls.push({ prompt, options })

    const matcherIndex = this.matchers.findIndex(m =>
      typeof m.match === 'string' ? prompt.includes(m.match) : m.match.test(prompt),
    )
    if (matcherIndex !== -1) {
      const [entry] = this.matchers.splice(matcherIndex, 1)
      return entry.response
    }

    const queued = this.queue.shift()
    if (queued !== undefined) return queued

    throw new Error(
      `MockProvider: no response configured for prompt (first 80 chars): ${JSON.stringify(prompt.slice(0, 80))}`,
    )
  }
}

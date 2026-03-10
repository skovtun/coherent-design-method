/**
 * Figma REST API client (Story 3.8).
 * Fetches file and optional image exports.
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1'

export interface FigmaClientOptions {
  /** Callback for progress (e.g. "Fetching...", "Parsing..."). */
  onProgress?: (message: string) => void
}

export class FigmaClient {
  constructor(private token: string, private options: FigmaClientOptions = {}) {}

  private progress(msg: string): void {
    this.options.onProgress?.(msg)
  }

  /**
   * Extract file key from Figma URL or return as-is if already a key.
   * e.g. https://www.figma.com/file/ABC123/Title → ABC123
   */
  static extractFileKey(urlOrKey: string): string | null {
    const trimmed = (urlOrKey ?? '').trim()
    if (!trimmed) return null
    const match = trimmed.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/)
    if (match) return match[1]
    if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed
    return null
  }

  /**
   * Fetch file structure from Figma API.
   * GET https://api.figma.com/v1/files/:key
   */
  private async fetchWithRetry(url: string, retries = 2): Promise<Response> {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Figma-Token': this.token, 'Accept': 'application/json' },
    })
    if (res.status === 429 && retries > 0) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '', 10)
      const delay = (Number.isFinite(retryAfter) ? retryAfter : 5) * 1000
      this.progress(`Rate limited — retrying in ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
      return this.fetchWithRetry(url, retries - 1)
    }
    return res
  }

  private async safeJson(res: Response): Promise<unknown> {
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`Figma API returned non-JSON response: ${text.slice(0, 200)}`)
    }
  }

  async fetchFile(fileKey: string): Promise<unknown> {
    this.progress('Fetching Figma file...')
    const url = `${FIGMA_API_BASE}/files/${fileKey}`
    const res = await this.fetchWithRetry(url)

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let message = `Figma API error ${res.status}`
      if (res.status === 401) message = 'Invalid or expired Figma token. Check Settings → Personal access tokens.'
      else if (res.status === 403) message = 'Access forbidden to this file. Check file permissions.'
      else if (res.status === 404) message = 'File not found. Check the file key or URL.'
      else if (res.status === 429) message = 'Rate limited after retries. Try again later.'
      else if (text) message += `: ${text.slice(0, 200)}`
      throw new Error(message)
    }

    const data = await this.safeJson(res)
    this.progress('File received.')
    return data
  }

  /**
   * Fetch image URLs for given node IDs (for raster or vector export).
   * GET https://api.figma.com/v1/images/:key?ids=id1,id2&format=svg
   */
  async fetchImages(
    fileKey: string,
    nodeIds: string[],
    options: { format?: 'svg' | 'png'; scale?: number } = {}
  ): Promise<Record<string, string>> {
    if (nodeIds.length === 0) return {}
    this.progress(`Fetching images for ${nodeIds.length} node(s)...`)
    const ids = nodeIds.slice(0, 50).join(',')
    const format = options.format ?? 'svg'
    const scale = options.scale ?? 1
    const url = `${FIGMA_API_BASE}/images/${fileKey}?ids=${encodeURIComponent(ids)}&format=${format}&scale=${scale}`
    const res = await this.fetchWithRetry(url)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Figma images API error ${res.status}: ${text.slice(0, 150)}`)
    }
    const data = await this.safeJson(res) as { err?: string; images?: Record<string, string> }
    if (data.err) throw new Error(data.err)
    return data.images ?? {}
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('../managers/SharedComponentsRegistry.js', () => ({
  loadManifest: vi.fn(),
}))

vi.mock('./SharedComponentGenerator.js', () => ({
  toSharedFileName: vi.fn((name: string) => name.toLowerCase()),
}))

import { integrateSharedLayoutIntoRootLayout } from './SharedLayoutIntegration.js'
import { readFile, writeFile } from 'fs/promises'
import { loadManifest } from '../managers/SharedComponentsRegistry.js'

const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>
const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>
const mockLoadManifest = loadManifest as unknown as ReturnType<typeof vi.fn>

describe('integrateSharedLayoutIntoRootLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const LAYOUT_WITH_APPNAV = `import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { AppNav } from './AppNav'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col">
        <AppNav />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  )
}
`

  it('removes <AppNav /> when shared Header is integrated', async () => {
    mockLoadManifest.mockResolvedValue({
      shared: [{ name: 'Header', type: 'layout' }],
    })
    mockReadFile.mockResolvedValue(LAYOUT_WITH_APPNAV)
    mockWriteFile.mockResolvedValue(undefined)

    await integrateSharedLayoutIntoRootLayout('/fake')

    const written = mockWriteFile.mock.calls[0]?.[1] as string
    expect(written).toBeDefined()
    expect(written).not.toContain('<AppNav')
    expect(written).toContain('<Header />')
  })

  it('removes AppNav import line when shared Header is integrated', async () => {
    mockLoadManifest.mockResolvedValue({
      shared: [{ name: 'Header', type: 'layout' }],
    })
    mockReadFile.mockResolvedValue(LAYOUT_WITH_APPNAV)
    mockWriteFile.mockResolvedValue(undefined)

    await integrateSharedLayoutIntoRootLayout('/fake')

    const written = mockWriteFile.mock.calls[0]?.[1] as string
    expect(written).not.toContain("from './AppNav'")
    expect(written).not.toContain('AppNav')
  })

  it('keeps AppNav when only Footer (no Header) is integrated', async () => {
    mockLoadManifest.mockResolvedValue({
      shared: [{ name: 'Footer', type: 'layout' }],
    })
    mockReadFile.mockResolvedValue(LAYOUT_WITH_APPNAV)
    mockWriteFile.mockResolvedValue(undefined)

    await integrateSharedLayoutIntoRootLayout('/fake')

    const written = mockWriteFile.mock.calls[0]?.[1] as string
    expect(written).toBeDefined()
    expect(written).toContain('AppNav')
    expect(written).toContain('<Footer />')
  })

  it('returns false when no layout components in manifest', async () => {
    mockLoadManifest.mockResolvedValue({ shared: [] })

    const result = await integrateSharedLayoutIntoRootLayout('/fake')
    expect(result).toBe(false)
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

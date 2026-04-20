import { describe, it, expect } from 'vitest'
import { buildIssueBody, buildGitHubIssueURL } from './report-issue.js'

describe('buildIssueBody', () => {
  it('includes CLI and project versions', () => {
    const body = buildIssueBody({
      projectVersion: '0.6.42',
      cliVersion: '0.6.99',
      pages: [],
    })
    expect(body).toContain('**Coherent CLI**: v0.6.99')
    expect(body).toContain('**Project version**: v0.6.42')
  })

  it('adds Page section when pagePath provided', () => {
    const body = buildIssueBody({
      projectVersion: '0.6.42',
      cliVersion: '0.6.99',
      pages: [],
      pagePath: '/dashboard',
    })
    expect(body).toContain('## Page')
    expect(body).toContain('`/dashboard`')
  })

  it('embeds screenshot reference with upload reminder', () => {
    const body = buildIssueBody({
      projectVersion: '0.6.42',
      cliVersion: '0.6.99',
      pages: [],
      screenshot: '/tmp/shot.png',
    })
    expect(body).toContain('## Screenshot')
    expect(body).toContain('/tmp/shot.png')
    expect(body).toContain('attach after opening')
  })

  it('truncates page list after 5 with ellipsis', () => {
    const pages = ['/a', '/b', '/c', '/d', '/e', '/f', '/g']
    const body = buildIssueBody({ projectVersion: '1.0', cliVersion: '1.0', pages })
    expect(body).toContain('7 (/a, /b, /c, /d, /e, …)')
  })

  it('includes Steps to reproduce and Expected/Actual sections', () => {
    const body = buildIssueBody({ projectVersion: '1.0', cliVersion: '1.0', pages: [] })
    expect(body).toContain('## Steps to reproduce')
    expect(body).toContain('## Expected behavior')
    expect(body).toContain('## Actual behavior')
  })
})

describe('buildGitHubIssueURL', () => {
  it('returns a valid GitHub issue URL with encoded title and body', () => {
    const url = buildGitHubIssueURL('user/repo', 'My Title', 'Some body')
    expect(url).toMatch(/^https:\/\/github\.com\/user\/repo\/issues\/new\?/)
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('My Title')
    expect(params.get('body')).toBe('Some body')
  })

  it('encodes special characters correctly', () => {
    const url = buildGitHubIssueURL('a/b', '[bug] broken & failing', '## Details')
    const params = new URL(url).searchParams
    expect(params.get('title')).toBe('[bug] broken & failing')
    expect(params.get('body')).toBe('## Details')
  })
})

import { describe, it, expect } from 'vitest'
import { extractFrontmatter, parseSafeYaml, SafeYamlError } from './safe-yaml.js'

describe('extractFrontmatter', () => {
  it('returns null data when there is no frontmatter', () => {
    const { data, body } = extractFrontmatter('# Title\n\nbody')
    expect(data).toBeNull()
    expect(body).toContain('# Title')
  })

  it('splits leading --- frontmatter from body', () => {
    const { data, body } = extractFrontmatter('---\nname: Acme\n---\n# Title\n')
    expect(data).toEqual({ name: 'Acme' })
    expect(body.trim()).toBe('# Title')
  })

  it('is lenient on a bare horizontal rule (unterminated frontmatter → body)', () => {
    const { data } = extractFrontmatter('---\nnot really frontmatter')
    expect(data).toBeNull()
  })
})

describe('parseSafeYaml — nested maps', () => {
  it('parses a flat colors map with quoted hex (# not treated as comment)', () => {
    const data = parseSafeYaml('colors:\n  primary: "#635bff"\n  ink: "#0d253d"\n')
    expect(data).toEqual({ colors: { primary: '#635bff', ink: '#0d253d' } })
  })

  it('parses nested typography role maps to depth 3', () => {
    const data = parseSafeYaml(
      'typography:\n  body-md:\n    fontFamily: "Sohne"\n    fontSize: 16px\n  display:\n    fontFamily: "Sohne"\n',
    )
    expect(data).toEqual({
      typography: {
        'body-md': { fontFamily: 'Sohne', fontSize: '16px' },
        display: { fontFamily: 'Sohne' },
      },
    })
  })

  it('strips a bare inline comment but keeps quoted #', () => {
    const data = parseSafeYaml('version: 1  # a comment\nname: Acme\n')
    expect(data).toEqual({ version: '1', name: 'Acme' })
  })

  it('allows ! * & inside quoted or mid-line values (not YAML syntax)', () => {
    expect(parseSafeYaml('name: "Acme!"\n')).toEqual({ name: 'Acme!' })
    expect(parseSafeYaml('title: a << b\n')).toEqual({ title: 'a << b' })
    expect(parseSafeYaml('note: great & good\n')).toEqual({ note: 'great & good' })
  })

  it('skips sequence subtrees without corrupting sibling keys', () => {
    const data = parseSafeYaml('components:\n  - name: Button\n  - name: Card\nspacing:\n  md: 16px\n')
    expect(data).toEqual({ components: {}, spacing: { md: '16px' } })
  })
})

describe('parseSafeYaml — safety', () => {
  it('rejects anchors', () => {
    expect(() => parseSafeYaml('a: &anchor value\nb: *anchor\n')).toThrow(SafeYamlError)
  })
  it('rejects aliases (blocks expansion bombs)', () => {
    expect(() => parseSafeYaml('b: *anchor\n')).toThrow(SafeYamlError)
  })
  it('rejects tags', () => {
    expect(() => parseSafeYaml('a: !!python/object x\n')).toThrow(SafeYamlError)
  })
  it('rejects merge keys', () => {
    expect(() => parseSafeYaml('base:\n  x: 1\nchild:\n  <<: *base\n')).toThrow(SafeYamlError)
  })
  it('rejects tabs in indentation', () => {
    expect(() => parseSafeYaml('colors:\n\tprimary: "#000000"\n')).toThrow(SafeYamlError)
  })
  it('rejects nesting past the depth limit', () => {
    let doc = ''
    for (let i = 0; i < 12; i++) doc += '  '.repeat(i) + `k${i}:\n`
    expect(() => parseSafeYaml(doc)).toThrow(SafeYamlError)
  })
})

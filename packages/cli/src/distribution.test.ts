import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const repo = join(__dirname, '..', '..', '..')
const json = (p: string) => JSON.parse(readFileSync(join(repo, p), 'utf-8'))

describe('distribution manifests', () => {
  it('plugin, MCP registry entry and npm package carry one version and one MCP name', () => {
    const cli = json('packages/cli/package.json')
    const server = json('server.json')
    expect(server.version).toBe(cli.version)
    expect(server.packages[0].version).toBe(cli.version)
    expect(server.packages[0].identifier).toBe(cli.name)
    expect(server.name).toBe(cli.mcpName)
    expect(json('plugins/coherent/.claude-plugin/plugin.json').version).toBe(cli.version)
    expect(json('plugins/coherent/plugin.json').version).toBe(cli.version)
  })

  it('the skill has the frontmatter skill indexes read', () => {
    const skill = readFileSync(join(repo, 'plugins/coherent/skills/coherent/SKILL.md'), 'utf-8')
    expect(skill).toMatch(/^---\nname: coherent\ndescription: .{40,1024}\n---\n/)
  })
})

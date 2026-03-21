import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: async () => ({ content: [{ type: 'text', text: '{}' }] }) }
      constructor() {}
    },
  }
})

import { ClaudeClient } from './claude.js'

function makeClient(responseText: string): ClaudeClient {
  const client = new ClaudeClient('test-key')
  ;(client as any).client = {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text: responseText }],
        stop_reason: 'end_turn',
      }),
    },
  }
  return client
}

function makeClientWithCapture(responseText: string): {
  client: ClaudeClient
  captured: { messages: any[]; system: string; max_tokens: number }
} {
  const captured = { messages: [] as any[], system: '', max_tokens: 0 }
  const client = new ClaudeClient('test-key')
  ;(client as any).client = {
    messages: {
      create: async (opts: any) => {
        captured.messages = opts.messages
        captured.system = opts.system
        captured.max_tokens = opts.max_tokens
        return {
          content: [{ type: 'text', text: responseText }],
          stop_reason: 'end_turn',
        }
      },
    },
  }
  return { client, captured }
}

describe('ClaudeClient.extractSharedComponents', () => {
  it('returns parsed components from AI response', async () => {
    const aiResponse = JSON.stringify({
      components: [
        {
          name: 'FeatureCard',
          type: 'widget',
          description: 'A card with icon, title, and description',
          propsInterface: 'export interface FeatureCardProps { icon: string; title: string; description: string }',
          code: '"use client"\nexport function FeatureCard() { return <div>Feature</div> }',
        },
      ],
    })

    const client = makeClient(aiResponse)
    const result = await client.extractSharedComponents!('<div>page code</div>', ['Button', 'Card'], ['ExistingHero'])

    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('FeatureCard')
    expect(result.components[0].type).toBe('widget')
    expect(result.components[0].description).toBe('A card with icon, title, and description')
    expect(result.components[0].code).toContain('FeatureCard')
  })

  it('strips markdown fencing from response', async () => {
    const json = JSON.stringify({
      components: [
        {
          name: 'StatCard',
          type: 'widget',
          description: 'Stat display',
          propsInterface: 'export interface StatCardProps { value: number }',
          code: 'export function StatCard() { return <div>Stat</div> }',
        },
      ],
    })
    const wrapped = '```json\n' + json + '\n```'

    const client = makeClient(wrapped)
    const result = await client.extractSharedComponents!('<div/>', [], [])

    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('StatCard')
  })

  it('sends correct system prompt, user message, and model params', async () => {
    const { client, captured } = makeClientWithCapture('{ "components": [] }')
    await client.extractSharedComponents!('<div>page</div>', ['Button'], ['Hero'])

    expect(captured.messages).toHaveLength(1)
    expect(captured.messages[0].role).toBe('user')
    expect(captured.messages[0].content).toContain('<div>page</div>')
    expect(captured.messages[0].content).toContain('Button')
    expect(captured.messages[0].content).toContain('Hero')
    expect(captured.system).toContain('JSON')
    expect(captured.max_tokens).toBe(16384)
  })

  it('returns empty array when no components found', async () => {
    const client = makeClient('{ "components": [] }')
    const result = await client.extractSharedComponents!('<div/>', [], [])

    expect(result.components).toEqual([])
  })

  it('returns empty array on API error', async () => {
    const client = new ClaudeClient('test-key')
    ;(client as any).client = {
      messages: {
        create: async () => {
          throw new Error('API rate limit')
        },
      },
    }
    const result = await client.extractSharedComponents!('<div/>', [], [])

    expect(result.components).toEqual([])
  })
})

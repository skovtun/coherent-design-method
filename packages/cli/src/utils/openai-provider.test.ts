import { describe, it, expect } from 'vitest'
import { OpenAIClient } from './openai-provider.js'

function makeMockOpenAI(responseContent: string) {
  return class MockOpenAI {
    chat = {
      completions: {
        create: async () => ({
          choices: [{ message: { content: responseContent }, finish_reason: 'stop' }],
        }),
      },
    }
  }
}

describe('OpenAIClient.extractSharedComponents', () => {
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

    const client = new OpenAIClient('test-key', 'gpt-4o', makeMockOpenAI(aiResponse))
    const result = await client.extractSharedComponents(
      '<div>page code</div>',
      ['Button', 'Card'],
      ['ExistingHero'],
    )

    expect(result.components).toHaveLength(1)
    expect(result.components[0].name).toBe('FeatureCard')
    expect(result.components[0].type).toBe('widget')
    expect(result.components[0].description).toBe('A card with icon, title, and description')
    expect(result.components[0].code).toContain('FeatureCard')
  })

  it('sends correct system and user prompts', async () => {
    let capturedMessages: any[] = []
    let capturedOptions: any = {}

    const MockOpenAI = class {
      chat = {
        completions: {
          create: async (opts: any) => {
            capturedMessages = opts.messages
            capturedOptions = opts
            return {
              choices: [{ message: { content: '{ "components": [] }' }, finish_reason: 'stop' }],
            }
          },
        },
      }
    }

    const client = new OpenAIClient('test-key', 'gpt-4o', MockOpenAI)
    await client.extractSharedComponents('<div>page</div>', ['Button'], ['Hero'])

    expect(capturedMessages).toHaveLength(2)
    expect(capturedMessages[0].role).toBe('system')
    expect(capturedMessages[1].role).toBe('user')
    expect(capturedMessages[1].content).toContain('<div>page</div>')
    expect(capturedMessages[1].content).toContain('Button')
    expect(capturedMessages[1].content).toContain('Hero')
    expect(capturedOptions.response_format).toEqual({ type: 'json_object' })
    expect(capturedOptions.temperature).toBe(0.3)
    expect(capturedOptions.max_tokens).toBe(16384)
  })

  it('returns empty array when no components found', async () => {
    const client = new OpenAIClient('test-key', 'gpt-4o', makeMockOpenAI('{ "components": [] }'))
    const result = await client.extractSharedComponents('<div/>', [], [])

    expect(result.components).toEqual([])
  })

  it('returns empty array on API error', async () => {
    const MockOpenAI = class {
      chat = {
        completions: {
          create: async () => {
            throw new Error('API rate limit')
          },
        },
      }
    }

    const client = new OpenAIClient('test-key', 'gpt-4o', MockOpenAI)
    const result = await client.extractSharedComponents('<div/>', [], [])

    expect(result.components).toEqual([])
  })
})

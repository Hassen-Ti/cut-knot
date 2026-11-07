/** Groq API client for AI harness. Uses fixtures when GROQ_API_KEY is missing. */

type GroqMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type GroqTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type GroqToolCall = {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

type GroqRequest = {
  model: string
  messages: GroqMessage[]
  tools?: GroqTool[]
  tool_choice?: 'required' | 'auto' | 'none'
  temperature?: number
}

type GroqResponse = {
  id: string
  choices: Array<{
    message: {
      role: string
      content: string | null
      tool_calls?: GroqToolCall[]
    }
  }>
}

export type AiHarnessRequest = {
  userMessage: string
  availableColumns: string[]
  context?: string
}

export type AiHarnessResponse = {
  proposal: unknown
  raw?: GroqResponse
  deterministic: boolean
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'openai/gpt-oss-120b'

const SYSTEM_PROMPT = `You are a data transformation assistant for Cut Knot. 
You propose actions to transform CSV data. Actions must be valid JSON matching the schema.
Available action types: clean_column, drop_column, deduplicate, filter, sort, sum, if, create_kpi.
NEVER compute numbers yourself. Propose actions; the deterministic engine executes them.
All column names must exactly match the provided available columns (case-sensitive).
Provide a brief reason for each proposal.`

function getDeterministicProposal(userMessage: string, columns: string[]): unknown {
  const lower = userMessage.toLowerCase()
  
  if (lower.includes('filtre') && lower.includes('km') && lower.includes('50')) {
    return {
      type: 'filter',
      column: columns.find(c => c.toLowerCase().includes('km')) || 'Km',
      operator: '>',
      value: 50,
    }
  }
  
  if (lower.includes('kpi') && lower.includes('coût') && lower.includes('km')) {
    return {
      type: 'create_kpi',
      title: 'Coût / km',
      agg: 'ratio',
      numerator: columns.find(c => c.toLowerCase().includes('montant')) || 'Montant',
      denominator: columns.find(c => c.toLowerCase().includes('km')) || 'Km',
    }
  }
  
  if (lower.includes('dédupliqu') || lower.includes('doublon')) {
    return {
      type: 'deduplicate',
      keyColumns: [columns[0] || 'ID'],
    }
  }
  
  return {
    type: 'filter',
    column: columns[0] || 'ID',
    operator: '!=',
    value: '',
  }
}

export async function requestAiProposal(request: AiHarnessRequest): Promise<AiHarnessResponse> {
  const apiKey = process.env.GROQ_API_KEY
  
  if (!apiKey) {
    console.warn('[AI Harness] GROQ_API_KEY not set, using deterministic fixture')
    return {
      proposal: getDeterministicProposal(request.userMessage, request.availableColumns),
      deterministic: true,
    }
  }

  const tools: GroqTool[] = [
    {
      type: 'function',
      function: {
        name: 'propose_action',
        description: 'Propose a data transformation action',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'object',
              description: 'The action to propose',
            },
            reason: {
              type: 'string',
              description: 'Brief explanation of why this action is proposed',
            },
          },
          required: ['action', 'reason'],
        },
      },
    },
  ]

  const messages: GroqMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Available columns: ${request.availableColumns.join(', ')}\n\n${request.context || ''}\n\nUser request: ${request.userMessage}`,
    },
  ]

  const groqRequest: GroqRequest = {
    model: GROQ_MODEL,
    messages,
    tools,
    tool_choice: 'required',
    temperature: 0.1,
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqRequest),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Groq API error ${response.status}: ${text}`)
    }

    const data = (await response.json()) as GroqResponse
    const toolCall = data.choices[0]?.message.tool_calls?.[0]

    if (!toolCall) {
      throw new Error('No tool call in Groq response')
    }

    const parsed = JSON.parse(toolCall.function.arguments) as { action: unknown; reason: string }
    return {
      proposal: parsed.action,
      raw: data,
      deterministic: false,
    }
  } catch (error) {
    console.error('[AI Harness] Groq API request failed:', error)
    throw error
  }
}

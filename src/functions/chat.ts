// src/functions/chat.ts
import { createServerFn } from '@tanstack/react-start'
import { OpenRouter } from '@openrouter/sdk'
import { z } from 'zod'
import { ProviderPreferences } from '@openrouter/sdk/models'
import { env } from "cloudflare:workers";


const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  message: z.string(),
  model: z.string().optional().default('anthropic/claude-3.5-sonnet-20241022'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
  temperature: z.number().optional().default(0.7),
})

// Definitions of subtypes are below
type Request = {
    // Either "messages" or "prompt" is required
    messages?: Message[];
    prompt?: string;
  
    // If "model" is unspecified, uses the user's default
    model?: string; // See "Supported Models" section
  
    // Allows to force the model to produce specific output format.
    // See models page and note on this docs page for which models support it.
    response_format?: { type: 'json_object' };
  
    stop?: string | string[];
    stream?: boolean; // Enable streaming
  
    // See LLM Parameters (openrouter.ai/docs/api/reference/parameters)
    max_tokens?: number; // Range: [1, context_length)
    temperature?: number; // Range: [0, 2]
  
    // Tool calling
    // Will be passed down as-is for providers implementing OpenAI's interface.
    // For providers with custom interfaces, we transform and map the properties.
    // Otherwise, we transform the tools into a YAML template. The model responds with an assistant message.
    // See models supporting tool calling: openrouter.ai/models?supported_parameters=tools
    tools?: Tool[];
    tool_choice?: ToolChoice;
  
    // Advanced optional parameters
    seed?: number; // Integer only
    top_p?: number; // Range: (0, 1]
    top_k?: number; // Range: [1, Infinity) Not available for OpenAI models
    frequency_penalty?: number; // Range: [-2, 2]
    presence_penalty?: number; // Range: [-2, 2]
    repetition_penalty?: number; // Range: (0, 2]
    logit_bias?: { [key: number]: number };
    top_logprobs: number; // Integer only
    min_p?: number; // Range: [0, 1]
    top_a?: number; // Range: [0, 1]
  
    // Reduce latency by providing the model with a predicted output
    // https://platform.openai.com/docs/guides/latency-optimization#use-predicted-outputs
    prediction?: { type: 'content'; content: string };
  
    // OpenRouter-only parameters
    // See "Prompt Transforms" section: openrouter.ai/docs/guides/features/message-transforms
    transforms?: string[];
    // See "Model Routing" section: openrouter.ai/docs/guides/features/model-routing
    models?: string[];
    route?: 'fallback';
    // See "Provider Routing" section: openrouter.ai/docs/guides/routing/provider-selection
    provider?: ProviderPreferences;
    user?: string; // A stable identifier for your end-users. Used to help detect and prevent abuse.
    
    // Debug options (streaming only)
    debug?: {
      echo_upstream_body?: boolean; // If true, returns the transformed request body sent to the provider
    };
  };
  
  // Subtypes:
  
  type TextContent = {
    type: 'text';
    text: string;
  };
  
  type ImageContentPart = {
    type: 'image_url';
    image_url: {
      url: string; // URL or base64 encoded image data
      detail?: string; // Optional, defaults to "auto"
    };
  };
  
  type ContentPart = TextContent | ImageContentPart;
  
  type Message =
    | {
        role: 'user' | 'assistant' | 'system';
        // ContentParts are only for the "user" role:
        content: string | ContentPart[];
        // If "name" is included, it will be prepended like this
        // for non-OpenAI models: `{name}: {content}`
        name?: string;
      }
    | {
        role: 'tool';
        content: string;
        tool_call_id: string;
        name?: string;
      };
  
  type FunctionDescription = {
    description?: string;
    name: string;
    parameters: object; // JSON Schema object
  };
  
  type Tool = {
    type: 'function';
    function: FunctionDescription;
  };
  
  type ToolChoice =
    | 'none'
    | 'auto'
    | {
        type: 'function';
        function: {
          name: string;
        };
      };
  

export const sendChatMessage = createServerFn({ method: 'POST' })
  .inputValidator(messageSchema)
  .handler(async ({ data, context }) => {
    const messagesToSend = data.messages || [{ role: data.role, content: data.message }]

    console.log(`[OpenRouter] Using model: ${data.model}`)
    console.log(`[OpenRouter] Message count: ${messagesToSend.length}`)
    console.log(`[OpenRouter] Temperature: ${data.temperature || 0.7}`)
    console.log('[OpenRouter] Messages being sent:', JSON.stringify(messagesToSend, null, 2))

    // Get API key from Cloudflare env or fallback to process.env
    const apiKey = env.OPENROUTER_API_KEY

    if (!apiKey) {
      console.error('[OpenRouter] OPENROUTER_API_KEY not found in env')
      throw new Error('OPENROUTER_API_KEY is not configured')
    }

    console.log('[OpenRouter] API key found, initializing client...')
    console.log('[OpenRouter] API key type:', typeof apiKey)
    console.log('[OpenRouter] API key length:', apiKey?.length)
    console.log('[OpenRouter] API key (first 10 chars):', apiKey?.substring(0, 10) + '...')
    console.log('[OpenRouter] API key is truthy:', !!apiKey)

    if (!apiKey || apiKey.trim() === '' || apiKey === 'your-new-api-key-here') {
      throw new Error('Invalid API key - please set a valid OpenRouter API key in .dev.vars')
    }

    // Create OpenRouter client with the API key
    const openRouter = new OpenRouter({
      apiKey: apiKey.trim(),
    })

    console.log('[OpenRouter] Client initialized successfully')
    console.log('[OpenRouter] Sending request to API...')
    console.log('[OpenRouter] Request details:', {
      model: data.model,
      messageCount: messagesToSend.length,
      stream: true,
      temperature: data.temperature || 0.7,
    })

    let stream
    try {
      stream = await openRouter.chat.send({
        model: data.model,
        messages: messagesToSend,
        stream: true,
        temperature: data.temperature || 0.7,
      })
      console.log('[OpenRouter] Stream connection established successfully')
    } catch (error) {
      console.error('[OpenRouter] Error sending request:', error)
      console.error('[OpenRouter] Error details:', JSON.stringify(error, null, 2))
      throw error
    }

    // Create a ReadableStream that will be sent to the client
    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          let totalChunks = 0
          let totalContent = ''
          try {
            console.log('[OpenRouter] Starting to receive stream chunks...')
            for await (const chunk of stream) {
              const content = chunk.choices?.[0]?.delta?.content
              if (content) {
                totalChunks++
                totalContent += content
                console.log(`[OpenRouter] Chunk ${totalChunks}: "${content}"`)
                controller.enqueue(encoder.encode(content))
              }
            }
            console.log('[OpenRouter] Stream complete!')
            console.log(`[OpenRouter] Total chunks received: ${totalChunks}`)
            console.log(`[OpenRouter] Total content length: ${totalContent.length} characters`)
            console.log('[OpenRouter] Complete response:', totalContent)
            controller.close()
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.log('[OpenRouter] Stream cancelled by client')
              controller.close()
            } else {
              console.error('[OpenRouter] Stream error:', error)
              controller.error(error)
            }
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
          'Connection': 'keep-alive',
        },
      }
    )
  })

// Schema for summarization request
const summarizeSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })),
  type: z.enum(['summary', 'keypoints']).default('summary'),
})

export const summarizeConversation = createServerFn({ method: 'POST' })
  .inputValidator(summarizeSchema)
  .handler(async ({ data, context }) => {
    console.log(`[OpenRouter] Summarizing conversation with ${data.messages.length} messages`)
    console.log(`[OpenRouter] Summary type: ${data.type}`)

    // Get API key from Cloudflare env
    const apiKey = env.OPENROUTER_API_KEY

    if (!apiKey || apiKey.trim() === '' || apiKey === 'your-new-api-key-here') {
      throw new Error('Invalid API key - please set a valid OpenRouter API key in .dev.vars')
    }

    // Create OpenRouter client
    const openRouter = new OpenRouter({
      apiKey: apiKey.trim(),
    })

    // Format the conversation for summarization
    const conversationText = data.messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n')

    // Create the prompt based on type
    const systemPrompt = data.type === 'summary'
      ? 'You are a conversation summarizer. Provide a concise summary of the following conversation, capturing the main topics discussed and key outcomes. Keep it brief but comprehensive.'
      : 'You are a conversation analyzer. Extract and list the key points from the following conversation as a bulleted list. Focus on the most important information, decisions, and conclusions.'

    const userPrompt = `${systemPrompt}\n\nConversation:\n${conversationText}\n\nProvide the ${data.type === 'summary' ? 'summary' : 'key points'}:`

    console.log('[OpenRouter] Sending summarization request...')

    try {
      const response = await openRouter.chat.send({
        model: 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'user', content: userPrompt }],
        stream: false,
        temperature: 0.3,
      })

      const summary = response.choices?.[0]?.message?.content || ''
      console.log(`[OpenRouter] Summary generated (${summary.length} chars)`)

      return {
        success: true,
        summary: summary,
        type: data.type,
      }
    } catch (error) {
      console.error('[OpenRouter] Error generating summary:', error)
      throw error
    }
  })
// src/functions/chat.ts
import { createServerFn } from '@tanstack/react-start'
import { OpenRouter } from '@openrouter/sdk'
import { z } from 'zod'
import { ProviderPreferences } from '@openrouter/sdk/models'
import { env } from "cloudflare:workers";


const openRouter = new OpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
})

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
  .handler(async ({ data }) => {
    const messagesToSend = data.messages || [{ role: data.role, content: data.message }]

    console.log(`[OpenRouter] Using model: ${data.model}`)
    console.log(`[OpenRouter] Message count: ${messagesToSend.length}`)

    const stream = await openRouter.chat.send({
      model: data.model,
      messages: messagesToSend,
      stream: true,
      temperature: data.temperature || 0.7,
    })

    // Create a ReadableStream that will be sent to the client
    const encoder = new TextEncoder()

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const content = chunk.choices?.[0]?.delta?.content
              if (content) {
                controller.enqueue(encoder.encode(content))
              }
            }
            controller.close()
          } catch (error: any) {
            if (error.name === 'AbortError') {
              console.log('Stream cancelled')
              controller.close()
            } else {
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
// src/functions/chat.ts
import { createServerFn } from '@tanstack/react-start'
import { OpenRouter } from '@openrouter/sdk'
import { z } from 'zod'

const openRouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  message: z.string(),
  model: z.string().optional().default('anthropic/claude-3.5-sonnet'),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional(),
})

export const sendChatMessage = createServerFn({ method: 'POST' })
  .inputValidator(messageSchema)
  .handler(async ({ data }) => {
    const messagesToSend = data.messages || [{ role: data.role, content: data.message }]

    const stream = await openRouter.chat.send({
      model: data.model,
      messages: messagesToSend,
      stream: true,
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
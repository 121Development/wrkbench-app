import { useState, useEffect, useRef } from 'react'
import { Handle, Position } from '@xyflow/react'
import { ArrowUp, User, Bot } from 'lucide-react'
import { sendChatMessage } from '../functions/chat'

interface ChatNodeProps {
  data: {
    label?: string
  }
}

type AIModel = 'ChatGPT' | 'Claude' | 'Gemini'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const MODEL_MAP = {
  ChatGPT: 'openai/gpt-4o',
  Claude: 'anthropic/claude-3.5-sonnet',
  Gemini: 'google/gemini-2.0-flash-exp',
}

export default function ChatNode({ data }: ChatNodeProps) {
  const [selectedModel, setSelectedModel] = useState<AIModel>('Claude')
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    // Create assistant message placeholder
    const assistantMessageId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ])

    try {
      // Build conversation history including the new user message
      const conversationHistory = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: userMessage.content },
      ]

      // Call the server function
      const response = await sendChatMessage({
        data: {
          role: 'user',
          message: userMessage.content,
          model: MODEL_MAP[selectedModel],
          messages: conversationHistory,
        },
      })

      // Read the stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No reader available')
      }

      let accumulatedContent = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        accumulatedContent += chunk

        // Update the assistant message with accumulated content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: accumulatedContent }
              : msg
          )
        )
      }
    } catch (error) {
      console.error('Error sending message:', error)
      // Remove the placeholder message on error
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId))
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleSend()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-[500px]">
      <style>{`
        .chat-scroll-container::-webkit-scrollbar {
          width: 8px;
        }
        .chat-scroll-container::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 4px;
        }
        .chat-scroll-container::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
        }
        .chat-scroll-container::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>

      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">
          {data.label || 'AI Chat'}
        </h3>
      </div>

      {/* Chat Messages Area */}
      <div
        ref={scrollContainerRef}
        className="chat-scroll-container h-[300px] p-6 overflow-y-auto bg-gray-50 scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 #f1f5f9'
        }}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">Start a conversation...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex items-start gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${
                    message.role === 'user'
                      ? 'bg-gradient-to-br from-blue-500 to-cyan-500'
                      : 'bg-gradient-to-br from-purple-500 to-pink-500'
                  }`}
                >
                  {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div
                  className={`rounded-2xl px-4 py-3 shadow-sm max-w-[80%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-white rounded-tl-sm'
                  }`}
                >
                  <p
                    className={`text-sm leading-relaxed whitespace-pre-wrap ${
                      message.role === 'user' ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {message.content}
                  </p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-200 bg-white rounded-b-2xl">
        <form onSubmit={onSubmit}>
          <div className="relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              disabled={isLoading}
              className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[52px] max-h-[200px] placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={1}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`absolute right-2 bottom-2 p-2 rounded-lg transition-all ${
                input.trim() && !isLoading
                  ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md hover:shadow-lg'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              <ArrowUp size={20} strokeWidth={2.5} />
            </button>
          </div>
        </form>
        <p className="text-xs text-gray-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>

        {/* Model Switcher */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2 font-medium">Model</p>
          <div className="flex gap-2">
            {(['ChatGPT', 'Claude', 'Gemini'] as AIModel[]).map((model) => (
              <button
                key={model}
                onClick={() => setSelectedModel(model)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  selectedModel === model
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {model}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  )
}

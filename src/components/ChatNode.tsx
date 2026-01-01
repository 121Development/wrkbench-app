import { useState, useEffect, useRef } from 'react'
import { Handle, Position, useReactFlow, NodeResizer } from '@xyflow/react'
import { ArrowUp, X, Settings, ChevronDown, ChevronUp, Undo2, Redo2, Pencil, Check } from 'lucide-react'
import { sendChatMessage } from '../functions/chat'

interface ChatNodeProps {
  id: string
  data: {
    label?: string
  }
  selected?: boolean
}

type AIModel = 'ChatGPT' | 'Claude' | 'Gemini'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const MODEL_MAP = {
  ChatGPT: 'openai/gpt-5.2-chat',  // Latest GPT-4o model
  Claude: 'anthropic/claude-haiku-4.5',  // Latest Claude 3.5 Sonnet
  Gemini: 'google/gemini-3-flash-preview',  // Latest Gemini 2.0 Flash
}

export default function ChatNode({ id, data, selected }: ChatNodeProps) {
  const [selectedModel, setSelectedModel] = useState<AIModel>('Claude')
  const [messages, setMessages] = useState<Message[]>([])
  const [deletedMessages, setDeletedMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [temperature, setTemperature] = useState(0.7)
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { setNodes } = useReactFlow()

  const handleClose = () => {
    setNodes((nodes) => nodes.filter((node) => node.id !== id))
  }

  const handleUndo = () => {
    if (messages.length === 0) return
    const lastMessage = messages[messages.length - 1]
    setMessages((prev) => prev.slice(0, -1))
    setDeletedMessages((prev) => [...prev, lastMessage])
  }

  const handleRedo = () => {
    if (deletedMessages.length === 0) return
    const lastDeleted = deletedMessages[deletedMessages.length - 1]
    setDeletedMessages((prev) => prev.slice(0, -1))
    setMessages((prev) => [...prev, lastDeleted])
  }

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessageId(messageId)
    setEditingContent(content)
  }

  const handleCancelEdit = () => {
    setEditingMessageId(null)
    setEditingContent('')
  }

  const handleSaveEdit = async () => {
    if (!editingContent.trim() || !editingMessageId || isLoading) return

    // Find the index of the message being edited
    const messageIndex = messages.findIndex((m) => m.id === editingMessageId)
    if (messageIndex === -1) return

    // Update the message content
    const updatedMessages = messages.slice(0, messageIndex + 1)
    updatedMessages[messageIndex] = {
      ...updatedMessages[messageIndex],
      content: editingContent.trim(),
    }

    // Remove all messages after the edited one (since context changes)
    setMessages(updatedMessages)
    setEditingMessageId(null)
    setEditingContent('')
    setDeletedMessages([]) // Clear redo history
    setIsLoading(true)

    // Create assistant message placeholder
    const assistantMessageId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '' },
    ])

    try {
      // Build conversation history with the edited message
      const conversationHistory = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      // Call the server function
      const response = await sendChatMessage({
        data: {
          role: 'user',
          message: editingContent.trim(),
          model: MODEL_MAP[selectedModel],
          messages: conversationHistory,
          temperature: temperature,
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
    setDeletedMessages([]) // Clear redo history when new message is sent
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
          temperature: temperature,
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
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 min-w-[500px] w-full h-full flex flex-col">
      <NodeResizer
        isVisible={selected}
        minWidth={400}
        minHeight={400}
        handleStyle={{
          width: '12px',
          height: '12px',
          borderRadius: '2px',
        }}
      />

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

      {/* Settings Card */}
      <div className="nodrag bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
        {/* Settings Bar - Always Visible */}
        <button
          onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
          className="w-full px-4 py-2 flex items-center justify-between hover:bg-purple-100/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings size={16} className="text-purple-600" />
            <span className="text-xs font-medium text-purple-700">
              {isSettingsExpanded ? 'Settings' : `${selectedModel} • ${temperature.toFixed(2)}`}
            </span>
          </div>
          {isSettingsExpanded ? (
            <ChevronUp size={16} className="text-purple-600" />
          ) : (
            <ChevronDown size={16} className="text-purple-600" />
          )}
        </button>

        {/* Expandable Settings Content */}
        {isSettingsExpanded && (
          <div className="px-4 pb-3 pt-1 space-y-3 animate-in slide-in-from-top-2 duration-200">
            {/* Model Switcher */}
            <div>
              <label className="text-xs font-medium text-gray-700 mb-2 block">
                Model
              </label>
              <div className="flex gap-2">
                {(['ChatGPT', 'Claude', 'Gemini'] as AIModel[]).map((model) => (
                  <button
                    key={model}
                    onClick={() => setSelectedModel(model)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedModel === model
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-purple-100'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>

            {/* Temperature Control */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-gray-700">
                  Temperature
                </label>
                <span className="text-xs font-mono text-purple-600 bg-white px-2 py-0.5 rounded">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>0 (Precise)</span>
                <span>1 (Creative)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          {data.label || 'AI Chat'}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={messages.length === 0}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Undo"
          >
            <Undo2 size={18} className="text-gray-500 hover:text-gray-700" />
          </button>
          <button
            onClick={handleRedo}
            disabled={deletedMessages.length === 0}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Redo"
          >
            <Redo2 size={18} className="text-gray-500 hover:text-gray-700" />
          </button>
          <button
            onClick={handleClose}
            className="p-1 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close"
          >
            <X size={18} className="text-gray-500 hover:text-gray-700" />
          </button>
        </div>
      </div>

      {/* Chat Messages Area */}
      <div
        ref={scrollContainerRef}
        className="nodrag chat-scroll-container flex-1 p-6 overflow-y-auto bg-gray-50 scroll-smooth"
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
                className={`flex ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`group rounded-2xl px-4 py-3 shadow-sm max-w-[80%] relative ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-white rounded-tl-sm'
                  }`}
                >
                  {editingMessageId === message.id ? (
                    <div className="nodrag">
                      <textarea
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        className="nodrag w-full min-h-[60px] bg-white text-gray-700 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSaveEdit()
                          }
                          if (e.key === 'Escape') {
                            handleCancelEdit()
                          }
                        }}
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
                        >
                          <Check size={14} />
                          Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1 bg-gray-200 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-300 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p
                        className={`text-sm leading-relaxed whitespace-pre-wrap ${
                          message.role === 'user' ? 'text-white' : 'text-gray-700'
                        }`}
                      >
                        {message.content}
                      </p>
                      {message.role === 'user' && (
                        <button
                          onClick={() => handleEditMessage(message.id, message.content)}
                          className="nodrag absolute -top-2 -right-2 p-1.5 bg-gray-700 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-800"
                          aria-label="Edit message"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="nodrag p-4 border-t border-gray-200 bg-white rounded-b-2xl">
        <form onSubmit={onSubmit}>
          <div className="relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              disabled={isLoading}
              className="nodrag flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[52px] max-h-[200px] placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  )
}

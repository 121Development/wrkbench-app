import { useState, useEffect, useRef, useContext } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useReactFlow, NodeResizer, useEdges, useNodes } from '@xyflow/react'
import { ArrowUp, X, Settings, ChevronDown, ChevronUp, Undo2, Redo2, Pencil, Check, Copy, Check as CheckCopy, Reply, Download, MoreHorizontal, Circle, Maximize2 } from 'lucide-react'
import { sendChatMessage } from '../functions/chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { LogContext } from '../routes/index'
import ChatExpand from './ChatExpand'

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
  replyTo?: {
    id: string
    content: string
    role: 'user' | 'assistant'
  }
}

const MODEL_MAP = {
  ChatGPT: 'openai/gpt-5.2-chat',  // Latest GPT-4o model
  Claude: 'anthropic/claude-haiku-4.5',  // Latest Claude 3.5 Sonnet
  Gemini: 'google/gemini-3-flash-preview',  // Latest Gemini 2.0 Flash
}

interface CodeBlockProps {
  inline?: boolean
  className?: string
  children?: React.ReactNode
  copiedCodeBlock: string | null
  setCopiedCodeBlock: (id: string | null) => void
}

function CodeBlock({ inline, className, children, copiedCodeBlock, setCopiedCodeBlock, ...props }: CodeBlockProps) {
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''
  const codeString = String(children).replace(/\n$/, '')
  const codeId = `${language}-${codeString.substring(0, 20)}`

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeString)
      setCopiedCodeBlock(codeId)
      setTimeout(() => setCopiedCodeBlock(null), 2000)
    } catch (error) {
      console.error('Failed to copy code:', error)
    }
  }

  const handleDownloadCode = () => {
    const blob = new Blob([codeString], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code.${language || 'txt'}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!inline && language) {
    return (
      <div className="nodrag my-4 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700">
        {/* Header with language and buttons */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d30] border-b border-gray-700">
          <span className="text-xs font-mono text-gray-300">{language}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCode}
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Download code"
            >
              <Download size={14} />
            </button>
            <button
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal size={14} />
            </button>
            <button
              onClick={handleCopyCode}
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Copy code"
            >
              {copiedCodeBlock === codeId ? (
                <CheckCopy size={14} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
        {/* Code content with syntax highlighting */}
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: '#1e1e1e',
            fontSize: '0.875rem',
          }}
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    )
  }

  return (
    <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
      {children}
    </code>
  )
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [connectedContexts, setConnectedContexts] = useState<Map<string, string>>(new Map())
  const [isContextExpanded, setIsContextExpanded] = useState(false)
  const [isExpandOpen, setIsExpandOpen] = useState(false)
  const connectedContextsRef = useRef<Map<string, string>>(new Map())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const { setNodes } = useReactFlow()
  const edges = useEdges()
  const nodes = useNodes()
  const { addLog } = useContext(LogContext)

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

  const handleCopyMessage = async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      setTimeout(() => setCopiedMessageId(null), 2000) // Reset after 2 seconds
    } catch (error) {
      console.error('Failed to copy text:', error)
    }
  }

  const handleReplyTo = (message: Message) => {
    setReplyingTo(message)
  }

  const handleCancelReply = () => {
    setReplyingTo(null)
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

        if (done) {
          addLog('Message Received', `Chat Node ${id}: AI response completed (${accumulatedContent.length} chars)`)
          break
        }

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
      addLog('Error', `Chat Node ${id}: Failed to send message - ${error}`)
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

  // Sync messages to node data so other nodes can access them
  useEffect(() => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, messages: messages } }
          : node
      )
    )
  }, [messages, id, setNodes])

  // Monitor context and chat node connections
  useEffect(() => {
    const inputEdges = edges.filter(
      (edge) => edge.target === id && edge.source.startsWith('node-')
    )

    const newContexts = new Map<string, string>()

    inputEdges.forEach((edge) => {
      const sourceNode = nodes.find(node => node.id === edge.source)
      if (sourceNode) {
        if (sourceNode.type === 'contextNode') {
          // Handle context nodes
          const contextText = (sourceNode.data as any).text || ''
          newContexts.set(edge.source, contextText)
        } else if (sourceNode.type === 'chatNode') {
          // Handle chat nodes - format messages as conversation history
          const sourceMessages = (sourceNode.data as any).messages || []
          const formattedConversation = sourceMessages
            .map((msg: Message) => {
              const role = msg.role === 'user' ? 'User' : 'Assistant'
              return `**${role}:** ${msg.content}`
            })
            .join('\n\n')
          newContexts.set(edge.source, formattedConversation)
        }
      }
    })

    // Detect changes and inject context messages
    const oldContextIds = new Set(connectedContextsRef.current.keys())
    const newContextIds = new Set(newContexts.keys())

    // New contexts added
    newContextIds.forEach((contextId) => {
      if (!oldContextIds.has(contextId)) {
        const contextText = newContexts.get(contextId) || ''
        const sourceNode = nodes.find(node => node.id === contextId)
        const nodeType = sourceNode?.type === 'chatNode' ? 'Chat' : 'Context'
        const contextLabel = (sourceNode?.data as any)?.label || nodeType

        // Inject context added message
        const contextMessage: Message = {
          id: `context-${contextId}-${Date.now()}`,
          role: 'assistant',
          content: `📎 **${nodeType} Connected: ${contextLabel}**\n\n${contextText}`,
        }
        setMessages((prev) => [...prev, contextMessage])
      }
    })

    // Contexts removed
    oldContextIds.forEach((contextId) => {
      if (!newContextIds.has(contextId)) {
        const sourceNode = nodes.find(node => node.id === contextId)
        const nodeType = sourceNode?.type === 'chatNode' ? 'Chat' : 'Context'
        const contextLabel = (sourceNode?.data as any)?.label || nodeType
        const oldContextText = connectedContextsRef.current.get(contextId) || ''

        // Inject context removed message with full context text
        const removalMessage: Message = {
          id: `context-removed-${contextId}-${Date.now()}`,
          role: 'assistant',
          content: `📎 **${nodeType} Disconnected: ${contextLabel}**\n\nThe following information has been removed and should no longer be considered in future responses:\n\n---\n\n${oldContextText}\n\n---\n\n*Please disregard this information going forward.*`,
        }
        setMessages((prev) => [...prev, removalMessage])
      }
    })

    // Contexts updated (text/messages changed)
    newContextIds.forEach((contextId) => {
      if (oldContextIds.has(contextId)) {
        const oldText = connectedContextsRef.current.get(contextId) || ''
        const newText = newContexts.get(contextId) || ''

        if (oldText !== newText && newText) {
          const sourceNode = nodes.find(node => node.id === contextId)
          const nodeType = sourceNode?.type === 'chatNode' ? 'Chat' : 'Context'
          const contextLabel = (sourceNode?.data as any)?.label || nodeType

          // Inject context updated message with instructions to disregard old context
          const updateMessage: Message = {
            id: `context-updated-${contextId}-${Date.now()}`,
            role: 'assistant',
            content: `📎 **${nodeType} Updated: ${contextLabel}**\n\n**Previous version (disregard this):**\n\n---\n\n${oldText}\n\n---\n\n**New version (use this going forward):**\n\n---\n\n${newText}\n\n---\n\n*Please disregard the previous version and only use the new information above in all future responses.*`,
          }
          setMessages((prev) => [...prev, updateMessage])
        }
      }
    })

    // Update both state and ref
    connectedContextsRef.current = newContexts
    setConnectedContexts(newContexts)
  }, [edges, nodes, id])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      replyTo: replyingTo ? {
        id: replyingTo.id,
        content: replyingTo.content,
        role: replyingTo.role,
      } : undefined,
    }

    addLog('Message Sent', `Chat Node ${id}: "${input.trim().substring(0, 50)}${input.trim().length > 50 ? '...' : ''}"`)

    setMessages((prev) => [...prev, userMessage])
    setDeletedMessages([]) // Clear redo history when new message is sent
    setReplyingTo(null) // Clear reply reference
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

        if (done) {
          addLog('Message Received', `Chat Node ${id}: AI response completed (${accumulatedContent.length} chars)`)
          break
        }

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
      addLog('Error', `Chat Node ${id}: Failed to send message - ${error}`)
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
    <>
    <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full h-full flex flex-col">
      <NodeResizer
        isVisible={selected}
        minWidth={500}
        minHeight={500}
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

      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: 'none',
          border: 'none',
          width: '1.5em',
          height: '1.5em',
        }}
      >
        <Circle
          size={24}
          fill="white"
          stroke="#9333ea"
          strokeWidth={2}
          style={{
            pointerEvents: 'none',
            left: 0,
            top: 0,
            position: 'absolute',
          }}
        />
      </Handle>

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

      {/* Active Inputs Indicator */}
      {connectedContexts.size > 0 && (
        <div className="nodrag bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
          <button
            onClick={() => setIsContextExpanded(!isContextExpanded)}
            className="w-full px-4 py-2 flex items-center justify-between hover:bg-amber-100/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm">📎</span>
              <span className="text-xs font-medium text-amber-700">
                Active Inputs ({connectedContexts.size})
              </span>
            </div>
            {isContextExpanded ? (
              <ChevronUp size={16} className="text-amber-600" />
            ) : (
              <ChevronDown size={16} className="text-amber-600" />
            )}
          </button>

          {isContextExpanded && (
            <div className="px-4 pb-3 pt-1 space-y-2 animate-in slide-in-from-top-2 duration-200">
              {Array.from(connectedContexts.entries()).map(([contextId, contextText]) => {
                const sourceNode = nodes.find(node => node.id === contextId)
                const nodeType = sourceNode?.type === 'chatNode' ? 'Chat' : 'Context'
                const contextLabel = (sourceNode?.data as any)?.label || nodeType
                return (
                  <div
                    key={contextId}
                    className="bg-white rounded-lg p-2 border border-amber-200"
                  >
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      {nodeType}: {contextLabel}
                    </p>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {contextText || 'No content'}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">
          {data.label || 'AI Chat'}
        </h3>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-gray-100 rounded-md transition-colors"
          aria-label="Close"
        >
          <X size={18} className="text-gray-500 hover:text-gray-700" />
        </button>
      </div>

      {/* Chat Messages Area */}
      <div
        ref={scrollContainerRef}
        className="nodrag nowheel chat-scroll-container flex-1 p-6 overflow-y-auto bg-gray-50 scroll-smooth"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#cbd5e1 #f1f5f9'
        }}
        onWheel={(e) => e.stopPropagation()}
      >
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">Start a conversation...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isContextMessage = message.content.startsWith('📎')
              return (
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
                      : isContextMessage
                      ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-tl-sm'
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
                      <div>
                        {message.replyTo && (
                          <div className="mb-2 pl-3 border-l-2 border-gray-400 opacity-70">
                            <p className="text-xs font-medium mb-1">
                              {message.replyTo.role === 'user' ? 'You' : 'AI'}
                            </p>
                            <p className="text-xs line-clamp-2">
                              {message.replyTo.content}
                            </p>
                          </div>
                        )}
                        {message.role === 'user' ? (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap text-white select-text">
                            {message.content}
                          </p>
                        ) : (
                          <div className="text-sm leading-relaxed text-gray-700 prose prose-sm max-w-none prose-headings:mt-6 prose-headings:mb-4 prose-p:my-4 prose-pre:my-4 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 select-text">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code: (props) => (
                                  <CodeBlock
                                    {...props}
                                    copiedCodeBlock={copiedCodeBlock}
                                    setCopiedCodeBlock={setCopiedCodeBlock}
                                  />
                                ),
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                      <div className="nodrag absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleReplyTo(message)}
                          className="p-1.5 bg-gray-700 text-white rounded-full hover:bg-gray-800"
                          aria-label="Reply to message"
                        >
                          <Reply size={12} />
                        </button>
                        <button
                          onClick={() => handleCopyMessage(message.id, message.content)}
                          className="p-1.5 bg-gray-700 text-white rounded-full hover:bg-gray-800"
                          aria-label="Copy message"
                        >
                          {copiedMessageId === message.id ? (
                            <CheckCopy size={12} />
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                        {message.role === 'user' && (
                          <button
                            onClick={() => handleEditMessage(message.id, message.content)}
                            className="p-1.5 bg-gray-700 text-white rounded-full hover:bg-gray-800"
                            aria-label="Edit message"
                          >
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="nodrag p-4 border-t border-gray-200 bg-white rounded-b-2xl">
        {/* Reply Preview */}
        {replyingTo && (
          <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200 flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Reply size={14} className="text-purple-600 flex-shrink-0" />
                <p className="text-xs font-medium text-purple-600">
                  Replying to {replyingTo.role === 'user' ? 'yourself' : 'AI'}
                </p>
              </div>
              <p className="text-xs text-gray-600 line-clamp-2">
                {replyingTo.content}
              </p>
            </div>
            <button
              onClick={handleCancelReply}
              className="p-1 hover:bg-gray-200 rounded-md transition-colors ml-2 flex-shrink-0"
              aria-label="Cancel reply"
            >
              <X size={14} className="text-gray-500" />
            </button>
          </div>
        )}
        <form onSubmit={onSubmit}>
          <div className="relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              disabled={isLoading}
              className="nodrag nowheel flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[52px] max-h-[200px] placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
              rows={1}
              onWheel={(e) => e.stopPropagation()}
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

        {/* Action Buttons: Undo, Redo, Expand */}
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
          <button
            onClick={handleUndo}
            disabled={messages.length === 0}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Undo"
            title="Undo last message"
          >
            <Undo2 size={16} className="text-gray-600" />
          </button>
          <button
            onClick={handleRedo}
            disabled={deletedMessages.length === 0}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Redo"
            title="Redo message"
          >
            <Redo2 size={16} className="text-gray-600" />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1"></div>
          <button
            onClick={() => setIsExpandOpen(true)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Expand view"
            title="Open expanded view"
          >
            <Maximize2 size={16} className="text-gray-600" />
          </button>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: 'none',
          border: 'none',
          width: '1.5em',
          height: '1.5em',
        }}
      >
        <Circle
          size={24}
          fill="white"
          stroke="#9333ea"
          strokeWidth={2}
          style={{
            pointerEvents: 'none',
            left: 0,
            top: 0,
            position: 'absolute',
          }}
        />
      </Handle>

    </div>
    {/* Expanded Chat View - Rendered outside React Flow using Portal */}
    {isExpandOpen && createPortal(
      <ChatExpand
        messages={messages}
        input={input}
        isLoading={isLoading}
        replyingTo={replyingTo}
        copiedCodeBlock={copiedCodeBlock}
        chatLabel={data.label}
        selectedModel={selectedModel}
        temperature={temperature}
        isSettingsExpanded={isSettingsExpanded}
        deletedMessages={deletedMessages}
        onClose={() => setIsExpandOpen(false)}
        onInputChange={setInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        onCancelReply={handleCancelReply}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onModelChange={setSelectedModel}
        onTemperatureChange={setTemperature}
        onToggleSettings={() => setIsSettingsExpanded(!isSettingsExpanded)}
        setCopiedCodeBlock={setCopiedCodeBlock}
      />,
      document.body
    )}
    </>
  )
}

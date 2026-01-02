import { useRef, useEffect } from 'react'
import { X, ArrowUp, Reply, Undo2, Redo2, Settings, ChevronDown, ChevronUp } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

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

interface ChatExpandProps {
  messages: Message[]
  input: string
  isLoading: boolean
  replyingTo: Message | null
  copiedCodeBlock: string | null
  chatLabel?: string
  selectedModel: AIModel
  temperature: number
  isSettingsExpanded: boolean
  deletedMessages: Message[]
  onClose: () => void
  onInputChange: (value: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  onCancelReply: () => void
  onUndo: () => void
  onRedo: () => void
  onModelChange: (model: AIModel) => void
  onTemperatureChange: (temp: number) => void
  onToggleSettings: () => void
  setCopiedCodeBlock: (id: string | null) => void
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

  if (!inline && language) {
    return (
      <div className="nodrag my-4 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700">
        <div className="flex items-center justify-between px-4 py-2 bg-[#2d2d30] border-b border-gray-700">
          <span className="text-xs font-mono text-gray-300">{language}</span>
          <button
            onClick={handleCopyCode}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            {copiedCodeBlock === codeId ? 'Copied!' : 'Copy'}
          </button>
        </div>
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

export default function ChatExpand({
  messages,
  input,
  isLoading,
  replyingTo,
  copiedCodeBlock,
  chatLabel,
  selectedModel,
  temperature,
  isSettingsExpanded,
  deletedMessages,
  onClose,
  onInputChange,
  onSend,
  onKeyDown,
  onCancelReply,
  onUndo,
  onRedo,
  onModelChange,
  onTemperatureChange,
  onToggleSettings,
  setCopiedCodeBlock,
}: ChatExpandProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSend()
  }

  return (
    <div className="nodrag fixed top-0 right-0 h-screen w-[700px] bg-white shadow-2xl border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50">
        <h3 className="text-lg font-semibold text-gray-800">
          {chatLabel || 'AI Chat'} - Expanded View
        </h3>
        <button
          onClick={onClose}
          className="p-1 hover:bg-purple-100 rounded-md transition-colors"
          aria-label="Close expanded view"
        >
          <X size={20} className="text-gray-500 hover:text-gray-700" />
        </button>
      </div>

      {/* Settings Card */}
      <div className="nodrag bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-200">
        {/* Settings Bar - Always Visible */}
        <button
          onClick={onToggleSettings}
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
                    onClick={() => onModelChange(model)}
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
                onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
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

      {/* Messages */}
      <div className="nodrag nowheel flex-1 p-6 overflow-y-auto bg-gray-50" onWheel={(e) => e.stopPropagation()}>
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-base">Start a conversation...</p>
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
                    className={`rounded-2xl px-5 py-4 shadow-sm max-w-[85%] ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white rounded-tr-sm'
                        : isContextMessage
                        ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-tl-sm'
                        : 'bg-white rounded-tl-sm'
                    }`}
                  >
                    {message.replyTo && (
                      <div className="mb-3 pl-3 border-l-2 border-gray-400 opacity-70">
                        <p className="text-xs font-medium mb-1">
                          {message.replyTo.role === 'user' ? 'You' : 'AI'}
                        </p>
                        <p className="text-xs line-clamp-2">
                          {message.replyTo.content}
                        </p>
                      </div>
                    )}
                    {message.role === 'user' ? (
                      <p className="text-base leading-relaxed whitespace-pre-wrap text-white select-text">
                        {message.content}
                      </p>
                    ) : (
                      <div className="text-base leading-relaxed text-gray-700 prose prose-base max-w-none prose-headings:mt-6 prose-headings:mb-4 prose-p:my-4 prose-pre:my-4 prose-ul:my-3 prose-ol:my-3 prose-li:my-1 select-text">
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
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="nodrag p-6 border-t border-gray-200 bg-white">
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
              onClick={onCancelReply}
              className="p-1 hover:bg-gray-200 rounded-md transition-colors ml-2 flex-shrink-0"
              aria-label="Cancel reply"
            >
              <X size={14} className="text-gray-500" />
            </button>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message..."
              disabled={isLoading}
              className="nodrag nowheel flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 pr-12 text-base focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent min-h-[52px] max-h-[200px] placeholder:text-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
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

        {/* Action Buttons: Undo, Redo */}
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-200">
          <button
            onClick={onUndo}
            disabled={messages.length === 0}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Undo"
            title="Undo last message"
          >
            <Undo2 size={16} className="text-gray-600" />
          </button>
          <button
            onClick={onRedo}
            disabled={deletedMessages.length === 0}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Redo"
            title="Redo message"
          >
            <Redo2 size={16} className="text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  )
}

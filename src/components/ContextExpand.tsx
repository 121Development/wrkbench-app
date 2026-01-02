import { X, Copy, Check as CheckCopy, Download, MoreHorizontal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useState } from 'react'

interface ContextExpandProps {
  text: string
  contextLabel?: string
  characterCount: number
  onClose: () => void
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

export default function ContextExpand({
  text,
  contextLabel,
  characterCount,
  onClose,
}: ContextExpandProps) {
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null)

  return (
    <div className="nodrag fixed inset-0 md:top-0 md:right-0 md:left-auto md:w-[700px] h-screen bg-white shadow-2xl md:border-l border-gray-200 z-50 flex flex-col">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
        <h3 className="text-base sm:text-lg font-semibold text-gray-800 flex items-center gap-2 truncate mr-2">
          <span>📝</span>
          {contextLabel || 'Context'} - Expanded View
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 sm:p-1 hover:bg-amber-100 rounded-md transition-colors flex-shrink-0"
          aria-label="Close expanded view"
        >
          <X size={24} className="sm:w-5 sm:h-5 text-gray-500 hover:text-gray-700" />
        </button>
      </div>

      {/* Content Area */}
      <div className="nodrag nowheel flex-1 p-4 sm:p-6 overflow-y-auto bg-gray-50" onWheel={(e) => e.stopPropagation()}>
        {text.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm sm:text-base">No context entered yet...</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 sm:p-6 shadow-sm">
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
                {text}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>

      {/* Footer with character count */}
      <div className="px-6 py-4 border-t border-gray-200 bg-white">
        <p className="text-sm text-gray-500 text-center">
          {characterCount} characters
        </p>
      </div>
    </div>
  )
}

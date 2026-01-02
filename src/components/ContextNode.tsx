import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { X, Circle, Maximize2, Copy, Check as CheckCopy, Download, MoreHorizontal } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ContextExpand from './ContextExpand'

interface ContextNodeProps {
  id: string
  data: {
    label?: string
    initialText?: string
  }
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
      <div className="nodrag my-2 rounded-lg overflow-hidden bg-[#1e1e1e] border border-gray-700">
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d30] border-b border-gray-700">
          <span className="text-xs font-mono text-gray-300">{language}</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCode}
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Download code"
            >
              <Download size={12} />
            </button>
            <button
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal size={12} />
            </button>
            <button
              onClick={handleCopyCode}
              className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
              aria-label="Copy code"
            >
              {copiedCodeBlock === codeId ? (
                <CheckCopy size={12} />
              ) : (
                <Copy size={12} />
              )}
            </button>
          </div>
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '0.75rem',
            background: '#1e1e1e',
            fontSize: '0.75rem',
          }}
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    )
  }

  return (
    <code className="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-xs font-mono" {...props}>
      {children}
    </code>
  )
}

export default function ContextNode({ id, data }: ContextNodeProps) {
  const [text, setText] = useState(data.initialText || '')
  const [savedText, setSavedText] = useState(data.text || data.initialText || '')
  const [hasChanges, setHasChanges] = useState(false)
  const [isExpandOpen, setIsExpandOpen] = useState(false)
  const [copiedCodeBlock, setCopiedCodeBlock] = useState<string | null>(null)
  const { setNodes } = useReactFlow()

  const handleClose = () => {
    setNodes((nodes) => nodes.filter((node) => node.id !== id))
  }

  const handleTextChange = (newText: string) => {
    setText(newText)
    setHasChanges(newText !== savedText)
  }

  const handleApplyChanges = () => {
    // Update the node data so other nodes can access the text
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, text: text } }
          : node
      )
    )
    setSavedText(text)
    setHasChanges(false)
  }

  return (
    <>
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-[400px]">
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
          stroke="#ea580c"
          strokeWidth={2}
          style={{
            pointerEvents: 'none',
            left: 0,
            top: 0,
            position: 'absolute',
          }}
        />
      </Handle>

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span>📝</span>
          {data.label || 'Context'}
        </h3>
        <button
          onClick={handleClose}
          className="p-1 hover:bg-amber-100 rounded-md transition-colors"
          aria-label="Close"
        >
          <X size={16} className="text-gray-500 hover:text-gray-700" />
        </button>
      </div>

      {/* Text Area */}
      <div className="nodrag p-4">
        <textarea
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder="Enter context information..."
          className="nodrag w-full h-[200px] resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent placeholder:text-gray-400"
        />

        {/* Markdown Preview */}
        {savedText && (
          <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 max-h-[150px] overflow-y-auto">
            <p className="text-xs font-medium text-gray-600 mb-2">Preview:</p>
            <div className="text-xs leading-relaxed text-gray-700 prose prose-sm max-w-none prose-headings:mt-3 prose-headings:mb-2 prose-p:my-2 prose-pre:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 select-text">
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
                {savedText}
              </ReactMarkdown>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-400">
              {text.length} characters
            </p>
            <button
              onClick={() => setIsExpandOpen(true)}
              className="p-1.5 hover:bg-amber-100 rounded-md transition-colors border border-amber-200"
              aria-label="Expand view"
              title="Open expanded view"
            >
              <Maximize2 size={16} className="text-amber-600" />
            </button>
          </div>
          {hasChanges && (
            <button
              onClick={handleApplyChanges}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              Apply Changes
            </button>
          )}
        </div>
        {hasChanges && (
          <p className="text-xs text-amber-600 mt-1">
            Unsaved changes - click Apply to update connected chats
          </p>
        )}
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
          stroke="#ea580c"
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

    {/* Expanded Context View - Rendered outside React Flow using Portal */}
    {isExpandOpen && createPortal(
      <ContextExpand
        text={savedText}
        contextLabel={data.label}
        characterCount={savedText.length}
        onClose={() => setIsExpandOpen(false)}
      />,
      document.body
    )}
    </>
  )
}

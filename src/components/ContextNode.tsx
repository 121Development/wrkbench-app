import { useState } from 'react'
import { Handle, Position, useReactFlow } from '@xyflow/react'
import { X } from 'lucide-react'

interface ContextNodeProps {
  id: string
  data: {
    label?: string
    initialText?: string
  }
}

export default function ContextNode({ id, data }: ContextNodeProps) {
  const [text, setText] = useState(data.initialText || '')
  const { setNodes } = useReactFlow()

  const handleClose = () => {
    setNodes((nodes) => nodes.filter((node) => node.id !== id))
  }

  const handleTextChange = (newText: string) => {
    setText(newText)
    // Update the node data so other nodes can access the text
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, text: newText } }
          : node
      )
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-[400px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

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
        <p className="text-xs text-gray-400 mt-2">
          {text.length} characters
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  )
}

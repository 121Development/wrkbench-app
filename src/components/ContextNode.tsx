import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'

interface ContextNodeProps {
  data: {
    label?: string
    initialText?: string
  }
}

export default function ContextNode({ data }: ContextNodeProps) {
  const [text, setText] = useState(data.initialText || '')

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 w-[400px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />

      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-orange-50">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <span>📝</span>
          {data.label || 'Context'}
        </h3>
      </div>

      {/* Text Area */}
      <div className="p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Enter context information..."
          className="w-full h-[200px] resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent placeholder:text-gray-400"
        />
        <p className="text-xs text-gray-400 mt-2">
          {text.length} characters
        </p>
      </div>

      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  )
}

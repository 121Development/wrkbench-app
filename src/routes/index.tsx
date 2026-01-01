import { createFileRoute } from '@tanstack/react-router'
import { ReactFlow, Background, Controls, MiniMap, Node, Edge, useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus } from 'lucide-react'
import ChatNode from '../components/ChatNode'
import ContextNode from '../components/ContextNode'

export const Route = createFileRoute('/')({ component: App })

const nodeTypes = {
  chatNode: ChatNode,
  contextNode: ContextNode,
}

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'chatNode',
    position: { x: 250, y: 150 },
    data: { label: 'Chat' },
  },
]

const initialEdges: Edge[] = []

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nodeIdCounter = useRef(2) // Start from 2 since we have node '1'

  const handleAddNode = useCallback((type: string) => {
    const nodeId = `node-${nodeIdCounter.current++}`

    // Calculate position - center of viewport with slight offset for each new node
    const centerX = window.innerWidth / 2 - 200 // Offset for node width
    const centerY = window.innerHeight / 2 - 150 // Offset for node height
    const offset = (nodeIdCounter.current - 2) * 50 // Stagger new nodes

    const newNode: Node = {
      id: nodeId,
      type: type === 'context' ? 'contextNode' : 'chatNode',
      position: { x: centerX + offset, y: centerY + offset },
      data: {
        label: type === 'context' ? 'Context' : 'Chat',
      },
    }

    setNodes((nds) => [...nds, newNode])
    setIsMenuOpen(false)
  }, [setNodes])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges]
  )

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false)
      }
    }

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isMenuOpen])

  return (
    <div className="w-screen h-screen relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>

      {/* Floating Add Button */}
      <div className="absolute top-6 right-6 z-10" ref={menuRef}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-12 h-12 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center"
          aria-label="Add node"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <div className="absolute top-14 right-0 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[180px] animate-in fade-in slide-in-from-top-2 duration-200">
            <button
              onClick={() => handleAddNode('context')}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
            >
              <span className="text-lg">📝</span>
              <span className="font-medium">Context</span>
            </button>
            <div className="border-t border-gray-100"></div>
            <button
              onClick={() => handleAddNode('chatNode')}
              className="w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors flex items-center gap-3"
            >
              <span className="text-lg">💬</span>
              <span className="font-medium">Chat Node</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

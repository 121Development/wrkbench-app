import { createFileRoute } from '@tanstack/react-router'
import { ReactFlow, Background, Controls, MiniMap, Node, Edge, useNodesState, useEdgesState, addEdge, Connection } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useState, useEffect, useRef, useCallback, createContext } from 'react'
import { Plus, Undo2, Redo2, FileText, X, Download } from 'lucide-react'
import ChatNode from '../components/ChatNode'
import ContextNode from '../components/ContextNode'

export const Route = createFileRoute('/')({ component: App })

interface LogEntry {
  timestamp: string
  action: string
  details: string
}

export const LogContext = createContext<{
  addLog: (action: string, details: string) => void
}>({
  addLog: () => {},
})

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
    style: { width: 600, height: 600 },
  },
]

const initialEdges: Edge[] = []

interface HistoryState {
  nodes: Node[]
  edges: Edge[]
}

function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const nodeIdCounter = useRef(2) // Start from 2 since we have node '1'

  // History management
  const [history, setHistory] = useState<HistoryState[]>([{ nodes: initialNodes, edges: initialEdges }])
  const [historyIndex, setHistoryIndex] = useState(0)
  const isUndoRedoAction = useRef(false)

  // Logging
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isLogOpen, setIsLogOpen] = useState(false)

  const addLog = useCallback((action: string, details: string) => {
    const timestamp = new Date().toLocaleString()
    setLogs((prev) => [...prev, { timestamp, action, details }])
  }, [])

  const downloadLogs = useCallback(() => {
    const logText = logs
      .map((log) => `[${log.timestamp}] ${log.action}: ${log.details}`)
      .join('\n')
    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wrkbench-logs-${new Date().toISOString()}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    addLog('Action', 'Logs downloaded')
  }, [logs, addLog])

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
      style: type === 'context' ? undefined : { width: 600, height: 600 },
    }

    const nodeType = type === 'context' ? 'Context Node' : 'Chat Node'
    addLog('Node Created', `${nodeType} (ID: ${nodeId})`)

    setNodes((nds) => [...nds, newNode])
    setIsMenuOpen(false)
  }, [setNodes, addLog])

  const onConnect = useCallback(
    (connection: Connection) => {
      addLog('Connection Created', `From ${connection.source} to ${connection.target}`)
      setEdges((eds) => addEdge(connection, eds))
    },
    [setEdges, addLog]
  )

  // Track changes to nodes and edges for history
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false
      return
    }

    // Add to history when nodes or edges change
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push({ nodes, edges })
      // Limit history to 50 states
      return newHistory.slice(-50)
    })
    setHistoryIndex((prev) => Math.min(prev + 1, 49))
  }, [nodes, edges])

  // Track node and edge deletions
  useEffect(() => {
    if (isUndoRedoAction.current) return

    const prevState = history[historyIndex]
    if (!prevState) return

    // Check for deleted nodes
    const deletedNodes = prevState.nodes.filter(
      (oldNode) => !nodes.find((n) => n.id === oldNode.id)
    )
    deletedNodes.forEach((node) => {
      addLog('Node Deleted', `${node.type === 'chatNode' ? 'Chat Node' : 'Context Node'} (ID: ${node.id})`)
    })

    // Check for deleted edges
    const deletedEdges = prevState.edges.filter(
      (oldEdge) => !edges.find((e) => e.id === oldEdge.id)
    )
    deletedEdges.forEach((edge) => {
      addLog('Connection Removed', `From ${edge.source} to ${edge.target}`)
    })
  }, [nodes, edges, history, historyIndex, addLog])

  // Undo function
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      addLog('Action', 'Undo')
      const newIndex = historyIndex - 1
      const state = history[newIndex]
      isUndoRedoAction.current = true
      setNodes(state.nodes)
      setEdges(state.edges)
      setHistoryIndex(newIndex)
    }
  }, [historyIndex, history, setNodes, setEdges, addLog])

  // Redo function
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      addLog('Action', 'Redo')
      const newIndex = historyIndex + 1
      const state = history[newIndex]
      isUndoRedoAction.current = true
      setNodes(state.nodes)
      setEdges(state.edges)
      setHistoryIndex(newIndex)
    }
  }, [historyIndex, history, setNodes, setEdges, addLog])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

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
    <LogContext.Provider value={{ addLog }}>
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

      {/* Floating Add Button and Logs */}
      <div className="absolute top-6 right-6 z-10 flex items-center gap-3">
        {/* Logs Button */}
        <button
          onClick={() => setIsLogOpen(true)}
          className="w-10 h-10 bg-white hover:bg-gray-50 text-gray-700 rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center border border-gray-200"
          aria-label="View Logs"
          title="View Activity Logs"
        >
          <FileText size={18} />
        </button>

        {/* Add Node Button */}
        <div ref={menuRef}>
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

      {/* Log Modal */}
      {isLogOpen && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Activity Logs</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadLogs}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Download size={16} />
                  Download
                </button>
                <button
                  onClick={() => setIsLogOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>

            {/* Log Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {logs.length === 0 ? (
                <p className="text-gray-400 text-center py-8">No activity logged yet</p>
              ) : (
                <div className="space-y-2 font-mono text-xs">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-gray-400 whitespace-nowrap">{log.timestamp}</span>
                        <div className="flex-1">
                          <span className="font-semibold text-purple-600">{log.action}:</span>{' '}
                          <span className="text-gray-700">{log.details}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </LogContext.Provider>
  )
}

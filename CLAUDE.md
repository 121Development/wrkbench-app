# Spatial AI Canvas - Project Documentation

## Project Overview

A **Spatial AI Canvas** application where users create multiple chat/task nodes on an infinite zoomable canvas. Nodes can be connected with typed edges that pass compressed context packs (not full transcripts), enabling complex multi-agent workflows while preventing context drift and "spaghetti" diagrams.

**Core Innovation**: Nodes exchange versioned, compressed "context packs" instead of full chat histories, with automatic staleness detection and sync management.

---

## Tech Stack

### Framework & Routing
- **TanStack Start** - Full-stack React framework (Vite-based)
- **TanStack Router** - File-based routing with type-safe params
- **TypeScript** - Full-stack type safety

### State & Data Management
- **Zustand** - Local/UI state (viewport, selections, optimistic updates)
- **TanStack Query** - Async operations, LLM streaming, caching
- **IndexedDB (Dexie.js)** - Local-first persistence
  - *Note: Convex is considered for future multi-user features*

### Canvas & UI
- **React Flow v12** - Node-graph canvas engine
- **shadcn/ui + Radix UI** - Headless component library
- **Tailwind CSS** - Styling
- **Lucide React** - Icons

### AI Integration
- **OpenRouter** - Unified LLM provider API (200+ models)
- **Anthropic Claude Sonnet 4.5** - Primary model
- Direct SDK integration (TanStack AI skipped - experimental)

### Deployment
- **Cloudflare Pages + Workers** - Edge deployment
- **Cloudflare KV** - Optional edge caching for context packs

---

## Core Data Models

### Node
```typescript
interface Node {
  id: string;
  type: NodeType; // generic_chat | persona | requirements | research | decision_log | output_artifact
  position: { x: number; y: number };
  metadata: NodeMetadata; // title, tags, status, dates
  task: TaskDefinition; // intent, constraints, acceptance criteria
  artifact: Artifact; // living document output
  trace: ChatTrace; // chat history, reasoning, snippets
  contextPack: ContextPack; // compressed representation
}
```

### Edge (Context Contract)
```typescript
interface Edge {
  id: string;
  source: string; // node ID
  target: string; // node ID
  type: EdgeType; // reference | import | constraint | persona
  config: EdgeConfig; // payloadScope, weight, sourceSelector
  state: EdgeState; // syncMode (auto/snapshot), lastSyncVersion, isStale
}
```

### Context Pack (Compression Unit)
```typescript
interface ContextPack {
  nodeId: string;
  version: string; // hash of content
  timestamp: Date;
  summary: string[]; // 5-10 rolling bullets
  pinnedFacts: string[];
  artifactSnapshot: string; // outline or full content
  openQuestions?: string[];
  todos?: string[];
}
```

---

## File Structure

```
app/
├── routes/
│   ├── __root.tsx                 # Root layout
│   ├── index.tsx                  # Main canvas page
│   └── api/
│       ├── chat.ts                # Server function for LLM streaming
│       └── context-pack.ts        # Server function for summarization
├── components/
│   ├── canvas/
│   │   ├── CanvasContainer.tsx    # React Flow wrapper
│   │   ├── CustomNode.tsx         # Node component (zoom-dependent rendering)
│   │   └── CustomEdge.tsx         # Edge with type labels & staleness
│   ├── node/
│   │   ├── NodeHeader.tsx         # Title, type, status
│   │   ├── ArtifactPanel.tsx      # Living document editor
│   │   └── ChatTracePanel.tsx     # Chat interface with streaming
│   └── ui/
│       └── [shadcn components]    # Reusable UI primitives
├── lib/
│   ├── store.ts                   # Zustand store (nodes, edges, viewport)
│   ├── db.ts                      # Dexie.js IndexedDB setup
│   ├── types.ts                   # All TypeScript interfaces
│   └── services/
│       ├── openrouter.ts          # OpenRouter LLM service
│       └── context.ts             # Context pack generation logic
├── hooks/
│   ├── useLLMStream.ts            # TanStack Query hook for streaming
│   └── useCanvasStore.ts          # Zustand selector hooks
└── utils/
    ├── hash.ts                    # Version hashing for context packs
    └── prompt.ts                  # System prompt construction
```

---

## Key Architecture Patterns

### State Management Strategy

**Three-Layer State:**

1. **Zustand** - Local/UI state (instant)
   - Canvas viewport, zoom level
   - Selected nodes
   - UI toggles (modals, panels)
   - Optimistic updates

2. **TanStack Query** - Async/server state (cached)
   - LLM streaming responses
   - Context pack generation (expensive)
   - Node persistence to IndexedDB

3. **IndexedDB** - Source of truth (persistent)
   - All nodes, edges, clusters
   - Chat traces, artifacts
   - Context packs

### Data Flow Pattern

```
User Action
    ↓
Zustand (optimistic update - instant UI feedback)
    ↓
TanStack Query (async operation - streaming/save)
    ↓
IndexedDB (persistence)
    ↓
Zustand sync (on success/error)
```

### Optimistic Updates Template

```typescript
const useUpdateNode = (nodeId: string) => {
  const updateOptimistically = useCanvasStore(state => state.updateNodeOptimistically);
  
  return useMutation({
    mutationFn: async (updates) => await db.nodes.update(nodeId, updates),
    
    onMutate: async (updates) => {
      // Instant UI update
      updateOptimistically(nodeId, updates);
      return { previous: useCanvasStore.getState().nodes.get(nodeId) };
    },
    
    onError: (err, variables, context) => {
      // Rollback on failure
      if (context?.previous) {
        updateOptimistically(nodeId, context.previous);
      }
    },
  });
};
```

---

## LLM Integration (OpenRouter)

### Service Layer
```typescript
// lib/services/openrouter.ts
class OpenRouterService {
  async streamChat(
    messages: Message[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    options?: { model?: string; temperature?: number }
  ): Promise<void>
}
```

### Server Function (TanStack Start)
```typescript
// app/routes/api/chat.ts
export const streamChat = createServerFn('POST', async (payload) => {
  // Returns ReadableStream for streaming to client
});
```

### Available Models
- `anthropic/claude-sonnet-4-20250514` (Primary - $3/1M tokens)
- `anthropic/claude-haiku-4-20250514` (Fast - $0.25/1M tokens)
- `openai/gpt-4-turbo` ($10/1M tokens)
- `google/gemini-pro-1.5` ($0.5/1M tokens)

### Environment Variables
```bash
OPENROUTER_API_KEY=sk-or-v1-...
```

---

## Canvas Features

### Zoom-Level Rendering
- **Far zoom (< 0.5)**: Node titles only
- **Mid zoom (0.5-1.5)**: Title + summary
- **Near zoom (> 1.5)**: Full node UI (artifact + chat trace)

### Edge Types
1. **Reference**: Cite only, not injected into prompt
2. **Import**: Inject context pack into downstream prompts
3. **Constraint**: Enforce upstream rules downstream
4. **Persona**: Apply style/tone rules downstream

### Context Pack Generation
- Triggered every 5 messages or on explicit request
- LLM-generated 5-10 bullet summary
- Includes pinned facts, artifact snapshot, open questions
- Versioned with hash for staleness detection

### Staleness Detection
- Edge stores `lastSyncVersion` (hash of context pack)
- Background check compares current pack version vs last sync
- Visual indicator (badge) on stale edges
- Manual or auto-sync modes

---

## Development Commands

### Setup
```bash
# Create project
npm create @tanstack/start@latest spatial-ai-canvas -- --template basic
cd spatial-ai-canvas

# Install dependencies
pnpm add @tanstack/react-query @xyflow/react zustand dexie
pnpm add @radix-ui/react-dialog @radix-ui/react-dropdown-menu
pnpm add lucide-react tailwindcss clsx class-variance-authority

# Cloudflare adapter
pnpm add -D @tanstack/start-cloudflare-adapter wrangler
```

### Development
```bash
pnpm dev              # Start dev server (http://localhost:3000)
pnpm build            # Build for production
pnpm preview          # Preview production build
```

### Deployment (Cloudflare)
```bash
# Set secrets
wrangler secret put OPENROUTER_API_KEY

# Deploy
pnpm build
wrangler pages deploy ./dist
```

---

## Code Style Guidelines

### TypeScript
- Use `interface` for public APIs, `type` for unions/intersections
- Prefer `Map` and `Set` over plain objects for collections
- Always define return types for functions
- Use `Omit<T, 'id'>` for create operations

### React Components
- Use functional components with hooks
- Prefer named exports over default exports
- Keep components under 200 lines (extract sub-components)
- Use `memo()` for expensive list items (nodes on canvas)

### State Updates
- Always create new Map/Set instances (immutability)
```typescript
// ✅ Good
set((state) => ({
  nodes: new Map(state.nodes).set(id, node)
}));

// ❌ Bad (mutates existing Map)
set((state) => {
  state.nodes.set(id, node);
  return { nodes: state.nodes };
});
```

### Async Operations
- Use TanStack Query for all async operations
- Always handle loading and error states
- Use optimistic updates for better UX
- Debounce expensive operations (context pack generation)

---

## Testing Strategy

### Unit Tests
- Store logic (Zustand actions)
- Context pack generation
- Hash/version utilities
- Prompt construction

### Integration Tests
- LLM service (mocked responses)
- IndexedDB operations
- Canvas operations (node/edge CRUD)

### E2E Tests (Playwright)
- **Magic Loop**: Create node A → Create node B → Connect → Chat in B → Verify context from A
- Staleness flow: Edit upstream → Verify badge → Refresh → Verify update
- Zoom navigation: Verify rendering at different zoom levels

---

## Known Issues & Warnings

### Performance
- **100+ nodes**: Use React Flow's virtualization (built-in)
- **Edge rendering**: Hide edges at far zoom to improve performance
- **Context pack generation**: Debounce to avoid excessive LLM calls

### Browser Compatibility
- IndexedDB required (all modern browsers supported)
- Canvas rendering requires WebGL (for smooth zoom/pan)

### LLM Streaming
- OpenRouter may have rate limits (handle 429 responses)
- Implement retry logic with exponential backoff
- Show clear error messages to users

### Data Loss Prevention
- Auto-save to IndexedDB on every change (debounced 500ms)
- Consider periodic export to JSON for backup
- Future: Convex migration for cloud backup

---

## Implementation Phases (14 weeks)

1. **Phase 1-2**: Core canvas + node model (4 weeks)
2. **Phase 3**: Context packs (1 week)
3. **Phase 4-5**: Edges + versioning (3 weeks)
4. **Phase 6**: Visual hygiene (1 week)
5. **Phase 7**: Node types (1 week)
6. **Phase 8**: Provenance (1 week)
7. **Phase 9**: Persistence (1 week)
8. **Phase 10**: Cluster operations (1 week)
9. **Phase 11**: Polish + Magic Loop validation (1 week)

---

## Future Considerations

### Multi-User Collaboration (Post-MVP)
- **Option A**: Cloudflare Durable Objects (complex, aligns with expertise)
- **Option B**: Convex migration (simple, vendor lock-in)
- **Decision trigger**: User demand for real-time collaboration

### Convex Migration Path
1. Define schema matching current data model
2. Create migration script (IndexedDB → Convex)
3. Replace data access layer incrementally
4. Keep Zustand + TanStack Query (just swap backend)
5. **Estimated time**: 1-2 weeks

---

## Repository Etiquette

### Branch Naming
- `feature/node-types` - New features
- `fix/edge-staleness` - Bug fixes
- `refactor/context-generation` - Refactoring
- `docs/architecture` - Documentation

### Commit Messages
```
feat: add persona node type
fix: edge staleness detection on rapid updates
refactor: extract context pack logic to service
docs: update CLAUDE.md with testing strategy
```

### Development Workflow
- Use feature branches
- Squash commits before merge to main
- Run `pnpm build` before committing
- Test locally with `pnpm preview`

---

## Critical Reminders

1. **Context packs are compressed** - Never pass full chat transcripts via edges
2. **Staleness is automatic** - Background checks run every 30 seconds
3. **Optimistic updates everywhere** - UI should feel instant
4. **Type safety end-to-end** - Leverage TanStack Start's shared types
5. **Offline-first** - IndexedDB ensures app works without network
6. **OpenRouter costs** - Monitor usage, implement rate limiting per user
7. **Memory management** - Clear old context packs after 30 minutes (TanStack Query GC)

---

## Contact & Resources

- **TanStack Start Docs**: https://tanstack.com/start
- **React Flow Docs**: https://reactflow.dev
- **OpenRouter API**: https://openrouter.ai/docs
- **Convex Docs**: https://docs.convex.dev (future reference)

---

*Last Updated: January 2026*
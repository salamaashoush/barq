# Barq SSR Design Document

## Overview

Full isomorphic SSR support for Barq - same components render on server and client seamlessly.

## Architecture

```
Server                          Client
  |                               |
  v                               v
renderToString()  ----HTML--->  hydrate()
  |                               |
  v                               v
String output                 Attach reactivity
with markers                  to existing DOM
```

## Design Decisions

| Decision   | Choice                | Rationale                              |
| ---------- | --------------------- | -------------------------------------- |
| Compiler   | No compiler           | Runtime detection via `isServer` flag  |
| Components | Single with branching | Same import works both sides           |
| Async      | renderToStringAsync   | Wait for resources before render       |
| Runtime    | Bun only              | No Node.js compat overhead             |
| Markers    | HTML comments         | Already used in client, extend for SSR |

## Package Structure

```
packages/core/src/
  server.ts              # Server-only entry point
  hydrate.ts             # Client hydration
  ssr/
    context.ts           # isServer, ID generation
    escape.ts            # HTML escaping
    render.ts            # renderToString implementation
```

## New Exports

```typescript
// @barqjs/server
export { renderToString, renderToStringAsync } from "./ssr/render.ts"
export { isServer } from "./ssr/context.ts"

// @barqjs (main)
export { hydrate } from "./hydrate.ts"
export { isServer, isClient } from "./ssr/context.ts"
```

## Implementation Details

### 1. SSR Context (src/ssr/context.ts)

```typescript
// Environment detection
export const isServer = typeof document === "undefined"
export const isClient = !isServer

// Hydration ID generation - must match server/client order
let hydrationId = 0

export function nextHydrationId(): string {
  return `hk-${hydrationId++}`
}

export function resetHydrationId(): void {
  hydrationId = 0
}

// SSR rendering context
export interface SSRContext {
  ids: Map<unknown, string>
}

export function createSSRContext(): SSRContext {
  return { ids: new Map() }
}
```

### 2. HTML Escaping (src/ssr/escape.ts)

```typescript
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, c => ESCAPE_MAP[c])
}

export function escapeAttr(str: string): string {
  return str.replace(/[&"]/g, c => ESCAPE_MAP[c])
}
```

### 3. Server Rendering (src/ssr/render.ts)

```typescript
import { escapeHtml, escapeAttr } from "./escape.ts"
import { resetHydrationId, createSSRContext } from "./context.ts"
import type { JSXElement } from "../dom.ts"

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
])

export function renderToString(element: JSXElement): string {
  resetHydrationId()
  return renderNode(element)
}

export async function renderToStringAsync(element: JSXElement): Promise<string> {
  resetHydrationId()
  const context = createSSRContext()

  // Phase 1: Collect resources during render
  const resources = collectResources(() => renderNode(element))

  // Phase 2: Wait for all resources
  await Promise.all(resources.map(r => r.promise))

  // Phase 3: Render with resolved data
  return renderNode(element)
}

function renderNode(node: JSXElement): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string") return escapeHtml(node)
  if (typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(renderNode).join("")

  if (node instanceof DocumentFragment) {
    return renderFragment(node)
  }

  if (node instanceof Element) {
    return renderElement(node)
  }

  return ""
}

function renderElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const attrs = renderAttributes(el)

  if (VOID_ELEMENTS.has(tag)) {
    return `<${tag}${attrs}>`
  }

  const children = Array.from(el.childNodes).map(renderNode).join("")
  return `<${tag}${attrs}>${children}</${tag}>`
}

function renderAttributes(el: Element): string {
  let result = ""
  for (const attr of el.attributes) {
    result += ` ${attr.name}="${escapeAttr(attr.value)}"`
  }
  return result
}

function renderFragment(frag: DocumentFragment): string {
  return Array.from(frag.childNodes).map(renderNode).join("")
}
```

### 4. Component SSR Branches

Components check `isServer` and branch internally:

```typescript
// In components.ts
import { isServer } from "./ssr/context.ts"

export function Show(props: ShowProps): JSXElement {
  if (isServer) {
    // Server: evaluate condition once, return static content
    const condition = typeof props.when === "function" ? props.when() : props.when
    const id = nextHydrationId()

    if (condition) {
      const content = childToNodes(props.children)
      return createSSRMarkedContent("Show", id, content)
    }
    return props.fallback ? childToNodes(props.fallback) : null
  }

  // Client: existing marker-based reactive implementation
  // ... current implementation ...
}

export function For<T, U extends JSXElement>(props: ForProps<T, U>): JSXElement {
  if (isServer) {
    const id = nextHydrationId()
    const items = typeof props.each === "function" ? props.each() : props.each

    if (!items || items.length === 0) {
      return props.fallback ?? null
    }

    const rendered = items.map((item, i) => {
      const indexSignal = () => i  // Static on server
      return props.children(item, indexSignal)
    })

    return createSSRMarkedContent("For", id, rendered)
  }

  // Client: existing implementation
  // ...
}

function createSSRMarkedContent(
  type: string,
  id: string,
  content: Node | Node[]
): DocumentFragment {
  const frag = document.createDocumentFragment()
  frag.appendChild(document.createComment(`$${type}:${id}`))

  if (Array.isArray(content)) {
    content.forEach(n => frag.appendChild(n))
  } else if (content) {
    frag.appendChild(content)
  }

  frag.appendChild(document.createComment(`/${type}:${id}`))
  return frag
}
```

### 5. Signal Behavior on Server

Effects are no-ops on server:

```typescript
// In signals.ts
import { isServer } from "./ssr/context.ts"

export function effect(fn: () => void | (() => void)): () => void {
  if (isServer) {
    // Don't set up subscriptions on server
    // Just return cleanup no-op
    return () => {}
  }

  // Client: full reactive implementation
  // ... existing code ...
}
```

Signals work normally (read/write values) but don't create subscriptions.

### 6. Client Hydration (src/hydrate.ts)

```typescript
import { resetHydrationId, nextHydrationId } from "./ssr/context.ts"
import type { JSXElement } from "./dom.ts"

export function hydrate(element: JSXElement, container: HTMLElement): () => void {
  resetHydrationId()

  // Walk existing DOM, don't create new nodes
  hydrateNode(element, container, container.firstChild)

  return () => {
    container.textContent = ""
  }
}

function hydrateNode(
  vnode: JSXElement,
  parent: Node,
  dom: Node | null
): Node | null {
  if (vnode == null || typeof vnode === "boolean") {
    return dom
  }

  // Text node
  if (typeof vnode === "string" || typeof vnode === "number") {
    // Skip text node, move to next sibling
    return dom?.nextSibling ?? null
  }

  // Array
  if (Array.isArray(vnode)) {
    let current = dom
    for (const child of vnode) {
      current = hydrateNode(child, parent, current)
    }
    return current
  }

  // Element
  if (vnode instanceof Element) {
    if (dom instanceof Element) {
      // Hydrate attributes (attach event handlers)
      hydrateAttributes(vnode, dom)

      // Hydrate children
      hydrateNode(
        Array.from(vnode.childNodes),
        dom,
        dom.firstChild
      )

      return dom.nextSibling
    }
  }

  // DocumentFragment (from Show/For/etc)
  if (vnode instanceof DocumentFragment) {
    return hydrateFragment(vnode, parent, dom)
  }

  return dom?.nextSibling ?? null
}

function hydrateAttributes(vnode: Element, dom: Element): void {
  // Find event handlers and refs from vnode, attach to dom
  // This requires tracking props during createElement
}

function hydrateFragment(
  frag: DocumentFragment,
  parent: Node,
  dom: Node | null
): Node | null {
  // Find marker comments, set up reactive contexts
  // Match <!--$Show:hk-0--> ... <!--/Show:hk-0-->
  // Attach effects for reactive updates
}
```

### 7. Resource Tracking for Async SSR

```typescript
// In async.ts
let ssrResources: Resource<unknown>[] | null = null

export function trackResource(resource: Resource<unknown>): void {
  if (ssrResources) {
    ssrResources.push(resource)
  }
}

export function collectResources(render: () => void): Resource<unknown>[] {
  ssrResources = []
  render()
  const result = ssrResources
  ssrResources = null
  return result
}

// In useResource, add tracking:
export function useResource<T, S>(
  source: () => S,
  fetcher: (source: S) => Promise<T>
): Resource<T> {
  // ... existing code ...

  // Track for SSR
  trackResource(resource)

  return resource
}
```

## API Usage

### Server (Bun)

```typescript
import { renderToStringAsync } from "@barqjs/core/server"
import { App } from "./App"

Bun.serve({
  async fetch(req) {
    const data = await fetchInitialData()

    const html = await renderToStringAsync(<App initialData={data} />)

    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>My App</title></head>
        <body>
          <div id="root">${html}</div>
          <script>window.__DATA__ = ${JSON.stringify(data)}</script>
          <script type="module" src="/client.js"></script>
        </body>
      </html>
    `, {
      headers: { "Content-Type": "text/html" }
    })
  }
})
```

### Client (Browser)

```typescript
import { hydrate } from "@barqjs/core"
import { App } from "./App"

hydrate(
  <App initialData={window.__DATA__} />,
  document.getElementById("root")!
)
```

### Isomorphic Component

```typescript
import { useState, useResource, Show, For } from "@barqjs/core"

export function UserList() {
  const users = useResource(
    () => null,
    async () => {
      const res = await fetch("/api/users")
      return res.json()
    }
  )

  return (
    <div>
      <Show when={() => users.loading()} fallback={null}>
        <div>Loading...</div>
      </Show>

      <Show when={() => !users.loading() && users()}>
        <For each={() => users()!}>
          {(user) => <div>{user.name}</div>}
        </For>
      </Show>
    </div>
  )
}
```

## Implementation Order

1. SSR utilities (context.ts, escape.ts)
2. Signal SSR mode (skip effects on server)
3. renderToString basic implementation
4. Component SSR branches (Show, For, Index)
5. Hydration markers in output
6. Resource tracking for async
7. renderToStringAsync
8. hydrate() client function
9. Integration tests

## Files Summary

| File               | Type   | Purpose                 |
| ------------------ | ------ | ----------------------- |
| src/ssr/context.ts | New    | isServer, ID generation |
| src/ssr/escape.ts  | New    | HTML escaping           |
| src/ssr/render.ts  | New    | renderToString          |
| src/hydrate.ts     | New    | Client hydration        |
| src/server.ts      | New    | Server entry point      |
| src/signals.ts     | Modify | Skip effects on server  |
| src/components.ts  | Modify | SSR branches            |
| src/async.ts       | Modify | Resource tracking       |
| src/dom.ts         | Modify | isServer checks         |
| src/index.ts       | Modify | New exports             |
| package.json       | Modify | Add exports             |

## Estimated Size

- New code: ~425 lines
- Modified code: ~165 lines
- Total: ~590 lines

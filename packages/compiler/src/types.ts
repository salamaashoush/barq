import type { NodePath } from "@babel/core"
import type * as t from "@babel/types"

/**
 * Reactive source types that the compiler tracks
 */
export type ReactiveSourceType = "signal" | "store" | "computed" | "resource" | "prop"

/**
 * Information about a reactive binding
 */
export interface ReactiveBinding {
  type: ReactiveSourceType
  name: string
  /** For destructured bindings like [count, setCount] */
  getter?: string
  setter?: string
  /** For store bindings, tracks the store variable name */
  storeName?: string
}

/**
 * Compiler state tracked per scope
 */
export interface ScopeState {
  /** Map of binding name to reactive info */
  reactiveBindings: Map<string, ReactiveBinding>
  /** Parent scope for lookup */
  parent?: ScopeState
}

/**
 * Plugin options
 */
export interface BarqCompilerOptions {
  /**
   * Enable auto-computed detection
   * When true, expressions depending on reactive values become useMemo
   * @default true
   */
  autoComputed?: boolean

  /**
   * Control flow components that need children wrapped
   * @default ["Show", "Match", "Switch", "ErrorBoundary", "Suspense", "Await"]
   */
  controlFlowComponents?: string[]

  /**
   * List components whose children callback needs item wrapping
   * @default ["For", "Index"]
   */
  listComponents?: string[]

  /**
   * Provider components that need children wrapped
   * @default [] (auto-detected by .Provider suffix)
   */
  providerComponents?: string[]

  /**
   * Module source for barq imports
   * @default "@barqjs/core"
   */
  moduleSource?: string

  /**
   * Enable development mode with extra warnings
   * @default false
   */
  dev?: boolean
}

/**
 * Compiler plugin state
 */
export interface PluginState {
  opts: BarqCompilerOptions
  /** Stack of scope states */
  scopeStack: ScopeState[]
  /** Track if we need to import useMemo */
  needsUseMemo: boolean
  /** File-level imports from barq */
  barqImports: Set<string>
  /** Current file path */
  filename?: string
}

/**
 * Helper to check if a node is a reactive identifier
 */
export function isReactiveIdentifier(
  state: PluginState,
  name: string
): ReactiveBinding | undefined {
  for (let i = state.scopeStack.length - 1; i >= 0; i--) {
    const binding = state.scopeStack[i].reactiveBindings.get(name)
    if (binding) return binding
  }
  return undefined
}

/**
 * Register a reactive binding in current scope
 */
export function registerReactiveBinding(
  state: PluginState,
  binding: ReactiveBinding
): void {
  const currentScope = state.scopeStack[state.scopeStack.length - 1]
  if (currentScope) {
    currentScope.reactiveBindings.set(binding.name, binding)
  }
}

/**
 * Push a new scope
 */
export function pushScope(state: PluginState): void {
  const parent = state.scopeStack[state.scopeStack.length - 1]
  state.scopeStack.push({
    reactiveBindings: new Map(),
    parent,
  })
}

/**
 * Pop current scope
 */
export function popScope(state: PluginState): void {
  state.scopeStack.pop()
}

/**
 * Check if we're inside a JSX context
 */
export function isInsideJSX(path: NodePath): boolean {
  return path.findParent(
    (p) =>
      p.isJSXElement() ||
      p.isJSXFragment() ||
      p.isJSXAttribute() ||
      p.isJSXExpressionContainer()
  ) !== null
}

/**
 * Check if we're inside an event handler (onClick, onInput, etc.)
 */
export function isInsideEventHandler(path: NodePath): boolean {
  const jsxAttr = path.findParent((p) => p.isJSXAttribute()) as NodePath<t.JSXAttribute> | null
  if (!jsxAttr) return false

  const name = jsxAttr.node.name
  if (name.type === "JSXIdentifier") {
    return /^on[A-Z]/.test(name.name)
  }
  return false
}

/**
 * Check if we're inside a callback/arrow function that's not the component body
 */
export function isInsideCallback(path: NodePath): boolean {
  let depth = 0
  let current: NodePath | null = path

  while (current) {
    if (current.isArrowFunctionExpression() || current.isFunctionExpression()) {
      depth++
      if (depth > 1) return true
    }
    if (current.isFunctionDeclaration()) {
      // If we hit a function declaration, we're at component level
      return depth > 0
    }
    current = current.parentPath
  }

  return false
}

/**
 * Default control flow components
 */
export const DEFAULT_CONTROL_FLOW = [
  "Show",
  "Match",
  "Switch",
  "ErrorBoundary",
  "Suspense",
  "Await",
]

/**
 * Default list components
 */
export const DEFAULT_LIST_COMPONENTS = ["For", "Index"]

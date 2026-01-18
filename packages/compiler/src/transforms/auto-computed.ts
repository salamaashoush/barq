import type { NodePath } from "@babel/core"
import * as t from "@babel/types"
import {
  type PluginState,
  isReactiveIdentifier,
  registerReactiveBinding,
} from "../types.js"

/**
 * Transform variable declarations that derive from reactive values into useMemo
 *
 * const doubled = count * 2
 * → const doubled = useMemo(() => count() * 2)
 *
 * const filtered = items.filter(x => x.active)
 * → const filtered = useMemo(() => items().filter(x => x.active))
 */
export function transformAutoComputed(
  path: NodePath<t.VariableDeclaration>,
  state: PluginState
): void {
  // Skip if auto-computed is disabled
  if (state.opts.autoComputed === false) return

  // Skip if inside a hook call (useEffect, useMemo, etc.)
  if (isInsideHookCall(path)) return

  // Skip if inside a hook function definition (function useXxx() {...})
  // Hook implementations should return raw values, not auto-wrapped getters
  if (isInsideHookDefinition(path)) return

  // Skip if inside a nested function (not the component function itself)
  // Variables inside nested functions don't need auto-wrapping - the function provides lazy eval
  if (isInsideNestedFunction(path)) return

  for (const declarator of path.get("declarations")) {
    const init = declarator.node.init
    const id = declarator.node.id

    // Skip if no initializer
    if (!init) continue

    // Skip if not a simple identifier binding
    if (id.type !== "Identifier") continue

    // Skip if it's already a hook call (useState, useMemo, etc.)
    if (init.type === "CallExpression") {
      const callee = init.callee
      if (callee.type === "Identifier" && isHookCall(callee.name)) {
        continue
      }
    }

    // Skip if it's a function expression
    if (
      init.type === "ArrowFunctionExpression" ||
      init.type === "FunctionExpression"
    ) {
      continue
    }

    // Skip if expression contains await (can't be wrapped in sync useMemo callback)
    if (containsAwait(init)) {
      continue
    }

    // Skip if it's a new expression (e.g., new URL(...), new Map(), etc.)
    if (init.type === "NewExpression") {
      continue
    }

    // Skip if it's an object literal (signals as property values should not be called)
    if (init.type === "ObjectExpression") {
      continue
    }

    // Skip if it's an array literal
    if (init.type === "ArrayExpression") {
      continue
    }

    // Collect shadowed names from enclosing function scope
    const enclosingShadowed = collectEnclosingScopeBindings(path)

    // Check if the initializer references any reactive values
    const reactiveRefs = findReactiveReferences(init, state, enclosingShadowed)

    if (reactiveRefs.length === 0) continue

    // Transform to thunk (lazy getter) - NOT useMemo
    // SolidJS approach: just wrap in () => to make it lazy, don't auto-memoize
    const transformedInit = transformToThunk(init, state, reactiveRefs)

    // Replace the initializer
    declarator.node.init = transformedInit

    // Register this as a computed binding (it's a derived getter)
    registerReactiveBinding(state, {
      type: "computed",
      name: id.name,
      getter: id.name,
    })
  }
}

/**
 * Check if we're inside a hook function definition (function useXxx() {...})
 * Hook implementations should return raw values, not auto-wrapped getters
 */
function isInsideHookDefinition(path: NodePath): boolean {
  let current = path.parentPath

  while (current) {
    // Check if we're inside a function declaration with a hook name
    if (current.isFunctionDeclaration()) {
      const funcName = current.node.id?.name
      if (funcName && funcName.startsWith("use")) {
        return true
      }
    }
    // Check if we're inside a function expression assigned to a hook name
    if (current.isFunctionExpression() || current.isArrowFunctionExpression()) {
      const parent = current.parentPath
      if (parent?.isVariableDeclarator()) {
        const id = parent.node.id
        if (id.type === "Identifier" && id.name.startsWith("use")) {
          return true
        }
      }
    }
    current = current.parentPath
  }

  return false
}

/**
 * Check if we're inside a hook call like useEffect, useMemo, etc.
 * We don't want to auto-wrap things inside effects
 */
function isInsideHookCall(path: NodePath): boolean {
  let current = path.parentPath

  while (current) {
    // Check if we're inside an arrow function that's an argument to a hook
    if (
      current.isArrowFunctionExpression() ||
      current.isFunctionExpression()
    ) {
      const parent = current.parentPath
      if (parent?.isCallExpression()) {
        const callee = parent.node.callee
        if (callee.type === "Identifier" && isHookCall(callee.name)) {
          return true
        }
      }
    }
    current = current.parentPath
  }

  return false
}

/**
 * Check if we're inside a nested function body (not the component function itself)
 * Variable declarations inside nested functions don't need auto-computed wrapping
 * because the function itself provides the lazy evaluation
 *
 * Example:
 *   function Component() {           // This is the component (level 0)
 *     const doubled = count * 2;     // Should be wrapped
 *     const handler = () => {        // Nested function (level 1)
 *       const x = state.todos;       // Should NOT be wrapped
 *     };
 *   }
 *
 * We detect nested functions by finding functions whose parent VariableDeclarator
 * is inside another function body (not at module/program level).
 */
function isInsideNestedFunction(path: NodePath): boolean {
  let current = path.parentPath

  while (current) {
    // Check if we're inside a function
    if (
      current.isFunctionDeclaration() ||
      current.isFunctionExpression() ||
      current.isArrowFunctionExpression()
    ) {
      // Check if this function is assigned to a variable
      const funcParent = current.parentPath
      if (funcParent?.isVariableDeclarator()) {
        // Check if the VariableDeclaration containing this function
        // is inside another function (not at module level)
        const varDecl = funcParent.parentPath // VariableDeclaration
        const varDeclParent = varDecl?.parentPath

        // If the variable declaration is inside a BlockStatement that's
        // inside a function, then we're in a nested function
        if (varDeclParent?.isBlockStatement()) {
          const blockParent = varDeclParent.parentPath
          if (
            blockParent?.isFunctionDeclaration() ||
            blockParent?.isFunctionExpression() ||
            blockParent?.isArrowFunctionExpression()
          ) {
            return true
          }
        }
      }
    }
    current = current.parentPath
  }

  return false
}

/**
 * Check if a function name is a hook call
 */
function isHookCall(name: string): boolean {
  return (
    name.startsWith("use") ||
    name === "signal" ||
    name === "computed" ||
    name === "effect" ||
    name === "resource" ||
    name === "createScope" ||
    name === "batch" ||
    name === "untrack" ||
    name === "onMount" ||
    name === "onCleanup"
  )
}

/**
 * Check if an expression contains an await expression
 */
function containsAwait(node: t.Node): boolean {
  if (node.type === "AwaitExpression") return true

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "type") continue

    const child = (node as Record<string, unknown>)[key]

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          if (containsAwait(item as t.Node)) return true
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      if (containsAwait(child as t.Node)) return true
    }
  }

  return false
}

/**
 * Collect binding names from enclosing function scope
 * This captures function parameters that should be treated as shadowed
 */
function collectEnclosingScopeBindings(path: NodePath): Set<string> {
  const bindings = new Set<string>()
  let current = path.parentPath

  while (current) {
    // Check function declarations
    if (current.isFunctionDeclaration() || current.isFunctionExpression() || current.isArrowFunctionExpression()) {
      const funcNode = current.node as t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression
      for (const param of funcNode.params) {
        collectBindingNames(param, bindings)
      }
      // Stop at the first enclosing function - we've found our scope
      break
    }

    current = current.parentPath
  }

  return bindings
}

/**
 * Find reactive references in an expression that are NOT already being called
 * If a signal is used as `signal()`, it's already invoked and doesn't need wrapping
 */
function findReactiveReferences(
  node: t.Node,
  state: PluginState,
  initialShadowed: Set<string> = new Set()
): Array<{ name: string; type: string }> {
  const refs: Array<{ name: string; type: string }> = []
  const seen = new Set<string>()

  traverseWithScopeAndParent(node, initialShadowed, null, (n, shadowedNames, parent) => {
    if (n.type === "Identifier") {
      // Skip if this name is shadowed by a local parameter
      if (shadowedNames.has(n.name)) return

      const binding = isReactiveIdentifier(state, n.name)
      if (binding && !seen.has(n.name)) {
        // Skip setters
        if (binding.setter === n.name) return

        // Skip if this identifier is already being called as callee of a CallExpression
        // e.g., contextState() - the signal is already invoked
        if (parent?.type === "CallExpression" && (parent as t.CallExpression).callee === n) {
          return
        }

        seen.add(n.name)
        refs.push({ name: n.name, type: binding.type })
      }
    }
    // Check for store member access
    else if (n.type === "MemberExpression") {
      const rootName = getRootIdentifier(n)
      if (rootName && !seen.has(rootName) && !shadowedNames.has(rootName)) {
        const binding = isReactiveIdentifier(state, rootName)
        if (binding?.type === "store") {
          seen.add(rootName)
          refs.push({ name: rootName, type: "store" })
        }
      }
    }
  })

  return refs
}

/**
 * Traverse with scope tracking and parent info
 */
function traverseWithScopeAndParent(
  node: t.Node,
  shadowedNames: Set<string>,
  parent: t.Node | null,
  visitor: (node: t.Node, shadowedNames: Set<string>, parent: t.Node | null) => void
): void {
  visitor(node, shadowedNames, parent)

  // Handle function expressions - collect parameter names as shadowed
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    const funcNode = node as t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration
    const newShadowed = new Set(shadowedNames)

    for (const param of funcNode.params) {
      collectBindingNames(param, newShadowed)
    }

    if (funcNode.body) {
      traverseWithScopeAndParent(funcNode.body, newShadowed, node, visitor)
    }
    return
  }

  // Handle member expressions - only traverse object, skip property if not computed
  if (node.type === "MemberExpression") {
    const memberNode = node as t.MemberExpression
    traverseWithScopeAndParent(memberNode.object, shadowedNames, node, visitor)
    if (memberNode.computed && memberNode.property) {
      traverseWithScopeAndParent(memberNode.property, shadowedNames, node, visitor)
    }
    return
  }

  // For other nodes, traverse children
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "type") continue

    const child = (node as Record<string, unknown>)[key]

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          traverseWithScopeAndParent(item as t.Node, shadowedNames, node, visitor)
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      traverseWithScopeAndParent(child as t.Node, shadowedNames, node, visitor)
    }
  }
}

/**
 * Transform expression to a thunk (lazy getter)
 *
 * SolidJS approach: wrap in () => to make it lazy/reactive
 * This does NOT memoize - just defers evaluation
 *
 * const doubled = count * 2
 * → const doubled = () => count() * 2
 */
function transformToThunk(
  init: t.Expression,
  state: PluginState,
  reactiveRefs: Array<{ name: string; type: string }>
): t.ArrowFunctionExpression {
  // Clone the expression
  const cloned = t.cloneNode(init, true) as t.Expression

  // Add () calls to signal/computed references
  addSignalCalls(cloned, state, reactiveRefs)

  // Wrap in arrow function () => ... (thunk, not memoized)
  return t.arrowFunctionExpression([], cloned)
}

/**
 * Add () calls to signal/computed references in expression
 */
function addSignalCalls(
  node: t.Node,
  state: PluginState,
  reactiveRefs: Array<{ name: string; type: string }>
): void {
  const signalNames = new Set(
    reactiveRefs
      .filter((r) => r.type === "signal" || r.type === "computed" || r.type === "resource")
      .map((r) => r.name)
  )

  traverseAndReplaceWithScope(node, new Set(), signalNames)
}

/**
 * Get root identifier from member expression
 */
function getRootIdentifier(node: t.MemberExpression): string | null {
  let current: t.Expression = node.object

  while (current.type === "MemberExpression") {
    current = current.object
  }

  if (current.type === "Identifier") {
    return current.name
  }

  return null
}

/**
 * Traverse AST with proper scope tracking
 * Tracks function parameters to know when names are shadowed
 */
function traverseWithScope(
  node: t.Node,
  shadowedNames: Set<string>,
  visitor: (node: t.Node, shadowedNames: Set<string>) => void
): void {
  visitor(node, shadowedNames)

  // Handle function expressions - collect parameter names as shadowed
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    const funcNode = node as t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration
    const newShadowed = new Set(shadowedNames)

    // Add all parameter names to shadowed set
    for (const param of funcNode.params) {
      collectBindingNames(param, newShadowed)
    }

    // Traverse body with new shadowed names
    if (funcNode.body) {
      traverseWithScope(funcNode.body, newShadowed, visitor)
    }
    return
  }

  // Handle member expressions - only traverse object, skip property if not computed
  // This prevents window.location from being confused with a signal named location
  if (node.type === "MemberExpression") {
    const memberNode = node as t.MemberExpression
    // Always traverse the object part
    traverseWithScope(memberNode.object, shadowedNames, visitor)
    // Only traverse property if it's computed (e.g., obj[key])
    if (memberNode.computed && memberNode.property) {
      traverseWithScope(memberNode.property, shadowedNames, visitor)
    }
    return
  }

  // For other nodes, traverse children
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "type") continue

    const child = (node as Record<string, unknown>)[key]

    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && "type" in item) {
          traverseWithScope(item as t.Node, shadowedNames, visitor)
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      traverseWithScope(child as t.Node, shadowedNames, visitor)
    }
  }
}

/**
 * Collect all binding names from a pattern (handles destructuring, etc.)
 */
function collectBindingNames(pattern: t.Node, names: Set<string>): void {
  if (pattern.type === "Identifier") {
    names.add(pattern.name)
  } else if (pattern.type === "ObjectPattern") {
    for (const prop of pattern.properties) {
      if (prop.type === "ObjectProperty") {
        collectBindingNames(prop.value, names)
      } else if (prop.type === "RestElement") {
        collectBindingNames(prop.argument, names)
      }
    }
  } else if (pattern.type === "ArrayPattern") {
    for (const element of pattern.elements) {
      if (element) {
        collectBindingNames(element, names)
      }
    }
  } else if (pattern.type === "RestElement") {
    collectBindingNames(pattern.argument, names)
  } else if (pattern.type === "AssignmentPattern") {
    collectBindingNames(pattern.left, names)
  }
}

/**
 * Traverse and replace with proper scope tracking
 */
function traverseAndReplaceWithScope(
  node: t.Node,
  shadowedNames: Set<string>,
  signalNames: Set<string>,
  parent?: t.Node,
  key?: string,
  index?: number
): void {
  // Handle function expressions - collect parameter names as shadowed
  if (
    node.type === "ArrowFunctionExpression" ||
    node.type === "FunctionExpression" ||
    node.type === "FunctionDeclaration"
  ) {
    const funcNode = node as t.ArrowFunctionExpression | t.FunctionExpression | t.FunctionDeclaration
    const newShadowed = new Set(shadowedNames)

    // Add all parameter names to shadowed set
    for (const param of funcNode.params) {
      collectBindingNames(param, newShadowed)
    }

    // Traverse body with new shadowed names (don't traverse params)
    if (funcNode.body) {
      traverseAndReplaceWithScope(funcNode.body, newShadowed, signalNames, funcNode, "body")
    }
    return
  }

  // Handle template literals specially
  if (node.type === "TemplateLiteral") {
    const templateNode = node as t.TemplateLiteral
    for (let i = 0; i < templateNode.expressions.length; i++) {
      const expr = templateNode.expressions[i]
      if (expr.type === "Identifier" && signalNames.has(expr.name) && !shadowedNames.has(expr.name)) {
        // Replace with call expression
        templateNode.expressions[i] = t.callExpression(t.identifier(expr.name), [])
      } else {
        traverseAndReplaceWithScope(expr, shadowedNames, signalNames, templateNode, "expressions", i)
      }
    }
    return
  }

  // Handle member expressions - only traverse object, skip property if not computed
  // This prevents window.location from being confused with a signal named location
  if (node.type === "MemberExpression") {
    const memberNode = node as t.MemberExpression
    // Always traverse the object part
    traverseAndReplaceWithScope(memberNode.object, shadowedNames, signalNames, node, "object")
    // Only traverse property if it's computed (e.g., obj[key])
    if (memberNode.computed && memberNode.property) {
      traverseAndReplaceWithScope(memberNode.property, shadowedNames, signalNames, node, "property")
    }
    return
  }

  // Handle identifiers
  if (node.type === "Identifier" && signalNames.has(node.name) && !shadowedNames.has(node.name)) {
    // Check if already being called
    if (parent?.type === "CallExpression" && (parent as t.CallExpression).callee === node) {
      return
    }

    // For signals in member expressions (e.g., items.reduce()), we NEED to add ()
    // items.reduce(...) → items().reduce(...)

    // Don't transform if it's an object property key
    if (parent?.type === "ObjectProperty" && (parent as t.ObjectProperty).key === node) {
      return
    }

    // Don't transform if it's a method definition key
    if (parent?.type === "ObjectMethod" && (parent as t.ObjectMethod).key === node) {
      return
    }

    // Replace with call
    if (parent && key !== undefined) {
      const callExpr = t.callExpression(t.identifier(node.name), [])
      if (index !== undefined) {
        ;(parent as Record<string, unknown[]>)[key][index] = callExpr
      } else {
        ;(parent as Record<string, unknown>)[key] = callExpr
      }
    }
    return
  }

  // For other nodes, traverse children
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "start" || k === "end" || k === "type") continue

    const child = (node as Record<string, unknown>)[k]

    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (child[i] && typeof child[i] === "object" && "type" in child[i]) {
          traverseAndReplaceWithScope(child[i] as t.Node, shadowedNames, signalNames, node, k, i)
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      traverseAndReplaceWithScope(child as t.Node, shadowedNames, signalNames, node, k)
    }
  }
}

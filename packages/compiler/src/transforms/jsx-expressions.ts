import type { NodePath } from "@babel/core"
import * as t from "@babel/types"
import {
  type PluginState,
  isReactiveIdentifier,
} from "../types.js"

/**
 * Transform JSX expression containers to be reactive
 *
 * {count + 1} → {() => count() + 1}
 * {state.user.name} → {() => state.user.name}
 * {count} → {count} (keep signal reference for simple cases)
 */
export function transformJSXExpression(
  path: NodePath<t.JSXExpressionContainer>,
  state: PluginState
): void {
  const expr = path.node.expression

  // Skip empty expressions
  if (expr.type === "JSXEmptyExpression") return

  // Skip if already wrapped in arrow function
  if (expr.type === "ArrowFunctionExpression") return

  // Skip function expressions
  if (expr.type === "FunctionExpression") return

  // Check if expression contains reactive references
  const reactiveRefs = findReactiveReferences(expr, state, new Set())

  if (reactiveRefs.length === 0) return

  // Simple identifier case: {count} - keep as signal/computed/resource reference
  if (expr.type === "Identifier") {
    const binding = isReactiveIdentifier(state, expr.name)
    if (binding && (binding.type === "signal" || binding.type === "computed" || binding.type === "resource")) {
      // Keep as-is for signal/computed/resource - Barq handles this
      return
    }
  }

  // For store access or complex expressions, wrap in arrow function
  // and add () calls to signal/computed accesses
  const transformedExpr = transformExpressionWithCalls(expr, state, new Set())

  path.node.expression = t.arrowFunctionExpression([], transformedExpr)
}

/**
 * Transform JSX attributes that need reactive wrapping
 *
 * class={isActive ? "active" : ""} → class={() => isActive() ? "active" : ""}
 * style={{color: textColor}} → style={() => ({color: textColor()})}
 */
export function transformJSXAttribute(
  path: NodePath<t.JSXAttribute>,
  state: PluginState
): void {
  const name = path.node.name
  const value = path.node.value

  // Skip non-JSX-identifier names
  if (name.type !== "JSXIdentifier") return

  // Skip event handlers - they're handled differently
  if (/^on[A-Z]/.test(name.name)) {
    transformEventHandler(path, state)
    return
  }

  // Skip ref attribute
  if (name.name === "ref") return

  // Only process expression containers
  if (!value || value.type !== "JSXExpressionContainer") return

  const expr = value.expression
  if (expr.type === "JSXEmptyExpression") return

  // Skip if already an arrow function
  if (expr.type === "ArrowFunctionExpression") return

  // Check if expression contains reactive references
  const reactiveRefs = findReactiveReferences(expr, state, new Set())

  if (reactiveRefs.length === 0) return

  // Simple identifier that's a signal/computed/resource - keep as reference for Barq
  if (expr.type === "Identifier") {
    const binding = isReactiveIdentifier(state, expr.name)
    if (binding && (binding.type === "signal" || binding.type === "computed" || binding.type === "resource")) {
      return
    }
  }

  // Wrap in arrow function with calls
  const transformedExpr = transformExpressionWithCalls(expr, state, new Set())
  value.expression = t.arrowFunctionExpression([], transformedExpr)
}

/**
 * Transform event handlers to add () calls to signal reads
 *
 * onClick={() => setCount(count + 1)} → onClick={() => setCount(count() + 1)}
 */
function transformEventHandler(
  path: NodePath<t.JSXAttribute>,
  state: PluginState
): void {
  const value = path.node.value
  if (!value || value.type !== "JSXExpressionContainer") return

  const expr = value.expression
  if (expr.type === "JSXEmptyExpression") return

  // Only transform arrow functions
  if (expr.type !== "ArrowFunctionExpression") return

  // Collect parameter names as shadowed
  const shadowedNames = new Set<string>()
  for (const param of expr.params) {
    collectBindingNames(param, shadowedNames)
  }

  // Transform the body to add () calls
  if (expr.body.type === "BlockStatement") {
    // Block body - transform statements
    transformBlockWithCalls(expr.body, state, shadowedNames)
  } else {
    // Expression body - transform expression
    expr.body = transformExpressionWithCalls(expr.body, state, shadowedNames)
  }
}

/**
 * Find all reactive references in an expression with scope tracking
 */
function findReactiveReferences(
  node: t.Node,
  state: PluginState,
  shadowedNames: Set<string>
): Array<{ name: string; type: string }> {
  const refs: Array<{ name: string; type: string }> = []

  traverseWithScope(node, shadowedNames, (n, currentShadowed) => {
    if (n.type === "Identifier") {
      // Skip if shadowed by a local parameter
      if (currentShadowed.has(n.name)) return

      const binding = isReactiveIdentifier(state, n.name)
      if (binding) {
        // Skip props - prop accesses don't need wrapping, handled by runtime
        if (binding.type === "prop") return

        refs.push({ name: n.name, type: binding.type })
      }
    }
    // Check for store member access: state.user.name
    else if (n.type === "MemberExpression") {
      const rootName = getRootIdentifier(n)
      if (rootName && !currentShadowed.has(rootName)) {
        const binding = isReactiveIdentifier(state, rootName)
        if (binding?.type === "store") {
          refs.push({ name: rootName, type: "store" })
        }
      }
    }
  })

  return refs
}

/**
 * Transform expression to add () calls to signal/computed reads with scope tracking
 */
function transformExpressionWithCalls(
  node: t.Expression,
  state: PluginState,
  shadowedNames: Set<string>
): t.Expression {
  // Deep clone to avoid mutating original
  const cloned = t.cloneNode(node, true)

  transformNodeWithCalls(cloned, state, shadowedNames)

  return cloned
}

/**
 * Transform a block statement to add () calls
 */
function transformBlockWithCalls(
  block: t.BlockStatement,
  state: PluginState,
  shadowedNames: Set<string>
): void {
  for (const stmt of block.body) {
    transformWithScopeAndReplace(stmt, state, shadowedNames)
  }
}

/**
 * Transform node in place to add () calls with scope tracking
 */
function transformNodeWithCalls(
  node: t.Node,
  state: PluginState,
  shadowedNames: Set<string>
): void {
  transformWithScopeAndReplace(node, state, shadowedNames)
}

/**
 * Transform with proper scope tracking and replace identifiers with calls
 */
function transformWithScopeAndReplace(
  node: t.Node,
  state: PluginState,
  shadowedNames: Set<string>,
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
      transformWithScopeAndReplace(funcNode.body, state, newShadowed, funcNode, "body")
    }
    return
  }

  // Handle template literals specially
  if (node.type === "TemplateLiteral") {
    const templateNode = node as t.TemplateLiteral
    for (let i = 0; i < templateNode.expressions.length; i++) {
      const expr = templateNode.expressions[i]
      if (expr.type === "Identifier" && !shadowedNames.has(expr.name)) {
        const binding = isReactiveIdentifier(state, expr.name)
        if (
          binding &&
          binding.setter !== expr.name &&
          binding.type !== "store" &&
          binding.type !== "prop" &&
          (binding.type === "signal" || binding.type === "computed" || binding.type === "resource")
        ) {
          templateNode.expressions[i] = t.callExpression(t.identifier(expr.name), [])
        }
      } else if (expr.type !== "Identifier") {
        // Recursively transform complex expressions in template literal
        transformWithScopeAndReplace(expr, state, shadowedNames, templateNode, "expressions", i)
      }
    }
    return
  }

  // Handle member expressions - only traverse object, skip property if not computed
  // This prevents e.target.value from being confused with a signal named "value"
  if (node.type === "MemberExpression") {
    const memberNode = node as t.MemberExpression
    const rootName = getRootIdentifier(memberNode)

    // For store access, don't recurse at all - store reactivity is handled by wrapper
    if (rootName && !shadowedNames.has(rootName)) {
      const binding = isReactiveIdentifier(state, rootName)
      if (binding?.type === "store") {
        return
      }
    }

    // Always traverse the object part
    transformWithScopeAndReplace(memberNode.object, state, shadowedNames, node, "object")
    // Only traverse property if it's computed (e.g., obj[key])
    if (memberNode.computed && memberNode.property) {
      transformWithScopeAndReplace(memberNode.property, state, shadowedNames, node, "property")
    }
    return
  }

  // Handle identifiers
  if (node.type === "Identifier") {
    // Skip if shadowed
    if (shadowedNames.has(node.name)) return

    const binding = isReactiveIdentifier(state, node.name)
    if (!binding) return

    // Skip setters
    if (binding.setter === node.name) return

    // Skip store identifiers (handled by wrapper)
    if (binding.type === "store") return

    // Skip prop identifiers (handled by wrapper)
    if (binding.type === "prop") return

    // For signals/computed/resources, add () call
    if (
      binding.type === "signal" ||
      binding.type === "computed" ||
      binding.type === "resource"
    ) {
      // Check if already being called
      if (parent?.type === "CallExpression" && (parent as t.CallExpression).callee === node) {
        return
      }

      // For resources accessing special properties like .loading, .error - skip
      // These are handled by Barq's resource system
      if (binding.type === "resource" && parent?.type === "MemberExpression" && (parent as t.MemberExpression).object === node) {
        return
      }

      // Accessor methods live on the signal itself: count.set(...),
      // count.update(...), count.peek() must NOT become count().set(...)
      if (parent?.type === "MemberExpression" && (parent as t.MemberExpression).object === node) {
        const memberParent = parent as t.MemberExpression
        if (
          !memberParent.computed &&
          memberParent.property.type === "Identifier" &&
          (memberParent.property.name === "set" ||
            memberParent.property.name === "update" ||
            memberParent.property.name === "peek")
        ) {
          return
        }
      }

      // For signals/computed in member expressions (e.g., items.join()), we NEED to add ()
      // items.join(", ") → items().join(", ")

      // Don't transform if it's an object property key
      if (parent?.type === "ObjectProperty" && (parent as t.ObjectProperty).key === node) {
        return
      }

      // Don't transform if it's a method definition key
      if (parent?.type === "ObjectMethod" && (parent as t.ObjectMethod).key === node) {
        return
      }

      // Replace identifier with call
      if (parent && key !== undefined) {
        const callExpr = t.callExpression(t.identifier(node.name), [])
        if (index !== undefined) {
          ;(parent as unknown as Record<string, unknown[]>)[key][index] = callExpr
        } else {
          ;(parent as unknown as Record<string, unknown>)[key] = callExpr
        }
      }
    }
    return
  }

  // For other nodes, traverse children
  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "start" || k === "end" || k === "type") continue

    const child = (node as unknown as Record<string, unknown>)[k]

    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (child[i] && typeof child[i] === "object" && "type" in child[i]) {
          transformWithScopeAndReplace(child[i] as t.Node, state, shadowedNames, node, k, i)
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      transformWithScopeAndReplace(child as t.Node, state, shadowedNames, node, k)
    }
  }
}

/**
 * Get root identifier from member expression
 * state.user.name → "state"
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
 * Traverse AST with proper scope tracking (read-only traversal for finding refs)
 */
function traverseWithScope(
  node: t.Node,
  shadowedNames: Set<string>,
  visitor: (node: t.Node, shadowedNames: Set<string>) => void
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

    // Traverse body with new shadowed names
    if (funcNode.body) {
      traverseWithScope(funcNode.body, newShadowed, visitor)
    }
    return
  }

  // Handle member expressions - only traverse object, skip property if not computed
  // This prevents item.id from being confused with a signal named "id"
  if (node.type === "MemberExpression") {
    const memberNode = node as t.MemberExpression
    visitor(node, shadowedNames)
    // Always traverse the object part
    traverseWithScope(memberNode.object, shadowedNames, visitor)
    // Only traverse property if it's computed (e.g., obj[key])
    if (memberNode.computed && memberNode.property) {
      traverseWithScope(memberNode.property, shadowedNames, visitor)
    }
    return
  }

  visitor(node, shadowedNames)

  // For other nodes, traverse children
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "type") continue

    const child = (node as unknown as Record<string, unknown>)[key]

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

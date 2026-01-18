import type { NodePath } from "@babel/core"
import * as t from "@babel/types"
import {
  type PluginState,
  DEFAULT_CONTROL_FLOW,
  DEFAULT_LIST_COMPONENTS,
  isReactiveIdentifier,
} from "../types.js"

/**
 * Transform control flow components to wrap children and conditions
 *
 * <Show when={isVisible}>
 *   <Content />
 * </Show>
 *
 * becomes:
 *
 * <Show when={() => isVisible()}>
 *   {() => <Content />}
 * </Show>
 */
export function transformControlFlow(
  path: NodePath<t.JSXElement>,
  state: PluginState
): void {
  const openingElement = path.node.openingElement
  const name = openingElement.name

  // Handle JSXMemberExpression like ThemeContext.Provider
  if (name.type === "JSXMemberExpression") {
    // Check if it ends with .Provider
    if (name.property.type === "JSXIdentifier" && name.property.name === "Provider") {
      transformProviderComponent(path, state)
    }
    return
  }

  // Only handle simple JSX identifiers for other transforms
  if (name.type !== "JSXIdentifier") return

  const componentName = name.name
  const opts = state.opts

  const controlFlowComponents = opts.controlFlowComponents ?? DEFAULT_CONTROL_FLOW
  const listComponents = opts.listComponents ?? DEFAULT_LIST_COMPONENTS

  // Check if it's a control flow component
  if (controlFlowComponents.includes(componentName)) {
    transformControlFlowComponent(path, state)
  }
  // Check if it's a list component
  else if (listComponents.includes(componentName)) {
    transformListComponent(path, state)
  }
  // Check if it's a Provider component (ends with Provider)
  else if (componentName.endsWith("Provider")) {
    transformProviderComponent(path, state)
  }
}

/**
 * Check if an identifier refers to a function in the Babel scope
 */
function isIdentifierFunction(path: NodePath, name: string): boolean {
  const binding = path.scope.getBinding(name)
  if (!binding) return false

  // Check if the binding is a variable declarator with a function initializer
  if (binding.path.isVariableDeclarator()) {
    const init = binding.path.node.init
    if (init?.type === "ArrowFunctionExpression" || init?.type === "FunctionExpression") {
      return true
    }
  }

  // Check if the binding is a function declaration
  if (binding.path.isFunctionDeclaration()) {
    return true
  }

  return false
}

/**
 * Transform control flow components (Show, Match, Switch, etc.)
 */
function transformControlFlowComponent(
  path: NodePath<t.JSXElement>,
  state: PluginState
): void {
  const openingElement = path.node.openingElement

  // Transform `when` and `fallback` props
  for (const attr of openingElement.attributes) {
    if (attr.type !== "JSXAttribute") continue
    if (attr.name.type !== "JSXIdentifier") continue

    const attrName = attr.name.name

    // Transform when={condition} → when={() => condition()}
    if (attrName === "when") {
      wrapAttributeInArrowFunction(attr, state, true, path)
    }
    // Transform fallback={<Fallback />} → fallback={() => <Fallback />}
    else if (attrName === "fallback") {
      wrapAttributeInArrowFunction(attr, state, false, path)
    }
  }

  // Transform children - wrap non-function children in () =>
  transformChildrenToCallbacks(path, state)
}

/**
 * Transform list components (For, Index)
 */
function transformListComponent(
  path: NodePath<t.JSXElement>,
  state: PluginState
): void {
  const openingElement = path.node.openingElement
  const componentName = (openingElement.name as t.JSXIdentifier).name

  // Transform `each` prop to be reactive
  for (const attr of openingElement.attributes) {
    if (attr.type !== "JSXAttribute") continue
    if (attr.name.type !== "JSXIdentifier") continue

    const attrName = attr.name.name

    // Transform each={items} → each={() => items()} if reactive
    if (attrName === "each") {
      wrapAttributeInArrowFunction(attr, state, true, path)
    }
    // Transform fallback
    else if (attrName === "fallback") {
      wrapAttributeInArrowFunction(attr, state, false, path)
    }
  }

  // For/Index children are callback functions, but we need to transform
  // the item access inside: {(item) => <li>{item.name}</li>}
  // → {(item) => <li>{() => item().name}</li>}
  transformListChildCallback(path, state, componentName)
}

/**
 * Transform Provider components to wrap children
 */
function transformProviderComponent(
  path: NodePath<t.JSXElement>,
  state: PluginState
): void {
  // Just wrap children in callback
  transformChildrenToCallbacks(path, state)
}

/**
 * Wrap an attribute value in arrow function if not already
 */
function wrapAttributeInArrowFunction(
  attr: t.JSXAttribute,
  state: PluginState,
  addCalls: boolean,
  path: NodePath<t.JSXElement>
): void {
  if (!attr.value) return

  // Handle expression container
  if (attr.value.type === "JSXExpressionContainer") {
    const expr = attr.value.expression

    if (expr.type === "JSXEmptyExpression") return

    // Skip if already an arrow function
    if (expr.type === "ArrowFunctionExpression") return

    // Skip if already a function expression
    if (expr.type === "FunctionExpression") return

    // If the expression is an identifier that refers to a function,
    // wrap with a call: filteredItems → () => filteredItems()
    if (expr.type === "Identifier" && isIdentifierFunction(path, expr.name)) {
      attr.value.expression = t.arrowFunctionExpression(
        [],
        t.callExpression(t.identifier(expr.name), [])
      )
      return
    }

    // Clone and transform expression
    let transformedExpr = t.cloneNode(expr, true) as t.Expression

    if (addCalls) {
      transformedExpr = addSignalCalls(transformedExpr, state, new Set())
    }

    // Wrap in arrow function
    attr.value.expression = t.arrowFunctionExpression([], transformedExpr)
  }
}

/**
 * Transform children of control flow component to callbacks
 */
function transformChildrenToCallbacks(
  path: NodePath<t.JSXElement>,
  state: PluginState
): void {
  const children = path.node.children

  for (let i = 0; i < children.length; i++) {
    const child = children[i]

    // Skip whitespace text
    if (child.type === "JSXText" && child.value.trim() === "") continue

    // JSX Element - wrap in callback: <Foo /> → {() => <Foo />}
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      children[i] = t.jsxExpressionContainer(
        t.arrowFunctionExpression([], child)
      )
    }
    // Expression container - wrap content in callback if not already
    else if (child.type === "JSXExpressionContainer") {
      const expr = child.expression

      if (expr.type === "JSXEmptyExpression") continue

      // Skip if already an arrow function
      if (expr.type === "ArrowFunctionExpression") continue

      // Skip function expressions
      if (expr.type === "FunctionExpression") continue

      // Wrap in arrow function
      child.expression = t.arrowFunctionExpression([], expr as t.Expression)
    }
  }
}

/**
 * Transform list component child callback
 * For: {(item, index) => <li>{item.name}</li>}
 * Index: {(item, index) => <li>{item.name}</li>}
 *
 * For `For`: item is a getter function, so item.name → item().name
 * For `Index`: item is a signal, so item → item() when used as value
 */
function transformListChildCallback(
  path: NodePath<t.JSXElement>,
  state: PluginState,
  componentName: string
): void {
  const children = path.node.children

  for (const child of children) {
    if (child.type !== "JSXExpressionContainer") continue

    const expr = child.expression
    if (expr.type !== "ArrowFunctionExpression") continue

    // Get parameter names
    const params = expr.params
    if (!Array.isArray(params)) continue
    const itemParam = params[0]
    const indexParam = params[1]

    // Collect parameter names that need () added
    const reactiveParams = new Set<string>()

    if (componentName === "For") {
      // In For:
      // - item is the actual value (stable reference), NOT a getter
      // - index is a getter () => number
      // So only index needs () calls
      if (indexParam?.type === "Identifier") {
        reactiveParams.add(indexParam.name)
      }
    } else if (componentName === "Index") {
      // In Index:
      // - item is a signal/getter () => T
      // - index is just a number, NOT a getter
      // So only item needs () calls
      if (itemParam?.type === "Identifier") {
        reactiveParams.add(itemParam.name)
      }
    }

    // Transform the callback body
    if (reactiveParams.size > 0) {
      transformListCallbackBody(expr, reactiveParams, componentName)
    }
  }
}

/**
 * Transform list callback body to add () calls to reactive params
 */
function transformListCallbackBody(
  callback: t.ArrowFunctionExpression,
  reactiveParams: Set<string>,
  componentName: string
): void {
  const body = callback.body

  // Track shadowed names from nested functions
  traverseWithScope(body, new Set(), (node, parent, key, shadowedNames, index) => {
    // Handle template literals specially
    if (node.type === "TemplateLiteral") {
      const templateNode = node as t.TemplateLiteral
      for (let i = 0; i < templateNode.expressions.length; i++) {
        const expr = templateNode.expressions[i]
        if (
          expr.type === "Identifier" &&
          reactiveParams.has(expr.name) &&
          !shadowedNames?.has(expr.name)
        ) {
          templateNode.expressions[i] = t.callExpression(t.identifier(expr.name), [])
        }
      }
      return "skip"
    }

    // Handle member expressions: item.name → item().name
    if (
      node.type === "MemberExpression" &&
      node.object.type === "Identifier" &&
      reactiveParams.has(node.object.name) &&
      !shadowedNames?.has(node.object.name)
    ) {
      // For `For` component, item is a getter: item.name → item().name
      if (componentName === "For") {
        node.object = t.callExpression(t.identifier(node.object.name), [])
      }
      return "skip" // Don't recurse into the transformed node
    }

    // Handle direct identifier usage (not in member expression)
    if (
      node.type === "Identifier" &&
      reactiveParams.has(node.name) &&
      !shadowedNames?.has(node.name) &&
      parent?.type !== "MemberExpression"
    ) {
      // Check if already being called
      if (parent?.type === "CallExpression" && parent.callee === node) {
        return
      }

      // Don't transform if it's an object property key
      if (parent?.type === "ObjectProperty" && (parent as t.ObjectProperty).key === node) {
        return
      }

      // For both For and Index, direct usage needs ()
      if (parent && key !== undefined) {
        const callExpr = t.callExpression(t.identifier(node.name), [])
        if (index !== undefined) {
          ;(parent as Record<string, unknown[]>)[key as string][index] = callExpr
        } else {
          ;(parent as Record<string, unknown>)[key as string] = callExpr
        }
      }
    }
  })
}

/**
 * Add signal calls to an expression with proper scope tracking
 */
function addSignalCalls(
  expr: t.Expression,
  state: PluginState,
  shadowedNames: Set<string>
): t.Expression {
  // Handle top-level identifier case: visible → visible()
  if (expr.type === "Identifier") {
    if (shadowedNames.has(expr.name)) return expr

    const binding = isReactiveIdentifier(state, expr.name)
    if (
      binding &&
      binding.setter !== expr.name &&
      binding.type !== "store" &&
      binding.type !== "prop" &&
      (binding.type === "signal" || binding.type === "computed" || binding.type === "resource")
    ) {
      return t.callExpression(t.identifier(expr.name), [])
    }
    return expr
  }

  // For complex expressions, traverse and transform with scope tracking
  traverseWithScope(expr, shadowedNames, (node, parent, key, currentShadowed, index) => {
    // Handle template literals specially
    if (node.type === "TemplateLiteral") {
      const templateNode = node as t.TemplateLiteral
      for (let i = 0; i < templateNode.expressions.length; i++) {
        const texpr = templateNode.expressions[i]
        if (texpr.type === "Identifier" && !currentShadowed.has(texpr.name)) {
          const binding = isReactiveIdentifier(state, texpr.name)
          if (
            binding &&
            binding.setter !== texpr.name &&
            binding.type !== "store" &&
            binding.type !== "prop" &&
            (binding.type === "signal" || binding.type === "computed" || binding.type === "resource")
          ) {
            templateNode.expressions[i] = t.callExpression(t.identifier(texpr.name), [])
          }
        }
      }
      return "skip"
    }

    if (node.type === "Identifier") {
      if (currentShadowed.has(node.name)) return

      const binding = isReactiveIdentifier(state, node.name)

      if (!binding) return
      if (binding.setter === node.name) return
      if (binding.type === "store") return
      if (binding.type === "prop") return

      if (
        binding.type === "signal" ||
        binding.type === "computed" ||
        binding.type === "resource"
      ) {
        // Check if already being called
        if (parent?.type === "CallExpression" && parent.callee === node) {
          return
        }

        // For resources accessing special properties like .loading, .error, .refetch - skip
        // These are accessed directly on the resource object, not on the data
        if (binding.type === "resource" && parent?.type === "MemberExpression" && (parent as t.MemberExpression).object === node) {
          return
        }

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
      }
    }
  })

  return expr
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
 * Traverse and transform AST in place with proper scope tracking
 */
function traverseWithScope(
  node: t.Node,
  shadowedNames: Set<string>,
  visitor: (
    node: t.Node,
    parent?: t.Node,
    key?: string,
    shadowedNames?: Set<string>,
    index?: number
  ) => void | "skip",
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
      traverseWithScope(funcNode.body, newShadowed, visitor, funcNode, "body")
    }
    return
  }

  const result = visitor(node, parent, key, shadowedNames, index)
  if (result === "skip") return

  for (const k of Object.keys(node)) {
    if (k === "loc" || k === "start" || k === "end" || k === "type") continue

    const child = (node as Record<string, unknown>)[k]

    if (Array.isArray(child)) {
      for (let i = 0; i < child.length; i++) {
        if (child[i] && typeof child[i] === "object" && "type" in child[i]) {
          traverseWithScope(child[i] as t.Node, shadowedNames, visitor, node, k, i)
        }
      }
    } else if (child && typeof child === "object" && "type" in child) {
      traverseWithScope(child as t.Node, shadowedNames, visitor, node, k)
    }
  }
}

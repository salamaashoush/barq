import type { NodePath } from "@babel/core"
import type * as t from "@babel/types"
import {
  type PluginState,
  type ReactiveBinding,
  registerReactiveBinding,
} from "../types.js"

/**
 * Reactive hooks that return [getter, setter] tuple
 */
const SIGNAL_HOOKS = new Set(["useState", "signal", "useLocalStorage"])

/**
 * Reactive hooks that return [state, setState] for stores
 */
const STORE_HOOKS = new Set(["useStore"])

/**
 * Reactive hooks that return computed values
 */
const COMPUTED_HOOKS = new Set(["useMemo", "computed"])

/**
 * Reactive hooks that return resources
 */
const RESOURCE_HOOKS = new Set(["useResource", "resource"])

/**
 * Reactive hooks that return context getters
 */
const CONTEXT_HOOKS = new Set(["useContext"])

/**
 * Track reactive sources from variable declarations
 *
 * Detects patterns like:
 * - const [count, setCount] = useState(0)
 * - const [state, setState] = useStore({...})
 * - const doubled = useMemo(() => count * 2)
 * - const [data] = useResource(...)
 */
export function trackReactiveSources(
  path: NodePath<t.VariableDeclaration>,
  state: PluginState
): void {
  for (const declarator of path.node.declarations) {
    if (!declarator.init) continue

    // Check if it's a call expression
    if (declarator.init.type !== "CallExpression") continue

    const callee = declarator.init.callee
    if (callee.type !== "Identifier") continue

    const hookName = callee.name

    // Handle [getter, setter] = useState/signal pattern
    if (SIGNAL_HOOKS.has(hookName)) {
      trackSignalBinding(declarator, state)
    }
    // Handle [state, setState] = useStore pattern
    else if (STORE_HOOKS.has(hookName)) {
      trackStoreBinding(declarator, state)
    }
    // Handle computed = useMemo pattern
    else if (COMPUTED_HOOKS.has(hookName)) {
      trackComputedBinding(declarator, state)
    }
    // Handle [resource] = useResource pattern
    else if (RESOURCE_HOOKS.has(hookName)) {
      trackResourceBinding(declarator, state)
    }
    // Handle context = useContext pattern (returns getter)
    else if (CONTEXT_HOOKS.has(hookName)) {
      trackContextBinding(declarator, state)
    }
  }
}

/**
 * Track signal bindings: const [count, setCount] = useState(0)
 */
function trackSignalBinding(
  declarator: t.VariableDeclarator,
  state: PluginState
): void {
  const id = declarator.id

  // Array destructuring: [count, setCount]
  if (id.type === "ArrayPattern" && id.elements.length >= 1) {
    const getter = id.elements[0]
    const setter = id.elements[1]

    if (getter?.type === "Identifier") {
      const binding: ReactiveBinding = {
        type: "signal",
        name: getter.name,
        getter: getter.name,
      }

      if (setter?.type === "Identifier") {
        binding.setter = setter.name
      }

      registerReactiveBinding(state, binding)
    }
  }
  // Direct assignment: const count = signal(0)
  else if (id.type === "Identifier") {
    registerReactiveBinding(state, {
      type: "signal",
      name: id.name,
      getter: id.name,
    })
  }
}

/**
 * Track store bindings: const [state, setState] = useStore({...})
 */
function trackStoreBinding(
  declarator: t.VariableDeclarator,
  state: PluginState
): void {
  const id = declarator.id

  // Array destructuring: [state, setState]
  if (id.type === "ArrayPattern" && id.elements.length >= 1) {
    const storeVar = id.elements[0]
    const setter = id.elements[1]

    if (storeVar?.type === "Identifier") {
      const binding: ReactiveBinding = {
        type: "store",
        name: storeVar.name,
        storeName: storeVar.name,
      }

      if (setter?.type === "Identifier") {
        binding.setter = setter.name
      }

      registerReactiveBinding(state, binding)
    }
  }
}

/**
 * Track computed bindings: const doubled = useMemo(() => count * 2)
 */
function trackComputedBinding(
  declarator: t.VariableDeclarator,
  state: PluginState
): void {
  const id = declarator.id

  if (id.type === "Identifier") {
    registerReactiveBinding(state, {
      type: "computed",
      name: id.name,
      getter: id.name,
    })
  }
}

/**
 * Track resource bindings: const [data] = useResource(...)
 */
function trackResourceBinding(
  declarator: t.VariableDeclarator,
  state: PluginState
): void {
  const id = declarator.id

  // Array destructuring: [resource] or [resource, { refetch }]
  if (id.type === "ArrayPattern" && id.elements.length >= 1) {
    const resource = id.elements[0]

    if (resource?.type === "Identifier") {
      registerReactiveBinding(state, {
        type: "resource",
        name: resource.name,
        getter: resource.name,
      })
    }
  }
  // Direct: const resource = useResource(...)
  else if (id.type === "Identifier") {
    registerReactiveBinding(state, {
      type: "resource",
      name: id.name,
      getter: id.name,
    })
  }
}

/**
 * Track context bindings: const theme = useContext(ThemeContext)
 * useContext returns a getter function () => T
 */
function trackContextBinding(
  declarator: t.VariableDeclarator,
  state: PluginState
): void {
  const id = declarator.id

  if (id.type === "Identifier") {
    // useContext returns a getter, so treat it like computed
    registerReactiveBinding(state, {
      type: "computed",
      name: id.name,
      getter: id.name,
    })
  }
}

/**
 * Track component props as potentially reactive
 */
export function trackPropsAsReactive(
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>,
  state: PluginState
): void {
  const params = path.node.params
  if (!params || !Array.isArray(params) || params.length === 0) return

  const firstParam = params[0]

  // props object: function Component(props)
  if (firstParam.type === "Identifier") {
    registerReactiveBinding(state, {
      type: "prop",
      name: firstParam.name,
    })
  }
  // Destructured props: function Component({ count, name })
  else if (firstParam.type === "ObjectPattern" && Array.isArray(firstParam.properties)) {
    for (const prop of firstParam.properties) {
      if (prop.type === "ObjectProperty" && prop.value.type === "Identifier") {
        registerReactiveBinding(state, {
          type: "prop",
          name: prop.value.name,
        })
      } else if (prop.type === "RestElement" && prop.argument.type === "Identifier") {
        registerReactiveBinding(state, {
          type: "prop",
          name: prop.argument.name,
        })
      }
    }
  }
}

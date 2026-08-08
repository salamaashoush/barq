import type { PluginObj, PluginPass } from "@babel/core"
import type * as BabelTypes from "@babel/types"
import {
  type PluginState,
  type BarqCompilerOptions,
  pushScope,
  popScope,
  DEFAULT_CONTROL_FLOW,
  DEFAULT_LIST_COMPONENTS,
} from "./types.js"
import {
  trackReactiveSources,
  trackPropsAsReactive,
} from "./transforms/track-reactive-sources.js"
import {
  transformJSXExpression,
  transformJSXAttribute,
} from "./transforms/jsx-expressions.js"
import { transformControlFlow } from "./transforms/control-flow.js"
import { transformAutoComputed } from "./transforms/auto-computed.js"
import {
  finalizeTemplates,
  transformTemplateCodegen,
} from "./transforms/template-codegen.js"

/**
 * Barq Babel Plugin
 *
 * Transforms clean JSX into fine-grained reactive code.
 *
 * Example:
 * ```tsx
 * const [count, setCount] = useState(0)
 * const doubled = count * 2
 *
 * <Show when={count > 0}>
 *   <div>{doubled}</div>
 * </Show>
 * ```
 *
 * Becomes:
 * ```tsx
 * const [count, setCount] = useState(0)
 * const doubled = useMemo(() => count() * 2)
 *
 * <Show when={() => count() > 0}>
 *   {() => <div>{doubled}</div>}
 * </Show>
 * ```
 */
export default function barqPlugin(
  { types: t }: { types: typeof BabelTypes }
): PluginObj<PluginPass & { barqState: PluginState }> {
  return {
    name: "barq-compiler",

    pre(this: PluginPass & { barqState: PluginState }) {
      const opts = (this.opts || {}) as BarqCompilerOptions

      this.barqState = {
        opts: {
          autoComputed: opts.autoComputed ?? true,
          controlFlowComponents: opts.controlFlowComponents ?? DEFAULT_CONTROL_FLOW,
          listComponents: opts.listComponents ?? DEFAULT_LIST_COMPONENTS,
          providerComponents: opts.providerComponents ?? [],
          moduleSource: opts.moduleSource ?? "@barqjs/core",
          dev: opts.dev ?? false,
          templates: opts.templates ?? true,
        },
        scopeStack: [{ reactiveBindings: new Map() }],
        needsUseMemo: false,
        barqImports: new Set(),
        importAliases: new Map(),
        filename: this.filename,
      }
    },

    visitor: {
      // Track imports from barq to know what reactive primitives are used
      ImportDeclaration(path, passState) {
        const state = (passState as PluginPass & { barqState: PluginState }).barqState
        const source = path.node.source.value

        if (source === state.opts.moduleSource || source === "@barqjs/core") {
          for (const specifier of path.node.specifiers) {
            if (specifier.type === "ImportSpecifier") {
              const imported =
                specifier.imported.type === "Identifier"
                  ? specifier.imported.name
                  : specifier.imported.value

              state.barqImports.add(imported)

              // Renamed import: local name maps back to the canonical hook
              if (specifier.local.name !== imported) {
                state.importAliases?.set(specifier.local.name, imported)
              }
            }
          }
        }
      },

      // Track function declarations (components)
      FunctionDeclaration: {
        enter(path, passState) {
          const state = (passState as PluginPass & { barqState: PluginState }).barqState

          // Check if this looks like a component (PascalCase)
          const name = path.node.id?.name
          if (!name || !/^[A-Z]/.test(name)) return

          pushScope(state)
          trackPropsAsReactive(path, state)
        },
        exit(path, passState) {
          const state = (passState as PluginPass & { barqState: PluginState }).barqState
          const name = path.node.id?.name
          if (!name || !/^[A-Z]/.test(name)) return

          popScope(state)
        },
      },

      // Track arrow functions that are components
      ArrowFunctionExpression: {
        enter(path, passState) {
          const state = (passState as PluginPass & { barqState: PluginState }).barqState

          // Check if parent is a variable declarator with PascalCase name
          const parent = path.parent
          if (
            parent.type === "VariableDeclarator" &&
            parent.id.type === "Identifier" &&
            /^[A-Z]/.test(parent.id.name)
          ) {
            pushScope(state)
            trackPropsAsReactive(path, state)
          }
        },
        exit(path, passState) {
          const state = (passState as PluginPass & { barqState: PluginState }).barqState

          const parent = path.parent
          if (
            parent.type === "VariableDeclarator" &&
            parent.id.type === "Identifier" &&
            /^[A-Z]/.test(parent.id.name)
          ) {
            popScope(state)
          }
        },
      },

      // Track variable declarations for reactive sources
      VariableDeclaration(path, passState) {
        const state = (passState as PluginPass & { barqState: PluginState }).barqState

        // First, track any reactive sources (useState, useStore, etc.)
        trackReactiveSources(path, state)

        // Then, check for auto-computed opportunities
        transformAutoComputed(path, state)
      },

      // Transform JSX elements
      JSXElement(path, passState) {
        const state = (passState as PluginPass & { barqState: PluginState }).barqState

        // Transform control flow components
        transformControlFlow(path, state)
      },

      // Transform JSX expression containers
      JSXExpressionContainer(path, passState) {
        const state = (passState as PluginPass & { barqState: PluginState }).barqState

        // Skip if inside JSXAttribute - handled separately
        if (path.parentPath?.isJSXAttribute()) return

        transformJSXExpression(path, state)
      },

      // Transform JSX attributes
      JSXAttribute(path, passState) {
        const state = (passState as PluginPass & { barqState: PluginState }).barqState
        transformJSXAttribute(path, state)
      },

      // Add useMemo import if needed
      Program: {
        exit(path, passState) {
          const state = (passState as PluginPass & { barqState: PluginState }).barqState

          // Optimizing pass: after all reactive-wrapping transforms ran,
          // compile outermost intrinsic JSX trees to cloneable templates
          if (state.opts.templates !== false) {
            path.traverse({
              JSXElement(jsxPath) {
                transformTemplateCodegen(jsxPath, state)
              },
            })
            finalizeTemplates(path, state)
          }

          if (state.needsUseMemo && !state.barqImports.has("useMemo")) {
            // Find existing barq import
            let barqImport: BabelTypes.ImportDeclaration | null = null

            for (const stmt of path.node.body) {
              if (
                stmt.type === "ImportDeclaration" &&
                (stmt.source.value === state.opts.moduleSource ||
                  stmt.source.value === "@barqjs/core")
              ) {
                barqImport = stmt
                break
              }
            }

            if (barqImport) {
              // Add useMemo to existing import
              barqImport.specifiers.push(
                t.importSpecifier(t.identifier("useMemo"), t.identifier("useMemo"))
              )
            } else {
              // Create new import
              const importDecl = t.importDeclaration(
                [t.importSpecifier(t.identifier("useMemo"), t.identifier("useMemo"))],
                t.stringLiteral(state.opts.moduleSource ?? "@barqjs/core")
              )
              path.node.body.unshift(importDecl)
            }
          }
        },
      },
    },
  }
}

export { barqPlugin }
export type { BarqCompilerOptions }

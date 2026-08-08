import type { NodePath } from "@babel/core"
import * as t from "@babel/types"
import type { PluginState } from "../types.js"

/**
 * Template-cloning codegen (the optimizing pass).
 *
 * Outermost intrinsic JSX trees compile to a hoisted static template that
 * is cloned per instance, with precomputed firstChild/nextSibling walks to
 * the dynamic "holes":
 *
 *   <div class="card"><span>Hi {name()}</span></div>
 *   →
 *   const _tmpl$ = _$template(`<div class="card"><span>Hi <!----></span></div>`)
 *   (() => {
 *     const _el$ = _tmpl$()
 *     const _el$2 = _el$.firstChild
 *     _$insert(_el$2, () => name(), _el$2.firstChild.nextSibling)
 *     return _el$
 *   })()
 *
 * Static attributes and text are baked into the HTML; dynamic attributes,
 * events and refs go through _$setProp; expression/component children go
 * through _$insert against comment placeholders. Elements with spreads or
 * innerHTML bail out of inlining and become insert holes (runtime path).
 */

interface TemplateState {
  templates: Array<{ id: t.Identifier; html: string; isSVG: boolean }>
  imports: Set<string>
}

const templateStates = new WeakMap<PluginState, TemplateState>()

function getTemplateState(state: PluginState): TemplateState {
  let ts = templateStates.get(state)
  if (!ts) {
    ts = { templates: [], imports: new Set() }
    templateStates.set(state, ts)
  }
  return ts
}

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
])

const SVG_TAGS = new Set([
  "svg",
  "path",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
  "rect",
  "g",
  "defs",
  "use",
  "text",
  "tspan",
  "linearGradient",
  "radialGradient",
  "stop",
  "filter",
  "mask",
  "pattern",
  "marker",
  "symbol",
  "clipPath",
  "foreignObject",
  "image",
])

/** Properties that must be set via setProp even when static (form state) */
const PROPERTY_ATTRS = new Set([
  "value",
  "checked",
  "selected",
  "indeterminate",
  "innerHTML",
  "innerText",
  "textContent",
])

/** Tags whose text content is whitespace-sensitive */
const PRESERVE_WHITESPACE = new Set(["pre", "textarea"])

type HolePath = number[]

interface PropOp {
  kind: "prop"
  path: HolePath
  name: string
  expr: t.Expression
}

interface SpreadOp {
  kind: "spread"
  path: HolePath
  // Getter returning the merged props object (spreads + named attrs, in order)
  expr: t.Expression
}

interface InsertOp {
  kind: "insert"
  parentPath: HolePath
  markerPath: HolePath | null // null: append at end of parent
  expr: t.Expression
}

type Op = PropOp | SpreadOp | InsertOp

interface BuildContext {
  ops: Op[]
  bailed: boolean
}

function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

/** JSX text semantics: drop whitespace-only lines, join lines, collapse */
function cleanJSXText(raw: string): string {
  if (!raw.includes("\n")) return raw
  const lines = raw.split("\n")
  const kept: string[] = []
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]
    if (i !== 0) line = line.replace(/^\s+/, "")
    if (i !== lines.length - 1) line = line.replace(/\s+$/, "")
    if (line.length > 0) kept.push(line)
  }
  return kept.join(" ")
}

function isIntrinsicElement(node: t.JSXElement): boolean {
  const name = node.openingElement.name
  return name.type === "JSXIdentifier" && /^[a-z]/.test(name.name)
}

function attrName(name: t.JSXIdentifier | t.JSXNamespacedName): string {
  if (name.type === "JSXIdentifier") return name.name
  return `${name.namespace.name}:${name.name.name}`
}

function staticAttrValue(value: t.JSXAttribute["value"]): string | true | null {
  // <input disabled /> → boolean attribute
  if (value === null || value === undefined) return true
  if (value.type === "StringLiteral") return value.value
  if (value.type === "JSXExpressionContainer") {
    const expr = value.expression
    if (expr.type === "StringLiteral") return expr.value
    if (expr.type === "NumericLiteral") return String(expr.value)
    if (expr.type === "BooleanLiteral") return expr.value ? true : null
  }
  return null
}

/**
 * Build template HTML + ops for an intrinsic element subtree.
 * Returns null when the element can't be inlined (spread, innerHTML).
 */
function buildElement(node: t.JSXElement, path: HolePath, ctx: BuildContext): string | null {
  const opening = node.openingElement
  const tag = (opening.name as t.JSXIdentifier).name

  let html = `<${tag}`

  const hasSpread = opening.attributes.some((a) => a.type === "JSXSpreadAttribute")

  if (hasSpread) {
    // Spread present: all attributes funnel through one reactive _$spread
    // with a merged getter (order preserved: later wins). The template
    // stays - only attribute handling moves to the runtime.
    const objectProps: Array<t.ObjectProperty | t.SpreadElement> = []
    for (const attr of opening.attributes) {
      if (attr.type === "JSXSpreadAttribute") {
        objectProps.push(t.spreadElement(attr.argument))
        continue
      }
      const name = attrName(attr.name)
      if (name === "dangerouslySetInnerHTML") return null // bail: runtime path
      const expr = attrExpression(attr)
      if (expr) {
        objectProps.push(t.objectProperty(t.stringLiteral(name), expr))
      }
    }
    ctx.ops.push({
      kind: "spread",
      path,
      expr: t.arrowFunctionExpression([], t.objectExpression(objectProps)),
    })
  } else {
    for (const attr of opening.attributes) {
      const name = attrName((attr as t.JSXAttribute).name)

      if (name === "dangerouslySetInnerHTML") {
        return null // bail: runtime path
      }

      // Events, refs and property-backed attrs always go through setProp
      if (/^on[A-Z]/.test(name) || name === "ref" || PROPERTY_ATTRS.has(name)) {
        const expr = attrExpression(attr as t.JSXAttribute)
        if (expr) {
          const wrapped = /^on[A-Z]/.test(name) || name === "ref" ? expr : wrapDynamicExpr(expr)
          ctx.ops.push({ kind: "prop", path, name, expr: wrapped })
        }
        continue
      }

      const staticValue = staticAttrValue((attr as t.JSXAttribute).value)
      if (staticValue === true) {
        html += ` ${normalizeAttrName(name)}`
      } else if (typeof staticValue === "string") {
        html += ` ${normalizeAttrName(name)}="${escapeAttr(staticValue)}"`
      } else if (staticValue === null && (attr as t.JSXAttribute).value) {
        const expr = attrExpression(attr as t.JSXAttribute)
        if (expr) ctx.ops.push({ kind: "prop", path, name, expr: wrapDynamicExpr(expr) })
      }
    }
  }

  if (VOID_ELEMENTS.has(tag)) {
    return `${html}>`
  }
  html += ">"

  const preserveWhitespace = PRESERVE_WHITESPACE.has(tag)
  html += buildChildren(node.children, path, ctx, preserveWhitespace)

  return `${html}</${tag}>`
}

function normalizeAttrName(name: string): string {
  if (name === "className") return "class"
  if (name === "htmlFor") return "for"
  return name
}

/**
 * Wrap a dynamic expression in a thunk so the runtime re-evaluates it
 * reactively. Plain identifiers pass through (signal accessors are already
 * callable; static vars stay static), as do existing functions, component
 * JSX (created once), and literals. Everything else - member reads like
 * `user.score` on store proxies, conditionals, calls - must be lazy or
 * fine-grained updates have no subscriber.
 */
function wrapDynamicExpr(expr: t.Expression): t.Expression {
  switch (expr.type) {
    case "ArrowFunctionExpression":
    case "FunctionExpression":
    case "Identifier":
    case "JSXElement":
    case "JSXFragment":
    case "StringLiteral":
    case "NumericLiteral":
    case "BooleanLiteral":
    case "NullLiteral":
      return expr
    default:
      return t.arrowFunctionExpression([], expr)
  }
}

function attrExpression(attr: t.JSXAttribute): t.Expression | null {
  const value = attr.value
  if (!value) return t.booleanLiteral(true)
  if (value.type === "StringLiteral") return value
  if (value.type === "JSXExpressionContainer") {
    if (value.expression.type === "JSXEmptyExpression") return null
    return value.expression as t.Expression
  }
  if (value.type === "JSXElement" || value.type === "JSXFragment") {
    return value
  }
  return null
}

/**
 * Build children HTML; dynamic children become comment placeholders with
 * insert ops. Tracks DOM child indexes (consecutive text fuses into one
 * text node when parsed).
 */
function buildChildren(
  children: Array<
    t.JSXText | t.JSXExpressionContainer | t.JSXSpreadChild | t.JSXElement | t.JSXFragment
  >,
  parentPath: HolePath,
  ctx: BuildContext,
  preserveWhitespace: boolean,
): string {
  let html = ""
  let domIndex = 0
  let lastWasText = false

  const appendText = (text: string) => {
    if (text.length === 0) return
    html += escapeHtmlText(text)
    if (!lastWasText) {
      domIndex++
      lastWasText = true
    }
  }

  const appendNodeHtml = (chunk: string) => {
    html += chunk
    domIndex++
    lastWasText = false
  }

  // A hole that nothing follows needs no placeholder: insert() appends at the
  // end of the parent. Only the last emitting child qualifies - two holes both
  // anchored at "the end" would interleave each other's nodes on update.
  const emitsNothing = (child: t.Node): boolean => {
    if (child.type === "JSXText") {
      return (preserveWhitespace ? child.value : cleanJSXText(child.value)) === ""
    }
    return (
      child.type === "JSXExpressionContainer" &&
      child.expression.type === "JSXEmptyExpression"
    )
  }
  let lastEmittingIndex = -1
  for (let i = children.length - 1; i >= 0; i--) {
    if (!emitsNothing(children[i])) {
      lastEmittingIndex = i
      break
    }
  }

  for (let childIndex = 0; childIndex < children.length; childIndex++) {
    const child = children[childIndex]
    const isTrailingHole = childIndex === lastEmittingIndex
    if (child.type === "JSXText") {
      const text = preserveWhitespace ? child.value : cleanJSXText(child.value)
      appendText(text)
      continue
    }

    if (child.type === "JSXExpressionContainer") {
      const expr = child.expression
      if (expr.type === "JSXEmptyExpression") continue
      if (expr.type === "StringLiteral") {
        appendText(expr.value)
        continue
      }
      if (expr.type === "NumericLiteral") {
        appendText(String(expr.value))
        continue
      }
      // Dynamic hole with comment placeholder (thunked: lazy + reactive)
      ctx.ops.push({
        kind: "insert",
        parentPath,
        markerPath: isTrailingHole ? undefined : [...parentPath, domIndex],
        expr: wrapDynamicExpr(expr as t.Expression),
      })
      if (!isTrailingHole) appendNodeHtml("<!---->")
      continue
    }

    if (child.type === "JSXSpreadChild") {
      ctx.ops.push({
        kind: "insert",
        parentPath,
        markerPath: isTrailingHole ? undefined : [...parentPath, domIndex],
        expr: child.expression,
      })
      if (!isTrailingHole) appendNodeHtml("<!---->")
      continue
    }

    if (child.type === "JSXFragment") {
      ctx.ops.push({
        kind: "insert",
        parentPath,
        markerPath: isTrailingHole ? undefined : [...parentPath, domIndex],
        expr: child as unknown as t.Expression,
      })
      if (!isTrailingHole) appendNodeHtml("<!---->")
      continue
    }

    // JSXElement
    if (isIntrinsicElement(child)) {
      const childHtml = buildElement(child, [...parentPath, domIndex], ctx)
      if (childHtml !== null) {
        appendNodeHtml(childHtml)
        continue
      }
      // Bailed (spread/innerHTML): fall through to insert hole
    }

    // Component (or bailed intrinsic): runtime-created, inserted at hole
    ctx.ops.push({
      kind: "insert",
      parentPath,
      markerPath: isTrailingHole ? undefined : [...parentPath, domIndex],
      expr: child as unknown as t.Expression,
    })
    if (!isTrailingHole) appendNodeHtml("<!---->")
  }

  return html
}

/**
 * Generate the per-instance code: clone, walk to holes, run ops.
 */
function generateInstance(
  templateId: t.Identifier,
  ops: Op[],
  state: PluginState,
): t.Expression {
  const ts = getTemplateState(state)
  const statements: t.Statement[] = []
  const rootId = t.identifier("_el$")

  statements.push(
    t.variableDeclaration("const", [
      t.variableDeclarator(rootId, t.callExpression(templateId, [])),
    ]),
  )

  // Cache walked refs: pathKey -> identifier (root is "")
  const refs = new Map<string, t.Identifier>()
  refs.set("", rootId)
  let refCounter = 1

  const getRef = (path: HolePath): t.Identifier => {
    const key = path.join(".")
    const cached = refs.get(key)
    if (cached) return cached

    const parentPath = path.slice(0, -1)
    const index = path[path.length - 1]

    // Prefer stepping from the closest already-walked sibling: re-walking
    // `firstChild.nextSibling...` from the parent for each child makes a row
    // of n holes cost O(n^2) member reads at clone time.
    let from: t.Expression | null = null
    let steps = 0
    for (let j = index - 1; j >= 0; j--) {
      const sibling = refs.get([...parentPath, j].join("."))
      if (sibling) {
        from = sibling
        steps = index - j
        break
      }
    }

    let expr: t.Expression
    if (from !== null) {
      expr = from
      for (let i = 0; i < steps; i++) {
        expr = t.memberExpression(expr, t.identifier("nextSibling"))
      }
    } else {
      expr = t.memberExpression(getRef(parentPath), t.identifier("firstChild"))
      for (let i = 0; i < index; i++) {
        expr = t.memberExpression(expr, t.identifier("nextSibling"))
      }
    }

    const id = t.identifier(`_el$${++refCounter}`)
    statements.push(t.variableDeclaration("const", [t.variableDeclarator(id, expr)]))
    refs.set(key, id)
    return id
  }

  // Phase 1: materialize EVERY needed ref before any mutation runs -
  // insert ops consume their placeholder comments and splice in nodes,
  // which would invalidate sibling walks computed afterwards
  const needed: HolePath[] = []
  for (const op of ops) {
    if (op.kind === "prop" || op.kind === "spread") {
      needed.push(op.path)
    } else {
      needed.push(op.parentPath)
      if (op.markerPath) needed.push(op.markerPath)
    }
  }
  // Document order, so a node's preceding siblings are already walked when it
  // is reached and the sibling shortcut above can fire
  needed.sort((a, b) => {
    const len = a.length < b.length ? a.length : b.length
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) return a[i] - b[i]
    }
    return a.length - b.length
  })
  for (const path of needed) getRef(path)

  // Phase 2: run the ops against the captured node references
  for (const op of ops) {
    if (op.kind === "prop") {
      const target = refs.get(op.path.join("."))!
      ts.imports.add("setProp")
      statements.push(
        t.expressionStatement(
          t.callExpression(t.identifier("_$setProp"), [
            target,
            t.stringLiteral(op.name),
            op.expr,
          ]),
        ),
      )
    } else if (op.kind === "spread") {
      const target = refs.get(op.path.join("."))!
      ts.imports.add("spread")
      statements.push(
        t.expressionStatement(
          t.callExpression(t.identifier("_$spread"), [target, op.expr]),
        ),
      )
    } else {
      const parent = refs.get(op.parentPath.join("."))!
      ts.imports.add("insert")
      // No marker: the hole owns the tail of its parent, so insert() appends
      const args: t.Expression[] = [parent, op.expr]
      if (op.markerPath) args.push(refs.get(op.markerPath.join("."))!)
      statements.push(
        t.expressionStatement(t.callExpression(t.identifier("_$insert"), args)),
      )
    }
  }

  statements.push(t.returnStatement(rootId))

  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(statements)), [])
}

/**
 * Compile an outermost intrinsic JSX element into template + clone code.
 * Returns null if the tree can't be compiled (root bails).
 */
export function transformTemplateCodegen(
  path: NodePath<t.JSXElement>,
  state: PluginState,
): void {
  if (state.opts.templates === false) return
  if (!isIntrinsicElement(path.node)) return

  // Only outermost intrinsic roots: nested ones are handled by the walk
  if (
    path.parentPath?.isJSXElement() ||
    path.parentPath?.isJSXFragment() ||
    // attribute value position is compiled with its owner
    path.parentPath?.isJSXAttribute()
  ) {
    return
  }

  const ctx: BuildContext = { ops: [], bailed: false }
  const html = buildElement(path.node, [], ctx)
  if (html === null) return // root bails: stays on runtime path

  const ts = getTemplateState(state)
  ts.imports.add("template")

  const rootTag = (path.node.openingElement.name as t.JSXIdentifier).name
  const templateId = t.identifier(`_tmpl$${ts.templates.length + 1}`)
  ts.templates.push({ id: templateId, html, isSVG: SVG_TAGS.has(rootTag) })

  const instance = generateInstance(templateId, ctx.ops, state)

  // No skip(): Babel re-traverses the replacement, which compiles JSX
  // still embedded in hole expressions (e.g. <For> children rows)
  path.replaceWith(instance)
}

/**
 * Inject hoisted template declarations and helper imports at Program exit.
 */
export function finalizeTemplates(programPath: NodePath<t.Program>, state: PluginState): void {
  const ts = templateStates.get(state)
  if (!ts || ts.templates.length === 0) return

  const moduleSource = state.opts.moduleSource ?? "@barqjs/core"

  const specifiers: t.ImportSpecifier[] = []
  if (ts.imports.has("template")) {
    specifiers.push(t.importSpecifier(t.identifier("_$template"), t.identifier("template")))
  }
  if (ts.imports.has("insert")) {
    specifiers.push(t.importSpecifier(t.identifier("_$insert"), t.identifier("insert")))
  }
  if (ts.imports.has("setProp")) {
    specifiers.push(t.importSpecifier(t.identifier("_$setProp"), t.identifier("setProp")))
  }
  if (ts.imports.has("spread")) {
    specifiers.push(t.importSpecifier(t.identifier("_$spread"), t.identifier("spread")))
  }

  const declarations: t.Statement[] = ts.templates.map(({ id, html, isSVG }) =>
    t.variableDeclaration("const", [
      t.variableDeclarator(
        id,
        t.callExpression(
          t.identifier("_$template"),
          isSVG
            ? [t.templateLiteral([t.templateElement({ raw: html }, true)], []), t.booleanLiteral(true)]
            : [t.templateLiteral([t.templateElement({ raw: html }, true)], [])],
        ),
      ),
    ]),
  )

  const importDecl = t.importDeclaration(specifiers, t.stringLiteral(moduleSource))
  programPath.node.body.unshift(importDecl, ...declarations)

  ts.templates = []
  ts.imports.clear()
}

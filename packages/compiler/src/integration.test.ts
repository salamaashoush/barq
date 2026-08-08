/**
 * Compile-and-run integration: the template codegen output executes
 * against the real @barqjs/core runtime in a DOM and stays reactive.
 */

import { beforeAll, describe, expect, it } from "bun:test"
import * as babel from "@babel/core"
import barqPlugin from "./babel.js"

let barqRuntime: typeof import("@barqjs/core")

beforeAll(async () => {
  const { GlobalRegistrator } = await import("@happy-dom/global-registrator")
  if (typeof document === "undefined") {
    GlobalRegistrator.register()
  }
  barqRuntime = await import("@barqjs/core")
})

/** Compile TSX, rewrite core imports to a provided runtime, eval, return App */
function compileComponent(source: string): (props?: Record<string, unknown>) => Node {
  const result = babel.transformSync(source, {
    plugins: [[barqPlugin, {}]],
    presets: [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]],
    filename: "integration.tsx",
  })
  let code = result?.code ?? ""
  code = code.replace(
    /import\s*\{([^}]+)\}\s*from\s*"@barqjs\/core";?/g,
    (_match, names: string) => `const {${names.replace(/\s+as\s+/g, ": ")}} = __barq;`,
  )
  const factory = new Function("__barq", `${code}\nreturn App;`)
  return factory(barqRuntime)
}

describe("compiled output runtime integration", () => {
  it("static template clones correct DOM per instance", () => {
    const App = compileComponent(`
      function App() {
        return <div class="card"><span>Hello</span> world</div>
      }
    `)
    const a = App() as HTMLElement
    const b = App() as HTMLElement
    expect(a.outerHTML).toBe('<div class="card"><span>Hello</span> world</div>')
    expect(b).not.toBe(a) // independent clones
  })

  it("reactive hole updates fine-grained (element identity preserved)", () => {
    const App = compileComponent(`
      import { signal, flush } from "@barqjs/core"
      const count = signal(0)
      function App() {
        return <p>Count: {count}</p>
      }
      App.count = count
    `) as ((props?: Record<string, unknown>) => HTMLElement) & {
      count: { set(v: number): void }
    }

    const el = App()
    document.body.appendChild(el)
    expect(el.textContent).toBe("Count: 0")

    const span = el.firstChild // the static "Count: " text node
    App.count.set(5)
    barqRuntime.flush()
    expect(el.textContent).toBe("Count: 5")
    expect(el.firstChild).toBe(span) // static part untouched
  })

  it("dynamic attribute updates through setProp render effect", () => {
    const App = compileComponent(`
      import { signal } from "@barqjs/core"
      const active = signal(false)
      function App() {
        return <div class={() => (active() ? "on" : "off")}>x</div>
      }
      App.active = active
    `) as ((props?: Record<string, unknown>) => HTMLElement) & {
      active: { set(v: boolean): void }
    }

    const el = App()
    expect(el.getAttribute("class")).toBe("off")
    App.active.set(true)
    barqRuntime.flush()
    expect(el.getAttribute("class")).toBe("on")
  })

  it("compiled event handlers fire through delegation", () => {
    const App = compileComponent(`
      import { signal } from "@barqjs/core"
      const clicks = signal(0)
      function App() {
        return <button onClick={() => clicks.set(clicks() + 1)}>go {clicks}</button>
      }
      App.clicks = clicks
    `) as ((props?: Record<string, unknown>) => HTMLButtonElement) & {
      clicks: () => number
    }

    const el = App()
    document.body.appendChild(el)
    el.click()
    barqRuntime.flush()
    expect(App.clicks()).toBe(1)
    expect(el.textContent).toBe("go 1")
  })

  it("sibling walks stay valid after an earlier hole is filled (ref ordering)", () => {
    const App = compileComponent(`
      import { signal } from "@barqjs/core"
      const a = signal("A")
      const b = signal("B")
      function App() {
        return <div>{a}<span>tail:{b}</span></div>
      }
      App.a = a
      App.b = b
    `) as ((props?: Record<string, unknown>) => HTMLElement) & {
      a: { set(v: string): void }
      b: { set(v: string): void }
    }

    const el = App()
    expect(el.textContent).toBe("Atail:B")
    expect(el.querySelector("span")?.textContent).toBe("tail:B")

    App.b.set("Z")
    barqRuntime.flush()
    expect(el.querySelector("span")?.textContent).toBe("tail:Z")
  })

  it("nested holes walk to the right positions", () => {
    const App = compileComponent(`
      import { signal } from "@barqjs/core"
      const a = signal("A")
      const b = signal("B")
      function App() {
        return <div><span>1:{a}</span><span>2:{b}</span></div>
      }
      App.a = a
      App.b = b
    `) as ((props?: Record<string, unknown>) => HTMLElement) & {
      a: { set(v: string): void }
      b: { set(v: string): void }
    }

    const el = App()
    expect(el.textContent).toBe("1:A2:B")
    App.b.set("Z")
    barqRuntime.flush()
    expect(el.textContent).toBe("1:A2:Z")
  })
})

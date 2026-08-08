import { describe, expect, it } from "bun:test"
import * as babel from "@babel/core"
import barqPlugin from "./babel.js"

function transform(code: string, opts = {}): string {
  const result = babel.transformSync(code, {
    plugins: [[barqPlugin, opts]],
    presets: [["@babel/preset-typescript", { isTSX: true, allExtensions: true }]],
    filename: "test.tsx",
  })
  return result?.code ?? ""
}

describe("tracking fixes", () => {
  it("createAsync values are tracked as reactive", () => {
    const output = transform(`
      import { createAsync } from "@barqjs/core"
      function App() {
        const user = createAsync(async () => fetchUser(), { key: "user" })
        return <div>{user.name}</div>
      }
    `)
    // user is a computed accessor: member access gets the call
    expect(output).toContain("user().name")
  })

  it("createOptimistic is a signal; .set is not mangled", () => {
    const output = transform(`
      import { createOptimistic } from "@barqjs/core"
      function App() {
        const opt = createOptimistic(0)
        return <button onClick={() => opt.set(opt() + 1)}>{opt}</button>
      }
    `)
    expect(output).toContain("opt.set(opt() + 1)")
    expect(output).not.toContain("opt().set")
  })

  it("signal accessor methods survive in handlers (set/update/peek)", () => {
    const output = transform(`
      import { signal } from "@barqjs/core"
      function App() {
        const count = signal(0)
        return <button onClick={() => { count.update(n => n + 1); count.set(count.peek()) }}>x</button>
      }
    `)
    expect(output).toContain("count.update(n => n + 1)")
    expect(output).toContain("count.set(count.peek())")
    expect(output).not.toContain("count().")
  })

  it("renamed imports still register reactive bindings", () => {
    const output = transform(`
      import { signal as sig } from "@barqjs/core"
      function App() {
        const count = sig(0)
        return <div>{count * 2}</div>
      }
    `)
    expect(output).toContain("count() * 2")
  })

  it("const aliases of signals are tracked", () => {
    const output = transform(`
      import { signal } from "@barqjs/core"
      function App() {
        const count = signal(0)
        const c = count
        return <div>{c + 1}</div>
      }
    `)
    expect(output).toContain("c() + 1")
  })

  it("createProjection result is a store (member reads wrapped, not called)", () => {
    const output = transform(`
      import { createProjection } from "@barqjs/core"
      function App() {
        const sel = createProjection((d) => { d.on = true }, { on: false })
        return <div>{sel.on ? "yes" : "no"}</div>
      }
    `)
    expect(output).toContain('sel.on ? "yes" : "no"')
    expect(output).not.toContain("sel()")
  })

  it("Loading/Errored/Reveal are control flow (children thunked)", () => {
    const output = transform(`
      import { Loading } from "@barqjs/core"
      function App() {
        return <Loading fallback={<p>wait</p>}><div>ready</div></Loading>
      }
    `)
    expect(output).toMatch(/fallback=\{\(\) =>/)
    expect(output).toMatch(/\{\(\) => \(\(\) => \{/) // thunked compiled child
  })

  it("Repeat: count wrapped, children index untouched", () => {
    const output = transform(`
      import { signal, Repeat } from "@barqjs/core"
      function App() {
        const n = signal(3)
        return <Repeat count={n}>{(i) => <span>{i}</span>}</Repeat>
      }
    `)
    expect(output).toContain("count={() => n()}")
    expect(output).toContain("_$insert(_el$, i,")
    expect(output).not.toContain("i()")
  })
})

import { describe, expect, it } from "bun:test"
import * as babel from "@babel/core"
import barqPlugin from "./babel.js"

/**
 * Helper to transform code and return the result
 */
function transform(code: string, opts = {}): string {
  const result = babel.transformSync(code, {
    plugins: [[barqPlugin, opts]],
    presets: [
      ["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
    ],
    filename: "test.tsx",
  })

  return result?.code ?? ""
}

describe("Barq Compiler", () => {
  describe("Reactive Source Tracking", () => {
    it("should track useState bindings", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          return <div>{count + 1}</div>
        }
      `

      const output = transform(input)

      // count + 1 should become () => count() + 1
      expect(output).toContain("() => count() + 1")
    })

    it("should track useStore bindings", () => {
      const input = `
        import { useStore } from "@barqjs/core"

        function App() {
          const [state, setState] = useStore({ user: { name: "John" } })
          return <div>{state.user.name}</div>
        }
      `

      const output = transform(input)

      // state.user.name should become () => state.user.name
      expect(output).toContain("() => state.user.name")
    })

    it("should track useMemo bindings", () => {
      const input = `
        import { useState, useMemo } from "@barqjs/core"

        function App() {
          const [count, setCount] = useState(0)
          const doubled = useMemo(() => count() * 2)
          return <div>{doubled + 1}</div>
        }
      `

      const output = transform(input)

      // doubled + 1 should become () => doubled() + 1
      expect(output).toContain("() => doubled() + 1")
    })
  })

  describe("JSX Expression Transforms", () => {
    it("should keep simple signal reference as-is", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          return <div>{count}</div>
        }
      `

      const output = transform(input)

      // Compiled: raw signal accessor passed to insert (not called eagerly)
      expect(output).toContain("_$template(`<div><!----></div>`)")
      expect(output).toContain("_$insert(_el$, count,")
      expect(output).not.toContain("count()")
    })

    it("should wrap binary expressions with reactive values", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          return <div>{count * 2}</div>
        }
      `

      const output = transform(input)

      expect(output).toContain("() => count() * 2")
    })

    it("should wrap ternary expressions with reactive values", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [isActive, setIsActive] = useState(false)
          return <div class={isActive ? "active" : "inactive"}></div>
        }
      `

      const output = transform(input)

      expect(output).toContain('() => isActive() ? "active" : "inactive"')
    })

    it("should transform event handlers to add signal calls", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          return <button onClick={() => setCount(count + 1)}>+</button>
        }
      `

      const output = transform(input)

      expect(output).toContain("setCount(count() + 1)")
    })
  })

  describe("Control Flow Transforms", () => {
    it("should transform Show component", () => {
      const input = `
        import { useState, Show } from "@barqjs/core"

        function App() {
          const [visible, setVisible] = useState(true)
          return (
            <Show when={visible}>
              <div>Content</div>
            </Show>
          )
        }
      `

      const output = transform(input)

      // when should be wrapped: when={() => visible()}
      expect(output).toContain("when={() => visible()}")
      // children thunked; intrinsic content compiled to a template
      expect(output).toContain("_$template(`<div>Content</div>`)")
      expect(output).toMatch(/\{\(\) => \(\(\) => \{/)
    })

    it("should transform Show with fallback", () => {
      const input = `
        import { useState, Show } from "@barqjs/core"

        function App() {
          const [visible, setVisible] = useState(true)
          return (
            <Show when={visible} fallback={<span>Hidden</span>}>
              <div>Content</div>
            </Show>
          )
        }
      `

      const output = transform(input)

      expect(output).toContain("when={() => visible()}")
      // fallback thunked; both branches compiled to templates
      expect(output).toContain("_$template(`<span>Hidden</span>`)")
      expect(output).toContain("_$template(`<div>Content</div>`)")
      expect(output).toMatch(/fallback=\{\(\) => \(\(\) => \{/)
    })

    it("should transform Switch/Match", () => {
      const input = `
        import { useState, Switch, Match } from "@barqjs/core"

        function App() {
          const [status, setStatus] = useState("loading")
          return (
            <Switch>
              <Match when={status === "loading"}>
                <Spinner />
              </Match>
              <Match when={status === "ready"}>
                <Content />
              </Match>
            </Switch>
          )
        }
      `

      const output = transform(input)

      expect(output).toContain('when={() => status() === "loading"}')
      expect(output).toContain('when={() => status() === "ready"}')
      expect(output).toContain("{() => <Spinner />}")
      expect(output).toContain("{() => <Content />}")
    })

    it("should transform For component", () => {
      const input = `
        import { useState, For } from "@barqjs/core"

        function App() {
          const [items, setItems] = useState([1, 2, 3])
          return (
            <For each={items}>
              {(item) => <li>{item}</li>}
            </For>
          )
        }
      `

      const output = transform(input)

      // each should be wrapped
      expect(output).toContain("each={() => items()}")
    })

    it("should transform For callback with item access", () => {
      const input = `
        import { useState, For } from "@barqjs/core"

        function App() {
          const [items, setItems] = useState([{name: "a"}])
          return (
            <For each={items}>
              {(item) => <li>{item.name}</li>}
            </For>
          )
        }
      `

      const output = transform(input)

      // item is a callback parameter (the actual value), not a signal
      // So item.name stays as item.name, not item().name
      expect(output).toContain("item.name")
      // The each prop should be wrapped
      expect(output).toContain("each={() => items()}")
    })
  })

  describe("Auto Computed", () => {
    it("should convert derived values to thunks", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          const doubled = count * 2
          return <div>{doubled}</div>
        }
      `

      const output = transform(input)

      // Should transform to thunk (lazy getter), not useMemo
      // SolidJS-style: just wrap in () => for lazy evaluation
      expect(output).toContain("doubled = () => count() * 2")
    })

    it("should chain computed values correctly", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          const doubled = count * 2
          const quadrupled = doubled * 2
          return <div>{quadrupled}</div>
        }
      `

      const output = transform(input)

      // Should transform to thunks with proper signal calls
      expect(output).toContain("doubled = () => count() * 2")
      expect(output).toContain("quadrupled = () => doubled() * 2")
    })

    it("should not transform function expressions", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          const increment = () => setCount(count + 1)
          return <button onClick={increment}>+</button>
        }
      `

      const output = transform(input)

      // Should not wrap arrow function in useMemo
      expect(output).not.toContain("useMemo(() => () =>")
    })

    it("can be disabled via options", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function Counter() {
          const [count, setCount] = useState(0)
          const doubled = count * 2
          return <div>{doubled}</div>
        }
      `

      const output = transform(input, { autoComputed: false })

      // Should NOT transform to useMemo
      expect(output).not.toContain("useMemo")
    })
  })

  describe("Complex Examples", () => {
    it("should handle a complete component", () => {
      const input = `
        import { useState, useStore, Show, For } from "@barqjs/core"

        function UserDashboard() {
          const [activeTab, setActiveTab] = useState("posts")
          const [state, setState] = useStore({
            filters: { search: "" }
          })
          const [user, setUser] = useState({ name: "John" })

          return (
            <div class={activeTab === "posts" ? "posts" : "other"}>
              <Show when={user}>
                <h1>Hello, {user.name}</h1>
              </Show>

              <input
                value={state.filters.search}
                onInput={(e) => setState("filters", "search", e.target.value)}
              />
            </div>
          )
        }
      `

      const output = transform(input)

      // Class should be wrapped
      expect(output).toContain('() => activeTab() === "posts" ? "posts" : "other"')

      // Show when should be wrapped
      expect(output).toContain("when={() => user()}")

      // Children of Show should be wrapped
      expect(output).toContain("{() =>")

      // Store access should be wrapped
      expect(output).toContain("() => state.filters.search")
    })

    it("should handle nested control flow", () => {
      const input = `
        import { useState, Show, For } from "@barqjs/core"

        function App() {
          const [visible, setVisible] = useState(true)
          const [items, setItems] = useState([1, 2, 3])

          return (
            <Show when={visible}>
              <For each={items}>
                {(item) => <li>{item}</li>}
              </For>
            </Show>
          )
        }
      `

      const output = transform(input)

      expect(output).toContain("when={() => visible()}")
      expect(output).toContain("each={() => items()}")
    })
  })

  describe("Edge Cases", () => {
    it("should not transform non-reactive expressions", () => {
      const input = `
        function App() {
          const items = [1, 2, 3]
          return <div>{items.length}</div>
        }
      `

      const output = transform(input)

      // Member reads are thunked (store proxies need lazy reads); plain
      // identifiers stay direct
      expect(output).toContain("_$insert(_el$, () => items.length,")
    })

    it("should handle expressions already wrapped in arrow functions", () => {
      const input = `
        import { useState, Show } from "@barqjs/core"

        function App() {
          const [visible, setVisible] = useState(true)
          return (
            <Show when={() => visible()}>
              {() => <div>Content</div>}
            </Show>
          )
        }
      `

      const output = transform(input)

      // Should not double-wrap
      expect(output).not.toContain("() => () =>")
    })

    it("should handle multiple signals in one expression", () => {
      const input = `
        import { useState } from "@barqjs/core"

        function App() {
          const [a, setA] = useState(1)
          const [b, setB] = useState(2)
          return <div>{a + b}</div>
        }
      `

      const output = transform(input)

      expect(output).toContain("() => a() + b()")
    })
  })
})

  describe("JSX with computed functions", () => {
    it("should NOT wrap function references in JSX props", () => {
      const input = `
        import { For, useStore } from "@barqjs/core"

        function App() {
          const [state, setState] = useStore({ items: [] })
          
          const filteredItems = () => {
            return state.items.filter(x => x.active)
          }
          
          return <For each={filteredItems}>{item => <li>{item.name}</li>}</For>
        }
      `

      const output = transform(input)
      console.log("Output:", output)
      
      // filteredItems is already a function, should NOT be wrapped again
      // It should be passed as-is: each={filteredItems} or each={() => filteredItems()}
      // NOT as each={() => filteredItems} (function returning function)
      expect(output).not.toContain("each={() => filteredItems}")
    })
  })

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

describe("template codegen", () => {
  it("compiles a fully static tree to a single hoisted template", () => {
    const output = transform(`
      function App() {
        return <div class="card"><span>Hello</span> world</div>
      }
    `)
    expect(output).toContain('_$template(`<div class="card"><span>Hello</span> world</div>`)')
    expect(output).toContain("const _el$ = _tmpl$1()")
    expect(output).toContain("return _el$")
    expect(output).not.toContain("_$insert")
    expect(output).not.toContain("_$setProp")
  })

  it("hoists templates to module scope and imports helpers once", () => {
    const output = transform(`
      function A() { return <p>a</p> }
      function B() { return <p>b</p> }
    `)
    expect(output).toContain("_tmpl$1")
    expect(output).toContain("_tmpl$2")
    expect(output.match(/import \{ template as _\$template/g)?.length).toBe(1)
  })

  it("static attributes are inlined; dynamic ones go through setProp", () => {
    const output = transform(`
      import { signal } from "@barqjs/core"
      function App() {
        const active = signal(false)
        return <div id="x" tabindex={2} class={active() ? "on" : "off"}>hi</div>
      }
    `)
    expect(output).toContain('id="x"')
    expect(output).toContain('tabindex="2"')
    expect(output).toContain('_$setProp(_el$, "class"')
  })

  it("event handlers compile to setProp (delegation-compatible)", () => {
    const output = transform(`
      function App() {
        return <button onClick={() => console.log("hi")}>go</button>
      }
    `)
    expect(output).toContain('_$setProp(_el$, "onClick"')
    expect(output).toContain("_$template(`<button>go</button>`)")
  })

  it("value/checked stay properties even when static", () => {
    const output = transform(`
      function App() {
        return <input value="abc" />
      }
    `)
    expect(output).toContain("_$template(`<input>`)")
    expect(output).toContain('_$setProp(_el$, "value", "abc")')
  })

  it("dynamic children become comment holes with precomputed walks", () => {
    const output = transform(`
      import { signal } from "@barqjs/core"
      function App() {
        const name = signal("x")
        return <div><span>Hi {name}</span><b>!</b></div>
      }
    `)
    expect(output).toContain("_$template(`<div><span>Hi </span><b>!</b></div>`)")
    expect(output).toContain("const _el$2 = _el$.firstChild")
    expect(output).toContain("_$insert(_el$2, name)")
  })

  it("component children become insert holes; surrounding statics stay in template", () => {
    const output = transform(`
      import { Show } from "@barqjs/core"
      function App() {
        return <div><h1>Title</h1><Show when={() => true}>{() => "y"}</Show></div>
      }
    `)
    expect(output).toContain("_$template(`<div><h1>Title</h1></div>`)")
    expect(output).toContain("_$insert(_el$, <Show")
  })

  it("escapes static text and attribute values", () => {
    const output = transform(`
      function App() {
        return <div title={"a\\"b"}>{"<script>"}1 &amp; 2</div>
      }
    `)
    expect(output).toContain("a&quot;b")
    expect(output).toContain("&lt;script&gt;")
    expect(output).not.toContain("<script>")
  })

  it("svg roots get the SVG template flag", () => {
    const output = transform(`
      function App() {
        return <svg viewBox="0 0 10 10"><circle r="4" /></svg>
      }
    `)
    expect(output).toMatch(/_\$template\(`<svg viewBox="0 0 10 10"><circle r="4"><\/circle><\/svg>`, true\)/)
  })

  it("spread attributes compile to a reactive _$spread (template kept)", () => {
    const output = transform(`
      function App(props) {
        return <div id="x" {...props} title="t">x</div>
      }
    `)
    expect(output).toContain("_$template(`<div>x</div>`)")
    expect(output).toMatch(/_\$spread\(_el\$, \(\) => \(\{/)
    expect(output).toContain('"id": "x"')
    expect(output).toContain("...props")
    expect(output).toContain('"title": "t"')
  })

  it("innerHTML still bails; bailed child becomes a hole inside a compiled parent", () => {
    const output = transform(`
      function App(props) {
        return <section><div dangerouslySetInnerHTML={props.html}>x</div></section>
      }
    `)
    expect(output).toContain("_$template(`<section></section>`)")
    expect(output).toContain("_$insert(_el$, <div dangerouslySetInnerHTML={props.html}>x</div>)")
  })

  it("JSX whitespace rules: indentation-only text dropped, inline spaces kept", () => {
    const output = transform(`
      function App() {
        return (
          <ul>
            <li>one</li>
            <li>two</li>
          </ul>
        )
      }
    `)
    expect(output).toContain("_$template(`<ul><li>one</li><li>two</li></ul>`)")
  })

  it("templates: false disables the optimizing pass", () => {
    const output = transform(
      `function App() { return <div>hi</div> }`,
      { templates: false },
    )
    expect(output).not.toContain("_$template")
    expect(output).toContain("<div>hi</div>")
  })
})

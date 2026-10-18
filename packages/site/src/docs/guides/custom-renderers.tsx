import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import mount from "./snippets/custom-renderers/mount.ts?raw";
import renderer from "./snippets/custom-renderers/renderer.ts?raw";
import scene from "./snippets/custom-renderers/scene.tsx?raw";
import viteConfig from "./snippets/custom-renderers/vite.config.ts?raw";

export const sections: readonly DocsSection[] = [
  { id: "host", label: "A host" },
  { id: "components", label: "Components on it" },
  { id: "compiling", label: "Compiling for it" },
  { id: "one-app", label: "Two renderers in one app" },
  { id: "diagnostics", label: "What the compiler refuses" },
];

export function Body() {
  return (
    <>
      <p>
        <code>@barqjs/web</code> renders into a document. <code>@barqjs/universal</code> renders
        into anything else that has nodes with children: a canvas scene graph, a terminal, a native
        view tree. Signals, components and control flow are <code>@barqjs/core</code>'s on either,
        unchanged. What a host supplies is how to create, move and write to its nodes.
      </p>

      <h2 class={anchor} id="host">
        A host
      </h2>
      <p>
        <code>createRenderer</code> takes the host's node operations once and returns{" "}
        <code>render</code> and the runtime compiled code calls. A renderer module exports every
        member it returns, so the compiler can import them from it. This one keeps its nodes in
        memory:
      </p>
      <CodeBlock code={renderer} />
      <ul>
        <li>
          <code>createElement</code>, <code>createTextNode</code>, <code>replaceText</code> and{" "}
          <code>isTextNode</code> make and update nodes.
        </li>
        <li>
          <code>setProperty(node, name, value, prev)</code> writes one property. <code>prev</code>{" "}
          is the value that name last held on that node, <code>undefined</code> the first time.
        </li>
        <li>
          <code>insertNode(parent, node, anchor)</code> puts <code>node</code> before{" "}
          <code>anchor</code>, or last when <code>anchor</code> is <code>null</code>. It has to move
          a node that already has a parent, as the document's <code>insertBefore</code> does: a
          keyed list reorders by inserting rows that are already placed.
        </li>
        <li>
          <code>removeNode</code>, <code>getParentNode</code>, <code>getFirstChild</code> and{" "}
          <code>getNextSibling</code> walk and trim the tree.
        </li>
        <li>
          <code>createSentinel</code> and <code>createContainer</code> are optional. The first is
          the node a range is anchored against and defaults to an empty text node. The second holds
          content built while it is not shown, such as a <code>Loading</code> body behind its
          fallback, and defaults to <code>createElement("#container")</code>.
        </li>
      </ul>

      <h2 class={anchor} id="components">
        Components on it
      </h2>
      <p>
        A component for a custom host is written as any other. Its tags are the host's, and every
        attribute is a property the host is handed under the name it was written with.
      </p>
      <CodeBlock code={scene} />
      <p>
        <code>render</code> mounts it into a node of the host and returns the function that disposes
        it, as <code>@barqjs/web</code>'s does:
      </p>
      <CodeBlock code={mount} />
      <p>
        <code>Show</code>, <code>For</code>, <code>Switch</code>, <code>Loading</code> and{" "}
        <code>Errored</code> run over the host. <code>{"<Portal mount={node}>"}</code> mounts into
        another node of the same host, and into the node the tree was rendered into when{" "}
        <code>mount</code> is left out. <code>dynamic</code> takes a tag name or a component, as on
        the document.
      </p>
      <p>
        The pragma at the top of the file types its tags. <code>@barqjs/universal</code>'s{" "}
        <code>jsx-runtime</code> accepts any tag with any property; a renderer package that knows
        its tags exports a <code>jsx-runtime</code> of its own and the pragma names that instead. A
        project that renders only to the custom host sets <code>jsxImportSource</code> in{" "}
        <code>tsconfig.json</code> rather than per file.
      </p>

      <h2 class={anchor} id="compiling">
        Compiling for it
      </h2>
      <p>
        The compiler's <code>universal</code> target builds every element through the renderer
        module named by <code>moduleSource</code>. A project that renders only to the custom host
        sets both for the whole build:{" "}
        <code>
          {'barq({ compiler: { target: "universal", moduleSource: "/src/renderer.ts" } })'}
        </code>
        .
      </p>
      <p>
        In a module compiled that way an element is a <code>createElement</code> call placed with{" "}
        <code>insertNode</code>, text is a <code>createTextNode</code>, and every attribute and
        event is one <code>setProp</code> call: <code>{"onClick={handler}"}</code> is{" "}
        <code>{'setProp(node, "onClick", handler)'}</code>. A property that reads a signal is
        written again when the signal changes, with the value it held before as <code>prev</code>.
        There are no templates to clone and no delegated events: what an event name means is the
        host's to decide.
      </p>

      <h2 class={anchor} id="one-app">
        Two renderers in one app
      </h2>
      <p>
        <code>compiler.renderers</code> picks the renderer per file. A file whose name matches an
        entry's <code>include</code> compiles for that entry's <code>target</code> and{" "}
        <code>moduleSource</code>, and every other file keeps compiling for the document:
      </p>
      <CodeBlock code={viteConfig} />
      <ul>
        <li>
          <code>include</code> is one glob or a list. <code>*</code> matches within one path segment
          and <code>**</code> across them, and a pattern that does not start with <code>/</code>{" "}
          matches at any directory.
        </li>
        <li>
          <code>target</code> defaults to <code>"universal"</code>, and <code>moduleSource</code> to
          the build's own.
        </li>
        <li>The first entry that matches wins.</li>
      </ul>
      <p>
        Both halves read the same <code>@barqjs/core</code>, so a signal written by a button in the
        page moves the scene in the same flush. The build's <code>ssr</code> and{" "}
        <code>hydratable</code> keep describing its document files, and a matched file compiles the
        same on the server.
      </p>

      <h2 class={anchor} id="diagnostics">
        What the compiler refuses
      </h2>
      <p>Two codes are the document's concepts reaching a module compiled for another host.</p>
      <ul>
        <li>
          <a href="https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ027.md">
            <code>BARQ027</code>
          </a>{" "}
          reports a <code>bind:</code> or a form's <code>action</code>, which bind a document form
          control. Pass the value as a prop and write it back from the host's own event:{" "}
          <code>{"value={text()}"}</code> with <code>{"onChange={(next) => setText(next)}"}</code>.
        </li>
        <li>
          <a href="https://github.com/salamaashoush/barq/blob/main/packages/compiler/docs/BARQ028.md">
            <code>BARQ028</code>
          </a>{" "}
          reports <code>ssr</code>, <code>hydratable</code> or <code>interp</code> asked for beside{" "}
          <code>target: "universal"</code>. Each describes how a module reaches the document. An app
          that renders the document on the server and a custom host in the browser gives the host's
          files a <code>renderers</code> entry instead, which is not reported.
        </li>
      </ul>
    </>
  );
}

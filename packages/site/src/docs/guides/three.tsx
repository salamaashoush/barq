import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import app from "./snippets/three/app.tsx?raw";
import loader from "./snippets/three/loader.tsx?raw";
import scene from "./snippets/three/scene.tsx?raw";

export const sections: readonly DocsSection[] = [
  { id: "install", label: "Installation" },
  { id: "scene", label: "A scene" },
  { id: "props", label: "Tags and props" },
  { id: "frames", label: "Frames" },
  { id: "events", label: "Events" },
  { id: "assets", label: "Assets" },
  { id: "extend", label: "Your own classes" },
];

export function Body() {
  return (
    <>
      <p>
        <code>@barqjs/three</code> renders three.js scenes written as JSX. Every three class is a
        tag, a prop is a property of the object, and a signal a prop reads updates that property in
        place. The tags, <code>args</code>, <code>attach</code>, events and hooks follow React Three
        Fiber, so its examples read the same here.
      </p>

      <h2 class={anchor} id="install">
        Installation
      </h2>
      <CodeBlock code="bun add @barqjs/three three && bun add -d @types/three" />
      <p>
        There is nothing to configure. The package declares <code>Canvas</code> as a component whose
        children belong to the scene and claims three's tags, and <code>@barqjs/vite</code>
        reads both from its <code>package.json</code>.
      </p>

      <h2 class={anchor} id="scene">
        A scene
      </h2>
      <p>
        A component made of three's tags compiles for the scene wherever it is written, here in a
        file of its own:
      </p>
      <CodeBlock code={scene} />
      <p>
        The page renders it inside <code>Canvas</code>, beside document markup. The canvas's
        children compile for the scene too, so lights can be written inline:
      </p>
      <CodeBlock code={app} />
      <p>
        On the server <code>Canvas</code> writes a <code>{"<div>"}</code> holding a{" "}
        <code>{"<canvas>"}</code>; the scene mounts in the browser, under the canvas's owner, so it
        reads the page's contexts as well as its own.
      </p>

      <h2 class={anchor} id="props">
        Tags and props
      </h2>
      <ul>
        <li>
          <code>args</code> are the constructor's arguments. New <code>args</code> build a new
          object that takes over the old one's children and attachment.
        </li>
        <li>
          A math property takes what its <code>set</code> takes:{" "}
          <code>{"position={[1, 2, 3]}"}</code>, <code>{"scale={2}"}</code>,{" "}
          <code>{'color="hotpink"'}</code>. The value is copied into the object already there.
        </li>
        <li>
          A dashed name pierces: <code>{"position-x={x()}"}</code>,{" "}
          <code>{'material-color="red"'}</code>.
        </li>
        <li>
          Geometries, materials and fog attach to their parent by type; <code>attach</code> names
          another place, such as <code>{'attach="material-0"'}</code>, or is a function.
        </li>
        <li>
          <code>{"<primitive object={model} />"}</code> places an object made elsewhere and never
          disposes it. Anything else is disposed when its component unmounts, unless it or an
          ancestor has <code>{"dispose={null}"}</code>.
        </li>
      </ul>

      <h2 class={anchor} id="frames">
        Frames
      </h2>
      <p>
        The canvas draws on demand, and every prop write, insert and remove asks for the frame
        itself: a scene that changes through signals is drawn exactly when it changed, with no{" "}
        <code>invalidate</code> to remember. A <code>useFrame</code> subscriber keeps the canvas
        drawing every frame while it is mounted, and the signals it writes are drawn in the same
        frame. <code>{'frameloop="always"'}</code> and <code>{'"never"'}</code> are there when you
        want them, with <code>advance</code> for the latter.
      </p>

      <h2 class={anchor} id="events">
        Events
      </h2>
      <p>
        <code>onClick</code>, <code>onPointerOver</code>, <code>onPointerMove</code> and the rest
        are cast only against objects that have a handler, nearest first. They bubble to ancestors
        with a handler, stop at <code>stopPropagation</code>, and support pointer capture;{" "}
        <code>onPointerMissed</code> on the canvas hears a click that hit nothing.
      </p>

      <h2 class={anchor} id="assets">
        Assets
      </h2>
      <p>
        <code>useLoader</code> returns an accessor that suspends the nearest <code>Loading</code>{" "}
        until the asset is in, and answers at once from its cache afterwards:
      </p>
      <CodeBlock code={loader} />

      <h2 class={anchor} id="extend">
        Your own classes
      </h2>
      <p>
        <code>{"extend({ OrbitControls })"}</code> makes <code>{"<orbitControls>"}</code> a tag.
        Declare it in <code>ThreeElements</code> to have its props checked:
      </p>
      <CodeBlock
        code={[
          'declare module "@barqjs/three" {',
          "  interface ThreeElements {",
          "    orbitControls: ThreeElement<typeof OrbitControls>;",
          "  }",
          "}",
        ].join("\n")}
      />
    </>
  );
}

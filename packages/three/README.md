# @barqjs/three

three.js scenes written as barq JSX. Every three class is a tag, a prop is a
property of the object, and a signal a prop reads updates that property in
place. A page renders a scene with `<Canvas>`; the scene's components use
`useFrame`, `useThree` and `useLoader`. If you know React Three Fiber, you know
this package: the tags, `args`, `attach`, events and hooks follow it.

## Install

```bash
bun add @barqjs/core @barqjs/web @barqjs/three three
bun add -d @types/three
```

## A scene

```tsx
// src/app.tsx
import { createSignal, type Accessor } from "@barqjs/core";
import { Canvas, useFrame } from "@barqjs/three";

function Box(props: { position: Accessor<[number, number, number]> }) {
  const [hovered, setHovered] = createSignal(false);
  const [angle, setAngle] = createSignal(0);
  useFrame((_, delta) => setAngle(angle() + delta));
  return (
    <mesh
      position={props.position()}
      rotation-y={angle()}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered() ? "hotpink" : "orange"} />
    </mesh>
  );
}

export function App() {
  return (
    <Canvas camera={{ position: [0, 0, 5] }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 2, 5]} />
      <Box position={[-1.2, 0, 0]} />
      <Box position={[1.2, 0, 0]} />
    </Canvas>
  );
}
```

The children of `<Canvas>`, and any component whose JSX is made of three's
tags, compile for this package's renderer: the package declares `Canvas` as a
boundary and its tags as its own, so `@barqjs/vite` needs no configuration. A
build that picks renderers by file instead names this package's renderer
module:

```ts
barq({
  compiler: {
    renderers: [
      { include: ["src/scene/**"], target: "universal", moduleSource: "@barqjs/three/renderer" },
    ],
  },
});
```

On the server `<Canvas>` writes a `<div>` holding a `<canvas>` and nothing of
three. The scene mounts in the browser, from the canvas.

## Tags and props

- A tag is a three class with its first letter lowered: `<mesh>` is
  `THREE.Mesh`, `<boxGeometry>` is `THREE.BoxGeometry`. `<threeLine>`,
  `<threeAudio>`, `<threeSource>` and `<threePath>` name the four classes whose
  names the document also uses.
- `args` are the constructor's arguments. The object is built when its node
  joins a scene, and new `args` build a new object that takes the old one's
  children, attachment and handlers.
- A math property takes what its `set` takes: `position={[1, 2, 3]}`,
  `scale={2}`, `rotation={[0, Math.PI, 0]}`, `color="hotpink"`. The value is
  copied into the object that is already there, so a write allocates nothing.
- A dashed name pierces: `position-x={x()}`, `material-color="red"`.
- Geometries, materials and fog attach to their parent by type. `attach` names
  another place: `attach="material-0"` for an array slot, or a function
  `(parent, self) => cleanup`.
- `<primitive object={gltf.scene} />` places an object made elsewhere. It is
  never disposed.
- An object is disposed when the component that built it unmounts, unless it,
  or an ancestor, has `dispose={null}`.
- A `ref` is handed the three object once it exists, and again if new `args`
  replace it.

`extend` makes another class a tag. Declare its type once to have it checked:

```ts
import { extend, type ThreeElement } from "@barqjs/three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

extend({ OrbitControls });

declare module "@barqjs/three" {
  interface ThreeElements {
    orbitControls: ThreeElement<typeof OrbitControls>;
  }
}
```

## Frames

The default frameloop is `demand`, and nothing has to call `invalidate`: every
prop write, insert and remove asks for one frame, so a scene that changes
through signals is drawn exactly when it changed. A `useFrame` subscriber keeps
its canvas drawing every frame while it is subscribed.

- `useFrame((state, delta, xrFrame) => ..., priority)` runs before each frame,
  lowest priority first. Signals it writes are drawn in the same frame. Any
  subscriber with a priority above zero renders the frame itself.
- `frameloop="always"` draws every frame; `"never"` draws only through
  `advance(timestamp)`.
- `invalidate()` asks for a frame of every canvas; `useThree().invalidate()` of
  one.

## Hooks

- `useThree()` is the canvas's state: `gl`, `scene`, `camera`, `raycaster`,
  `size`, `viewport`, `pointer`, `clock`, `events`, `invalidate`, `setDpr`,
  `set` and `get`. Its members are reactive. `useThree((s) => s.size.width)`
  is an accessor of one.
- `useLoader(TextureLoader, url)` returns an accessor. Read inside `<Loading>`,
  it suspends until the asset is loaded; a loaded asset is cached per loader
  and URL. `useLoader.preload` and `useLoader.clear` manage the cache, and the
  URL may be an accessor.
- `useGraph(object)` collects an object's named nodes, materials and meshes.

## Events

`onClick`, `onDoubleClick`, `onContextMenu`, `onWheel`, `onPointerDown`, `Up`,
`Move`, `Over`, `Out`, `Enter`, `Leave`, `Cancel` and `onPointerMissed` work as
in React Three Fiber. Only objects with a handler are cast against, nearest hit
first; an event bubbles to every ancestor with a handler; `stopPropagation`,
`event.target.setPointerCapture` and `onPointerMissed` on the canvas behave as
there. The event carries the intersection (`object`, `point`, `distance`,
`face`, ...) with `eventObject`, `intersections`, `ray`, `camera`, `pointer`,
`delta`, `nativeEvent` and every property of the native event.

## Canvas

`<Canvas>` takes `gl` (renderer properties, a renderer, or a factory such as
`(defaults) => new WebGPURenderer(defaults)`, which may return a promise),
`camera`, `orthographic`, `scene`, `shadows`, `dpr`, `flat`, `linear`,
`legacy`, `frameloop`, `raycaster`, `performance`, `events`, `eventSource`,
`eventPrefix`, `onCreated` and `onPointerMissed`, plus `class`, `style` and
`id` for its `<div>`. It sizes itself to the `<div>` with a ResizeObserver.

`createRoot(canvas)` is the same without a component: `configure(props)`,
`render(() => <Scene />)` and `unmount()`.

## More

- `createPortal(() => <Children />, object, state?)` renders into another
  three object, under a state whose `scene` is that object and which may give
  it its own camera or event layer.
- `<Html position={[0, 1, 0]} center>` pins document content to a point of the
  scene. Only the content's own box takes pointer events; `pointerEvents="none"`
  lets them through to the canvas, and `wrapperClass` styles the element that
  moves.
- `applyProps(object, props)` writes props onto any object with the rules
  above.

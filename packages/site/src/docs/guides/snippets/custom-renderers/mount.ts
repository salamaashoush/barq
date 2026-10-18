import { SceneNode, render } from "./renderer.ts";
import Scene from "./scene.tsx";

export default function mount(): string {
  const stage = new SceneNode("root");
  const dispose = render(Scene, stage);
  // <root><stage><sprite name="salama"></sprite><sprite name="acme"></sprite></stage></root>
  const markup = String(stage);
  dispose();
  return markup;
}

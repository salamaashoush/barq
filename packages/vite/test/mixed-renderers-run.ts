/**
 * Run by `mixed-renderers.test.ts` in a process of its own, so the document it
 * installs is not the one the rest of the suite reads `isServer` against: the
 * built bundle, mounted once into happy-dom and once into its custom host,
 * then driven.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

interface Built {
  mount(element: HTMLElement): { scene(): string; dispose(): void };
  setCount(value: number): void;
  setItems(value: string[]): void;
  flush(): void;
}

const app = (await import(process.argv[2] ?? "")) as Built;
const element = document.createElement("div");
document.body.append(element);
const mounted = app.mount(element);
const frames = [{ dom: element.innerHTML, scene: mounted.scene() }];

app.setCount(2);
app.setItems(["b", "c", "a"]);
app.flush();
frames.push({ dom: element.innerHTML, scene: mounted.scene() });

element.querySelector("button")?.click();
app.flush();
frames.push({ dom: element.innerHTML, scene: mounted.scene() });

mounted.dispose();
frames.push({ dom: element.innerHTML, scene: mounted.scene() });
console.log(JSON.stringify(frames));

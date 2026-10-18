/**
 * Run by `vite.test.ts` in a process of its own, so the document it installs
 * and the copies of barq the bundle carries are not this suite's: the built
 * page mounted into happy-dom, its scene read, a signal written, read again.
 */

import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

interface Built {
  mount(element: HTMLElement): { scene(): string[]; dispose(): void };
  setCount(value: number): void;
  flush(): void;
}

const app = (await import(process.argv[2] ?? "")) as Built;
const element = document.createElement("div");
document.body.append(element);
const mounted = app.mount(element);
const frames = [{ dom: element.querySelector("h1")?.outerHTML, scene: mounted.scene() }];
app.setCount(3);
app.flush();
frames.push({ dom: element.querySelector("h1")?.outerHTML, scene: mounted.scene() });
mounted.dispose();
frames.push({ dom: element.innerHTML, scene: mounted.scene() });
console.log(JSON.stringify(frames));

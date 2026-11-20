import { red } from "./early.ts";
import { card } from "./card.ts";
import { orange } from "./late.ts";

const app = document.querySelector("#app");
for (const [id, atom] of [
  ["early", red],
  ["late", orange],
] as const) {
  const element = document.createElement("p");
  element.id = id;
  element.className = `${card} ${atom}`;
  element.textContent = id;
  app?.append(element);
}

(window as { loadSecond?: () => Promise<void> }).loadSecond = () =>
  import("./second.ts").then((module) => module.show());

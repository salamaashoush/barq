import { red } from "./early.ts";
import { card } from "./card.ts";
import { orange } from "./late.ts";
import { evaluated } from "./runtime.ts";

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

// A block the runtime evaluated, against an atom: the runtime writes its
// blocks in front of the build's atoms.
const runtime = document.createElement("p");
runtime.id = "runtime";
runtime.className = `${evaluated} ${red}`;
app?.append(runtime);

(window as SecondLoader).loadSecond = () => import("./second.ts").then((module) => module.show());

interface SecondLoader {
  loadSecond?: () => Promise<void>;
}

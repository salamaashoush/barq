import { wide } from "./wide.ts";
import { tight } from "./atom.ts";
import { flat } from "./flat.ts";

// A block, an atom under the same query, and a block after both: the minifier
// writes the first two under one `@media`, and the third has to stay last.
const element = document.createElement("p");
element.id = "merged";
element.className = `${wide} ${flat}`;
document.querySelector("#app")?.append(element);
const atom = document.createElement("p");
atom.id = "atom";
atom.className = `${wide} ${flat} ${tight}`;
document.querySelector("#app")?.append(atom);

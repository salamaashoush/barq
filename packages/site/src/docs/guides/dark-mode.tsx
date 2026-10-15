import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import { ComponentPreview } from "../preview.tsx";
import ModeToggle from "./snippets/dark-mode/mode-toggle.tsx";
import toggle from "./snippets/dark-mode/mode-toggle.tsx?raw";

export const sections: readonly DocsSection[] = [
  { id: "class", label: "The dark class" },
  { id: "toggle", label: "A mode toggle" },
  { id: "system", label: "Follow the system" },
];

export function Body() {
  return (
    <>
      <p>
        A theme carries its dark values under a selector, <code>.dark</code> by default. Dark mode
        is that class on an element: everything inside it reads the dark values.
      </p>

      <h2 class={anchor} id="class">
        The dark class
      </h2>
      <p>
        Put <code>dark</code> on <code>{"<html>"}</code> to turn the whole page, or on any element
        to turn only what is inside it.
      </p>
      <CodeBlock code={`<html class="dark">`} />

      <h2 class={anchor} id="toggle">
        A mode toggle
      </h2>
      <p>
        The choice is a signal, and the class follows it. This one remembers the choice in{" "}
        <code>localStorage</code>, which it reads once the page has settled: the server has no
        storage, and reading it while the tree is built would make the server and the client
        disagree.
      </p>
      <ComponentPreview code={toggle}>
        <ModeToggle />
      </ComponentPreview>

      <h2 class={anchor} id="system">
        Follow the system
      </h2>
      <p>
        To follow the operating system instead of a class, install the theme with{" "}
        <code>dark: "media"</code>, or run <code>barq-ui init --dark media</code>. The dark values
        then sit in a <code>prefers-color-scheme</code> media query and no class is needed.
      </p>
    </>
  );
}

import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import { ComponentPreview } from "../preview.tsx";
import ModeToggle from "./snippets/dark-mode/mode-toggle.tsx";
import toggle from "./snippets/dark-mode/mode-toggle.tsx?raw";

const pageToggle = `import { colorScheme, useColorScheme } from "@barqjs/primitives";

function Root(props: { children: Child }) {
  colorScheme({ disableTransitionOnChange: true });
  return props.children;
}

function ModeToggle() {
  const scheme = useColorScheme();
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="Toggle theme"
      onPress={() => scheme.set(scheme.resolved() === "dark" ? "light" : "dark")}
    >
      <Show when={scheme.resolved() === "dark"} fallback={<Moon />}>
        <Sun />
      </Show>
    </Button>
  );
}`;

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
        For the whole page, call <code>colorScheme()</code> from <code>@barqjs/primitives</code>{" "}
        once, near the root. It keeps the choice in a cookie, so the server renders with it, and
        puts a script in the head that writes the class on <code>{"<html>"}</code> before the first
        paint: a reader who picked dark, or whose system is dark, never sees a light frame. Anything
        below reads it back with <code>useColorScheme()</code>.
      </p>
      <CodeBlock code={pageToggle} />
      <p>
        <code>resolved()</code> is <code>undefined</code> while the choice is <code>"system"</code>{" "}
        and the page has not hydrated, because the server could not know the answer either. Style
        with the <code>dark</code> class rather than with that value.
      </p>
      <p>
        The class can also go on one element. This toggle turns only its own surface, and remembers
        the choice once the page has settled:
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

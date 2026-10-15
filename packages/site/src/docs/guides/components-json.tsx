import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";

export const SAMPLE = `{
  "registry": "node_modules",
  "paths": {
    "ui": "src/components/ui",
    "lib": "src/components/lib",
    "theme": "src/components/theme",
    "components": "src/components",
    "hooks": "src/hooks"
  },
  "theme": { "base": "neutral", "accent": "blue", "radius": "0.625rem" },
  "reset": true,
  "items": {}
}`;

export const REGISTRIES = `{
  "registries": {
    "@acme": "https://acme.example.com/r/{name}.json",
    "@private": {
      "url": "https://registry.example.com/{name}.json",
      "headers": { "Authorization": "Bearer \${API_TOKEN}" }
    }
  }
}`;

export const sections: readonly DocsSection[] = [
  { id: "registry", label: "registry" },
  { id: "registries", label: "registries" },
  { id: "paths", label: "paths" },
  { id: "theme", label: "theme" },
  { id: "reset", label: "reset" },
  { id: "items", label: "items" },
];

export function Body() {
  return (
    <>
      <p>
        <code>components.json</code> holds the configuration for your project. The CLI writes it on{" "}
        <code>barq-ui init</code> and reads it on every other command. You only need it if you use
        the CLI to add components; importing from the <code>@barqjs/ui</code> package needs no file.
      </p>
      <CodeBlock code={SAMPLE} title="components.json" />

      <h2 class={anchor} id="registry">
        registry
      </h2>
      <p>
        Where items come from. <code>"node_modules"</code> reads the copy of <code>@barqjs/ui</code>{" "}
        the project already has, so a monorepo, a pinned version and a machine with no network all
        work, and what <code>add</code> writes is the version in your lockfile. Anything else is a
        URL with <code>{"{name}"}</code> in it.
      </p>

      <h2 class={anchor} id="registries">
        registries
      </h2>
      <p>
        More registries, by scope. An item from one is addressed as <code>@scope/name</code>. A
        value is a URL pattern, or an object with a <code>url</code> and <code>headers</code>.{" "}
        <code>{"${NAME}"}</code> is read from the environment, so a token is never written into the
        file. A pattern that is not a URL is a path from the project root.
      </p>
      <CodeBlock code={REGISTRIES} title="components.json" />

      <h2 class={anchor} id="paths">
        paths
      </h2>
      <p>
        Where files go. <code>ui</code>, <code>lib</code>, <code>theme</code> and <code>hooks</code>{" "}
        each take the files of their type by name. Blocks, components and examples keep the path
        their registry gave them, under <code>components</code>. A component's own imports are
        relative and are recomputed against where the files land, so no layout depends on a{" "}
        <code>tsconfig</code> alias.
      </p>

      <h2 class={anchor} id="theme">
        theme
      </h2>
      <p>
        A base colour theme in <code>base</code>, optionally an <code>accent</code> over it, and the{" "}
        <code>radius</code>. <code>init</code> writes them into a <code>theme.ts</code> the compiler
        folds into a stylesheet. <code>style</code> is one of the eight component styles and is
        optional: with none you get the package's own look.
      </p>

      <h2 class={anchor} id="reset">
        reset
      </h2>
      <p>
        Whether the CSS reset is installed. <code>barq-ui init --no-reset</code> writes{" "}
        <code>false</code>.
      </p>

      <h2 class={anchor} id="items">
        items
      </h2>
      <p>
        What the project has, with a hash per file. The CLI writes this, and it is what lets{" "}
        <code>sync</code> tell a file you have edited from one you have not.
      </p>
    </>
  );
}

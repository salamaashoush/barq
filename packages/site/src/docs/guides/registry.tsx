import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock, CommandTabs } from "../code.tsx";

export const ITEM = `{
  "name": "pricing-table",
  "type": "registry:ui",
  "title": "Pricing Table",
  "dependencies": ["@barqjs/core", "@barqjs/css"],
  "registryDependencies": ["button", "card"],
  "files": [
    {
      "path": "ui/pricing-table.tsx",
      "type": "registry:ui",
      "content": "export function PricingTable() {\\n  return null;\\n}\\n"
    }
  ]
}`;

export const sections: readonly DocsSection[] = [
  { id: "item", label: "An item" },
  { id: "build", label: "Build a registry" },
  { id: "use", label: "Use a registry" },
];

export function Body() {
  return (
    <>
      <p>
        A registry is a set of JSON files, one per item, that the CLI reads to write components into
        a project. <code>@barqjs/ui</code> ships its own in the package, and you can build and serve
        one for your own components.
      </p>

      <h2 class={anchor} id="item">
        An item
      </h2>
      <p>
        An item names itself, says what it is, and carries its files with their contents.{" "}
        <code>dependencies</code> are npm packages. <code>registryDependencies</code> are other
        items: a bare name means the project's own registry, and <code>@scope/name</code> one of the
        registries the project lists.
      </p>
      <CodeBlock code={ITEM} title="pricing-table.json" />
      <p>
        An item may also carry <code>devDependencies</code>, <code>categories</code>,{" "}
        <code>meta</code>, <code>cssVars</code> and <code>css</code>. The last two are written into
        the project's <code>theme.ts</code>.
      </p>

      <h2 class={anchor} id="build">
        Build a registry
      </h2>
      <p>
        <code>build</code> reads a directory of components and writes the JSON. A file's bare
        imports are its npm dependencies and its relative imports are the items it needs. The
        directory a file is in is its type: <code>lib</code>, <code>theme</code>, <code>hooks</code>
        , <code>blocks</code>, <code>components</code>, <code>examples</code>, and <code>ui</code>{" "}
        for anything else. A directory under <code>blocks</code> is one item with every file in it.
      </p>
      <CommandTabs command="@barqjs/ui-cli build ./src/components" />

      <h2 class={anchor} id="use">
        Use a registry
      </h2>
      <p>
        Serve the result and point a <code>components.json</code> at it, as the registry or as one
        of several under <code>registries</code>.
      </p>
      <CodeBlock code={`{ "registry": "https://acme.example.com/r/{name}.json" }`} />
      <CodeBlock code="barq-ui add @acme/pricing-table" />
    </>
  );
}

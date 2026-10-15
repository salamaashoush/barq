import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock, CommandTabs } from "../code.tsx";
import app from "./snippets/installation/app.tsx?raw";

export const PACKAGES = [
  "@barqjs/ui",
  "@barqjs/aria",
  "@barqjs/css",
  "@barqjs/lucide",
  "@barqjs/ui-cli",
] as const;

export const sections: readonly DocsSection[] = [
  { id: "package", label: "Install the package" },
  { id: "styles", label: "Add the base styles" },
  { id: "cli", label: "Copy components with the CLI" },
];

export function Body() {
  return (
    <>
      <p>
        There are two ways to use the components. Install <code>@barqjs/ui</code> and import from
        it, or copy the components into your project with the CLI and own the code. Both need a barq
        app that compiles with the barq Vite plugin.
      </p>

      <h2 class={anchor} id="package">
        Install the package
      </h2>
      <p>
        Behaviour comes from <code>@barqjs/aria</code>, styling from <code>@barqjs/css</code> and
        icons from <code>@barqjs/lucide</code>.
      </p>
      <CodeBlock code="bun add @barqjs/ui @barqjs/aria @barqjs/css @barqjs/lucide" />

      <h2 class={anchor} id="styles">
        Add the base styles
      </h2>
      <p>
        Importing from <code>@barqjs/ui/theme</code> brings the base scale with it. Install a theme
        once, at the root of the app, then import a component and use it.
      </p>
      <CodeBlock code={app} title="src/app.tsx" />
      <p>
        The components sit in CSS layers, so a reset of your own that is not in a layer beats them.
        Put your reset in a layer, or import the package's one.
      </p>
      <CodeBlock code={`import "@barqjs/ui/theme/reset";`} />

      <h2 class={anchor} id="cli">
        Copy components with the CLI
      </h2>
      <p>
        <code>init</code> writes <code>components.json</code>, the theme and the base styles into
        your project.
      </p>
      <CommandTabs command="@barqjs/ui-cli init" />
      <p>
        <code>add</code> writes a component, everything it depends on, and installs the npm packages
        those files import.
      </p>
      <CommandTabs command="@barqjs/ui-cli add button" />
      <p>
        The files land under <code>paths.ui</code> from <code>components.json</code>, which is{" "}
        <code>src/components/ui</code> by default. They are your code from then on.
      </p>
    </>
  );
}

import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock, CommandTabs } from "../code.tsx";

export const COMMANDS = ["init", "add"] as const;

export const APP = `import "./components/theme/theme.ts";
import { Button } from "./components/ui/button.tsx";

export default function App() {
  return <Button variant="outline">Click me</Button>;
}`;

export const sections: readonly DocsSection[] = [
  { id: "init", label: "Run init" },
  { id: "add", label: "Add components" },
  { id: "use", label: "Use them" },
];

export function Body() {
  return (
    <>
      <p>
        The components are not a package you install. The CLI copies their source into your project,
        and from then on it is your code. You need a barq app that compiles with the barq Vite
        plugin.
      </p>

      <h2 class={anchor} id="init">
        Run init
      </h2>
      <p>
        <code>init</code> writes <code>components.json</code>, the theme and the base styles, and
        installs the packages they import: <code>@barqjs/aria</code> for behaviour,{" "}
        <code>@barqjs/css</code> for styling, <code>@barqjs/lucide</code> for icons and{" "}
        <code>@barqjs/primitives</code> for refs and observers.
      </p>
      <CommandTabs command="@barqjs/ui-cli init" />

      <h2 class={anchor} id="add">
        Add components
      </h2>
      <p>
        <code>add</code> writes a component and everything it depends on, and installs the npm
        packages those files import. The files land under <code>paths.ui</code> from{" "}
        <code>components.json</code>, which is <code>src/components/ui</code> by default.
      </p>
      <CommandTabs command="@barqjs/ui-cli add button" />

      <h2 class={anchor} id="use">
        Use them
      </h2>
      <p>
        Import the theme once, at the root of the app, then import the components from where{" "}
        <code>add</code> wrote them.
      </p>
      <CodeBlock code={APP} title="src/app.tsx" />
      <p>
        The components sit in CSS layers, so a reset of your own that is not in a layer beats them.
        Put your reset in a layer, or keep the one <code>init</code> installs.
      </p>
    </>
  );
}

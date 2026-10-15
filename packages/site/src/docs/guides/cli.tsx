import { For, type Incoming } from "@barqjs/core";

import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock, CommandTabs } from "../code.tsx";

interface Option {
  readonly flag: string;
  readonly does: string;
}

interface Command {
  readonly name: string;
  /** What follows `barq-ui` on the line the page shows. */
  readonly line: string;
  readonly does: string;
  readonly options: readonly Option[];
}

const PACKAGE = "@barqjs/ui-cli";

export const COMMANDS: readonly Command[] = [
  {
    name: "init",
    line: "init",
    does: "Sets up `components.json`, the theme and the base styles. It asks for the component style, the base colour theme, an accent and the radius from a list, and each has a flag so the command can be scripted.",
    options: [
      { flag: "--path <dir>", does: "Where components go." },
      { flag: "--registry <url>", does: "A registry URL containing `{name}`." },
      {
        flag: "--style <name>",
        does: "The component style: `vega`, `nova`, `lyra` and the others.",
      },
      { flag: "--theme <name>", does: "The base colour theme." },
      { flag: "--accent <name>", does: "An accent over the base." },
      { flag: "--radius <len>", does: "The radius." },
      {
        flag: "--dark <sel>",
        does: "The selector dark mode is asked for by, or `media` to follow the operating system.",
      },
      { flag: "--no-reset", does: "Do not install the CSS reset." },
    ],
  },
  {
    name: "add",
    line: "add button card dialog",
    does: "Adds components and blocks with whatever they need: the item, everything its `registryDependencies` name, and the npm packages those files import that the project does not have. The package manager is the one whose lockfile is nearest.",
    options: [
      { flag: "--all", does: "Every ui component the registry has." },
      { flag: "--dry-run", does: "Say what would be written, and write nothing." },
      {
        flag: "--diff[=<file>]",
        does: "Show what would change in the files you have, and write nothing.",
      },
      {
        flag: "--view[=<file>]",
        does: "Show the files as they would be written, and write nothing.",
      },
      { flag: "--no-install", does: "Print the install command instead of running it." },
      { flag: "--overwrite", does: "Replace a file you have edited." },
    ],
  },
  {
    name: "diff",
    line: "diff button",
    does: "Shows what the registry has that your copy does not. With no name it checks every item the project has.",
    options: [],
  },
  {
    name: "sync",
    line: "sync",
    does: "Takes the registry's version and keeps your edits. `init` and `add` record a hash per file in `components.json`, so a file you have not touched is replaced, and a file you edited is shown as a diff and kept.",
    options: [{ flag: "--overwrite", does: "Replace a file you have edited." }],
  },
  {
    name: "list",
    line: "list",
    does: "Lists what the registry offers.",
    options: [],
  },
  {
    name: "search",
    line: "search sidebar",
    does: "Finds items by name, description or category.",
    options: [{ flag: "--json", does: "Print JSON." }],
  },
  {
    name: "view",
    line: "view button",
    does: "Prints items as the registry serves them.",
    options: [],
  },
  {
    name: "info",
    line: "info",
    does: "Prints what this project is set up with.",
    options: [{ flag: "--json", does: "Print JSON." }],
  },
  {
    name: "theme",
    line: "theme stone",
    does: "Changes the colour theme and rewrites the project's `theme.ts`.",
    options: [],
  },
  {
    name: "style",
    line: "style nova",
    does: "Changes the component style and copies that stylesheet into the project.",
    options: [],
  },
  {
    name: "build",
    line: "build ./src/components",
    does: "Turns a directory of components into the JSON a registry serves.",
    options: [],
  },
];

export const GLOBAL_OPTIONS: readonly Option[] = [
  { flag: "-c, --cwd <dir>", does: "Where the project is. Defaults to the current directory." },
  { flag: "--yes", does: "Take every default without asking." },
  { flag: "-h, --help", does: "Show the usage." },
];

export const sections: readonly DocsSection[] = [
  ...COMMANDS.map((command) => ({ id: command.name, label: command.name })),
  { id: "options", label: "Options" },
  { id: "namespaces", label: "Namespaced registries" },
];

function Text(props: Incoming<{ text: string }>) {
  const parts = props
    .text()
    .split("`")
    .map((text, at) => ({ text, code: at % 2 === 1 }))
    .filter((part) => part.text !== "");
  return (
    <For each={() => parts}>
      {(part: { text: string; code: boolean }) =>
        part.code ? <code>{part.text}</code> : <span>{part.text}</span>
      }
    </For>
  );
}

function Options(props: Incoming<{ options: readonly Option[] }>) {
  return (
    <ul>
      <For each={() => props.options()}>
        {(option: Option) => (
          <li>
            <code>{option.flag}</code> <Text text={option.does} />
          </li>
        )}
      </For>
    </ul>
  );
}

export function Body() {
  return (
    <>
      <p>
        The CLI is the <code>{PACKAGE}</code> package and its command is <code>barq-ui</code>. It
        copies <code>@barqjs/ui</code> components into your project and keeps them in step with the
        registry they came from. Piped into a script there is nowhere to prompt, so every question
        takes its default.
      </p>
      <For each={() => COMMANDS}>
        {(command: Command) => (
          <>
            <h2 class={anchor} id={command.name}>
              {command.name}
            </h2>
            <p>
              <Text text={command.does} />
            </p>
            <CommandTabs command={`${PACKAGE} ${command.line}`} />
            {command.options.length === 0 ? null : <Options options={command.options} />}
          </>
        )}
      </For>
      <h2 class={anchor} id="options">
        Options
      </h2>
      <p>These apply to every command.</p>
      <Options options={GLOBAL_OPTIONS} />
      <h2 class={anchor} id="namespaces">
        Namespaced registries
      </h2>
      <p>
        A name is an item in the project's registry, or <code>@scope/name</code> for one of the
        registries <code>components.json</code> lists under <code>registries</code>.
      </p>
      <CodeBlock code={`barq-ui add @acme/pricing-table\nbarq-ui view @acme/pricing-table`} />
    </>
  );
}

import { For, type Incoming } from "@barqjs/core";

import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock, CommandTabs } from "../code.tsx";
import tokens from "./snippets/theming/tokens.tsx?raw";

export const TOKENS: readonly { readonly name: string; readonly does: string }[] = [
  { name: "--background", does: "The page, and the text on it in `--foreground`." },
  { name: "--card", does: "A card's surface, with `--card-foreground`." },
  { name: "--popover", does: "A menu's or a popover's surface, with `--popover-foreground`." },
  { name: "--primary", does: "The main action, with `--primary-foreground`." },
  { name: "--secondary", does: "A quieter action, with `--secondary-foreground`." },
  { name: "--muted", does: "A subdued surface, with `--muted-foreground` for subdued text." },
  { name: "--accent", does: "A hovered or highlighted row, with `--accent-foreground`." },
  { name: "--destructive", does: "A dangerous action." },
  { name: "--border", does: "Rules and outlines." },
  { name: "--input", does: "A field's border." },
  { name: "--ring", does: "The focus ring." },
  { name: "--chart-1", does: "The first of five chart colours, through `--chart-5`." },
];

export const DARK = `{
  "theme": { "base": "stone", "dark": "media" }
}`;

export const STYLES = ["vega", "nova", "maia", "lyra", "mira", "luma", "sera", "rhea"] as const;

export const sections: readonly DocsSection[] = [
  { id: "tokens", label: "Tokens" },
  { id: "install", label: "Install a theme" },
  { id: "scope", label: "Scope and dark mode" },
  { id: "use", label: "Use the tokens" },
  { id: "styles", label: "Component styles" },
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

export function Body() {
  return (
    <>
      <p>
        The components read CSS variables. A theme is a set of values for them, one for light and
        one for dark, in the <code>barq.theme</code> layer.
      </p>

      <h2 class={anchor} id="tokens">
        Tokens
      </h2>
      <p>A surface token names a background, and its foreground twin the text on it.</p>
      <ul>
        <For each={() => TOKENS}>
          {(token: (typeof TOKENS)[number]) => (
            <li>
              <code>{token.name}</code> <Text text={token.does} />
            </li>
          )}
        </For>
      </ul>

      <h2 class={anchor} id="install">
        Install a theme
      </h2>
      <p>
        <code>init</code> asks for a base colour theme, an accent over it and a radius, and writes
        them into <code>theme.ts</code> beside the components: a <code>globalCss</code> block the
        compiler folds into the stylesheet, so nothing runs in the browser. Changing the theme is
        one command, and it rewrites the file for you.
      </p>
      <CommandTabs command="@barqjs/ui-cli theme stone" />

      <h2 class={anchor} id="scope">
        Scope and dark mode
      </h2>
      <p>
        A theme is written on <code>:root</code> and its dark values under <code>.dark</code>.{" "}
        <code>theme.dark</code> in <code>components.json</code>, or <code>init --dark</code>, takes
        another selector or <code>"media"</code> to follow the operating system.
      </p>
      <CodeBlock code={DARK} title="components.json" />

      <h2 class={anchor} id="use">
        Use the tokens
      </h2>
      <p>Your own styles read the same variables, so they follow the theme.</p>
      <CodeBlock code={tokens} title="src/note.tsx" />

      <h2 class={anchor} id="styles">
        Component styles
      </h2>
      <p>
        A style changes the shape of the components rather than their colours: the radius, the
        spacing, the type. There are eight, and a style is optional. With none you get the package's
        own look.
      </p>
      <ul>
        <For each={() => STYLES}>
          {(style: string) => (
            <li>
              <code>{style}</code>
            </li>
          )}
        </For>
      </ul>
      <CommandTabs command="@barqjs/ui-cli style nova" />
    </>
  );
}

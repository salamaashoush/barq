/**
 * What can be added to a scaffolded project. One list, read by the prompt, by
 * `--list-add-ons` and by the gate that applies every entry of it.
 */

import { type PackageManager, addImport, execute, run } from "./project.ts";

export interface AddOnContext {
  readonly directory: string;
  readonly template: string;
  readonly packageManager: PackageManager;
  /** Whether dependencies were installed, so an add-on knows it may install its own. */
  readonly installed: boolean;
  /** This package's version, which is the release every barq package shares. */
  readonly version: string;
}

export interface AddOn {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** Returns what a person still has to do by hand, if anything. */
  apply(context: AddOnContext): string | undefined;
}

/** Where each template's entry is, which is where a theme is imported once. */
const ENTRY: Readonly<Record<string, readonly [file: string, specifier: string]>> = {
  "full-stack": ["src/routes/__root.tsx", "../components/theme/theme.ts"],
  spa: ["src/main.tsx", "./components/theme/theme.ts"],
  minimal: ["src/main.tsx", "./components/theme/theme.ts"],
};

const STARTER_COMPONENTS = ["button", "card", "input", "label"];

export const ADD_ONS: readonly AddOn[] = [
  {
    name: "ui",
    title: "UI components",
    description: "barq-ui: a theme and styled, accessible components copied into the project.",
    apply(context) {
      const cli = [...execute(context.packageManager), `@barqjs/ui-cli@${context.version}`];
      const skip = context.installed ? [] : ["--no-install"];
      const steps: readonly (readonly string[])[] = [
        [...cli, "init", "--yes"],
        [...cli, "add", ...STARTER_COMPONENTS, "--yes", ...skip],
      ];
      for (const step of steps) {
        if (run(context.directory, step).code !== 0) return `finish it with: ${step.join(" ")}`;
      }
      const entry = ENTRY[context.template];
      if (entry !== undefined) addImport(context.directory, entry[0], `import "${entry[1]}";`);
      return undefined;
    },
  },
];

export function findAddOn(name: string): AddOn | undefined {
  return ADD_ONS.find((addOn) => addOn.name === name);
}

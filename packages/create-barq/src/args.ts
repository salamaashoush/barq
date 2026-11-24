/** The command line, parsed. Every prompt has a flag, so a script never meets one. */

export interface Args {
  readonly directory?: string;
  readonly template?: string;
  /** `undefined` when not said, so the prompt may ask. */
  readonly addOns?: readonly string[];
  readonly packageManager?: string;
  readonly install?: boolean;
  readonly git?: boolean;
  readonly yes: boolean;
  readonly overwrite: boolean;
  readonly offline: boolean;
  readonly ref?: string;
  readonly list?: "templates" | "add-ons";
  readonly json: boolean;
  readonly help: boolean;
}

const VALUED = new Map<string, "template" | "addOns" | "packageManager" | "ref">([
  ["-t", "template"],
  ["--template", "template"],
  ["--add-ons", "addOns"],
  ["--pm", "packageManager"],
  ["--package-manager", "packageManager"],
  ["--ref", "ref"],
]);

export function parse(argv: readonly string[]): Args {
  const out: {
    -readonly [K in keyof Args]: Args[K];
  } = { yes: false, overwrite: false, offline: false, json: false, help: false };

  function set(key: "template" | "addOns" | "packageManager" | "ref", value: string): void {
    if (key === "addOns") {
      out.addOns = value
        .split(",")
        .map((name) => name.trim())
        .filter((name) => name !== "" && name !== "none");
    } else out[key] = value;
  }

  for (let at = 0; at < argv.length; at++) {
    const arg = argv[at] ?? "";
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const name = equals === -1 ? arg : arg.slice(0, equals);
    const valued = VALUED.get(name);
    if (valued !== undefined) {
      const value = equals === -1 ? argv[++at] : arg.slice(equals + 1);
      if (value === undefined || value.startsWith("-")) throw new Error(`${name} needs a value`);
      set(valued, value);
    } else if (arg === "-h" || arg === "--help") out.help = true;
    else if (arg === "-y" || arg === "--yes") out.yes = true;
    else if (arg === "--overwrite") out.overwrite = true;
    else if (arg === "--offline") out.offline = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--install") out.install = true;
    else if (arg === "--no-install") out.install = false;
    else if (arg === "--git") out.git = true;
    else if (arg === "--no-git") out.git = false;
    else if (arg === "--no-add-ons") out.addOns = [];
    else if (arg === "--list-templates") out.list = "templates";
    else if (arg === "--list-add-ons") out.list = "add-ons";
    // An unknown flag is not a directory name. Scaffolding into `--tempalte` is
    // the typo this refuses.
    else if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    else out.directory ??= arg;
  }
  return out;
}

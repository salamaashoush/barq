#!/usr/bin/env node
/**
 * `barq`: the command line of the framework.
 *
 * No dependencies beyond the compiler it drives. The argument parsing is
 * smaller than a library that would do it.
 */

import { realpathSync } from "node:fs";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";

import { check, codes, formatText, type Paint } from "./check.ts";

export { applyFixes, check, codes, formatText } from "./check.ts";
export type {
  CheckOptions,
  CheckResult,
  CodeEntry,
  Edit,
  Finding,
  Paint,
  Severity,
} from "./check.ts";

const HELP = `\
barq check [paths...]   Report the compiler's findings for a project
barq codes              List every code the compiler can raise

check options:
  --json                One JSON document on stdout, for a program to read
  --fix                 Apply the fixes the findings carry, then report what is left
  --root <dir>          The project root (default: the current directory)
  --level <CODE=level>  Set a code to suppress, note, warning or error; repeatable
  --max-warnings <n>    Exit 1 when there are more warnings than this

codes options:
  --json                The list as JSON

Exit status: 0 clean, 1 findings at error level or past --max-warnings, 2 a
command line this does not understand.
`;

const LEVELS = new Set(["suppress", "note", "warning", "error"]);

class UsageError extends Error {}

interface Parsed {
  command: string | undefined;
  paths: string[];
  json: boolean;
  fix: boolean;
  root: string;
  levels: [string, string][];
  maxWarnings: number | undefined;
  help: boolean;
}

export function parse(argv: readonly string[]): Parsed {
  const parsed: Parsed = {
    command: undefined,
    paths: [],
    json: false,
    fix: false,
    root: process.cwd(),
    levels: [],
    maxWarnings: undefined,
    help: false,
  };
  const value = (flag: string, index: number): string => {
    const next = argv[index];
    if (next === undefined || next.startsWith("--")) {
      throw new UsageError(`\`${flag}\` takes a value, and none follows it.`);
    }
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] as string;
    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--json":
        parsed.json = true;
        break;
      case "--fix":
        parsed.fix = true;
        break;
      case "--root":
        parsed.root = value(arg, ++index);
        break;
      case "--level": {
        const pair = value(arg, ++index);
        const [code, level] = pair.split("=");
        if (code === undefined || level === undefined || !LEVELS.has(level)) {
          throw new UsageError(
            `\`--level ${pair}\` is not \`CODE=level\`, where level is one of suppress, note, warning, error. Write it as \`--level BARQ004=error\`.`,
          );
        }
        parsed.levels.push([code.toUpperCase(), level]);
        break;
      }
      case "--max-warnings": {
        const text = value(arg, ++index);
        const count = Number(text);
        if (!Number.isInteger(count) || count < 0) {
          throw new UsageError(
            `\`--max-warnings ${text}\` is not a whole number. Write it as \`--max-warnings 0\`.`,
          );
        }
        parsed.maxWarnings = count;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          throw new UsageError(`\`${arg}\` is not an option of barq. Run \`barq --help\`.`);
        }
        if (parsed.command === undefined) parsed.command = arg;
        else parsed.paths.push(arg);
    }
  }
  return parsed;
}

function painter(): Paint {
  const styled = stdout.isTTY && process.env["NO_COLOR"] === undefined;
  const code =
    (open: string) =>
    (text: string): string =>
      styled ? `\u001B[${open}m${text}\u001B[0m` : text;
  return {
    error: code("31"),
    warning: code("33"),
    note: code("36"),
    dim: code("2"),
    bold: code("1"),
  };
}

/** Run one command line and answer with the exit status. */
export function main(argv: readonly string[], write: (text: string) => void): number {
  let parsed: Parsed;
  try {
    parsed = parse(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    write(`${error.message}\n`);
    return 2;
  }
  if (parsed.help || parsed.command === undefined) {
    write(HELP);
    return parsed.help ? 0 : 2;
  }
  switch (parsed.command) {
    case "check": {
      const result = check({
        root: parsed.root,
        paths: parsed.paths,
        fix: parsed.fix,
        levels: parsed.levels,
      });
      write(
        parsed.json ? `${JSON.stringify(result, null, 2)}\n` : `${formatText(result, painter())}\n`,
      );
      const { errors, warnings } = result.summary;
      const over = parsed.maxWarnings !== undefined && warnings > parsed.maxWarnings;
      return errors > 0 || over ? 1 : 0;
    }
    case "codes": {
      const list = codes();
      write(
        parsed.json
          ? `${JSON.stringify(list, null, 2)}\n`
          : `${list.map((entry) => `${entry.code}  ${entry.level.padEnd(7)}  ${entry.summary}`).join("\n")}\n`,
      );
      return 0;
    }
    default:
      write(`\`${parsed.command}\` is not a command of barq. Run \`barq --help\`.\n`);
      return 2;
  }
}

/**
 * The guard compares the script node was asked to run with this module rather
 * than reading `import.meta.main`, which node defines only from 24.2. `argv[1]`
 * is the `.bin` symlink under a package manager, hence the realpath.
 */
function invokedDirectly(): boolean {
  const script = process.argv[1];
  return script !== undefined && realpathSync(script) === fileURLToPath(import.meta.url);
}

if (invokedDirectly()) {
  process.exitCode = main(process.argv.slice(2), (text) => stdout.write(text));
}

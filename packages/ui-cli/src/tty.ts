/**
 * Writing to a terminal, and asking it a question.
 *
 * No colour library and no prompt library: six escape codes are the whole of
 * what this needs, and `readline/promises` asks a question in three lines. A
 * package a person downloads in order to write eight files should not download
 * eight of its own first.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const CSI = "\u001B[";

/** `NO_COLOR` is the convention every tool honours, and a pipe is not a terminal. */
const styled = stdout.isTTY && process.env["NO_COLOR"] === undefined;

const code = (open: string): ((text: string) => string) =>
  styled ? (text) => `${CSI}${open}m${text}${CSI}0m` : (text) => text;

export const dim = code("2");
export const bold = code("1");
export const green = code("32");
export const red = code("31");
export const yellow = code("33");
export const cyan = code("36");

export function say(line = ""): void {
  stdout.write(`${line}\n`);
}

/** A diff, coloured. The marker in column one is what carries it without colour. */
export function paint(diff: string): string {
  return diff
    .split("\n")
    .map((line) =>
      line.startsWith("+") ? green(line) : line.startsWith("-") ? red(line) : dim(line),
    )
    .join("\n");
}

/** One line of a `choose` list: what is stored, and what is shown. */
export interface Option {
  readonly value: string;
  readonly label: string;
}

export interface Ask {
  question(text: string, fallback: string): Promise<string>;
  confirm(text: string, fallback: boolean): Promise<boolean>;
  choose(text: string, options: readonly Option[], fallback: string): Promise<string>;
  close(): void;
}

/**
 * What one answer to a `choose` list means, or `undefined` to ask again.
 *
 * Separate from the reading so it can be tested without a terminal: this is
 * where a list prompt is actually wrong or right, and the half above it is
 * three lines of `readline`.
 *
 * A number picks a line and a name picks itself, because a person reading
 * `1  Neutral` reasonably types either. An empty answer is the default, which
 * is what makes the whole prompt skippable.
 */
export function pick(
  answer: string,
  options: readonly Option[],
  fallback: string,
): string | undefined {
  const trimmed = answer.trim();
  if (trimmed === "") return fallback;

  // `Number("")` is 0 and `Number(" 2 ")` is 2, so the emptiness test above has
  // to come first and the trim has to happen before this.
  const index = Number(trimmed);
  if (Number.isInteger(index) && index >= 1 && index <= options.length) {
    return options[index - 1]?.value;
  }

  return options.find((option) => option.value === trimmed)?.value;
}

/**
 * Piped into a script there is nowhere to prompt, so every question takes its
 * default. That is what makes `--yes` unnecessary in CI rather than merely
 * available.
 *
 * `allowed` is the CALLER's opinion — `--yes` says do not ask — and it is
 * ANDed with whether there is a terminal to ask on. Trusting the caller alone
 * hung: `sync` in a pipeline opened a readline on a stdin that would never
 * answer.
 */
export function ask(allowed = true): Ask {
  const rl = allowed && stdin.isTTY ? createInterface({ input: stdin, output: stdout }) : null;

  return {
    async question(text, fallback) {
      if (rl === null) return fallback;
      const answer = (await rl.question(`${text} ${dim(`(${fallback})`)} `)).trim();
      return answer === "" ? fallback : answer;
    },
    async confirm(text, fallback) {
      if (rl === null) return fallback;
      const answer = (await rl.question(`${text} ${dim(fallback ? "(Y/n)" : "(y/N)")} `))
        .trim()
        .toLowerCase();
      if (answer === "") return fallback;
      return answer.startsWith("y");
    },
    async choose(text, options, fallback) {
      if (rl === null) return fallback;
      const width = String(options.length).length;
      say(text);
      for (const [index, option] of options.entries()) {
        const number = String(index + 1).padStart(width);
        const mark = option.value === fallback ? cyan("›") : " ";
        say(`  ${mark} ${dim(number)} ${option.label}`);
      }
      for (;;) {
        const answer = await rl.question(`Which? ${dim(`(${fallback})`)} `);
        const chosen = pick(answer, options, fallback);
        if (chosen !== undefined) return chosen;
        say(red(`  Not one of them. A number from 1 to ${String(options.length)}.`));
      }
    },
    close() {
      rl?.close();
    },
  };
}

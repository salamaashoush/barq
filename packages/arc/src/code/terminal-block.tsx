import { useArcMessages } from "../components/messages.ts";
import { CodeBlock, type CodeBlockProps } from "./code-block.tsx";
import { type CodeLine, type HighlightText, escapeHtml } from "./lines.ts";

export type TerminalLineKind = "command" | "continued" | "output" | "blank";

export interface TerminalLine {
  kind: TerminalLineKind;
  /** The line as shown: a command without its prompt. */
  text: string;
}

function continues(previous: TerminalLine | undefined): boolean {
  return (
    previous !== undefined &&
    (previous.kind === "command" || previous.kind === "continued") &&
    previous.text.endsWith("\\")
  );
}

/**
 * The lines of a terminal snippet by what they are. Without `transcript`
 * every line is a command, except one that carries on the line before (that
 * line ends in a backslash, or this one is indented) and a blank one. With
 * it, a command is a line that starts with the prompt and a space, and a
 * line that is neither a command nor carries one on is the command's output.
 */
export function terminalLines(code: string, transcript = false, prompt = "$"): TerminalLine[] {
  const out: TerminalLine[] = [];
  const marker = `${prompt} `;
  for (const line of code.split("\n")) {
    const previous = out.at(-1);
    if (continues(previous)) {
      out.push({ kind: "continued", text: line });
    } else if (transcript) {
      if (line.startsWith(marker)) out.push({ kind: "command", text: line.slice(marker.length) });
      else if (line === prompt) out.push({ kind: "command", text: "" });
      else out.push({ kind: line === "" ? "blank" : "output", text: line });
    } else if (line.trim() === "") {
      out.push({ kind: "blank", text: line });
    } else if (/^\s/.test(line) && previous !== undefined && previous.kind !== "blank") {
      out.push({ kind: "continued", text: line });
    } else {
      out.push({ kind: "command", text: line });
    }
  }
  return out;
}

/** What a copy of the snippet holds: its commands, without prompts or output. */
export function terminalCommands(lines: readonly TerminalLine[]): string {
  return lines
    .filter((line) => line.kind === "command" || line.kind === "continued")
    .map((line) => line.text)
    .join("\n");
}

function isCode(line: TerminalLine): boolean {
  return line.kind === "command" || line.kind === "continued";
}

export interface TerminalBlockProps extends Omit<
  CodeBlockProps,
  "lineNumbers" | "renderLines" | "copyValue" | "range"
> {
  /**
   * The commands, one a line. With `transcript`, the commands start with the
   * prompt and a space, and the lines between them are what they printed.
   */
  code: string;
  transcript?: boolean;
  /** Drawn before each command, and left out of a copy. @default "$" */
  prompt?: string;
}

/**
 * Commands to type into a terminal: a prompt before each one that neither
 * a copy nor a screen reader picks up, the lines that carry a command on
 * set under it, and with `transcript` what the commands printed, faint,
 * which the copy button leaves out too.
 *
 * ```tsx
 * <TerminalBlock code={"bun add @barqjs/arc\nbun run dev"} />
 * <TerminalBlock transcript code={"$ acme status\nAll 3 services up"} />
 * ```
 *
 * The commands are highlighted as shell unless `language` says otherwise,
 * long lines wrap unless `wrap` is false, and the figure is named
 * "Terminal" unless a `filename` or `label` names it.
 */
export function TerminalBlock(props: TerminalBlockProps) {
  const messages = useArcMessages();
  function prompt(): string {
    return props.prompt ?? "$";
  }
  function render(code: string, highlight: HighlightText): readonly CodeLine[] {
    const all = terminalLines(code, props.transcript === true, prompt());
    const highlighted = highlight(
      all
        .filter(isCode)
        .map((line) => line.text)
        .join("\n"),
    );
    let next = 0;
    return all.map((line): CodeLine => {
      if (line.kind === "command") {
        return { html: highlighted[next++] ?? "", attributes: { "data-prompt": prompt() } };
      }
      if (line.kind === "continued") {
        return { html: highlighted[next++] ?? "", attributes: { "data-continued": "" } };
      }
      if (line.kind === "output") {
        return { html: escapeHtml(line.text), attributes: { "data-output": "" } };
      }
      return { html: "" };
    });
  }
  return (
    <CodeBlock
      code={props.code}
      language={props.language ?? "shell"}
      highlighter={props.highlighter}
      wrap={props.wrap ?? true}
      marks={props.marks}
      filename={props.filename}
      label={props.label ?? messages().terminal}
      copyable={props.copyable}
      copyLabel={props.copyLabel}
      maxHeight={props.maxHeight}
      renderLines={render}
      copyValue={terminalCommands(terminalLines(props.code, props.transcript === true, prompt()))}
      classes={props.classes}
      class={props.class}
      className={props.className}
    />
  );
}

/** The line numbers beside a block of code, one a line. */
export function codeGutter(source: string): string {
  return Array.from({ length: source.split("\n").length }, (_, index) => index + 1).join("\n");
}

import type { Child } from "@barqjs/core";

const MARK = "\u0000";

export interface SentenceProps {
  /** The sentence from arc's messages, handed a marker where the part goes. */
  words: (part: string) => string;
  /** What stands where the marker is: a live countdown, a date, a name set apart. */
  children: Child;
}

/**
 * A translated sentence with an element placed where the language puts its
 * part, so a message stays one sentence for a translator however its parts
 * are drawn.
 */
export function Sentence(props: SentenceProps) {
  function pieces(): readonly string[] {
    return props.words(MARK).split(MARK);
  }
  return (
    <>
      {pieces()[0]}
      {props.children}
      {pieces()[1] ?? ""}
    </>
  );
}

/**
 * Three's tags in `@barqjs/web`'s JSX namespace, for a file whose
 * `jsxImportSource` is the document's and whose `<Canvas>` holds a scene:
 * importing anything from `@barqjs/three` brings them in, as importing
 * `@react-three/fiber` adds them to React's.
 *
 * Four names are both a three class and an element of the document: `audio`
 * and `source` in HTML, `line` and `path` in SVG. They stay the document's
 * here, and three's go by `threeAudio`, `threeSource`, `threeLine` and
 * `threePath`, as they do in React Three Fiber.
 */

import type { ThreeElements } from "./three-types.ts";

/** The tags three and the document both name; the document keeps them in its namespace. */
export type DocumentTagClashes = "audio" | "source" | "line" | "path";

export interface ThreeIntrinsicElements extends Omit<ThreeElements, DocumentTagClashes> {}

declare module "@barqjs/web/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements extends ThreeIntrinsicElements {}
  }
}

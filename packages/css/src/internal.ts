/**
 * What the two implementations of this semantic have to agree on.
 *
 * `@barqjs/compiler` compiles `atoms` at build time and this package evaluates
 * what it declined, and the two must name a declaration the same class or one
 * rule reaches the page under two names. Everything here exists so the parity
 * tests on both sides can read the same answer.
 *
 * NOT public API. It is a subpath rather than the index so that saying so does
 * not depend on anyone reading a comment: nothing here is stable, and a value
 * you find useful belongs in the index instead.
 */

export { NEST, kebab, tierOf } from "./atoms.ts";
export { TIERS, hash, register } from "./sheet.ts";
export { SHORTHANDS, UNEXPANDABLE, expand } from "./shorthands.ts";
export { dynamicVar } from "./atoms.ts";

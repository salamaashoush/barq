import { signal } from "@barqjs/core"

export const suffix = signal("un")

/**
 * A template whose html carries multi-byte characters PAST byte 100.
 *
 * §6.2 locates a hoisted template by scanning a fixed byte budget past the
 * declaration name, and the budget lands exactly there: slicing a `&str` at it
 * split a two-byte character in half and took the whole compile down with a Rust
 * panic. Vite passes `sourcemap: true` unconditionally, so that was an ordinary
 * accented paragraph killing the build. No other fixture had a non-ASCII byte
 * inside a template longer than 100 bytes.
 */
export default function UnicodeLongTemplate() {
  return (
    <p class="lead" data-kind="prose">
      This paragraph is deliberately long so that the accented word sits past the search budget — café
      naïve, 日本語のテキスト, and an emoji 🎉 for the astral case.
      <span>{() => suffix()}</span>
    </p>
  )
}

export const steps = [() => suffix.set("deux"), () => suffix.set("")]

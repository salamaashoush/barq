/**
 * What each element takes.
 *
 * An attribute belongs to the elements that have it, an enumerated one to its
 * words, and the spellings the compiler and the runtime already accept have to
 * typecheck: the `prop:` prefix, custom elements, a list of refs, a class
 * written as a list or a map.
 *
 * `attribute-types.test.ts` typechecks this directory: every positive compiles
 * and every `@ts-expect-error` fires.
 */

import { createSignal } from "@barqjs/core";
import type { FunctionMaybe } from "@barqjs/core";
import type { JSX } from "../index.ts";
import { assertType } from "./assert.ts";
import type { Equal } from "./assert.ts";

const [on] = createSignal(false);
const [label] = createSignal<string | undefined>("salama");
const holder: { current: HTMLDivElement | null } = { current: null };
declare const opened: (event: CustomEvent<{ id: number }>) => void;

export const perElement = (
  <form method="post" enctype="multipart/form-data" novalidate>
    <a href="https://example.com" target="_blank" rel="noreferrer" download>
      a link
    </a>
    <button type="submit" disabled formnovalidate popovertarget="menu" popovertargetaction="show">
      go
    </button>
    <input type="email" name="email" required autocomplete="email" enterkeyhint="send" />
    <input type="checkbox" checked={on()} readOnly />
    <input type="number" min={0} max="10" step={1} value={3} maxLength={2} />
    <label for="email" htmlFor="email">
      Email
    </label>
    <select multiple size={3} value="b">
      <optgroup label="letters">
        <option value="a" selected>
          A
        </option>
        <option value="b" disabled>
          B
        </option>
      </optgroup>
    </select>
    <textarea rows={3} cols={40} wrap="soft" placeholder="notes" />
    <img src="/a.png" alt="" loading="lazy" decoding="async" fetchpriority="high" width={10} />
    <video src="/a.mp4" muted autoplay playsinline controls poster="/a.png" preload="metadata" />
    <audio src="/a.mp3" muted loop controls />
    <iframe src="https://example.com" sandbox="allow-scripts" allow="fullscreen" loading="lazy" />
    <table>
      <tbody>
        <tr>
          <th scope="col" colspan={2} abbr="n">
            name
          </th>
          <td colSpan={2} rowspan={1} headers="n">
            salama
          </td>
        </tr>
      </tbody>
    </table>
    <details open name="group">
      <summary>more</summary>
    </details>
    <dialog open closedby="any" />
    <meter min={0} max={10} value={3} low={2} high={8} optimum={5} />
    <progress max={10} value={3} />
    <ol reversed start={3} type="a">
      <li value={3}>three</li>
    </ol>
    <time datetime="2026-10-13">today</time>
    <blockquote cite="https://example.com">quoted</blockquote>
  </form>
);

export const globals = (
  <div
    id="root"
    tabIndex={0}
    hidden="until-found"
    inert
    popover="auto"
    draggable
    contenteditable="plaintext-only"
    spellcheck={false}
    dir="rtl"
    lang="ar"
    translate="no"
    enterkeyhint="done"
    inputmode="numeric"
    title={label()}
    onBeforeInput={(event) => {
      assertType<Equal<typeof event.inputType, string>>();
    }}
    onKeyDownCapture={(event) => {
      assertType<Equal<typeof event.key, string>>();
    }}
    onclick={(event) => {
      const target: HTMLDivElement = event.currentTarget;
      return target;
    }}
    ongotpointercapture={(event) => event.pointerId}
  />
);

/** An accessor is accepted wherever a value is, and may yield nothing. */
export const reactive = (
  <a
    href={() => "https://example.com"}
    title={label}
    class={() => (on() ? "on" : undefined)}
    aria-expanded={on}
    aria-label={label}
  >
    reactive
  </a>
);

export const aria = (
  <div
    role="dialog"
    aria-modal
    aria-expanded="false"
    aria-checked="mixed"
    aria-haspopup="listbox"
    aria-current="page"
    aria-live="polite"
    aria-invalid="spelling"
    aria-level={2}
    aria-valuenow="3"
    aria-labelledby="title"
    aria-hidden={on()}
  />
);

export const channels = <div prop:scrollTop={0} data-state="open" hidden={on()} />;

export const classes = (
  <div>
    <p class="one two" />
    <p class={["one", on() && "two", undefined, null]} />
    <p class={{ one: true, two: on(), three: undefined }} />
    <p class={on() && "one"} />
    <p class={["one", { two: on(), three: !on() }]} />
    <p class={["one", ["two", { three: on() }]]} />
  </div>
);

export const refs = (
  <div>
    <div ref={holder} />
    <div ref={(element) => element.focus()} />
    <div ref={[holder, (element) => element.focus()]} />
  </div>
);

export const customElements = (
  <my-toggle pressed prop:value={{ nested: 1 }} size="lg" open={on()} class="x" onToggled={opened}>
    <slot-content some-attribute="anything" />
  </my-toggle>
);

export const svg = (
  <svg viewBox="0 0 10 10" role="img" aria-label="chart" class={["chart"]} ref={[]}>
    <path d="M0 0" stroke-width={2} onClick={(event) => event.type} style={{ fill: "red" }} />
    <circle cx={1} cy={1} r={1} fill="red" data-point="1" />
  </svg>
);

export const mathml = (
  <math display="block" displaystyle>
    <mrow>
      <mi mathvariant="normal">x</mi>
      <mo form="infix" stretchy={false}>
        +
      </mo>
      <mfrac linethickness="0">
        <mn>1</mn>
        <msqrt>
          <mn>2</mn>
        </msqrt>
      </mfrac>
    </mrow>
    <mtable columnalign="left">
      <mtr>
        <mtd columnspan={2}>
          <mtext>cell</mtext>
        </mtd>
      </mtr>
    </mtable>
  </math>
);

type DivProps = JSX.IntrinsicElements["div"];
type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement>;
assertType<Equal<"href" extends keyof DivProps ? true : false, false>>();
assertType<
  Equal<
    ButtonProps["type"],
    FunctionMaybe<"submit" | "reset" | "button" | "menu" | undefined> | undefined
  >
>();

export const refused = (
  <div>
    {/* @ts-expect-error a `<div>` has no `href` */}
    <div href="https://example.com" />
    {/* @ts-expect-error a `<div>` has no `checked` */}
    <div checked />
    {/* @ts-expect-error a `<span>` cannot be disabled */}
    <span disabled />
    {/* @ts-expect-error `txet` is not an input type */}
    <input type="txet" />
    {/* @ts-expect-error a button's type is one of four words */}
    <button type="buton" />
    {/* @ts-expect-error `aria-expanded` is true or false */}
    <div aria-expanded="maybe" />
    {/* @ts-expect-error `aria-haspopup` names a popup kind */}
    <div aria-haspopup="sheet" />
    {/* @ts-expect-error `muted` belongs to media elements */}
    <div muted />
    {/* @ts-expect-error `loading` is lazy or eager */}
    <img src="/a.png" loading="later" />
    {/* @ts-expect-error a class map says whether each name applies */}
    <p class={["one", { two: "yes" }]} />
    {/* @ts-expect-error a ref holds an element */}
    <div ref={{ current: null as string | null }} />
    {/* @ts-expect-error a ref callback is handed this element, which is not a canvas */}
    <div ref={(element: HTMLCanvasElement) => element.getContext("2d")} />
    {/* @ts-expect-error an unknown tag without a hyphen is not a custom element */}
    <mytoggle />
    {/* @ts-expect-error an event is `onClick`; `on:` is not a namespace */}
    <div on:click={() => {}} />
    {/* @ts-expect-error a capture-phase listener is `onFocusCapture` */}
    <div capture:focus={() => {}} />
    {/* @ts-expect-error an attribute is written by its own name */}
    <div attr:title="open" />
    {/* @ts-expect-error presence is `hidden={on()}` */}
    <div bool:hidden={on()} />
    {/* @ts-expect-error one style property is a key of `style` */}
    <div style:color="red" />
    {/* @ts-expect-error a name ending in Capture binds the capture phase, so this one has no camelCase form */}
    <div onGotPointerCapture={() => {}} />
    {/* @ts-expect-error `target` is not an attribute of a button */}
    <button target="_blank" />
    {/* @ts-expect-error `popovertargetaction` is one of three words */}
    <button popovertargetaction="open" />
    {/* @ts-expect-error class toggles are a map in `class` */}
    <p classList={{ one: true }} />
    {/* @ts-expect-error `<math>` is displayed as a block or inline */}
    <math display="flex" />
    {/* @ts-expect-error `form` on an operator is prefix, infix or postfix */}
    <mo form="suffix" />
    {/* @ts-expect-error `href` is not an attribute of a MathML token */}
    <mi href="https://example.com" />
  </div>
);

/**
 * `bind:` — the declared type of the two-way channel.
 *
 * The compiler lowers `bind:` and the runtime implements it, and for a long
 * time nothing declared the attribute: `<input bind:value={name} />` was a
 * `TS2322` in every project with `strict` on, and the fixtures could not see it
 * because a fixture is compiled and never typechecked.
 *
 * The negatives are the half that matters. `Bindable` exists to refuse a
 * read-only accessor one step before `BIND_TARGET_NOT_WRITABLE` does, and a
 * refusal that stops firing is a rule that has quietly gone.
 */

import { computed, linked, signal } from "../index.ts";

const name = signal("Ada");
const agreed = signal(false);
const amount = signal(0);
const when = signal<Date | null>(null);
const picked = signal<FileList | null>(null);
const size = signal("s");
const showing = signal(false);
const draft = linked(
  () => name(),
  (value) => value,
);
const element: { current: HTMLInputElement | null } = { current: null };

// Every channel the compiler resolves, on the element it resolves it for.
export const accepted = (
  <form>
    <input type="text" bind:value={name} />
    <textarea bind:value={name} />
    <input type="checkbox" bind:value={agreed} />
    <input type="number" bind:value={amount} />
    <input type="range" bind:value={amount} />
    <input type="date" bind:value={when} />
    <input type="file" bind:files={picked} />
    <input type="radio" name="size" value="s" bind:group={size} />
    <select bind:value={name} />
    <div contenteditable="true" bind:value={name} />
    <dialog bind:open={showing} />
    <input type="checkbox" bind:checked={agreed} />
    {/* A `linked` cell is writable, so it binds. */}
    <input type="text" bind:value={draft} />
    {/* `bind:this` is a ref, not a channel. */}
    <input type="text" bind:this={element} />
    {/* Any other property name, which is the runtime's own rule. */}
    <div bind:scrollTop={amount} />
  </form>
);

const readOnly = computed(() => "Ada");
const bare = (): string => "Ada";

export const refused = (
  <form>
    {/* @ts-expect-error a computed has no `set`, so it cannot be a bind target */}
    <input type="text" bind:value={readOnly} />
    {/* @ts-expect-error a bare accessor has no `set` either */}
    <input type="text" bind:value={bare} />
    {/* @ts-expect-error a string signal is not a boolean channel */}
    <input type="checkbox" bind:checked={name} />
    {/* @ts-expect-error `files` takes a FileList, not a string */}
    <input type="file" bind:files={name} />
  </form>
);

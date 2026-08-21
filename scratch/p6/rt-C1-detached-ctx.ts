/**
 * RED-C1: does a DETACHED `root()` created during a render inherit that render's
 * context / catcher, and does it pin the render scope alive?
 * `makeScope` copies `parent.ctx` and `parent.catcher` and keeps `parent`
 * (signals.ts:695-712); `createOwnerScope` reads `getCurrentOwner()` even when
 * `registerWithParent` is false (:2594-2606).
 */
import { context, provide, read, root, scope, getOwner } from "@barqjs/core";

const Tenant = context<string>("NONE", "tenant");

let entryRead: (() => string) | null = null;
let entryOwner: { parent: unknown; ctx: unknown; dead: boolean; catcher: unknown } | null = null;
let disposeRender: (() => void) | null = null;

scope((dispose, s) => {
  disposeRender = dispose;
  provide(s, Tenant, () => "acme", (inner) => {
    // The entry cache mints its detached scope HERE — during the render.
    root((_d, es) => {
      entryOwner = es as unknown as typeof entryOwner;
      entryRead = read(Tenant) as unknown as () => string;
    });
    return inner;
  });
});

const own = entryOwner as NonNullable<typeof entryOwner>;
console.log("entry reads Tenant      :", entryRead?.());
console.log("entry.parent is null?   :", own.parent === null);
console.log("entry.ctx === parent.ctx:", own.ctx === (own.parent as { ctx: unknown } | null)?.ctx);
console.log("entry.catcher===parent's:", own.catcher === (own.parent as { catcher: unknown } | null)?.catcher);

disposeRender?.();
console.log("after render dispose, render scope dead?", (own.parent as { dead: boolean }).dead);
console.log("after render dispose, entry scope dead? ", own.dead);
console.log("after render dispose, entry still reads:", entryRead?.());

// A second 'request' with a different tenant reads the SAME cached entry.
scope((_d, s2) => {
  provide(s2, Tenant, () => "globex", (inner) => {
    console.log("under tenant=globex the cached entry reads:", entryRead?.());
    return inner;
  });
});

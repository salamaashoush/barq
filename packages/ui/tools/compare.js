/**
 * The browser half of `tools/geometry.ts`.
 *
 * Appends a probe carrying upstream's own utility classes beside each element
 * this package rendered, and reports every computed property that differs. Run
 * it in a real browser: a headless DOM has no opinion about geometry, which is
 * the whole reason this exists.
 *
 * Not run on its own: `geometry.ts` writes it into `probe.js` behind the
 * stylesheet and the slots it reads from `globalThis.__geometryInput`, so the
 * page evaluating it needs nothing served beside it.
 */
globalThis.__geometry = (async () => {
  /** @type {{ css: string, spec: Record<string, { selector: string, classes: string }> }} */
  const { css, spec } = globalThis.__geometryInput;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  // Only slots the specs describe in ONE entry. A slot split across several —
  // `attachment`, `attachment-size-sm`, `attachment-orientation-vertical` — is
  // a base plus mutually exclusive variants, and no single class list is what
  // the element carries: comparing against the base alone reports the variants
  // as differences that are the harness's rather than the package's.
  const counts = new Map();
  for (const name of Object.keys(spec)) {
    const slot = name.split("/")[1];
    counts.set(slot, (counts.get(slot) ?? 0) + 1);
  }
  const base = new Map();
  for (const [name, entry] of Object.entries(spec)) {
    const slot = name.split("/")[1];
    if (counts.get(slot) === 1 && !base.has(slot)) base.set(slot, entry);
  }

  const PROPS = [
    "display",
    "position",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "margin-top",
    "margin-bottom",
    "border-top-width",
    "border-top-left-radius",
    "font-size",
    "line-height",
    "font-weight",
    "color",
    "background-color",
    "gap",
    "flex-direction",
    "align-items",
    "justify-content",
    "text-align",
    "overflow",
    "flex-grow",
    "flex-shrink",
    "white-space",
    "text-overflow",
    "box-sizing",
  ];

  const differing = [];
  let compared = 0;
  let ambiguous = 0;

  for (const [slot, entry] of base) {
    const all = [...document.querySelectorAll(entry.selector)].filter(
      (each) => each instanceof HTMLElement && each.offsetParent !== null,
    );
    // Exactly one VISIBLE element, or which one the rule meant is a guess.
    if (all.length !== 1) {
      ambiguous++;
      continue;
    }
    const el = all[0];
    const probe = document.createElement(el.tagName);
    probe.className = entry.classes;
    probe.textContent = "x";
    el.parentElement.append(probe);
    const theirs = getComputedStyle(/** @type {Element} */ (probe));
    const ours = getComputedStyle(/** @type {Element} */ (el));
    const bad = PROPS.filter((p) => theirs.getPropertyValue(p) !== ours.getPropertyValue(p)).map(
      (p) => `${p}: ${theirs.getPropertyValue(p)} | ${ours.getPropertyValue(p)}`,
    );
    probe.remove();
    compared++;
    if (bad.length > 0) differing.push({ slot, bad });
  }

  style.remove();
  return { compared, ambiguous, differing };
})();

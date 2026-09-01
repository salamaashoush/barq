/**
 * The style on the page, measured against the elements it actually styles.
 *
 * ```
 * bun run gallery
 * # in the page, once per style (?style=vega, ?style=nova, …):
 * eval(await (await fetch("/sweep.js")).text());
 * await globalThis.__sweep;
 * ```
 *
 * `bun run styles` asks whether a rule REACHED an element, and answers it by
 * matching slot names before anything is rendered. This asks the two questions
 * only a browser can, and each has already been the whole of a bug here:
 *
 * 1. **Does every custom property a rule reads resolve?** An undefined `var()`
 *    is invalid at computed-value time, so the declaration is dropped and the
 *    property takes its INITIAL value — not the value of the rule underneath.
 *    That is how all eight styles rendered every corner square with no error
 *    anywhere, and how the picker's popup came to have no background at all.
 *
 * 2. **Does every rule match something?** A selector naming a hook the
 *    components never write — a marker class, `data-state="checked"`, a size
 *    attribute — parses, ships, and silently styles nothing. Nineteen of the
 *    twenty-eight group markers were in that state, and every rule hanging off
 *    one was dead under all eight styles.
 *
 * A rule that matches nothing is reported as UNREACHED rather than as a
 * failure, because plenty of them are honestly conditional: `:hover`, an open
 * overlay, a disabled control. What the caller does with the list is compare it
 * against the states the page can actually be in — an unreached rule whose
 * selector has no pseudo-class and no state attribute is a real gap.
 *
 * What this does NOT prove: that the values are shadcn's. `tools/geometry.ts`
 * is the comparison against upstream's own utilities; this is the narrower
 * check that what we ship arrives intact.
 */

globalThis.__sweep = (() => {
  const scope = document.querySelector('[data-slot="preview"]') ?? document.body;
  const style = [...scope.classList].find((name) => name.startsWith("style-")) ?? null;
  if (style === null) return { error: "no style on the preview; open ?style=vega" };

  const sheet = [...document.styleSheets].find((each) => {
    try {
      return each.ownerNode?.textContent?.includes(`.${style} {`) === true;
    } catch {
      return false;
    }
  });
  if (sheet === undefined) return { error: `no stylesheet for ${style}` };

  /** Every rule, with its selector resolved through the nesting. */
  const rules = [];
  const walk = (list, prefix) => {
    for (const rule of list) {
      const own = rule.selectorText;
      // `&` is the parent, and a nested selector without one is a descendant.
      // Both have to be spelled out or `matches` answers a different question.
      const here =
        own === undefined
          ? prefix
          : prefix === ""
            ? own
            : own.includes("&")
              ? own.replaceAll("&", `:is(${prefix})`)
              : `${prefix} :is(${own})`;
      if (rule.style !== undefined && rule.style.length > 0) {
        rules.push({ selector: here, declarations: rule.style });
      }
      if (rule.cssRules !== undefined && rule.cssRules.length > 0) walk(rule.cssRules, here);
    }
  };
  walk(sheet.cssRules, "");

  /**
   * The names in `var(--x)` that have NO fallback.
   *
   * A `var()` with one is not a bug when the token is absent — that is what the
   * fallback is for, and this package leans on it: `var(--ui-leading, var(--text-sm--line-height))`
   * is how a descendant overrides a line height it usually inherits, and
   * `var(--ui-ring-inset,)` is a deliberate empty. Only a bare read can drop a
   * declaration, so only a bare read is worth reporting.
   */
  const varsIn = (value) => {
    const out = [];
    for (let at = value.indexOf("var("); at >= 0; at = value.indexOf("var(", at + 4)) {
      let depth = 0;
      let comma = -1;
      let end = value.length;
      for (let scan = at + 3; scan < value.length; scan++) {
        const character = value[scan];
        if (character === "(") depth++;
        else if (character === ")") {
          depth--;
          if (depth === 0) {
            end = scan;
            break;
          }
        } else if (character === "," && depth === 1 && comma < 0) comma = scan;
      }
      if (comma >= 0) continue;
      const name = value.slice(at + 4, end).trim();
      if (name.startsWith("--")) out.push(name);
    }
    return out;
  };

  /** A selector that can only match in a state the page is not in right now. */
  const CONDITIONAL =
    /:hover|:focus|:active|:target|::|\[data-(open|closed|selected|focused|disabled|hovered|pressed|state|placeholder|invalid|dragging|active|expanded)/;

  const unreached = [];
  const unresolved = new Map();
  let matched = 0;
  let checked = 0;

  for (const { selector, declarations } of rules) {
    let elements = [];
    try {
      elements = [...scope.querySelectorAll(selector)];
      // The scope itself can be the match, and `querySelectorAll` never returns it.
      if (scope.matches(selector)) elements.unshift(scope);
    } catch {
      unreached.push({ selector, why: "not a selector this browser parses" });
      continue;
    }

    if (elements.length === 0) {
      if (!CONDITIONAL.test(selector)) unreached.push({ selector, why: "matches no element" });
      continue;
    }
    matched++;

    // One element is enough: a token either resolves in this tree or it does
    // not, and every match is in the same scope.
    const element = elements[0];
    const computed = getComputedStyle(element);
    for (let at = 0; at < declarations.length; at++) {
      const property = declarations.item(at);
      for (const name of varsIn(declarations.getPropertyValue(property))) {
        checked++;
        if (computed.getPropertyValue(name).trim() !== "") continue;
        const held = unresolved.get(name) ?? { token: name, count: 0, example: selector };
        held.count++;
        unresolved.set(name, held);
      }
    }
  }

  return {
    style,
    rules: rules.length,
    matched,
    tokenReadsChecked: checked,
    unresolvedTokens: [...unresolved.values()].sort((a, b) => b.count - a.count),
    unreached: unreached.slice(0, 40),
    unreachedTotal: unreached.length,
  };
})();

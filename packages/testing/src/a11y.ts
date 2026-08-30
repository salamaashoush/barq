/**
 * What assistive technology would make of the DOM under test.
 *
 * A query by role tells you an element exists with a role. It does not tell
 * you the element has a NAME, that the name is the one you meant, that the
 * `aria-labelledby` you wrote points at anything, or that the role you chose
 * carries the attributes it is required to carry. Those are the failures that
 * survive a green suite and reach a screen reader.
 *
 * The name computation here follows accname 1.2 for the cases a component
 * library actually produces: label references, native labelling, name from
 * content, and the `title` fallback. It deliberately stops short of the parts
 * that need layout — generated content from `::before`, the space added
 * between inline and block descendants — because a headless DOM cannot answer
 * those and a wrong answer is worse than an absent one.
 */

/** Roles whose accessible name may come from their own text content. */
const NAME_FROM_CONTENT = new Set([
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "gridcell",
  "heading",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "row",
  "rowheader",
  "sectionhead",
  "switch",
  "tab",
  "tooltip",
  "tree",
  "treeitem",
]);

const INPUT_TYPE_ROLES: Record<string, string> = {
  button: "button",
  checkbox: "checkbox",
  email: "textbox",
  image: "button",
  number: "spinbutton",
  radio: "radio",
  range: "slider",
  reset: "button",
  search: "searchbox",
  submit: "button",
  tel: "textbox",
  text: "textbox",
  url: "textbox",
};

/**
 * The role an element has without one being written.
 *
 * Only the mappings a component library depends on. An element whose implicit
 * role depends on context the DOM cannot cheaply answer — `<section>` needing
 * an accessible name to be a `region`, `<td>` depending on its table's role —
 * is answered here the common way and noted where it is approximate.
 */
export function role(element: Element): string | null {
  const explicit = element.getAttribute("role");
  if (explicit !== null && explicit.trim() !== "") {
    return explicit.trim().split(/\s+/)[0];
  }

  const tag = element.tagName.toLowerCase();

  switch (tag) {
    case "a":
    case "area":
      return element.hasAttribute("href") ? "link" : "generic";
    case "article":
      return "article";
    case "aside":
      return "complementary";
    case "button":
      return "button";
    case "datalist":
      return "listbox";
    case "dd":
      return "definition";
    case "details":
      return "group";
    case "dfn":
      return "term";
    case "dialog":
      return "dialog";
    case "dt":
      return "term";
    case "fieldset":
      return "group";
    case "figure":
      return "figure";
    case "footer":
      return element.closest("article,aside,main,nav,section") === null ? "contentinfo" : "generic";
    case "form":
      return "form";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "header":
      return element.closest("article,aside,main,nav,section") === null ? "banner" : "generic";
    case "hr":
      return "separator";
    case "img":
      return element.getAttribute("alt") === "" ? "presentation" : "img";
    case "input": {
      const type = (element as HTMLInputElement).type.toLowerCase();
      if (type === "text" && element.hasAttribute("list")) return "combobox";
      return INPUT_TYPE_ROLES[type] ?? null;
    }
    case "li":
      return "listitem";
    case "main":
      return "main";
    case "menu":
    case "ol":
    case "ul":
      return "list";
    case "meter":
      return "meter";
    case "nav":
      return "navigation";
    case "optgroup":
      return "group";
    case "option":
      return "option";
    case "output":
      return "status";
    case "p":
      return "paragraph";
    case "progress":
      return "progressbar";
    case "search":
      return "search";
    case "section":
      // A `region` only when it has an accessible name; otherwise generic.
      return accessibleName(element) === "" ? "generic" : "region";
    case "select":
      return (element as HTMLSelectElement).multiple ||
        (element as HTMLSelectElement).size > 1
        ? "listbox"
        : "combobox";
    case "summary":
      return "button";
    case "table":
      return "table";
    case "tbody":
    case "tfoot":
    case "thead":
      return "rowgroup";
    case "td":
      return "cell";
    case "textarea":
      return "textbox";
    case "th":
      return element.getAttribute("scope") === "row" ? "rowheader" : "columnheader";
    case "tr":
      return "row";
    default:
      return null;
  }
}

function isHidden(element: Element): boolean {
  if (element.getAttribute("aria-hidden") === "true") return true;
  if (element.hasAttribute("hidden")) return true;
  const style = (element as HTMLElement).style;
  if (style?.display === "none" || style?.visibility === "hidden") return true;
  return false;
}

function referenced(element: Element, attribute: string): Element[] {
  const value = element.getAttribute(attribute);
  if (value === null || value.trim() === "") return [];
  const root = element.getRootNode() as Document | ShadowRoot;
  return value
    .trim()
    .split(/\s+/)
    .map((id) => root.querySelector(`#${CSS.escape(id)}`))
    .filter((node): node is Element => node !== null);
}

function labelsFor(element: Element): Element[] {
  const labels: Element[] = [];

  const id = element.getAttribute("id");
  if (id !== null && id !== "") {
    const root = element.getRootNode() as Document | ShadowRoot;
    for (const label of root.querySelectorAll(`label[for="${CSS.escape(id)}"]`)) {
      labels.push(label);
    }
  }

  const wrapping = element.closest("label");
  if (wrapping !== null && !labels.includes(wrapping)) labels.push(wrapping);

  return labels;
}

function textFrom(node: Node, visited: Set<Element>): string {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const element = node as Element;
  if (isHidden(element)) return "";

  // A labelled descendant contributes its NAME, not its text: an icon button
  // inside a menu item names itself, and the item's name has to include it.
  const own = nameOf(element, visited, true);
  if (own !== "") return own;

  let text = "";
  for (const child of element.childNodes) text += textFrom(child, visited);
  return text;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function nameOf(
  element: Element,
  visited: Set<Element>,
  fromContent: boolean,
  /**
   * Reached BY an `aria-labelledby`, so this element's own is not followed.
   *
   * accname 1.2 step 2B: a reference is resolved from the referenced element's
   * label and content, not by starting the whole computation again. Following
   * it would let an element that names itself — a combo box's toggle button
   * points at its own id so it is announced with the field's label — compute
   * its own name forever.
   */
  skipLabelledBy = false,
): string {
  if (visited.has(element)) return "";
  visited.add(element);

  const elementRole = role(element);
  if (elementRole === "presentation" || elementRole === "none") return "";

  // 1. aria-labelledby
  const labelledBy = skipLabelledBy ? [] : referenced(element, "aria-labelledby");
  if (labelledBy.length > 0) {
    const parts = labelledBy.map((target) => {
      const scoped = new Set(visited);
      scoped.delete(target);
      return collapse(nameOf(target, scoped, true, true) || textFrom(target, scoped));
    });
    const joined = collapse(parts.filter((part) => part !== "").join(" "));
    if (joined !== "") return joined;
  }

  // 2. aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel !== null && collapse(ariaLabel) !== "") return collapse(ariaLabel);

  // 3. Native labelling
  const tag = element.tagName.toLowerCase();

  if (tag === "input") {
    const input = element as HTMLInputElement;
    const type = input.type.toLowerCase();
    if (type === "button" || type === "submit" || type === "reset") {
      if (input.value !== "") return collapse(input.value);
      return type === "submit" ? "Submit" : type === "reset" ? "Reset" : "";
    }
    if (type === "image") {
      const alt = input.getAttribute("alt");
      if (alt !== null && collapse(alt) !== "") return collapse(alt);
      const title = input.getAttribute("title");
      if (title !== null && collapse(title) !== "") return collapse(title);
      return "Submit Query";
    }
  }

  if (tag === "img" || tag === "area") {
    const alt = element.getAttribute("alt");
    if (alt !== null) return collapse(alt);
  }

  if (tag === "fieldset") {
    const legend = element.querySelector(":scope > legend");
    if (legend !== null) return collapse(textFrom(legend, visited));
  }

  if (tag === "table") {
    const caption = element.querySelector(":scope > caption");
    if (caption !== null) return collapse(textFrom(caption, visited));
  }

  if (tag === "svg") {
    const title = element.querySelector(":scope > title");
    if (title !== null) return collapse(title.textContent ?? "");
  }

  if (tag === "input" || tag === "select" || tag === "textarea" || tag === "meter" || tag === "progress") {
    const labels = labelsFor(element);
    if (labels.length > 0) {
      const text = labels.map((label) => collapse(textFrom(label, visited))).join(" ");
      if (collapse(text) !== "") return collapse(text);
    }
    const placeholder = element.getAttribute("placeholder");
    if (placeholder !== null && collapse(placeholder) !== "") return collapse(placeholder);
  }

  // 4. Name from content
  if (fromContent || (elementRole !== null && NAME_FROM_CONTENT.has(elementRole))) {
    let text = "";
    for (const child of element.childNodes) text += textFrom(child, visited);
    if (collapse(text) !== "") return collapse(text);
  }

  // 5. title
  const title = element.getAttribute("title");
  if (title !== null && collapse(title) !== "") return collapse(title);

  return "";
}

/**
 * The name a screen reader announces for the element.
 *
 * ```ts
 * expect(accessibleName(screen.getByRole("button"))).toBe("Close dialog");
 * ```
 */
export function accessibleName(element: Element): string {
  return nameOf(element, new Set(), false);
}

/** The description a screen reader announces after the name. */
export function accessibleDescription(element: Element): string {
  const describedBy = referenced(element, "aria-describedby");
  if (describedBy.length > 0) {
    const parts = describedBy.map((target) => collapse(textFrom(target, new Set())));
    const joined = collapse(parts.filter((part) => part !== "").join(" "));
    if (joined !== "") return joined;
  }

  const ariaDescription = element.getAttribute("aria-description");
  if (ariaDescription !== null && collapse(ariaDescription) !== "") {
    return collapse(ariaDescription);
  }

  // `title` only describes when it did not name.
  const title = element.getAttribute("title");
  if (title !== null && collapse(title) !== "" && accessibleName(element) !== collapse(title)) {
    return collapse(title);
  }

  return "";
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface AriaViolation {
  /** Which check failed. */
  rule: string;
  /** What is wrong, in one sentence. */
  message: string;
  /** The element it is wrong on. */
  element: Element;
  /** The element's opening tag, for a readable failure. */
  html: string;
}

/** `aria-*` attributes and what they may hold. */
const ARIA_ATTRIBUTES: Record<string, "boolean" | "tristate" | "number" | "integer" | "idref" | "idrefs" | "string" | readonly string[]> = {
  "aria-activedescendant": "idref",
  "aria-atomic": "boolean",
  "aria-autocomplete": ["inline", "list", "both", "none"],
  "aria-braillelabel": "string",
  "aria-brailleroledescription": "string",
  "aria-busy": "boolean",
  "aria-checked": "tristate",
  "aria-colcount": "integer",
  "aria-colindex": "integer",
  "aria-colindextext": "string",
  "aria-colspan": "integer",
  "aria-controls": "idrefs",
  "aria-current": ["page", "step", "location", "date", "time", "true", "false"],
  "aria-describedby": "idrefs",
  "aria-description": "string",
  "aria-details": "idrefs",
  "aria-disabled": "boolean",
  "aria-errormessage": "idrefs",
  "aria-expanded": "tristate",
  "aria-flowto": "idrefs",
  "aria-haspopup": ["false", "true", "menu", "listbox", "tree", "grid", "dialog"],
  "aria-hidden": "tristate",
  "aria-invalid": ["grammar", "false", "spelling", "true"],
  "aria-keyshortcuts": "string",
  "aria-label": "string",
  "aria-labelledby": "idrefs",
  "aria-level": "integer",
  "aria-live": ["assertive", "off", "polite"],
  "aria-modal": "boolean",
  "aria-multiline": "boolean",
  "aria-multiselectable": "boolean",
  "aria-orientation": ["horizontal", "vertical", "undefined"],
  "aria-owns": "idrefs",
  "aria-placeholder": "string",
  "aria-posinset": "integer",
  "aria-pressed": "tristate",
  "aria-readonly": "boolean",
  "aria-relevant": "string",
  "aria-required": "boolean",
  "aria-roledescription": "string",
  "aria-rowcount": "integer",
  "aria-rowindex": "integer",
  "aria-rowindextext": "string",
  "aria-rowspan": "integer",
  "aria-selected": "tristate",
  "aria-setsize": "integer",
  "aria-sort": ["ascending", "descending", "none", "other"],
  "aria-valuemax": "number",
  "aria-valuemin": "number",
  "aria-valuenow": "number",
  "aria-valuetext": "string",
};

/** Attributes a role cannot do without. */
const REQUIRED_BY_ROLE: Record<string, readonly string[]> = {
  checkbox: ["aria-checked"],
  combobox: ["aria-expanded"],
  heading: ["aria-level"],
  meter: ["aria-valuenow"],
  option: ["aria-selected"],
  radio: ["aria-checked"],
  scrollbar: ["aria-controls", "aria-valuenow"],
  separator: [],
  slider: ["aria-valuenow"],
  spinbutton: [],
  switch: ["aria-checked"],
};

/** Roles that must appear inside one of these. */
const REQUIRED_PARENT: Record<string, readonly string[]> = {
  columnheader: ["row"],
  gridcell: ["row"],
  listitem: ["list", "group"],
  menuitem: ["menu", "menubar", "group"],
  menuitemcheckbox: ["menu", "menubar", "group"],
  menuitemradio: ["menu", "menubar", "group"],
  option: ["listbox", "group"],
  row: ["grid", "rowgroup", "table", "treegrid"],
  rowgroup: ["grid", "table", "treegrid"],
  rowheader: ["row"],
  tab: ["tablist"],
  treeitem: ["group", "tree"],
};

/** Roles that need an accessible name to be usable. */
const NAME_REQUIRED = new Set([
  "button",
  "checkbox",
  "combobox",
  "dialog",
  "alertdialog",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "option",
  "progressbar",
  "radio",
  "radiogroup",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "tree",
  "treeitem",
]);

const FOCUSABLE_SELECTOR =
  "input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled])," +
  "button:not([disabled]),a[href],area[href],summary,iframe,[tabindex]:not([disabled])";

function opening(element: Element): string {
  const html = element.outerHTML;
  const end = html.indexOf(">");
  return end === -1 ? html.slice(0, 120) : html.slice(0, end + 1);
}

function violation(rule: string, message: string, element: Element): AriaViolation {
  return { rule, message, element, html: opening(element) };
}

function checkAttributeValue(
  element: Element,
  attribute: string,
  value: string,
  found: AriaViolation[],
): void {
  const kind = ARIA_ATTRIBUTES[attribute];
  if (kind === undefined) {
    found.push(
      violation("aria-valid-attr", `"${attribute}" is not a WAI-ARIA attribute.`, element),
    );
    return;
  }

  const bad = (expected: string): void => {
    found.push(
      violation(
        "aria-valid-attr-value",
        `"${attribute}" is "${value}", which is not ${expected}.`,
        element,
      ),
    );
  };

  if (Array.isArray(kind)) {
    if (!kind.includes(value)) bad(`one of ${kind.join(", ")}`);
    return;
  }

  switch (kind) {
    case "boolean":
      if (value !== "true" && value !== "false") bad("true or false");
      break;
    case "tristate":
      if (value !== "true" && value !== "false" && value !== "mixed" && value !== "undefined") {
        bad("true, false, mixed or undefined");
      }
      break;
    case "number":
      if (value !== "" && Number.isNaN(Number(value))) bad("a number");
      break;
    case "integer":
      if (!/^-?\d+$/.test(value)) bad("an integer");
      break;
    case "idref":
    case "idrefs": {
      const ids = value.trim() === "" ? [] : value.trim().split(/\s+/);
      const root = element.getRootNode() as Document | ShadowRoot;
      // `getElementById` rather than a `#id` selector: an id may hold any
      // character, and escaping one for a selector is a round trip through a
      // parser that some engines refuse — an id a page can legally have would
      // then throw here rather than being reported.
      const exists = (id: string): boolean =>
        (root as Document).getElementById?.(id) !== null ||
        [...root.querySelectorAll("[id]")].some((element) => element.id === id);
      for (const id of ids) {
        if (!exists(id)) {
          found.push(
            violation(
              "aria-referenced-id-exists",
              `"${attribute}" points at "#${id}", which is not in the document.`,
              element,
            ),
          );
        }
      }
      break;
    }
    default:
      break;
  }
}

function ancestorRoles(element: Element): string[] {
  const roles: string[] = [];
  let at = element.parentElement;
  while (at !== null) {
    const parentRole = role(at);
    if (parentRole !== null) roles.push(parentRole);
    at = at.parentElement;
  }
  return roles;
}

export interface AriaCheckOptions {
  /** Rules to skip, by name. */
  skip?: readonly string[];
}

/**
 * Every ARIA problem in the subtree.
 *
 * The rules are the ones a headless DOM can answer without lying: no colour
 * contrast, no reading order, nothing that needs layout. What is left still
 * catches the mistakes a component library makes — a required attribute
 * missing, a reference pointing nowhere, a control with no name, a focusable
 * element hidden from assistive technology.
 *
 * ```ts
 * expect(ariaViolations(container)).toEqual([]);
 * ```
 */
export function ariaViolations(
  root: Element = document.body,
  options: AriaCheckOptions = {},
): AriaViolation[] {
  const found: AriaViolation[] = [];
  const skip = new Set(options.skip ?? []);
  const seenIds = new Map<string, Element>();

  const elements: Element[] = [root, ...root.querySelectorAll("*")];

  for (const element of elements) {
    for (const attribute of element.attributes) {
      if (attribute.name.startsWith("aria-")) {
        checkAttributeValue(element, attribute.name, attribute.value, found);
      }
    }

    const id = element.getAttribute("id");
    if (id !== null && id !== "") {
      const previous = seenIds.get(id);
      if (previous !== undefined) {
        found.push(violation("duplicate-id", `The id "${id}" is used more than once.`, element));
      } else {
        seenIds.set(id, element);
      }
    }

    if (element.getAttribute("aria-hidden") === "true") {
      const focusable = element.matches(FOCUSABLE_SELECTOR)
        ? [element]
        : [...element.querySelectorAll(FOCUSABLE_SELECTOR)];
      const reachable = focusable.filter((node) => node.getAttribute("tabindex") !== "-1");
      if (reachable.length > 0) {
        found.push(
          violation(
            "aria-hidden-focus",
            "aria-hidden=\"true\" hides an element that is still reachable by Tab.",
            element,
          ),
        );
      }
    }

    const tabindex = element.getAttribute("tabindex");
    if (tabindex !== null && Number(tabindex) > 0) {
      found.push(
        violation(
          "tabindex-positive",
          `tabindex="${tabindex}" reorders the Tab sequence away from the document order.`,
          element,
        ),
      );
    }

    // Nothing under `aria-hidden` is in the accessibility tree, so no rule
    // ABOUT that tree applies to it. A select's hidden native `<select>` is
    // the case that matters: it exists for the form and the browser's
    // autofill, and its options have no names because nothing is meant to
    // read them.
    if (element.closest('[aria-hidden="true"]') !== null) continue;

    const elementRole = role(element);
    if (elementRole === null || elementRole === "presentation" || elementRole === "none") continue;

    const required = REQUIRED_BY_ROLE[elementRole];
    if (required !== undefined) {
      for (const attribute of required) {
        // A native control expresses the state through the platform, not the
        // attribute: `<input type="checkbox">` has `checked`.
        if (element.hasAttribute(attribute)) continue;
        if (elementRole === "heading" && /^h[1-6]$/i.test(element.tagName)) continue;
        if (element.tagName === "INPUT" || element.tagName === "OPTION") continue;
        if (elementRole === "combobox" && element.tagName === "SELECT") continue;
        if (elementRole === "meter" || elementRole === "slider") {
          if (element.tagName === "METER" || element.tagName === "PROGRESS") continue;
        }
        found.push(
          violation(
            "aria-required-attr",
            `role="${elementRole}" requires ${attribute}.`,
            element,
          ),
        );
      }
    }

    const parents = REQUIRED_PARENT[elementRole];
    if (parents !== undefined) {
      const ancestors = ancestorRoles(element);
      // An element owned through `aria-owns` is inside its owner as far as
      // assistive technology is concerned, wherever it renders.
      const owned =
        element.id !== "" &&
        (element.getRootNode() as Document).querySelector(
          `[aria-owns~="${CSS.escape(element.id)}"]`,
        ) !== null;
      if (!owned && !ancestors.some((name) => parents.includes(name))) {
        found.push(
          violation(
            "aria-required-parent",
            `role="${elementRole}" must be inside ${parents.join(" or ")}.`,
            element,
          ),
        );
      }
    }

    if (NAME_REQUIRED.has(elementRole) && accessibleName(element) === "") {
      found.push(
        violation(
          "role-has-name",
          `role="${elementRole}" has no accessible name.`,
          element,
        ),
      );
    }

  }

  return found.filter((entry) => !skip.has(entry.rule));
}

/**
 * Throw with every violation listed, or return quietly.
 *
 * ```ts
 * expectNoAriaViolations(container);
 * ```
 */
export function expectNoAriaViolations(
  root: Element = document.body,
  options: AriaCheckOptions = {},
): void {
  const found = ariaViolations(root, options);
  if (found.length === 0) return;

  const report = found
    .map((entry) => `  [${entry.rule}] ${entry.message}\n    ${entry.html}`)
    .join("\n");
  throw new Error(`${found.length} ARIA violation(s):\n${report}`);
}

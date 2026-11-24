/**
 * Word's equations as LaTeX. Word keeps an equation as Office Math markup
 * (OMML), which nothing on the page reads; each of its structures maps to
 * the LaTeX the editor's formulas are written in.
 */

const LETTERS: Record<string, string> = {
  α: "\\alpha",
  β: "\\beta",
  γ: "\\gamma",
  δ: "\\delta",
  ε: "\\varepsilon",
  ϵ: "\\epsilon",
  ζ: "\\zeta",
  η: "\\eta",
  θ: "\\theta",
  ι: "\\iota",
  κ: "\\kappa",
  λ: "\\lambda",
  μ: "\\mu",
  ν: "\\nu",
  ξ: "\\xi",
  π: "\\pi",
  ρ: "\\rho",
  σ: "\\sigma",
  τ: "\\tau",
  υ: "\\upsilon",
  φ: "\\varphi",
  ϕ: "\\phi",
  χ: "\\chi",
  ψ: "\\psi",
  ω: "\\omega",
  Γ: "\\Gamma",
  Δ: "\\Delta",
  Θ: "\\Theta",
  Λ: "\\Lambda",
  Ξ: "\\Xi",
  Π: "\\Pi",
  Σ: "\\Sigma",
  Υ: "\\Upsilon",
  Φ: "\\Phi",
  Ψ: "\\Psi",
  Ω: "\\Omega",
};

const SYMBOLS: Record<string, string> = {
  ...LETTERS,
  "×": "\\times",
  "÷": "\\div",
  "±": "\\pm",
  "∓": "\\mp",
  "≤": "\\le",
  "≥": "\\ge",
  "≠": "\\ne",
  "≈": "\\approx",
  "≡": "\\equiv",
  "∝": "\\propto",
  "∞": "\\infty",
  "→": "\\to",
  "←": "\\leftarrow",
  "↔": "\\leftrightarrow",
  "⇒": "\\Rightarrow",
  "⇐": "\\Leftarrow",
  "⇔": "\\Leftrightarrow",
  "∈": "\\in",
  "∉": "\\notin",
  "⊂": "\\subset",
  "⊆": "\\subseteq",
  "⊃": "\\supset",
  "⊇": "\\supseteq",
  "∪": "\\cup",
  "∩": "\\cap",
  "∅": "\\emptyset",
  "∀": "\\forall",
  "∃": "\\exists",
  "¬": "\\neg",
  "∧": "\\wedge",
  "∨": "\\vee",
  "∂": "\\partial",
  "∇": "\\nabla",
  "·": "\\cdot",
  "⋅": "\\cdot",
  "∘": "\\circ",
  "…": "\\ldots",
  "⋯": "\\cdots",
  "∠": "\\angle",
  "⊥": "\\perp",
  "∥": "\\parallel",
  "°": "^{\\circ}",
  "−": "-",
  "∗": "*",
  "{": "\\{",
  "}": "\\}",
  "%": "\\%",
  "#": "\\#",
  $: "\\$",
  _: "\\_",
};

/** The big operators Word stacks limits on, by the character it draws. */
const OPERATORS: Record<string, string> = {
  "∑": "\\sum",
  "∏": "\\prod",
  "∐": "\\coprod",
  "∫": "\\int",
  "∬": "\\iint",
  "∭": "\\iiint",
  "∮": "\\oint",
  "⋃": "\\bigcup",
  "⋂": "\\bigcap",
  "⋁": "\\bigvee",
  "⋀": "\\bigwedge",
};

/** Accents by the combining mark Word puts over a letter. */
const ACCENTS: Record<string, string> = {
  "̂": "\\hat",
  "̃": "\\tilde",
  "̇": "\\dot",
  "̈": "\\ddot",
  "⃗": "\\vec",
  "̄": "\\bar",
  "̅": "\\bar",
  "̌": "\\check",
  "̆": "\\breve",
  "̀": "\\grave",
  "́": "\\acute",
};

const DELIMITERS: Record<string, string> = {
  "": ".",
  "{": "\\{",
  "}": "\\}",
  "‖": "\\|",
  "⟨": "\\langle",
  "〈": "\\langle",
  "⟩": "\\rangle",
  "〉": "\\rangle",
  "⌊": "\\lfloor",
  "⌋": "\\rfloor",
  "⌈": "\\lceil",
  "⌉": "\\rceil",
};

/** Function names LaTeX knows by a command of their own. */
const FUNCTIONS = new Set([
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "sinh",
  "cosh",
  "tanh",
  "arcsin",
  "arccos",
  "arctan",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "gcd",
  "deg",
  "dim",
  "arg",
]);

const named = (element: Element) => element.localName || element.nodeName;

const children = (element: Element) => [...element.children];

/** The first child of an element with a name, Word's prefix left aside. */
function child(element: Element, name: string): Element | undefined {
  return children(element).find((item) => named(item) === name);
}

/** A property's value: `m:val` where set, and on where the element stands bare. */
function property(element: Element, owner: string, name: string) {
  const holder = child(element, owner);
  const item = holder ? child(holder, name) : undefined;
  if (!item) return undefined;
  return (
    item.getAttribute("m:val") ??
    item.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/math", "val") ??
    ""
  );
}

const on = (value: string | undefined) =>
  value !== undefined && !["0", "off", "false"].includes(value);

const group = (latex: string) => `{${latex}}`;

/** A run's words, each symbol written as LaTeX writes it. */
function runText(run: Element): string {
  const text = children(run)
    .filter((item) => named(item) === "t")
    .map((item) => item.textContent)
    .join("");
  const properties = child(run, "rPr");
  if (properties && child(properties, "nor"))
    return `\\text{${text.replaceAll(/[{}]/g, (brace) => `\\${brace}`)}}`;
  return text.replaceAll(/./gsu, (character) => {
    const symbol = SYMBOLS[character];
    if (!symbol) return character;
    // A command needs a space before letters that follow it.
    return /^\\[a-zA-Z]+$/.test(symbol) ? `${symbol} ` : symbol;
  });
}

function delimiter(character: string | undefined, fallback: string) {
  const value = character ?? fallback;
  return DELIMITERS[value] ?? value;
}

/** The LaTeX of an argument, a run of structures and words. */
function content(element: Element | undefined): string {
  if (!element) return "";
  return children(element)
    .map((item) => convert(item))
    .join("");
}

function convert(element: Element): string {
  switch (named(element)) {
    case "r":
      return runText(element);
    case "f": {
      const kind = property(element, "fPr", "type");
      const top = content(child(element, "num"));
      const bottom = content(child(element, "den"));
      if (kind === "lin") return `${group(top)}/${group(bottom)}`;
      if (kind === "noBar") return `\\genfrac{}{}{0pt}{}${group(top)}${group(bottom)}`;
      return `\\frac${group(top)}${group(bottom)}`;
    }
    case "sSup":
      return `${group(content(child(element, "e")))}^${group(content(child(element, "sup")))}`;
    case "sSub":
      return `${group(content(child(element, "e")))}_${group(content(child(element, "sub")))}`;
    case "sSubSup":
      return `${group(content(child(element, "e")))}_${group(content(child(element, "sub")))}^${group(content(child(element, "sup")))}`;
    case "sPre":
      return `{}_${group(content(child(element, "sub")))}^${group(content(child(element, "sup")))}${group(content(child(element, "e")))}`;
    case "rad": {
      const degree = content(child(element, "deg"));
      const base = group(content(child(element, "e")));
      return on(property(element, "radPr", "degHide")) || !degree
        ? `\\sqrt${base}`
        : `\\sqrt[${degree}]${base}`;
    }
    case "nary": {
      const sign = property(element, "naryPr", "chr") || "∫";
      const operator = OPERATORS[sign] ?? sign;
      const lower = on(property(element, "naryPr", "subHide"))
        ? ""
        : content(child(element, "sub"));
      const upper = on(property(element, "naryPr", "supHide"))
        ? ""
        : content(child(element, "sup"));
      return `${operator}${lower ? `_${group(lower)}` : ""}${upper ? `^${group(upper)}` : ""}${group(content(child(element, "e")))}`;
    }
    case "d": {
      const open = delimiter(property(element, "dPr", "begChr"), "(");
      const close = delimiter(property(element, "dPr", "endChr"), ")");
      const separator = property(element, "dPr", "sepChr") ?? "|";
      const parts = children(element)
        .filter((item) => named(item) === "e")
        .map((item) => content(item));
      return `\\left${open}${parts.join(DELIMITERS[separator] ?? separator)}\\right${close}`;
    }
    case "m": {
      const rows = children(element)
        .filter((item) => named(item) === "mr")
        .map((row) =>
          children(row)
            .filter((item) => named(item) === "e")
            .map((item) => content(item))
            .join(" & "),
        );
      return `\\begin{matrix}${rows.join(" \\\\ ")}\\end{matrix}`;
    }
    case "eqArr": {
      const rows = children(element)
        .filter((item) => named(item) === "e")
        .map((item) => content(item));
      return `\\begin{aligned}${rows.join(" \\\\ ")}\\end{aligned}`;
    }
    case "acc": {
      const mark = property(element, "accPr", "chr") ?? "̂";
      return `${ACCENTS[mark] ?? "\\hat"}${group(content(child(element, "e")))}`;
    }
    case "bar":
      return `${property(element, "barPr", "pos") === "top" ? "\\overline" : "\\underline"}${group(content(child(element, "e")))}`;
    case "groupChr": {
      const top =
        property(element, "groupChrPr", "pos") === "top" ||
        property(element, "groupChrPr", "chr") === "⏞";
      return `${top ? "\\overbrace" : "\\underbrace"}${group(content(child(element, "e")))}`;
    }
    case "func": {
      const name = content(child(element, "fName")).trim();
      const head = FUNCTIONS.has(name)
        ? `\\${name}`
        : name.startsWith("\\")
          ? name
          : `\\operatorname${group(name)}`;
      return `${head}${group(content(child(element, "e")))}`;
    }
    case "limLow": {
      const base = content(child(element, "e")).trim();
      const limit = group(content(child(element, "lim")));
      return FUNCTIONS.has(base) ? `\\${base}_${limit}` : `\\underset${limit}${group(base)}`;
    }
    case "limUpp":
      return `\\overset${group(content(child(element, "lim")))}${group(content(child(element, "e")))}`;
    case "borderBox":
      return `\\boxed${group(content(child(element, "e")))}`;
    case "phant":
      return `\\phantom${group(content(child(element, "e")))}`;
    default:
      // Properties say how to draw, not what; anything else holds content.
      return named(element).endsWith("Pr") ? "" : content(element);
  }
}

/** An equation, `m:oMath`, as LaTeX. */
export function ommlToLatex(math: Element): string {
  return content(math)
    .replaceAll(/\s+/g, " ")
    .replaceAll(/ ([}^_])/g, "$1")
    .trim();
}

/**
 * CSS-in-JS Demo
 * Tests: css, keyframes, globalCss, atoms, create, variants, defineVars, createTheme,
 * dynamic, props, firstThatWorks, and the application's own token helpers
 */

import { type Incoming, signal } from "@barqjs/core";
import {
  atoms,
  create,
  createTheme,
  css,
  defineVars,
  dynamic,
  firstThatWorks,
  globalVars,
  keyframes,
  props as styleProps,
  variants,
} from "@barqjs/css";
import { Button, DemoCard, DemoSection } from "./shared";

const cardBase = css`
  padding: 20px;
  border-radius: 12px;
  font-weight: 500;
`;

const cardPrimary = css`
  background: #3b82f6;
  color: white;
`;

const cardSecondary = css`
  background: #475569;
  color: #e2e8f0;
`;

export function CssDemo() {
  return (
    <DemoSection>
      <CssBasicDemo />
      <StyledDemo />
      <KeyframeDemo />
      <ClsxDemo />
      <VariantsDemo />
      <ThemeDemo />
      <CssVarDemo />
      <AtomsDemo />
      <TokensDemo />
      <DynamicDemo />
    </DemoSection>
  );
}

// Basic css`` usage
function CssBasicDemo() {
  const boxStyle = css`
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    color: white;
    text-align: center;
    font-weight: bold;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.02);
    }
  `;

  const nestedStyle = css`
    padding: 16px;
    background: #334155;
    border-radius: 8px;

    p {
      margin-bottom: 8px;
      color: #94a3b8;
    }

    strong {
      color: #60a5fa;
    }
  `;

  return (
    <DemoCard title="css`` - Template Literals">
      <div class={boxStyle}>Styled with css template literal</div>

      <div class={nestedStyle} style={{ marginTop: "12px" }}>
        <p>Nested selectors work:</p>
        <strong>This is styled via nested selector</strong>
      </div>

      <p class={noteStyle}>css`` creates a class name from template literal styles.</p>
    </DemoCard>
  );
}

// styled components
function StyledDemo() {
  // One block per variant rather than one block with a branch in it. An
  // interpolation standing where a declaration would go has no CSS grammar to
  // sit in, so the compiler refuses it (BARQ014) instead of guessing; written
  // as two classes, both compile and the choice is an ordinary ternary.
  const Card = (props: Incoming<{ variant: "primary" | "secondary"; children: string }>) => (
    <div class={atoms(cardBase, props.variant() === "primary" ? cardPrimary : cardSecondary)}>
      {props.children}
    </div>
  );

  return (
    <DemoCard title="Styled Components Pattern">
      <div class={stackStyle}>
        <Card variant="primary">Primary Card</Card>
        <Card variant="secondary">Secondary Card</Card>
      </div>

      <p class={noteStyle}>Create styled components with dynamic props using css``.</p>
    </DemoCard>
  );
}

// Keyframe animations
function KeyframeDemo() {
  const animating = signal(false);

  const pulse = keyframes`
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
  `;

  const spin = keyframes`
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  `;

  const bounce = keyframes`
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-20px);
    }
  `;

  const animatedBoxStyle = css`
    width: 60px;
    height: 60px;
    background: #3b82f6;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
  `;

  return (
    <DemoCard title="keyframe - Animations">
      <Button onClick={() => animating.update((a) => !a)}>
        {() => (animating() ? "Stop" : "Start")} Animations
      </Button>

      <div class={animationRowStyle}>
        <div
          class={animatedBoxStyle}
          style={() => ({
            animation: animating() ? `${pulse} 1s ease-in-out infinite` : "none",
          })}
        >
          Pulse
        </div>

        <div
          class={animatedBoxStyle}
          style={() => ({
            animation: animating() ? `${spin} 2s linear infinite` : "none",
            borderRadius: "50%",
          })}
        >
          Spin
        </div>

        <div
          class={animatedBoxStyle}
          style={() => ({
            animation: animating() ? `${bounce} 0.6s ease-in-out infinite` : "none",
          })}
        >
          Bounce
        </div>
      </div>
    </DemoCard>
  );
}

// atoms: composing classes
function ClsxDemo() {
  const active = signal(false);
  const disabled = signal(false);
  const size = signal<"sm" | "md" | "lg">("md");

  const baseClass = css`
    padding: 12px 24px;
    border-radius: 8px;
    transition: all 0.2s;
  `;

  const activeClass = css`
    background: #3b82f6;
    color: white;
  `;

  const disabledClass = css`
    opacity: 0.5;
    cursor: not-allowed;
  `;

  const smClass = css`
    font-size: 12px;
    padding: 8px 16px;
  `;

  const lgClass = css`
    font-size: 18px;
    padding: 16px 32px;
  `;

  const computedClass = () =>
    atoms(
      baseClass,
      active() && activeClass,
      disabled() && disabledClass,
      size() === "sm" && smClass,
      size() === "lg" && lgClass,
    );

  return (
    <DemoCard title="atoms - class composition">
      <div class={buttonRowStyle}>
        <Button onClick={() => active.update((a) => !a)}>Toggle Active</Button>
        <Button onClick={() => disabled.update((d) => !d)}>Toggle Disabled</Button>
        <Button onClick={() => size.set("sm")}>Small</Button>
        <Button onClick={() => size.set("md")}>Medium</Button>
        <Button onClick={() => size.set("lg")}>Large</Button>
      </div>

      <div class={computedClass} style={{ background: active() ? undefined : "#475569" }}>
        Dynamic Classes Demo
      </div>

      <pre class={previewStyle}>
        Active: {() => String(active())}
        {"\n"}Disabled: {() => String(disabled())}
        {"\n"}Size: {size}
      </pre>
    </DemoCard>
  );
}

// variants (CVA-like)
function VariantsDemo() {
  const intent = signal<"primary" | "secondary" | "danger">("primary");
  const size = signal<"sm" | "md" | "lg">("md");

  const button = variants({
    base: css`
      border: none;
      border-radius: 6px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    `,
    variants: {
      intent: {
        primary: css`
          background: #3b82f6;
          color: white;
          &:hover {
            background: #2563eb;
          }
        `,
        secondary: css`
          background: #475569;
          color: #e2e8f0;
          &:hover {
            background: #64748b;
          }
        `,
        danger: css`
          background: #ef4444;
          color: white;
          &:hover {
            background: #dc2626;
          }
        `,
      },
      size: {
        sm: css`
          font-size: 12px;
          padding: 6px 12px;
        `,
        md: css`
          font-size: 14px;
          padding: 8px 16px;
        `,
        lg: css`
          font-size: 16px;
          padding: 12px 24px;
        `,
      },
    },
    defaults: {
      intent: "primary",
      size: "md",
    },
  });

  return (
    <DemoCard title="variants - CVA-like API">
      <div class={buttonRowStyle}>
        <select
          class={selectStyle}
          value={intent()}
          onChange={(e: Event) =>
            intent.set(
              (e.target as HTMLSelectElement).value as typeof intent extends () => infer T
                ? T
                : never,
            )
          }
        >
          <option value="primary">Primary</option>
          <option value="secondary">Secondary</option>
          <option value="danger">Danger</option>
        </select>

        <select
          class={selectStyle}
          value={size()}
          onChange={(e: Event) =>
            size.set(
              (e.target as HTMLSelectElement).value as typeof size extends () => infer T
                ? T
                : never,
            )
          }
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>

      <button type="button" class={() => button({ intent: intent(), size: size() })}>
        Variant Button
      </button>

      <p class={noteStyle}>variants() creates type-safe variant-based styling.</p>
    </DemoCard>
  );
}

/**
 * `globalVars`: tokens under the names you gave them.
 *
 * Module scope, because that is where a token set belongs — the compiler reads
 * it here and every block below folds against it, so `${tokens.background}` is
 * a `var()` in the stylesheet rather than a call in the browser.
 */
const tokens = globalVars({
  brand: "#3b82f6",
  surface: "#0f172a",
  radius: "8px",
  sans: "system-ui, sans-serif",
});

/** A class that redeclares two of them. Put it on any element. */
const dusk = createTheme(tokens, { brand: "#60a5fa", surface: "#1e293b" });

const tokenBox = css`
  padding: 16px;
  border-radius: ${tokens.radius};
  background: ${tokens.surface};
  font-family: ${tokens.sans};
  color: ${tokens.brand};
`;

function ThemeDemo() {
  return (
    <DemoCard title="globalVars & createTheme">
      <div class={tokenBox}>The tokens, as declared</div>
      <div class={dusk}>
        <div class={tokenBox}>The same block, under a theme that redeclares two</div>
      </div>
      <p class={noteStyle}>
        `globalVars` names the property what you called it, so an application's own `:root` is
        heard. `defineVars` hashes the set instead, which is below.
      </p>
    </DemoCard>
  );
}

/**
 * A custom property that changes every frame.
 *
 * Written straight onto the element, which is what a `style` object is for and
 * what BARQ015 tells you to reach for: the block stays static and compiles
 * away, and the only thing that moves is one property on one element.
 */
function CssVarDemo() {
  const hue = signal(220);

  return (
    <DemoCard title="a reactive custom property">
      <input
        type="range"
        min="0"
        max="360"
        value={hue()}
        onInput={(e: Event) => hue.set(Number((e.target as HTMLInputElement).value))}
        class={rangeStyle}
      />
      <p>Hue: {hue}</p>

      <div
        class={swatchStyle}
        style={() => ({
          "--primary-color": `hsl(${hue()}, 70%, 50%)`,
          "--primary-light": `hsl(${hue()}, 70%, 70%)`,
        })}
      >
        <p>Background reads var(--primary-color)</p>
      </div>

      <p class={noteStyle}>
        One property is written per change. The block itself never re-registers, because nothing in
        it moved.
      </p>
    </DemoCard>
  );
}

const swatchStyle = css`
  padding: 20px;
  border-radius: 8px;
  margin-top: 12px;
  background: var(--primary-color);
  color: white;
`;

// Styles
const stackStyle = css`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const animationRowStyle = css`
  display: flex;
  gap: 16px;
  margin-top: 16px;
  justify-content: center;
`;

const buttonRowStyle = css`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`;

const selectStyle = css`
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

const previewStyle = css`
  background: #0f172a;
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 12px;
  overflow-x: auto;
`;

const rangeStyle = css`
  width: 100%;
  margin-bottom: 8px;
`;

const noteStyle = css`
  font-size: 12px;
  color: #94a3b8;
  font-style: italic;
  margin-top: 12px;
`;

/**
 * `atoms` and `create`: one class per declaration, merged by property.
 *
 * The last argument wins per property, which is the difference from
 * `atoms(base, variant)` — there the stylesheet's order decides, here the
 * call's does. Every id here is asserted against a real browser.
 */
const cardStyles = create({
  root: { padding: 12, borderRadius: 8, background: "#1e293b" },
  loud: { color: "rgb(217, 70, 239)" },
  calm: { color: "rgb(16, 185, 129)" },
});

const boxed = atoms({ margin: "0 4px", color: "rgb(2, 132, 199)" }, { marginTop: 8 });
const cleared = atoms({ color: "rgb(220, 38, 38)", padding: 6 }, { color: null });
const stuck = atoms({ position: firstThatWorks("sticky", "-webkit-sticky", "fixed") });
const conditioned = atoms({
  "::before": { content: '"* "' },
  color: {
    default: "rgb(120, 113, 108)",
    "@media (min-width: 1px)": { default: "rgb(101, 163, 13)", ":hover": "rgb(190, 24, 93)" },
  },
});

function AtomsDemo() {
  const loud = signal(false);

  return (
    <DemoCard title="atoms & create - merged by property">
      <div class={atoms(cardStyles.root)}>
        <p data-testid="group" class={atoms(cardStyles.calm, loud() && cardStyles.loud)}>
          Last argument wins per property
        </p>
        <p data-testid="boxed" class={boxed}>
          A longhand replaces one side of a shorthand
        </p>
        <p data-testid="cleared" class={cleared}>
          `null` removes the colour and keeps the padding
        </p>
        <p data-testid="stuck" class={stuck}>
          `firstThatWorks` repeats the declaration, best last
        </p>
        <p data-testid="conditioned" class={conditioned}>
          A media query with a pseudo-class inside it
        </p>
      </div>
      <Button onClick={() => loud.update((on) => !on)}>Toggle variant</Button>
      <p class={noteStyle}>
        Compiled: every class above is a string literal in the bundle, and the CSS is a build asset.
      </p>
    </DemoCard>
  );
}

/**
 * `defineVars`: the same idea with the names hashed.
 *
 * The suffix is a hash of the whole token object, so two files declaring
 * different tokens cannot collide — and nothing outside the set can write
 * `--brand` and be heard, which is the trade against `globalVars` above.
 */
const scoped = defineVars({ brand: "rgb(59, 130, 246)", pad: "12px" });
const brighter = createTheme(scoped, { brand: "rgb(96, 165, 250)" });

const scopedBox = css`
  color: ${scoped.brand};
  padding: ${scoped.pad};
  border: 1px solid ${scoped.brand};
  border-radius: 6px;
`;

function TokensDemo() {
  return (
    <DemoCard title="defineVars - the same, scoped">
      <div data-testid="tokens-default" class={scopedBox}>
        Reads the token
      </div>
      <div class={brighter}>
        <div data-testid="tokens-themed" class={scopedBox}>
          The same block, under a theme that redeclares one token
        </div>
      </div>
      <p class={noteStyle}>
        A token crosses a module boundary as a `var()` string, so nothing has to resolve an import
        at build time.
      </p>
    </DemoCard>
  );
}

/** `dynamic`: the class is fixed, only the value changes. */
const tint = dynamic((colour: string) => ({ backgroundColor: colour }));

function DynamicDemo() {
  const hot = signal(false);

  return (
    <DemoCard title="dynamic - a value only known at run time">
      <p
        data-testid="dynamic"
        {...styleProps(cardStyles.root, tint(hot() ? "rgb(251, 146, 60)" : "rgb(148, 163, 184)"))}
      >
        One custom property changes; no new CSS is produced
      </p>
      <Button onClick={() => hot.update((on) => !on)} data-testid="toggle">
        Toggle colour
      </Button>
    </DemoCard>
  );
}

/**
 * CSS-in-JS Demo
 * Tests: css, styled, keyframe, globalCss, clsx, variants, createTheme, token, cssVar, defineVars
 */

import { For, useState } from "zest";
import {
  type DesignTokens,
  clsx,
  createTheme,
  css,
  cssVar,
  defineVars,
  keyframe,
  styled,
  token,
  variants,
} from "zest-extra";
import { Button, DemoCard, DemoSection } from "./shared";

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
  // Note: styled() requires goober's createElement integration
  // For now we'll show the css`` approach which works reliably

  const Card = (props: { variant: "primary" | "secondary"; children: string }) => {
    const cardStyle = css`
      padding: 20px;
      border-radius: 12px;
      font-weight: 500;
      ${
        props.variant === "primary"
          ? `
          background: #3b82f6;
          color: white;
        `
          : `
          background: #475569;
          color: #e2e8f0;
        `
      }
    `;

    return <div class={cardStyle}>{props.children}</div>;
  };

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
  const [animating, setAnimating] = useState(false);

  const pulse = keyframe`
    0%, 100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.8;
    }
  `;

  const spin = keyframe`
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  `;

  const bounce = keyframe`
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
      <Button onClick={() => setAnimating((a) => !a)}>
        {() => (animating() ? "Stop" : "Start")} Animations
      </Button>

      <div class={animationRowStyle}>
        <div
          class={animatedBoxStyle}
          style={{
            animation: animating() ? `${pulse} 1s ease-in-out infinite` : "none",
          }}
        >
          Pulse
        </div>

        <div
          class={animatedBoxStyle}
          style={{
            animation: animating() ? `${spin} 2s linear infinite` : "none",
            borderRadius: "50%",
          }}
        >
          Spin
        </div>

        <div
          class={animatedBoxStyle}
          style={{
            animation: animating() ? `${bounce} 0.6s ease-in-out infinite` : "none",
          }}
        >
          Bounce
        </div>
      </div>
    </DemoCard>
  );
}

// clsx utility
function ClsxDemo() {
  const [active, setActive] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");

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
    clsx(baseClass, active() && activeClass, disabled() && disabledClass, {
      [smClass]: size() === "sm",
      [lgClass]: size() === "lg",
    });

  return (
    <DemoCard title="clsx - Class Composition">
      <div class={buttonRowStyle}>
        <Button onClick={() => setActive((a) => !a)}>Toggle Active</Button>
        <Button onClick={() => setDisabled((d) => !d)}>Toggle Disabled</Button>
        <Button onClick={() => setSize("sm")}>Small</Button>
        <Button onClick={() => setSize("md")}>Medium</Button>
        <Button onClick={() => setSize("lg")}>Large</Button>
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
  const [intent, setIntent] = useState<"primary" | "secondary" | "danger">("primary");
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");

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
          &:hover { background: #2563eb; }
        `,
        secondary: css`
          background: #475569;
          color: #e2e8f0;
          &:hover { background: #64748b; }
        `,
        danger: css`
          background: #ef4444;
          color: white;
          &:hover { background: #dc2626; }
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
    defaultVariants: {
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
            setIntent(
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
            setSize(
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

// Theme tokens
function ThemeDemo() {
  const baseTokens: DesignTokens = {
    colors: {
      primary: "#3b82f6",
      secondary: "#64748b",
      background: "#0f172a",
      text: "#e2e8f0",
    },
    fonts: {
      sans: "system-ui, sans-serif",
      mono: "Fira Code, monospace",
    },
    spacing: {
      1: "4px",
      2: "8px",
      3: "12px",
      4: "16px",
    },
    radius: {
      sm: "4px",
      md: "8px",
      lg: "12px",
    },
    shadow: {
      sm: "0 1px 2px rgba(0,0,0,0.1)",
      md: "0 4px 6px rgba(0,0,0,0.1)",
    },
    fontSize: {
      sm: "12px",
      md: "14px",
      lg: "16px",
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      bold: 700,
    },
    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75,
    },
    zIndex: {
      dropdown: 100,
      modal: 1000,
    },
  };

  const darkTheme = createTheme(baseTokens, {
    colors: {
      primary: "#60a5fa",
      background: "#1e293b",
    },
  });

  return (
    <DemoCard title="createTheme & token">
      <div
        class={css`
          padding: 16px;
          background: ${token(baseTokens, "colors.background")};
          border-radius: ${token(baseTokens, "radius.md")};
          font-family: ${token(baseTokens, "fonts.sans")};
        `}
      >
        <p style={{ color: token(baseTokens, "colors.primary") }}>
          Primary Color: {token(baseTokens, "colors.primary")}
        </p>
        <p style={{ marginTop: token(baseTokens, "spacing.2") }}>
          Spacing 2: {token(baseTokens, "spacing.2")}
        </p>
      </div>

      <p class={noteStyle}>Design tokens provide consistent values across your app.</p>
    </DemoCard>
  );
}

// CSS Variables
function CssVarDemo() {
  const [hue, setHue] = useState(220);

  const vars = defineVars({
    "primary-hue": String(hue()),
    "primary-color": `hsl(${hue()}, 70%, 50%)`,
    "primary-light": `hsl(${hue()}, 70%, 70%)`,
  });

  return (
    <DemoCard title="cssVar & defineVars">
      <input
        type="range"
        min="0"
        max="360"
        value={hue()}
        onInput={(e: Event) => setHue(Number((e.target as HTMLInputElement).value))}
        class={rangeStyle}
      />
      <p>Hue: {hue}</p>

      <div
        class={css`
          padding: 20px;
          border-radius: 8px;
          margin-top: 12px;
        `}
        style={{
          ...Object.fromEntries(
            vars
              .split(";")
              .filter(Boolean)
              .map((v) => {
                const [key, val] = v.split(":");
                return [key.trim(), val?.trim()];
              }),
          ),
          background: cssVar("primary-color"),
          color: "white",
        }}
      >
        <p>Background uses {cssVar("primary-color")}</p>
      </div>

      <pre class={previewStyle}>{vars}</pre>
    </DemoCard>
  );
}

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

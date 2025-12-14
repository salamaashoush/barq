/**
 * Shared components for demos
 */

import { For, type Child } from "zest";
import { css, clsx } from "zest-extra";

// Demo section container
export function DemoSection(props: { children: Child }) {
  return <div class={sectionStyle}>{props.children}</div>;
}

// Demo card
export function DemoCard(props: { title: string; children: Child }) {
  return (
    <div class={cardStyle}>
      <h3 class={cardTitleStyle}>{props.title}</h3>
      <div class={cardContentStyle}>{props.children}</div>
    </div>
  );
}

// Button component
export function Button(props: {
  children: Child;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean | (() => boolean);
  variant?: "primary" | "secondary" | "danger" | (() => "primary" | "secondary" | "danger");
}) {
  // Handle both static and accessor for variant prop
  const getVariant = () => {
    if (typeof props.variant === "function") {
      return props.variant();
    }
    return props.variant ?? "primary";
  };

  // Handle both boolean and accessor for disabled prop
  const isDisabled = () => {
    if (typeof props.disabled === "function") {
      return props.disabled();
    }
    return props.disabled ?? false;
  };

  return (
    <button
      class={() => {
        const variant = getVariant();
        return clsx(buttonBaseStyle, {
          [buttonPrimaryStyle]: variant === "primary",
          [buttonSecondaryStyle]: variant === "secondary",
          [buttonDangerStyle]: variant === "danger",
          [buttonDisabledStyle]: isDisabled(),
        });
      }}
      onClick={props.onClick}
      disabled={isDisabled}
    >
      {props.children}
    </button>
  );
}

// Log display
export function Log(props: { logs: () => string[] }) {
  return (
    <div class={logContainerStyle}>
      <For each={props.logs}>
        {(log) => <div class={logLineStyle}>{log}</div>}
      </For>
    </div>
  );
}

// Input component
export function Input(props: {
  value: () => string;
  onInput: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={props.type || "text"}
      value={props.value()}
      onInput={(e: Event) => props.onInput((e.target as HTMLInputElement).value)}
      placeholder={props.placeholder}
      class={inputStyle}
    />
  );
}

// Styles
const sectionStyle = css`
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
`;

const cardStyle = css`
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  overflow: hidden;
`;

const cardTitleStyle = css`
  padding: 16px 20px;
  background: #334155;
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
  border-bottom: 1px solid #475569;
`;

const cardContentStyle = css`
  padding: 20px;
`;

const buttonBaseStyle = css`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s;
`;

const buttonPrimaryStyle = css`
  background: #3b82f6;
  color: white;

  &:hover {
    background: #2563eb;
  }
`;

const buttonSecondaryStyle = css`
  background: #475569;
  color: #e2e8f0;

  &:hover {
    background: #64748b;
  }
`;

const buttonDangerStyle = css`
  background: #ef4444;
  color: white;

  &:hover {
    background: #dc2626;
  }
`;

const buttonDisabledStyle = css`
  opacity: 0.5;
  cursor: not-allowed;

  &:hover {
    background: inherit;
  }
`;

const logContainerStyle = css`
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 12px;
  font-family: "Fira Code", monospace;
  font-size: 12px;
  max-height: 150px;
  overflow-y: auto;
  margin-top: 12px;
`;

const logLineStyle = css`
  color: #94a3b8;
  padding: 2px 0;
`;

const inputStyle = css`
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
  width: 100%;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }
`;

/**
 * JSX Types Demo
 * Tests: All JSX type features, reactive attributes, event handlers, refs, helper types
 */

import {
  type Accessor,
  type Child,
  type FlowProps,
  For,
  type FunctionMaybe,
  type ParentProps,
  type PropsWithChildren,
  type Ref,
  type RefCallback,
  type RefObject,
  Show,
  type VoidProps,
  useRef,
  useState,
} from "zest";
import { clsx, css } from "zest-extra";
import { Button, DemoCard, DemoSection, Log } from "./shared";

// ============================================================================
// Type Tests - These demonstrate correct typing at compile time
// ============================================================================

// Test PropsWithChildren - adds optional children
interface CardProps {
  title: string;
  variant?: "default" | "highlight";
}

function Card(props: PropsWithChildren<CardProps>) {
  return (
    <div class={clsx(cardStyle, props.variant === "highlight" && highlightStyle)}>
      <h4>{props.title}</h4>
      <div>{props.children}</div>
    </div>
  );
}

// Test ParentProps - SolidJS alias for PropsWithChildren
interface PanelProps {
  header: string;
}

function Panel(props: ParentProps<PanelProps>) {
  return (
    <div class={panelStyle}>
      <div class={panelHeaderStyle}>{props.header}</div>
      {props.children}
    </div>
  );
}

// Test VoidProps - component that should not have children
interface IconProps {
  name: string;
  size?: number;
}

function Icon(props: VoidProps<IconProps>) {
  const size = props.size ?? 16;
  return (
    <span class={iconStyle} style={{ fontSize: `${size}px` }}>
      [{props.name}]
    </span>
  );
}

// Test FlowProps - component that MUST have children
interface WrapperProps {
  padding?: number;
}

function Wrapper(props: FlowProps<WrapperProps>) {
  return <div style={{ padding: `${props.padding ?? 10}px` }}>{props.children}</div>;
}

// Test Accessor and FunctionMaybe types
interface ReactiveDisplayProps {
  // Can be static or reactive
  value: FunctionMaybe<string>;
  // Must be reactive
  count: Accessor<number>;
}

function ReactiveDisplay(props: ReactiveDisplayProps) {
  // Resolve FunctionMaybe - could be value or function
  const resolvedValue = typeof props.value === "function" ? props.value : () => props.value;

  return (
    <div class={displayStyle}>
      <span>Value: {resolvedValue}</span>
      <span>Count: {props.count}</span>
    </div>
  );
}

// Test Ref types
interface RefDemoProps {
  inputRef?: Ref<HTMLInputElement>;
}

function RefInput(props: RefDemoProps) {
  return <input type="text" ref={props.inputRef} class={inputStyle} placeholder="Type here..." />;
}

// ============================================================================
// Main Demo Component
// ============================================================================

export function JsxTypesDemo() {
  return (
    <DemoSection>
      <ReactiveAttributesDemo />
      <EventHandlersDemo />
      <RefTypesDemo />
      <HelperTypesDemo />
      <StyleAttributesDemo />
      <AriaAndDataDemo />
    </DemoSection>
  );
}

// ============================================================================
// Reactive Attributes Demo
// ============================================================================

function ReactiveAttributesDemo() {
  const [text, setText] = useState("Hello");
  const [disabled, setDisabled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [className, setClassName] = useState("default");
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-4), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  return (
    <DemoCard title="Reactive Attributes">
      <div class={rowStyle}>
        <input
          type="text"
          value={text()}
          onInput={(e: Event) => {
            const value = (e.target as HTMLInputElement).value;
            setText(value);
            addLog(`Input changed to "${value}"`);
          }}
          class={inputStyle}
          placeholder="Edit text..."
        />
      </div>

      <div class={rowStyle}>
        {/* Reactive disabled attribute - tests FunctionMaybe<boolean> */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => addLog("Button clicked!")}
          class={buttonStyle}
        >
          {() => (disabled() ? "Disabled" : "Click Me")}
        </button>

        <Button onClick={() => setDisabled((d) => !d)}>Toggle Disabled</Button>
      </div>

      <div class={rowStyle}>
        {/* Reactive hidden attribute */}
        <div hidden={hidden} class={boxStyle}>
          This box can be hidden
        </div>

        <Button onClick={() => setHidden((h) => !h)}>
          Toggle Hidden ({() => (hidden() ? "show" : "hide")})
        </Button>
      </div>

      <div class={rowStyle}>
        {/* Reactive className with object */}
        <div
          class={() => ({
            [baseClass]: true,
            [activeClass]: className() === "active",
            [errorClass]: className() === "error",
          })}
        >
          Class: {className}
        </div>

        <div class={buttonRowStyle}>
          <Button variant="secondary" onClick={() => setClassName("default")}>
            Default
          </Button>
          <Button variant="secondary" onClick={() => setClassName("active")}>
            Active
          </Button>
          <Button variant="danger" onClick={() => setClassName("error")}>
            Error
          </Button>
        </div>
      </div>

      <Log logs={logs} />

      <p class={noteStyle}>All attributes support reactive accessors via FunctionMaybe&lt;T&gt;.</p>
    </DemoCard>
  );
}

// ============================================================================
// Event Handlers Demo
// ============================================================================

function EventHandlersDemo() {
  const [logs, setLogs] = useState<string[]>([]);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-4), msg]);
  };

  return (
    <DemoCard title="Event Handlers">
      {/* Standard event handlers */}
      <div class={rowStyle}>
        <button
          type="button"
          onClick={(e) => {
            addLog(`onClick: button ${e.currentTarget.tagName}`);
          }}
          onMouseEnter={() => addLog("onMouseEnter")}
          onMouseLeave={() => addLog("onMouseLeave")}
          class={buttonStyle}
        >
          Hover & Click Me
        </button>
      </div>

      {/* Input events with proper typing */}
      <div class={rowStyle}>
        <input
          type="text"
          onInput={(e) => {
            // e.target is properly typed as HTMLInputElement
            addLog(`onInput: "${(e.target as HTMLInputElement).value}"`);
          }}
          onFocus={() => addLog("onFocus")}
          onBlur={() => addLog("onBlur")}
          class={inputStyle}
          placeholder="Focus and type..."
        />
      </div>

      {/* Keyboard events */}
      <div class={rowStyle}>
        <input
          type="text"
          onKeyDown={(e) => {
            addLog(`onKeyDown: ${e.key}`);
          }}
          onKeyUp={(e) => {
            addLog(`onKeyUp: ${e.key}`);
          }}
          class={inputStyle}
          placeholder="Press keys..."
        />
      </div>

      {/* Mouse position tracking */}
      <div
        onMouseMove={(e) => {
          setCoords({ x: e.clientX, y: e.clientY });
        }}
        class={trackingAreaStyle}
      >
        <p>
          Mouse: ({() => coords().x}, {() => coords().y})
        </p>
      </div>

      <Log logs={logs} />

      <p class={noteStyle}>
        Event handlers use EventHandlerUnion&lt;T, E&gt; for proper currentTarget typing.
      </p>
    </DemoCard>
  );
}

// ============================================================================
// Ref Types Demo
// ============================================================================

function RefTypesDemo() {
  const [logs, setLogs] = useState<string[]>([]);

  // Test different ref patterns
  const refObject = useRef<HTMLInputElement>();
  let refVariable: HTMLInputElement | null = null;

  const refCallback: RefCallback<HTMLInputElement> = (el) => {
    setLogs((prev) => [...prev, "RefCallback invoked"]);
  };

  const focusRef = () => {
    if (refObject.current) {
      refObject.current.focus();
      setLogs((prev) => [...prev, "Focused via refObject"]);
    }
  };

  const focusVariable = () => {
    if (refVariable) {
      refVariable.focus();
      setLogs((prev) => [...prev, "Focused via variable ref"]);
    }
  };

  return (
    <DemoCard title="Ref Types">
      <div class={rowStyle}>
        <label>RefObject:</label>
        <input type="text" ref={refObject} class={inputStyle} placeholder="RefObject ref" />
        <Button onClick={focusRef}>Focus</Button>
      </div>

      <div class={rowStyle}>
        <label>Variable ref:</label>
        <input
          type="text"
          ref={(el) => {
            refVariable = el;
          }}
          class={inputStyle}
          placeholder="Variable ref"
        />
        <Button onClick={focusVariable}>Focus</Button>
      </div>

      <div class={rowStyle}>
        <label>Callback ref:</label>
        <input type="text" ref={refCallback} class={inputStyle} placeholder="Callback ref" />
      </div>

      {/* Ref via component prop */}
      <div class={rowStyle}>
        <label>Component prop:</label>
        <RefInput inputRef={refObject} />
      </div>

      <Log logs={logs} />

      <p class={noteStyle}>
        Refs support object, callback, and variable patterns via Ref&lt;T&gt; type.
      </p>
    </DemoCard>
  );
}

// ============================================================================
// Helper Types Demo
// ============================================================================

function HelperTypesDemo() {
  const [count, setCount] = useState(0);

  return (
    <DemoCard title="Helper Types">
      {/* PropsWithChildren */}
      <Card title="PropsWithChildren">
        <p>This card uses PropsWithChildren&lt;CardProps&gt;</p>
      </Card>

      {/* ParentProps (SolidJS alias) */}
      <Panel header="ParentProps">
        <p>This panel uses ParentProps&lt;PanelProps&gt;</p>
      </Panel>

      {/* VoidProps - no children allowed */}
      <div class={rowStyle}>
        <Icon name="star" size={20} />
        <span>VoidProps - Icon cannot have children</span>
      </div>

      {/* FlowProps - children required */}
      <Wrapper padding={12}>
        <p>FlowProps - Wrapper must have children</p>
      </Wrapper>

      {/* Accessor and FunctionMaybe */}
      <div class={rowStyle}>
        <Button onClick={() => setCount((c) => c + 1)}>Increment</Button>
        <ReactiveDisplay value="Static string" count={count} />
      </div>

      <div class={rowStyle}>
        <ReactiveDisplay value={() => `Dynamic: ${count()}`} count={count} />
      </div>

      <p class={noteStyle}>
        Helper types: PropsWithChildren, ParentProps, VoidProps, FlowProps, Accessor, FunctionMaybe
      </p>
    </DemoCard>
  );
}

// ============================================================================
// Style Attributes Demo
// ============================================================================

function StyleAttributesDemo() {
  const [size, setSize] = useState(100);
  const [color, setColor] = useState("#3b82f6");

  return (
    <DemoCard title="Style Attributes">
      {/* String style */}
      <div style="padding: 10px; border: 1px solid #475569; border-radius: 4px;">String style</div>

      {/* Object style with reactive values */}
      <div
        style={{
          width: () => `${size()}px`,
          height: () => `${size()}px`,
          backgroundColor: color,
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          marginTop: "12px",
        }}
      >
        {size}px
      </div>

      <div class={sliderRowStyle}>
        <label>Size: {size}</label>
        <input
          type="range"
          min="50"
          max="200"
          value={size()}
          onInput={(e: Event) => setSize(Number.parseInt((e.target as HTMLInputElement).value))}
        />
      </div>

      <div class={sliderRowStyle}>
        <label>Color:</label>
        <input
          type="color"
          value={color()}
          onInput={(e: Event) => setColor((e.target as HTMLInputElement).value)}
        />
      </div>

      <p class={noteStyle}>
        Style supports string or object with reactive properties via FunctionMaybe.
      </p>
    </DemoCard>
  );
}

// ============================================================================
// ARIA and Data Attributes Demo
// ============================================================================

function AriaAndDataDemo() {
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState(50);

  return (
    <DemoCard title="ARIA & Data Attributes">
      {/* ARIA attributes */}
      <div class={rowStyle}>
        <button
          aria-expanded={expanded}
          aria-controls="expandable-content"
          aria-label="Toggle content visibility"
          onClick={() => setExpanded((e) => !e)}
          class={buttonStyle}
        >
          {() => (expanded() ? "Collapse" : "Expand")} (aria-expanded)
        </button>
      </div>

      <Show when={expanded}>
        <div id="expandable-content" role="region" aria-live="polite">
          <p>Expandable content is now visible!</p>
        </div>
      </Show>

      {/* Progress with ARIA */}
      <div class={rowStyle}>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Loading progress"
          class={progressBarStyle}
        >
          <div class={progressFillStyle} style={{ width: () => `${progress()}%` }} />
        </div>
        <span>{progress}%</span>
      </div>

      <div class={sliderRowStyle}>
        <label>Progress:</label>
        <input
          type="range"
          min="0"
          max="100"
          value={progress()}
          onInput={(e: Event) => setProgress(Number.parseInt((e.target as HTMLInputElement).value))}
        />
      </div>

      {/* Data attributes */}
      <div
        data-testid="demo-element"
        data-value={() => progress()}
        data-active={() => (expanded() ? "true" : "false")}
        class={dataBoxStyle}
      >
        <p>data-testid="demo-element"</p>
        <p>data-value={progress}</p>
        <p>data-active={() => (expanded() ? "true" : "false")}</p>
      </div>

      <p class={noteStyle}>ARIA and data-* attributes support reactive values.</p>
    </DemoCard>
  );
}

// ============================================================================
// Styles
// ============================================================================

const rowStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
`;

const buttonRowStyle = css`
  display: flex;
  gap: 8px;
`;

const inputStyle = css`
  padding: 8px 12px;
  border: 1px solid #475569;
  border-radius: 6px;
  background: #1e293b;
  color: #e2e8f0;
  font-size: 14px;
  flex: 1;
  max-width: 200px;

  &:focus {
    outline: none;
    border-color: #3b82f6;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const buttonStyle = css`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  background: #3b82f6;
  color: white;
  font-size: 14px;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #2563eb;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const boxStyle = css`
  padding: 12px;
  background: #334155;
  border-radius: 6px;
  color: #e2e8f0;
`;

const baseClass = css`
  padding: 12px;
  border-radius: 6px;
  transition: all 0.2s;
  color: #e2e8f0;
  background: #334155;
`;

const activeClass = css`
  background: #22c55e;
  color: white;
`;

const errorClass = css`
  background: #ef4444;
  color: white;
`;

const trackingAreaStyle = css`
  padding: 20px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  margin-bottom: 12px;
  text-align: center;
  color: #94a3b8;
`;

const cardStyle = css`
  background: #334155;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;

  h4 {
    margin: 0 0 8px 0;
    color: #e2e8f0;
  }
`;

const highlightStyle = css`
  border: 2px solid #3b82f6;
`;

const panelStyle = css`
  background: #1e3a5f;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 12px;
`;

const panelHeaderStyle = css`
  background: #0f172a;
  padding: 10px 12px;
  font-weight: 600;
  color: #60a5fa;
`;

const iconStyle = css`
  display: inline-block;
  color: #fbbf24;
`;

const displayStyle = css`
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: #0f172a;
  border-radius: 6px;
  font-family: monospace;
  color: #94a3b8;
`;

const sliderRowStyle = css`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  color: #94a3b8;

  input[type="range"] {
    flex: 1;
  }
`;

const progressBarStyle = css`
  flex: 1;
  height: 8px;
  background: #334155;
  border-radius: 4px;
  overflow: hidden;
`;

const progressFillStyle = css`
  height: 100%;
  background: #3b82f6;
  transition: width 0.2s;
`;

const dataBoxStyle = css`
  background: #0f172a;
  padding: 12px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  color: #94a3b8;
  margin-top: 12px;

  p {
    margin: 4px 0;
  }
`;

const noteStyle = css`
  font-size: 12px;
  color: #64748b;
  font-style: italic;
  margin-top: 12px;
`;

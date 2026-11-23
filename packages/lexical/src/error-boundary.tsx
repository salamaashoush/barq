import { Errored, untrack } from "@barqjs/core";
import type { JSX } from "@barqjs/web";

export interface ErrorBoundaryProps {
  children: JSX.Element;
  onError: (error: Error) => void;
}

/** What renders a decorator, so one that throws is caught there and not above the editor. */
export type ErrorBoundaryType = (props: ErrorBoundaryProps) => JSX.Element;

export interface LexicalErrorBoundaryProps extends ErrorBoundaryProps {
  /** Shown in place of what threw. A small notice by default; `null` renders nothing. */
  fallback?: JSX.Element;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error), { cause: error });
}

/**
 * The boundary every decorator renders inside: what throws is replaced by
 * `fallback` and handed to `onError`, which the editor routes to its own
 * `onError`.
 */
export function LexicalErrorBoundary(props: LexicalErrorBoundaryProps): JSX.Element {
  return (
    <Errored
      fallback={(error: () => Error) => {
        untrack(() => props.onError(asError(error())));
        return props.fallback === undefined ? (
          <div style={{ border: "1px solid #f00", color: "#f00", padding: "8px" }}>
            An error was thrown.
          </div>
        ) : (
          props.fallback
        );
      }}
    >
      {props.children}
    </Errored>
  );
}

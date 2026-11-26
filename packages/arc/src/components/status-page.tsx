import { type Child, Match, Show, Switch } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Compass } from "@barqjs/lucide/icons/compass";
import { FileX } from "@barqjs/lucide/icons/file-x";
import { LockKeyhole } from "@barqjs/lucide/icons/lock-keyhole";
import { LogIn } from "@barqjs/lucide/icons/log-in";
import { RefreshCw } from "@barqjs/lucide/icons/refresh-cw";
import { ServerCrash } from "@barqjs/lucide/icons/server-crash";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { WifiOff } from "@barqjs/lucide/icons/wifi-off";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { bg, edge, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { EmptyState } from "./empty-state.tsx";
import { maybeRouter } from "./link.ts";
import { useArcMessages } from "./messages.ts";
import { type ServerErrorKind, serverErrorKind, serverProblem } from "./server-message.ts";

export const statusPageStyles = variants({
  slots: {
    root: arc(layout.column, layout.centre, gap[2], {
      minBlockSize: "60svh",
      justifyContent: "center",
      padding: space.x6,
    }),
    code: arc(type.stat, fg.faint, { fontSize: "calc(var(--text-2xl) * 2)", lineHeight: "1" }),
    state: arc({ flex: "0 0 auto" }),
    title: arc(type.heading),
    problem: arc(type.mono, type.xs, fg.faint),
    details: arc(edge.all, rounded.md, bg.sunken, layout.fill, { textAlign: "start" }),
    summary: arc(type.label, { cursor: "pointer", padding: space.x3 }),
    message: arc(edge.top, type.mono, type.xs, type.written, fg.muted, {
      margin: "0px",
      padding: space.x3,
    }),
  },
});

type Slots = ReturnType<typeof statusPageStyles>;

const CODES: Partial<Record<ServerErrorKind, string>> = {
  "not-found": "404",
  forbidden: "403",
  gone: "410",
  "signed-out": "401",
  failed: "500",
};

interface StatusIconProps {
  kind: ServerErrorKind;
  icon: Child | undefined;
}

function StatusIcon(props: StatusIconProps) {
  return (
    <Switch>
      <Match when={props.icon !== undefined}>{props.icon}</Match>
      <Match when={props.kind === "not-found"}>
        <Compass />
      </Match>
      <Match when={props.kind === "forbidden"}>
        <LockKeyhole />
      </Match>
      <Match when={props.kind === "gone"}>
        <FileX />
      </Match>
      <Match when={props.kind === "signed-out"}>
        <LogIn />
      </Match>
      <Match when={props.kind === "offline"}>
        <WifiOff />
      </Match>
      <Match when={props.kind === "unreachable"}>
        <ServerCrash />
      </Match>
      <Match when={props.kind === "failed"}>
        <TriangleAlert />
      </Match>
    </Switch>
  );
}

function retries(kind: ServerErrorKind): boolean {
  return kind === "offline" || kind === "unreachable" || kind === "failed";
}

interface StatusActionsProps extends StatusPageProps {
  kind: ServerErrorKind;
}

function StatusActions(props: StatusActionsProps) {
  const messages = useArcMessages();
  function Home(home: HomeProps) {
    return (
      <Button href={props.homeHref ?? "/"} variant={home.primary ? "default" : "outline"}>
        {messages().goHome}
      </Button>
    );
  }
  function Back() {
    return (
      <Show when={props.onBack !== undefined}>
        <Button variant="outline" onPress={() => props.onBack?.()}>
          {messages().goBack}
        </Button>
      </Show>
    );
  }
  return (
    <Switch>
      <Match when={props.kind === "signed-out"}>
        <Show
          when={props.signInHref !== undefined}
          fallback={<Button onPress={() => window.location.reload()}>{messages().signIn}</Button>}
        >
          <Button href={props.signInHref}>{messages().signIn}</Button>
        </Show>
      </Match>
      <Match when={retries(props.kind)}>
        <Show when={props.onRetry !== undefined}>
          <Button onPress={() => props.onRetry?.()}>
            <RefreshCw aria-hidden="true" />
            {messages().tryAgain}
          </Button>
        </Show>
        <Back />
        <Home primary={props.onRetry === undefined} />
      </Match>
      <Match when={!retries(props.kind)}>
        <Home primary />
        <Back />
      </Match>
    </Switch>
  );
}

interface HomeProps {
  primary: boolean;
}

export interface StatusPageProps extends Customisable<Slots> {
  /** Why there is nothing to show, which sets the icon, the words and the way out. @default "failed" */
  kind?: ServerErrorKind;
  /** Drawn large above it: `"404"`. @default the kind's HTTP status; `null` for none */
  code?: Child | null;
  /** In place of the kind's icon. */
  icon?: Child;
  heading?: Child;
  description?: Child;
  /** In place of the kind's own actions. */
  actions?: Child;
  /** A Try again button, for a kind worth trying again. */
  onRetry?: () => void;
  /** A Go back button. */
  onBack?: () => void;
  /** Where Go home leads. @default "/" */
  homeHref?: string;
  /** Where Sign in leads for an ended session. @default the page again, which signs in and comes back */
  signInHref?: string;
  /** The API's code for the failure, in a quiet monospace line. */
  problemCode?: string;
  /** What a developer needs, behind a Details disclosure: the error's message. */
  details?: Child;
  /** @default 1 */
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
}

/**
 * A whole page that says why there is nothing to show, and where to go:
 * not found, forbidden, gone, signed out, offline, the server out of reach,
 * or a failure nobody foresaw.
 *
 * ```tsx
 * <StatusPage kind="forbidden" />
 * <StatusPage kind="failed" onRetry={reset} problemCode="db_timeout" details={error.message} />
 * ```
 *
 * A page the reader may not open, or that is gone, offers the way out and
 * no retry; an ended session offers signing in; offline, unreachable and
 * failed offer Try again. The heading is the page's first heading. Inside
 * a route, `ErrorPage` and `NotFoundPage` fill all of this in.
 */
export function StatusPage(props: StatusPageProps) {
  const messages = useArcMessages();
  function kind(): ServerErrorKind {
    return props.kind ?? "failed";
  }
  function cls(): Slots {
    return parts(statusPageStyles(), props.classes);
  }
  function code(): Child | null | undefined {
    return props.code === undefined ? CODES[kind()] : props.code;
  }
  return (
    <div
      class={arc(cls().root, props.class, props.className)}
      data-slot="status-page"
      data-kind={kind()}
    >
      <Show when={code() !== undefined && code() !== null}>
        <p class={cls().code} data-slot="status-page-code">
          {code()}
        </p>
      </Show>
      <EmptyState
        class={cls().state}
        classes={{ title: cls().title }}
        icon={<StatusIcon kind={kind()} icon={props.icon} />}
        heading={props.heading ?? messages().statusHeading(kind())}
        description={props.description ?? messages().statusDescription(kind())}
        headingLevel={props.headingLevel ?? 1}
        actions={props.actions ?? <StatusActions {...props} kind={kind()} />}
      >
        <Show when={props.problemCode !== undefined || props.details !== undefined}>
          <Show when={props.problemCode !== undefined}>
            <p class={cls().problem} data-slot="status-page-problem" translate="no">
              {props.problemCode}
            </p>
          </Show>
          <Show when={props.details !== undefined}>
            <details class={cls().details} data-slot="status-page-details">
              <summary class={cls().summary}>{messages().errorDetails}</summary>
              <pre class={cls().message}>{props.details}</pre>
            </details>
          </Show>
        </Show>
      </EmptyState>
    </div>
  );
}

export interface ErrorPageProps extends Omit<StatusPageProps, "kind" | "onRetry"> {
  /** The failure, as a route's `errorComponent` is handed it. */
  error: unknown;
  /** The boundary's reset: Try again calls it and reloads the route's data. */
  reset?: () => void;
}

/**
 * What a route shows when it fails, by what the reader can do about it.
 *
 * ```tsx
 * export const Route = createFileRoute("/checks/$id")({
 *   component: Check,
 *   errorComponent: (props) => <ErrorPage error={props.error} reset={props.reset} />,
 * });
 * ```
 *
 * The kind comes from the error's status or, for an error a server render
 * handed over as a plain `Error`, from its words. A failure nobody
 * foresaw keeps its API code and its message to hand behind Details. Try
 * again resets the boundary and reloads the route's data; Go back goes
 * back where there is somewhere to go.
 */
export function ErrorPage(props: ErrorPageProps) {
  const router = maybeRouter();
  function kind(): ServerErrorKind {
    return serverErrorKind(props.error);
  }
  function details(): Child | undefined {
    if (props.details !== undefined) return props.details;
    if (kind() !== "failed") return undefined;
    return serverProblem(props.error).message;
  }
  return (
    <StatusPage
      {...props}
      kind={kind()}
      problemCode={props.problemCode ?? serverProblem(props.error).code}
      details={details()}
      onRetry={() => {
        props.reset?.();
        void router?.invalidate();
      }}
      onBack={
        props.onBack ??
        (router !== undefined && router.canGoBack() ? () => router.history.go(-1) : undefined)
      }
    />
  );
}

/** A not-found page for a route's `notFoundComponent`, or the router's own. */
export function NotFoundPage(props: Omit<StatusPageProps, "kind">) {
  const router = maybeRouter();
  return (
    <StatusPage
      {...props}
      kind="not-found"
      onBack={
        props.onBack ??
        (router !== undefined && router.canGoBack() ? () => router.history.go(-1) : undefined)
      }
    />
  );
}

import { type Child, Match, Show, Switch } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Monitor } from "@barqjs/lucide/icons/monitor";
import { Smartphone } from "@barqjs/lucide/icons/smartphone";
import { Tablet } from "@barqjs/lucide/icons/tablet";
import { Terminal } from "@barqjs/lucide/icons/terminal";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, glyph, layout, truncate, type } from "../style/index.ts";
import { useAction } from "./action-feedback.tsx";
import { confirm } from "./confirm.tsx";
import {
  DataTable,
  type DataTableColumn,
  type DataTableError,
  type DataTableRowAction,
} from "./data-table.tsx";
import { EmptyState } from "./empty-state.tsx";
import { type Moment, RelativeTime } from "./format.tsx";
import { useArcMessages } from "./messages.ts";
import { PersonAvatar } from "./person-avatar.tsx";
import { type ScopeGroup, scopeSummary } from "./scope-picker.tsx";
import { CopyableField } from "./secret-fields.tsx";
import { SettingRow } from "./setting-row.tsx";
import { Status } from "./status.tsx";
import { OverflowList } from "./table-cells.tsx";
import { Value } from "./value.tsx";

/** What a session runs on, which picks its icon. */
export type SessionDevice = "desktop" | "phone" | "tablet" | "terminal";

/** One place a person is signed in. */
export interface ActiveSession {
  id: string;
  /** What signed in, in words: "Firefox on macOS", "acme CLI", a user agent. */
  client: string;
  /** @default "desktop" */
  device?: SessionDevice;
  /** Roughly where: "Cairo, Egypt". */
  location?: string;
  /** The network address it was last seen from. */
  address?: string;
  lastActiveAt: Moment;
  /** The session reading the page, which is marked and never signed out from here. */
  current?: boolean;
}

export const accessListStyles = variants({
  slots: {
    root: arc(layout.column, gap[3]),
    who: arc(layout.row, gap[2], layout.minZero),
    icon: arc(fg.faint, glyph.md, layout.noShrink),
    name: arc(truncate, layout.minZero),
    detail: arc(truncate, fg.muted),
    where: arc(layout.column, layout.minZero),
    address: arc(type.mono, type.meta),
    actions: arc(layout.row, layout.wrap, layout.end, gap[2]),
  },
});

type Slots = ReturnType<typeof accessListStyles>;

interface DeviceIconProps {
  device: SessionDevice | undefined;
}

function DeviceIcon(props: DeviceIconProps) {
  return (
    <Switch fallback={<Monitor />}>
      <Match when={props.device === "phone"}>
        <Smartphone />
      </Match>
      <Match when={props.device === "tablet"}>
        <Tablet />
      </Match>
      <Match when={props.device === "terminal"}>
        <Terminal />
      </Match>
    </Switch>
  );
}

export interface ActiveSessionsListProps extends Customisable<Slots> {
  /** `undefined` while they load. */
  sessions: readonly ActiveSession[] | undefined;
  /** @default "Sessions" */
  label?: string;
  /** Why they did not load. */
  error?: DataTableError | null;
  onRetry?: () => void | Promise<unknown>;
  /** Signs one session out. Left out, the list only reads. */
  onRevoke?: (session: ActiveSession) => unknown;
  /** Signs out every session but this one, asked first. */
  onRevokeOthers?: () => unknown;
  /** The moment times are measured from while the page is drawn and hydrated. */
  now?: Moment;
}

/**
 * Everywhere a person is signed in: what signed in, roughly where, when it
 * was last active, with a Sign out on each and Sign out everywhere else.
 *
 * ```tsx
 * <ActiveSessionsList sessions={sessions.data} onRevoke={(one) => api.endSession(one.id)} onRevokeOthers={api.endOthers} />
 * ```
 *
 * The reader's own session is marked "This device" and has no Sign out.
 * The address goes below the `md` step and the time below `sm`; on a phone
 * each session is a card. A sign-out that fails says why in a toast;
 * signing out the rest is asked first and fails inside the question.
 */
export function ActiveSessionsList(props: ActiveSessionsListProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(accessListStyles(), props.classes);
  }
  const revoke = useAction((session: ActiveSession) => props.onRevoke?.(session), {
    success: messages().signedOut,
  });
  function others(): number {
    return (props.sessions ?? []).filter((session) => session.current !== true).length;
  }
  async function revokeOthers(): Promise<void> {
    await confirm({
      title: messages().signOutOthersHeading,
      description: messages().signOutOthersDescription(others()),
      confirmLabel: messages().signOutOthers,
      tone: "danger",
      action: () => props.onRevokeOthers?.(),
    });
  }
  function where(session: ActiveSession): Child {
    return (
      <span class={cls().where}>
        <Show when={session.location !== undefined}>
          <span class={cls().detail}>{session.location}</span>
        </Show>
        <Show when={session.address !== undefined}>
          <span class={cls().address} dir="ltr">
            {session.address}
          </span>
        </Show>
        <Show when={session.location === undefined && session.address === undefined}>
          <Value value={undefined} absentText={messages().unknownPlace} />
        </Show>
      </span>
    );
  }
  function active(session: ActiveSession): Child {
    return (
      <Show
        when={session.current !== true}
        fallback={<Status tone="success">{messages().thisDevice}</Status>}
      >
        <RelativeTime value={session.lastActiveAt} now={props.now} />
      </Show>
    );
  }
  const columns: readonly DataTableColumn<ActiveSession>[] = [
    {
      id: "client",
      accessorFn: (session: ActiveSession) => session.client,
      header: messages().sessionClient,
      isRowHeader: true,
      width: "minmax(12rem, 2fr)",
      cell: (context) => (
        <span class={cls().who}>
          <span class={cls().icon} aria-hidden="true">
            <DeviceIcon device={context.row.original.device} />
          </span>
          <span class={cls().name}>{context.row.original.client}</span>
        </span>
      ),
    },
    {
      id: "where",
      header: messages().sessionWhere,
      hideBelow: "md",
      cell: (context) => where(context.row.original),
    },
    {
      id: "active",
      header: messages().sessionActive,
      align: "end",
      hideBelow: "sm",
      width: "10rem",
      cell: (context) => active(context.row.original),
    },
  ];
  function actions(session: ActiveSession): readonly DataTableRowAction[] {
    if (props.onRevoke === undefined || session.current === true) return [];
    return [
      {
        label: messages().signOut,
        inline: true,
        onAction: async () => {
          await revoke.run(session);
        },
      },
    ];
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="active-sessions-list">
      <DataTable<ActiveSession>
        label={props.label ?? messages().sessions}
        columns={columns}
        data={props.sessions}
        getRowId={(session: ActiveSession) => session.id}
        error={props.error}
        onRetry={props.onRetry}
        skeletonRows={3}
        rowActions={props.onRevoke === undefined ? undefined : actions}
        empty={<EmptyState placement="section" heading={messages().noSessions} />}
        card={{
          title: (session: ActiveSession) => session.client,
          leading: (session: ActiveSession) => (
            <span class={cls().icon} aria-hidden="true">
              <DeviceIcon device={session.device} />
            </span>
          ),
          fact: (session: ActiveSession) => session.location ?? session.address,
          status: (session: ActiveSession) => active(session),
        }}
      />
      <Show when={props.onRevokeOthers !== undefined && others() > 0}>
        <div class={cls().actions} data-slot="active-sessions-list-actions">
          <Button variant="outline" size="sm" onPress={() => void revokeOthers()}>
            {messages().signOutOthers}
          </Button>
        </div>
      </Show>
    </div>
  );
}

/** An application a person let act for them: an agent, an integration, a CLI. */
export interface ConnectedApp {
  id: string;
  name: string;
  /** Its mark, a picture's address. Left out, its initials. */
  logo?: string;
  /** What tells it apart from another of the same name: its host, the machine it runs on. */
  source?: string;
  /** What it was granted. */
  scopes?: readonly string[];
  connectedAt: Moment;
  /** Left out or `null`, it has not been used. */
  lastUsedAt?: Moment | null;
  /** Who connected it, in a list of everyone's. */
  connectedBy?: string;
  /** Why a policy stops it working now. */
  blocked?: string;
}

/** Whether applications may be connected at all, held by an administrator. */
export interface ConnectionPolicy {
  allowed: boolean;
  /** Its promise holds the switch while it saves; a rejection flips it back with why. */
  onAllowedChange: (allowed: boolean) => unknown;
  /** @default "Applications may connect" */
  label?: Child;
  description?: Child;
}

export interface ConnectedAppsListProps extends Customisable<Slots> {
  /** `undefined` while they load. */
  apps: readonly ConnectedApp[] | undefined;
  /** @default "Connected applications" */
  label?: string;
  error?: DataTableError | null;
  onRetry?: () => void | Promise<unknown>;
  /** Disconnects one, asked first. Left out, the list only reads. */
  onDisconnect?: (app: ConnectedApp) => unknown;
  /** What disconnecting says it does. @default its tokens stop at once */
  disconnectDescription?: (app: ConnectedApp) => Child;
  /** The scopes' groups, so each app's access is said briefly. */
  scopeGroups?: readonly ScopeGroup[];
  /** A switch above the list that lets applications connect, or stops them all. */
  policy?: ConnectionPolicy;
  /** The address an application connects at, to copy. */
  endpoint?: string;
  /** What an empty list shows. */
  empty?: Child;
  now?: Moment;
}

/**
 * The applications acting for people: each one's mark, what tells it apart,
 * what it was granted, when it was connected and last used, and Disconnect,
 * asked first.
 *
 * ```tsx
 * <ConnectedAppsList apps={agents} scopeGroups={SCOPES} onDisconnect={(app) => api.disconnect(app.id)}
 *   policy={{ allowed: policy.allowed, onAllowedChange: savePolicy }} endpoint="https://acme.example.com/mcp" />
 * ```
 *
 * One an administrator's policy stops is marked blocked with why. In a list
 * of everyone's, `connectedBy` adds who connected each. Columns give way as
 * the screen narrows, and on a phone each app is a card.
 */
export function ConnectedAppsList(props: ConnectedAppsListProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(accessListStyles(), props.classes);
  }
  function access(app: ConnectedApp): readonly string[] {
    const scopes = app.scopes ?? [];
    return props.scopeGroups === undefined ? scopes : scopeSummary(scopes, props.scopeGroups);
  }
  function state(app: ConnectedApp): Child {
    return (
      <Show
        when={app.blocked !== undefined}
        fallback={<Status tone="success">{messages().appConnected}</Status>}
      >
        <span class={cls().where}>
          <Status tone="warning">{messages().appBlocked}</Status>
          <span class={cls().detail}>{app.blocked}</span>
        </span>
      </Show>
    );
  }
  async function disconnect(app: ConnectedApp): Promise<void> {
    await confirm({
      title: messages().disconnectHeading(app.name),
      description: props.disconnectDescription?.(app) ?? messages().disconnectDescription,
      confirmLabel: messages().disconnect,
      tone: "danger",
      action: () => props.onDisconnect?.(app),
    });
  }
  function hasPeople(): boolean {
    return (props.apps ?? []).some((app) => app.connectedBy !== undefined);
  }
  function hasScopes(): boolean {
    return (props.apps ?? []).some((app) => (app.scopes ?? []).length > 0);
  }
  function columns(): readonly DataTableColumn<ConnectedApp>[] {
    const out: DataTableColumn<ConnectedApp>[] = [
      {
        id: "app",
        accessorFn: (app: ConnectedApp) => app.name,
        header: messages().appColumn,
        isRowHeader: true,
        width: "minmax(12rem, 2fr)",
        cell: (context) => (
          <span class={cls().who}>
            <span aria-hidden="true">
              <PersonAvatar
                person={{ name: context.row.original.name, src: context.row.original.logo }}
                size="sm"
              />
            </span>
            <span class={cls().where}>
              <span class={cls().name}>{context.row.original.name}</span>
              <Show when={context.row.original.source !== undefined}>
                <span class={cls().detail} dir="auto">
                  {context.row.original.source}
                </span>
              </Show>
            </span>
          </span>
        ),
      },
      {
        id: "state",
        header: messages().appState,
        width: "9rem",
        cell: (context) => state(context.row.original),
      },
    ];
    if (hasPeople()) {
      out.push({
        id: "by",
        header: messages().connectedBy,
        hideBelow: "sm",
        cell: (context) => (
          <span class={cls().detail}>{context.row.original.connectedBy ?? ""}</span>
        ),
      });
    }
    if (hasScopes()) {
      out.push({
        id: "access",
        header: messages().appAccess,
        hideBelow: "lg",
        cell: (context) => (
          <OverflowList
            label={messages().scopesOf(context.row.original.name)}
            items={access(context.row.original)}
            render={(scope: string) => <code class={cls().address}>{scope}</code>}
          />
        ),
      });
    }
    out.push(
      {
        id: "used",
        header: messages().lastUsed,
        align: "end",
        hideBelow: "lg",
        width: "8rem",
        cell: (context) => (
          <Value
            value={context.row.original.lastUsedAt}
            absent="never"
            format={(at: Moment) => <RelativeTime value={at} now={props.now} />}
          />
        ),
      },
      {
        id: "connected",
        header: messages().connectedAt,
        align: "end",
        hideBelow: "xl",
        width: "8rem",
        cell: (context) => (
          <RelativeTime value={context.row.original.connectedAt} now={props.now} />
        ),
      },
    );
    return out;
  }
  function actions(app: ConnectedApp): readonly DataTableRowAction[] {
    return [{ label: messages().disconnect, tone: "danger", onAction: () => disconnect(app) }];
  }
  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="connected-apps-list">
      <Show when={props.policy !== undefined}>
        <SettingRow
          label={props.policy?.label ?? messages().appsMayConnect}
          description={props.policy?.description}
          checked={props.policy?.allowed ?? false}
          onCheckedChange={(allowed: boolean) => props.policy?.onAllowedChange(allowed)}
        />
      </Show>
      <Show when={props.endpoint !== undefined}>
        <CopyableField
          label={messages().connectAt}
          value={props.endpoint ?? ""}
          copyLabel={messages().copyAddress}
        />
      </Show>
      <DataTable<ConnectedApp>
        label={props.label ?? messages().connectedApps}
        columns={columns()}
        data={props.apps}
        getRowId={(app: ConnectedApp) => app.id}
        error={props.error}
        onRetry={props.onRetry}
        skeletonRows={3}
        rowActions={props.onDisconnect === undefined ? undefined : actions}
        empty={
          props.empty ?? <EmptyState placement="section" heading={messages().noConnectedApps} />
        }
        card={{
          title: (app: ConnectedApp) => app.name,
          leading: (app: ConnectedApp) => (
            <span aria-hidden="true">
              <PersonAvatar person={{ name: app.name, src: app.logo }} size="sm" />
            </span>
          ),
          fact: (app: ConnectedApp) => app.blocked ?? app.source,
          status: (app: ConnectedApp) => (
            <Show
              when={app.blocked !== undefined}
              fallback={<Status tone="success">{messages().appConnected}</Status>}
            >
              <Status tone="warning">{messages().appBlocked}</Status>
            </Show>
          ),
        }}
      />
    </div>
  );
}

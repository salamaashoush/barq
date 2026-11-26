import { type Child, Show, createSignal, untrack } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { KeyRound } from "@barqjs/lucide/icons/key-round";
import { Plus } from "@barqjs/lucide/icons/plus";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { confirm } from "./confirm.tsx";
import {
  DataTable,
  type DataTableColumn,
  type DataTableError,
  type DataTableRowAction,
} from "./data-table.tsx";
import { EmptyState } from "./empty-state.tsx";
import { FormDialog } from "./form-dialog.tsx";
import { FormattedDate, type Moment, RelativeTime, toDate } from "./format.tsx";
import { type FieldOption, useArcForm } from "./form.tsx";
import { useArcMessages } from "./messages.ts";
import { type ScopeGroup, scopeSummary } from "./scope-picker.tsx";
import { OneTimeSecret } from "./secret-display.tsx";
import { Status } from "./status.tsx";
import { OverflowList } from "./table-cells.tsx";
import { freeSlug } from "./text-fields.tsx";
import { Value } from "./value.tsx";

/** A key as the server lists it: never the key itself, only what tells it apart. */
export interface ApiKey {
  id: string;
  name: string;
  /** Its first characters, shown as `ak_live_3f…`. */
  prefix?: string;
  /** Its last characters, shown as `…x7Qa`. */
  suffix?: string;
  /** What it may do. Left out, everything its owner may. */
  scopes?: readonly string[];
  /** Left out or `null`, it has not been used. */
  lastUsedAt?: Moment | null;
  /** Left out or `null`, it works until revoked. */
  expiresAt?: Moment | null;
}

/** What the create form asks for. */
export interface ApiKeyDraft {
  name: string;
  /** `null` for a key that works until revoked. */
  expiresAt: Date | null;
  /** The scopes ticked, with `scopeGroups`. */
  scopes: readonly string[];
}

/** A key just made: the key itself, which is shown once, and how it is listed. */
export interface CreatedApiKey {
  secret: string;
  key?: ApiKey;
}

/** A box the revoke question carries: "Also remove the 3 runners that joined with it". */
export interface RevokeOption {
  label: Child;
  /** @default true */
  defaultValue?: boolean;
}

interface KeyValues {
  name: string;
  expiry: string | null;
  scopes: readonly string[];
}

const NEVER = "never";

export const apiKeyManagerStyles = variants({
  slots: {
    root: arc(layout.column, gap[3]),
    bar: arc(layout.row, layout.wrap, layout.between, gap[2]),
    count: arc(type.meta),
    name: arc(type.medium),
    key: arc(type.mono, type.meta, fg.muted),
    scope: arc(type.mono, type.meta),
  },
});

type Slots = ReturnType<typeof apiKeyManagerStyles>;

export interface ApiKeyManagerProps extends Customisable<Slots> {
  /** `undefined` while they load. */
  keys: readonly ApiKey[] | undefined;
  /** @default "API keys" */
  label?: string;
  error?: DataTableError | null;
  onRetry?: () => void | Promise<unknown>;
  /** Makes a key. Its secret is shown once, in the dialog. Left out, no key can be made here. */
  onCreate?: (draft: ApiKeyDraft) => Promise<CreatedApiKey>;
  /** A key was made: where it flows next, such as install commands that fill it in. */
  onCreated?: (created: CreatedApiKey) => void;
  /** Revokes one, asked first; `also` is the answer to `revokeOption`'s box. */
  onRevoke?: (key: ApiKey, also: boolean) => unknown;
  /** What revoking it says it does. @default anything using it stops at once */
  revokeDescription?: (key: ApiKey) => Child;
  /** A box the revoke question carries for this key, or `undefined` for none. */
  revokeOption?: (key: ApiKey) => RevokeOption | undefined;
  /** How long a new key may last, in days, `null` for until revoked. @default [7, 30, 90, 365, null] */
  expiryDays?: readonly (number | null)[];
  /** @default 90, or the first of `expiryDays` */
  defaultExpiryDays?: number | null;
  /** The scopes a key may hold, picked when one is made and summed up in the list. */
  scopeGroups?: readonly ScopeGroup[];
  /** The scopes this reader may grant; the rest show, disabled. */
  allowedScopes?: readonly string[];
  /** @default none ticked */
  defaultScopes?: readonly string[];
  /** A new key's suggested name, made free of the names in use: `default`, `default-2`. @default "default" */
  defaultName?: string;
  /** What the dialog says of the key once made. */
  createdHint?: Child;
  /** The moment times are measured from while the page is drawn and hydrated. */
  now?: Moment;
}

/**
 * The API keys of an account, an organization or a machine: each one's
 * name, the characters that tell it apart, its scopes, when it was last used
 * and when it expires; a dialog that makes one and shows its secret once;
 * and Revoke, asked first.
 *
 * ```tsx
 * <ApiKeyManager keys={keys.data} scopeGroups={SCOPES}
 *   onCreate={(draft) => api.createKey(draft)} onRevoke={(key) => api.revokeKey(key.id)} />
 * ```
 *
 * A new key's name is suggested free of the names in use, its expiry is
 * one of `expiryDays`, and with `scopeGroups` it takes a scope picker that
 * asks for at least one. Once made, the dialog shows the secret with its
 * copy button until Done. An expired key is marked so in the danger tone.
 */
export function ApiKeyManager(props: ApiKeyManagerProps) {
  const messages = useArcMessages();
  const [made, setMade] = createSignal<CreatedApiKey | null>(null);
  const [creating, setCreating] = createSignal(false);
  function cls(): Slots {
    return parts(apiKeyManagerStyles(), props.classes);
  }
  function days(): readonly (number | null)[] {
    return props.expiryDays ?? [7, 30, 90, 365, null];
  }
  function expiryKey(day: number | null): string {
    return day === null ? NEVER : String(day);
  }
  function defaultExpiry(): string {
    const all = days();
    const wanted = props.defaultExpiryDays === undefined ? 90 : props.defaultExpiryDays;
    return expiryKey(all.includes(wanted) ? wanted : (all[0] ?? null));
  }
  function expiryOptions(): FieldOption[] {
    return days().map((day) => ({
      value: expiryKey(day),
      label: day === null ? messages().never : messages().inDays(day),
    }));
  }
  function suggestedName(): string {
    return freeSlug(
      props.defaultName ?? messages().defaultKeyName,
      (props.keys ?? []).map((key) => key.name),
    );
  }
  function defaults(): KeyValues {
    return {
      name: suggestedName(),
      expiry: defaultExpiry(),
      scopes: props.defaultScopes ?? [],
    };
  }

  const form = useArcForm(() => ({
    defaultValues: untrack(defaults),
    validators: {
      onSubmit: ({ value }) => {
        const fields: Record<string, string> = {};
        if (value.name.trim() === "") fields.name = messages().nameTheKey;
        if (props.scopeGroups !== undefined && value.scopes.length === 0) {
          fields.scopes = messages().pickAtLeastOne;
        }
        return Object.keys(fields).length > 0 ? { fields } : undefined;
      },
    },
    onSubmit: async ({ value }) => {
      const lasts = value.expiry ?? NEVER;
      const created = await props.onCreate?.({
        name: value.name.trim(),
        expiresAt: lasts === NEVER ? null : new Date(Date.now() + Number(lasts) * 86_400_000),
        scopes: value.scopes,
      });
      if (created === undefined) return;
      setMade(created);
      props.onCreated?.(created);
    },
  }));

  const chosenExpiry = form.useSelector((state) => state.values.expiry);

  function open(): void {
    setMade(null);
    form.reset(defaults());
    setCreating(true);
  }

  function expired(key: ApiKey): boolean {
    const at = key.expiresAt;
    if (at === null || at === undefined) return false;
    const now = props.now === undefined ? Date.now() : toDate(props.now).getTime();
    return toDate(at).getTime() <= now;
  }

  async function revoke(key: ApiKey): Promise<void> {
    const option = props.revokeOption?.(key);
    const description = props.revokeDescription?.(key) ?? messages().revokeKeyDescription;
    if (option === undefined) {
      await confirm({
        title: messages().revokeKeyHeading(key.name),
        description,
        confirmLabel: messages().revokeKey,
        tone: "danger",
        action: () => props.onRevoke?.(key, false),
      });
      return;
    }
    await confirm({
      title: messages().revokeKeyHeading(key.name),
      description,
      confirmLabel: messages().revokeKey,
      tone: "danger",
      field: { kind: "checkbox", label: option.label, defaultValue: option.defaultValue ?? true },
      action: (also: boolean) => props.onRevoke?.(key, also),
    });
  }

  function shown(key: ApiKey): string {
    if (key.prefix !== undefined) return `${key.prefix}…`;
    if (key.suffix !== undefined) return `…${key.suffix}`;
    return "";
  }

  function hasScopes(): boolean {
    return (props.keys ?? []).some((key) => key.scopes !== undefined);
  }

  function access(key: ApiKey): readonly string[] {
    const scopes = key.scopes ?? [];
    return props.scopeGroups === undefined ? scopes : scopeSummary(scopes, props.scopeGroups);
  }

  function expiry(key: ApiKey): Child {
    return (
      <Show
        when={!expired(key)}
        fallback={
          <Status tone="danger">
            {messages().expired} <RelativeTime value={key.expiresAt ?? 0} now={props.now} />
          </Status>
        }
      >
        <Value
          value={key.expiresAt}
          absent="never"
          format={(at: Moment) => <FormattedDate value={at} />}
        />
      </Show>
    );
  }

  function columns(): readonly DataTableColumn<ApiKey>[] {
    const out: DataTableColumn<ApiKey>[] = [
      {
        id: "name",
        accessorFn: (key: ApiKey) => key.name,
        header: messages().keyName,
        isRowHeader: true,
        cell: (context) => <span class={cls().name}>{context.row.original.name}</span>,
      },
      {
        id: "key",
        header: messages().keyColumn,
        hideBelow: "sm",
        width: "10rem",
        cell: (context) => (
          <code class={cls().key} dir="ltr">
            {shown(context.row.original)}
          </code>
        ),
      },
    ];
    if (hasScopes()) {
      out.push({
        id: "access",
        header: messages().appAccess,
        hideBelow: "lg",
        cell: (context) => (
          <Show
            when={context.row.original.scopes !== undefined}
            fallback={<span class={cls().count}>{messages().everyScope}</span>}
          >
            <OverflowList
              label={messages().scopesOf(context.row.original.name)}
              items={access(context.row.original)}
              render={(scope: string) => <code class={cls().scope}>{scope}</code>}
            />
          </Show>
        ),
      });
    }
    out.push(
      {
        id: "used",
        header: messages().lastUsed,
        align: "end",
        hideBelow: "md",
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
        id: "expires",
        header: messages().expires,
        align: "end",
        width: "10rem",
        cell: (context) => expiry(context.row.original),
      },
    );
    return out;
  }

  function actions(key: ApiKey): readonly DataTableRowAction[] {
    return [{ label: messages().revokeKey, tone: "danger", onAction: () => revoke(key) }];
  }

  function CreateButton() {
    return (
      <Button size="sm" onPress={open} data-slot="api-key-manager-create">
        <Plus aria-hidden="true" />
        {messages().createKey}
      </Button>
    );
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="api-key-manager">
      <Show when={props.onCreate !== undefined && (props.keys ?? []).length > 0}>
        <div class={cls().bar} data-slot="api-key-manager-bar">
          <span class={cls().count} data-slot="api-key-manager-count">
            {messages().keyCount((props.keys ?? []).length)}
          </span>
          <CreateButton />
        </div>
      </Show>
      <DataTable<ApiKey>
        label={props.label ?? messages().apiKeys}
        columns={columns()}
        data={props.keys}
        getRowId={(key: ApiKey) => key.id}
        error={props.error}
        onRetry={props.onRetry}
        skeletonRows={3}
        rowActions={props.onRevoke === undefined ? undefined : actions}
        empty={
          <EmptyState
            placement="section"
            icon={<KeyRound />}
            heading={messages().noApiKeys}
            description={messages().noApiKeysDescription}
            actions={props.onCreate === undefined ? undefined : <CreateButton />}
          />
        }
        card={{
          title: (key: ApiKey) => key.name,
          fact: (key: ApiKey) => shown(key),
          status: (key: ApiKey) => expiry(key),
        }}
      />
      <Show when={props.onCreate !== undefined}>
        <FormDialog
          form={form}
          heading={made() === null ? messages().createKeyHeading : messages().copyNewKey}
          description={made() === null ? messages().createKeyDescription : undefined}
          open={creating()}
          onOpenChange={(next: boolean) => {
            setCreating(next);
            if (!next) setMade(null);
          }}
          submitLabel={messages().createKey}
          result={() => (
            <OneTimeSecret
              value={made()?.secret ?? ""}
              heading={made()?.key?.name}
              hint={props.createdHint}
              expiresAt={made()?.key?.expiresAt ?? undefined}
              copyLabel={messages().copyTheKey}
            />
          )}
        >
          <form.AppField name="name">
            {(field) => <field.TextField label={messages().keyName} autoComplete="off" />}
          </form.AppField>
          <form.AppField name="expiry">
            {(field) => (
              <field.SelectField
                label={messages().expires}
                options={expiryOptions()}
                description={
                  chosenExpiry() === NEVER ? messages().neverExpiresHint : messages().expiresHint
                }
              />
            )}
          </form.AppField>
          <Show when={props.scopeGroups !== undefined}>
            <form.AppField name="scopes">
              {(field) => (
                <field.PermissionScopePicker
                  label={messages().scopes}
                  groups={props.scopeGroups ?? []}
                  allowed={props.allowedScopes}
                  isRequired
                />
              )}
            </form.AppField>
          </Show>
        </FormDialog>
      </Show>
    </div>
  );
}

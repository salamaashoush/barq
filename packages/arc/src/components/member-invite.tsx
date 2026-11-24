import { type Child, Show, createSignal } from "@barqjs/core";
import { variants } from "@barqjs/css";
import { Link2 } from "@barqjs/lucide/icons/link-2";
import { Mail } from "@barqjs/lucide/icons/mail";
import { Button } from "@barqjs/ui/button";

import { arcLayer as arc } from "../layer.ts";
import { type Customisable, parts } from "../lib/parts.ts";
import { fg, gap, layout, type } from "../style/index.ts";
import { confirm } from "./confirm.tsx";
import { CopyButton } from "./copy-button.tsx";
import { EmptyState } from "./empty-state.tsx";
import { type FieldOption, setServerErrors, useArcForm } from "./form.tsx";
import { type Moment, RelativeTime } from "./format.tsx";
import { List, ListItem } from "./item-list.tsx";
import { useArcMessages } from "./messages.ts";
import { Status } from "./status.tsx";

/** An answer now, or a promise the control shows as pending until it settles. */
type Outcome = void | Promise<unknown>;

export interface InviteDraft {
  emails: string[];
  role: string;
}

export interface RejectedInvite {
  email: string;
  reason: string;
}

/** The addresses a server refused, each with why; the rest were invited. */
export interface InviteResult {
  rejected?: readonly RejectedInvite[];
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  invitedAt: Moment;
  expiresAt?: Moment;
  invitedBy?: string;
  /** No longer usable; resending makes a new one. */
  expired?: boolean;
}

export interface InviteLink {
  id: string;
  url: string;
  role: string;
  uses: number;
  maxUses?: number;
  expiresAt?: Moment;
}

export interface InviteLinkDraft {
  role: string;
  /** None for unlimited. */
  maxUses?: number;
  /** Days until it stops working; none for never. */
  expiresInDays?: number;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export const memberInviteStyles = variants({
  slots: {
    root: arc(layout.column, gap[4]),
    form: arc(layout.column, gap[3]),
    row: arc(layout.row, layout.wrap, gap[3], { alignItems: "flex-end" }),
    emails: arc(layout.grow, { minWidth: "16rem" }),
    role: arc({ minWidth: "10rem" }),
    actions: arc(layout.row, layout.wrap, layout.end, gap[2]),
    meta: arc(type.meta, type.numeric),
    url: arc(type.mono, type.xs, layout.minZero, layout.clip, layout.nowrap, fg.muted),
    error: arc(type.caption, fg.danger, layout.flush),
  },
});

type Slots = ReturnType<typeof memberInviteStyles>;

export interface MemberInviteProps extends Customisable<Slots> {
  roles: readonly FieldOption[];
  /** @default the first of `roles` */
  defaultRole?: string;
  /** Sends the invitations. Addresses it refuses stay in the field with why. */
  onInvite: (draft: InviteDraft) => Promise<InviteResult | void> | InviteResult | void;
  /** No more addresses than this at once. @default 50 */
  maxEmails?: number;
  /** Refuses an address with a reason, past the shape of an email: a domain, a member already. */
  validateEmail?: (email: string) => string | undefined;
}

/**
 * Invitations by email: addresses typed or pasted as chips, each checked as
 * it is added, a role for all of them, and Send. Addresses the server
 * refuses stay in the field with the reason; the rest are cleared.
 *
 * ```tsx
 * <MemberInvite
 *   roles={[{ value: "member", label: "Member" }, { value: "admin", label: "Admin" }]}
 *   onInvite={(draft) => api.invite(draft)}
 * />
 * ```
 */
export function MemberInvite(props: MemberInviteProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(memberInviteStyles(), props.classes);
  }
  const form = useArcForm(() => ({
    defaultValues: {
      emails: [] as string[],
      role: props.defaultRole ?? props.roles[0]?.value ?? "",
    },
    onSubmit: async ({ value, formApi }) => {
      if (value.emails.length === 0) {
        setServerErrors(formApi, { fields: { emails: messages().addAnEmail } });
        return;
      }
      const result = await props.onInvite({ emails: [...value.emails], role: value.role });
      const rejected = (result ?? {}).rejected ?? [];
      formApi.setFieldValue(
        "emails",
        rejected.map((one) => one.email),
      );
      if (rejected.length > 0) {
        setServerErrors(formApi, {
          fields: {
            emails: rejected.map((one) => `${one.email}: ${one.reason}`).join(" "),
          },
        });
      }
    },
  }));

  function validate(email: string): string | undefined {
    if (!EMAIL.test(email)) return messages().invalidEmail(email);
    return props.validateEmail?.(email);
  }

  return (
    <form.AppForm>
      <form
        class={arc(cls().root, cls().form, props.class, props.className)}
        data-slot="member-invite"
        aria-label={messages().inviteMembers}
        noValidate
        onSubmit={(event: Event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.FormError />
        <div class={cls().row} data-slot="member-invite-row">
          <div class={cls().emails}>
            <form.AppField name="emails">
              {(field) => (
                <field.TagInput
                  label={messages().emailAddresses}
                  description={messages().emailsHint}
                  placeholder="name@example.com"
                  separators={[",", " ", ";"]}
                  caseInsensitive
                  maxTags={props.maxEmails ?? 50}
                  validate={validate}
                  addOnBlur
                />
              )}
            </form.AppField>
          </div>
          <div class={cls().role}>
            <form.AppField name="role">
              {(field) => <field.SelectField label={messages().role} options={props.roles} />}
            </form.AppField>
          </div>
        </div>
        <div class={cls().actions}>
          <form.SubmitButton>
            <Mail aria-hidden="true" />
            {messages().sendInvites}
          </form.SubmitButton>
        </div>
      </form>
    </form.AppForm>
  );
}

function roleLabel(roles: readonly FieldOption[], role: string): string {
  return roles.find((one) => one.value === role)?.label ?? role;
}

interface BusyKeys {
  get: () => ReadonlySet<string>;
  set: (next: ReadonlySet<string>) => void;
}

/** Run `outcome` with `key` marked busy, and mark `key` failed if it rejects. */
function tracked(
  outcome: Outcome,
  key: string,
  busy: BusyKeys,
  failed: (key: string | null) => void,
): void {
  if (!(outcome instanceof Promise)) return;
  busy.set(new Set([...busy.get(), key]));
  failed(null);
  outcome.then(
    () => {
      const left = new Set(busy.get());
      left.delete(key);
      busy.set(left);
    },
    () => {
      const left = new Set(busy.get());
      left.delete(key);
      busy.set(left);
      failed(key);
    },
  );
}

export interface PendingInvitesProps extends Customisable<Slots> {
  invites: readonly PendingInvite[];
  roles: readonly FieldOption[];
  onResend?: (invite: PendingInvite) => Outcome;
  /** Asked through `confirm()` first. */
  onRevoke?: (invite: PendingInvite) => Outcome;
  /** The moment times are measured from on the server and while hydrating. */
  now?: Moment;
  empty?: Child;
}

/**
 * The invitations not yet accepted: each address with its role, when it was
 * sent and when it expires, and Resend and Revoke, the second asked first.
 */
export function PendingInvites(props: PendingInvitesProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(memberInviteStyles(), props.classes);
  }
  const [busy, setBusy] = createSignal<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = createSignal<string | null>(null);
  const keep = { get: busy, set: setBusy };

  async function revoke(invite: PendingInvite): Promise<void> {
    const sure = await confirm({
      title: messages().revokeInviteHeading(invite.email),
      description: messages().revokeInviteDescription,
      confirmLabel: messages().revoke,
      tone: "danger",
    });
    if (sure) tracked(props.onRevoke?.(invite), invite.id, keep, setFailed);
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="pending-invites">
      <Show when={failed() !== null}>
        <p class={cls().error} role="alert">
          {messages().actionFailed}
        </p>
      </Show>
      <List<PendingInvite>
        aria-label={messages().pendingInvites}
        items={props.invites}
        getTextValue={(invite: PendingInvite) => invite.email}
        empty={props.empty ?? <EmptyState heading={messages().noPendingInvites} />}
      >
        {(invite: PendingInvite) => (
          <ListItem
            title={invite.email}
            description={
              <>
                {roleLabel(props.roles, invite.role)}
                <Show when={invite.invitedBy !== undefined}>
                  {` · ${messages().invitedBy(invite.invitedBy ?? "")}`}
                </Show>
              </>
            }
            meta={
              <Show
                when={invite.expired !== true}
                fallback={<Status tone="warning">{messages().inviteExpired}</Status>}
              >
                <span class={cls().meta}>
                  {messages().sent} <RelativeTime value={invite.invitedAt} now={props.now} />
                </span>
              </Show>
            }
            actions={
              <>
                <Show when={props.onResend !== undefined}>
                  <Button
                    variant="outline"
                    size="sm"
                    isPending={busy().has(invite.id)}
                    aria-label={messages().resendTo(invite.email)}
                    onPress={() => tracked(props.onResend?.(invite), invite.id, keep, setFailed)}
                  >
                    {messages().resend}
                  </Button>
                </Show>
                <Show when={props.onRevoke !== undefined}>
                  <Button
                    variant="ghost"
                    size="sm"
                    isDisabled={busy().has(invite.id)}
                    aria-label={messages().revokeFor(invite.email)}
                    onPress={() => void revoke(invite)}
                  >
                    {messages().revoke}
                  </Button>
                </Show>
              </>
            }
          />
        )}
      </List>
    </div>
  );
}

export interface InviteLinksProps extends Customisable<Slots> {
  links: readonly InviteLink[];
  roles: readonly FieldOption[];
  /** Adds a form that makes a link: its role, how many uses and for how long. */
  onCreate?: (draft: InviteLinkDraft) => Outcome;
  /** Asked through `confirm()` first. */
  onDeactivate?: (link: InviteLink) => Outcome;
  now?: Moment;
}

const EXPIRY_DAYS = ["1", "7", "30", ""] as const;

/**
 * Links that let anyone who has one join with a role: each to copy, with
 * its uses and when it expires, and Deactivate, asked first. `onCreate`
 * adds a form for a new one.
 */
export function InviteLinks(props: InviteLinksProps) {
  const messages = useArcMessages();
  function cls(): Slots {
    return parts(memberInviteStyles(), props.classes);
  }
  const [busy, setBusy] = createSignal<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = createSignal<string | null>(null);
  const keep = { get: busy, set: setBusy };

  const form = useArcForm(() => ({
    defaultValues: {
      role: props.roles[0]?.value ?? "",
      maxUses: null as number | null,
      expires: "7",
    },
    onSubmit: async ({ value }) => {
      await props.onCreate?.({
        role: value.role,
        maxUses: value.maxUses ?? undefined,
        expiresInDays: value.expires === "" ? undefined : Number(value.expires),
      });
    },
  }));

  async function deactivate(link: InviteLink): Promise<void> {
    const sure = await confirm({
      title: messages().deactivateLinkHeading,
      description: messages().deactivateLinkDescription,
      confirmLabel: messages().deactivate,
      tone: "danger",
    });
    if (sure) tracked(props.onDeactivate?.(link), link.id, keep, setFailed);
  }

  function expiry(days: string): string {
    return days === "" ? messages().never : messages().inDays(Number(days));
  }

  return (
    <div class={arc(cls().root, props.class, props.className)} data-slot="invite-links">
      <Show when={props.onCreate !== undefined}>
        <form.AppForm>
          <form
            class={cls().form}
            data-slot="invite-links-form"
            aria-label={messages().createInviteLink}
            noValidate
            onSubmit={(event: Event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
          >
            <div class={cls().row}>
              <div class={cls().role}>
                <form.AppField name="role">
                  {(field) => <field.SelectField label={messages().role} options={props.roles} />}
                </form.AppField>
              </div>
              <div class={cls().role}>
                <form.AppField name="maxUses">
                  {(field) => <field.NumberField label={messages().maxUses} min={1} step={1} />}
                </form.AppField>
              </div>
              <div class={cls().role}>
                <form.AppField name="expires">
                  {(field) => (
                    <field.SelectField
                      label={messages().expires}
                      options={EXPIRY_DAYS.map((days) => ({ value: days, label: expiry(days) }))}
                    />
                  )}
                </form.AppField>
              </div>
              <form.SubmitButton>
                <Link2 aria-hidden="true" />
                {messages().createInviteLink}
              </form.SubmitButton>
            </div>
          </form>
        </form.AppForm>
      </Show>
      <Show when={failed() !== null}>
        <p class={cls().error} role="alert">
          {messages().actionFailed}
        </p>
      </Show>
      <List<InviteLink>
        aria-label={messages().inviteLinks}
        items={props.links}
        getTextValue={(link: InviteLink) => link.url}
        empty={<EmptyState heading={messages().noInviteLinks} />}
      >
        {(link: InviteLink) => (
          <ListItem
            title={<span class={cls().url}>{link.url}</span>}
            description={`${roleLabel(props.roles, link.role)} · ${
              link.maxUses === undefined
                ? messages().usesCount(link.uses)
                : messages().usesOf(link.uses, link.maxUses)
            }`}
            meta={
              <Show when={link.expiresAt !== undefined} fallback={messages().neverExpires}>
                <span class={cls().meta}>
                  {messages().expiresLabel}{" "}
                  <RelativeTime value={link.expiresAt ?? 0} now={props.now} />
                </span>
              </Show>
            }
            actions={
              <>
                <CopyButton
                  value={link.url}
                  size="sm"
                  variant="outline"
                  label={messages().copyLink}
                />
                <Show when={props.onDeactivate !== undefined}>
                  <Button
                    variant="ghost"
                    size="sm"
                    isPending={busy().has(link.id)}
                    aria-label={messages().deactivateLink(link.url)}
                    onPress={() => void deactivate(link)}
                  >
                    {messages().deactivate}
                  </Button>
                </Show>
              </>
            }
          />
        )}
      </List>
    </div>
  );
}

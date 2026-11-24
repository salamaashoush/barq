import { Match, Switch } from "@barqjs/core";
import {
  type DangerAction,
  DangerZone,
  type NavGroup,
  SettingsLayout,
  SettingsSection,
  Stack,
  Text,
  setServerErrors,
  toast,
  useArcForm,
} from "@barqjs/arc";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Building2 } from "@barqjs/lucide/icons/building-2";
import { TriangleAlert } from "@barqjs/lucide/icons/triangle-alert";
import { UserRound } from "@barqjs/lucide/icons/user-round";
import { useSearchParams } from "@barqjs/router";

function section(id: string) {
  return {
    to: "/settings",
    search: { section: id },
    hash: "settings-layout",
  };
}

const NAVIGATION: readonly NavGroup[] = [
  {
    label: "Account",
    items: [
      { label: "Profile", icon: UserRound, ...section("profile") },
      { label: "Notifications", icon: Bell, ...section("notifications") },
    ],
  },
  {
    label: "Workspace",
    items: [
      { label: "General", icon: Building2, ...section("workspace") },
      { label: "Danger zone", icon: TriangleAlert, ...section("danger") },
    ],
  },
];

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function Profile() {
  const form = useArcForm(() => ({
    defaultValues: { name: "Salama", email: "salama@example.com", title: "Engineering lead" },
    onSubmit: async ({ value, formApi }) => {
      await wait(700);
      if (!value.email.endsWith("@example.com")) {
        setServerErrors(formApi, { fields: { email: "Use your example.com address" } });
      }
    },
  }));
  return (
    <SettingsSection
      id="profile"
      heading="Profile"
      description="How others see you across Acme."
      form={form}
      hint="Shown on comments and invoices."
    >
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
      <form.AppField name="email">
        {(field) => <field.TextField label="Email" type="email" />}
      </form.AppField>
      <form.AppField name="title">{(field) => <field.TextField label="Title" />}</form.AppField>
    </SettingsSection>
  );
}

function Notifications() {
  const form = useArcForm(() => ({
    defaultValues: { incidents: true, invoices: false, digest: "weekly" },
    onSubmit: () => wait(500),
  }));
  return (
    <SettingsSection
      id="notifications"
      heading="Notifications"
      description="What Acme emails you about."
      form={form}
    >
      <form.AppField name="incidents">
        {(field) => (
          <field.SwitchField label="Incidents" description="When a service you own goes down." />
        )}
      </form.AppField>
      <form.AppField name="invoices">
        {(field) => (
          <field.SwitchField label="Invoices" description="When a customer pays or is overdue." />
        )}
      </form.AppField>
      <form.AppField name="digest">
        {(field) => (
          <field.SelectField
            label="Digest"
            options={[
              { value: "daily", label: "Every morning" },
              { value: "weekly", label: "Monday mornings" },
              { value: "never", label: "Never" },
            ]}
          />
        )}
      </form.AppField>
    </SettingsSection>
  );
}

function Workspace() {
  return (
    <SettingsSection
      id="workspace"
      heading="General"
      description="The workspace's plan. Billing changes take effect next cycle."
      footer={
        <Text size="sm" color="muted">
          Business plan, 42 of 50 seats
        </Text>
      }
    >
      <Text>Acme Operations, created 3 March 2024.</Text>
    </SettingsSection>
  );
}

const DANGER: readonly DangerAction[] = [
  {
    id: "transfer",
    title: "Transfer ownership",
    description: "Make another admin the owner. You stay an admin.",
    label: "Transfer",
    confirm: { title: "Transfer Acme Operations to Lina?", confirmLabel: "Transfer" },
    onAction: async () => {
      await wait(800);
      toast.success("Ownership transferred to Lina");
    },
  },
  {
    id: "archive",
    title: "Archive the workspace",
    description: "Read-only for everyone. Restore within 30 days.",
    label: "Archive workspace",
    confirm: {
      title: "Archive Acme Operations?",
      description: "Nobody can change anything while it is archived.",
      confirmLabel: "Archive",
    },
    onAction: async () => {
      await wait(800);
      throw new Error("Archiving is not allowed while invoices are open");
    },
  },
  {
    id: "delete",
    title: "Delete the workspace",
    description: "Every project, invoice and member goes. This cannot be undone.",
    label: "Delete workspace",
    confirm: { title: "Delete Acme Operations for good?", confirmLabel: "Delete" },
    onAction: () => {},
    isDisabled: true,
  },
];

export default function SettingsLayoutExample() {
  const [search] = useSearchParams();
  function open() {
    return search().get("section");
  }

  return (
    <SettingsLayout
      navigation={NAVIGATION}
      selected={open() !== null}
      back={{ to: "/settings", hash: "settings-layout" }}
    >
      <Switch fallback={<Profile />}>
        <Match when={open() === "notifications"}>
          <Notifications />
        </Match>
        <Match when={open() === "workspace"}>
          <Workspace />
        </Match>
        <Match when={open() === "danger"}>
          <Stack gap={4}>
            <DangerZone actions={DANGER} />
          </Stack>
        </Match>
      </Switch>
    </SettingsLayout>
  );
}

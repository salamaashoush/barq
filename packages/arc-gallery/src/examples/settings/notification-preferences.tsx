import {
  type PreferenceChannel,
  type PreferenceGroup,
  PreferenceMatrix,
  SettingsSection,
  Stack,
  useArcForm,
} from "@barqjs/arc";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const CHANNELS: readonly PreferenceChannel[] = [
  { id: "email", label: "Email" },
  { id: "push", label: "Push", unavailable: "Allow notifications in this browser first." },
  { id: "app", label: "In the app" },
];

const GROUPS: readonly PreferenceGroup[] = [
  {
    id: "work",
    label: "Your work",
    description: "Things that need you.",
    kinds: [
      { id: "mention", label: "Mentions", description: "Someone names you in a comment." },
      { id: "assigned", label: "Assigned to you" },
      { id: "review", label: "Review requests" },
    ],
  },
  {
    id: "team",
    label: "Your team",
    kinds: [
      { id: "incident", label: "Incidents", description: "A service your team owns goes down." },
      { id: "deploy", label: "Deploys", channels: ["app"] },
    ],
  },
  {
    id: "account",
    label: "Account",
    kinds: [
      {
        id: "security",
        label: "Security alerts",
        locked: "Security alerts always reach you by email and in the app.",
        channels: ["email", "app"],
      },
    ],
  },
];

const DELAYS = [
  { value: "off", label: "Off" },
  { value: "0", label: "At once" },
  { value: "5", label: "After 5 minutes" },
  { value: "15", label: "After 15 minutes" },
];

const PAGING: readonly PreferenceChannel[] = [
  { id: "push", label: "Push", options: DELAYS },
  { id: "email", label: "Email", options: DELAYS },
  { id: "call", label: "Phone call", options: DELAYS, unavailable: "Verify a phone number first." },
];

const URGENCY: readonly PreferenceGroup[] = [
  {
    id: "urgency",
    label: "When you are paged",
    kinds: [
      { id: "urgent", label: "Urgent" },
      { id: "normal", label: "Not urgent" },
    ],
  },
];

export default function NotificationPreferencesExample() {
  const form = useArcForm(() => ({
    defaultValues: {
      notify: {
        mention: { email: true, app: true },
        assigned: { email: true, app: true },
        review: { app: true },
        incident: { email: true, push: true, app: true },
        deploy: { app: false },
        security: { email: true, app: true },
      },
    },
    onSubmit: () => wait(600),
  }));
  const paging = useArcForm(() => ({
    defaultValues: {
      paging: {
        urgent: { push: "0", email: "5", call: "off" },
        normal: { push: "15", email: "45", call: "off" },
      },
    },
    onSubmit: () => wait(600),
  }));
  return (
    <Stack gap={6}>
      <SettingsSection
        heading="Notifications"
        description="How you hear of each kind of notice. A group's first row sets every kind in it."
        form={form}
      >
        <form.AppField name="notify">
          {() => <PreferenceMatrix label="Notifications" channels={CHANNELS} groups={GROUPS} />}
        </form.AppField>
      </SettingsSection>
      <SettingsSection
        heading="Paging"
        description="How soon each method pages you. 45 minutes was saved before the list changed, and is kept."
        form={paging}
      >
        <paging.AppField name="paging">
          {() => (
            <PreferenceMatrix
              label="Paging"
              channels={PAGING}
              groups={URGENCY}
              groupDefaults={false}
            />
          )}
        </paging.AppField>
      </SettingsSection>
    </Stack>
  );
}

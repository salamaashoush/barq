import { createSignal } from "@barqjs/core";
import { CheckboxCards, RadioCards, Stack, Text } from "@barqjs/arc";
import { Bell } from "@barqjs/lucide/icons/bell";
import { Mail } from "@barqjs/lucide/icons/mail";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";
import { Smartphone } from "@barqjs/lucide/icons/smartphone";

export default function ChoiceCards() {
  const [plan, setPlan] = createSignal<string | null>("team");
  const [channels, setChannels] = createSignal<readonly string[]>(["email", "push"]);
  return (
    <Stack gap={8}>
      <RadioCards
        label="Plan"
        description={`You picked ${plan() ?? "nothing"}.`}
        value={plan()}
        onChange={setPlan}
        options={[
          { value: "starter", label: "Starter", description: "One project, community support." },
          { value: "team", label: "Team", description: "Up to 20 seats and SSO." },
          {
            value: "enterprise",
            label: "Enterprise",
            description: "Unlimited seats, audit logs, a named contact.",
          },
          { value: "legacy", label: "Legacy", description: "No longer offered.", isDisabled: true },
        ]}
      />
      <CheckboxCards
        label="Notify me by"
        value={channels()}
        onChange={setChannels}
        minCardWidth="12rem"
        options={[
          { value: "email", label: "Email", description: "salama@example.com", icon: <Mail /> },
          { value: "push", label: "Push", description: "On this device", icon: <Bell /> },
          { value: "sms", label: "SMS", description: "+20 100 123 4567", icon: <Smartphone /> },
          {
            value: "chat",
            label: "Chat",
            description: "The #alerts channel",
            icon: <MessageSquare />,
          },
        ]}
      />
      <Text size="xs" color="muted">
        Channels: {channels().join(", ") || "none"}
      </Text>
      <RadioCards
        label="Region"
        isRequired
        isInvalid
        errorMessage="Choose where your data lives."
        options={[
          { value: "eu", label: "Europe", description: "Frankfurt" },
          { value: "me", label: "Middle East", description: "Bahrain" },
        ]}
      />
      <CheckboxCards
        label="Add-ons"
        isDisabled
        defaultValue={["backups"]}
        options={[
          { value: "backups", label: "Daily backups" },
          { value: "support", label: "Priority support" },
        ]}
      />
    </Stack>
  );
}

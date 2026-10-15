import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@barqjs/ui";

const accordion = css`
  width: 100%;
  max-width: 32rem;
`;

interface Entry {
  readonly value: string;
  readonly trigger: string;
  readonly content: string;
}

const items: readonly Entry[] = [
  {
    value: "notifications",
    trigger: "Notification Settings",
    content:
      "Manage how you receive notifications. You can enable email alerts for updates or push notifications for mobile devices.",
  },
  {
    value: "privacy",
    trigger: "Privacy & Security",
    content:
      "Control your privacy settings and security preferences. Enable two-factor authentication, manage connected devices, review active sessions, and configure data sharing preferences. You can also download your data or delete your account.",
  },
  {
    value: "billing",
    trigger: "Billing & Subscription",
    content:
      "View your current plan, payment history, and upcoming invoices. Update your payment method, change your subscription tier, or cancel your subscription.",
  },
];

export default function AccordionMultiple() {
  return (
    <Accordion type="multiple" defaultValue={["notifications"]} class={accordion}>
      <For each={() => items}>
        {(item: Entry) => (
          <AccordionItem value={item.value}>
            <AccordionTrigger>{item.trigger}</AccordionTrigger>
            <AccordionContent>{item.content}</AccordionContent>
          </AccordionItem>
        )}
      </For>
    </Accordion>
  );
}

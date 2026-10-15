import { For } from "@barqjs/core";
import { css } from "@barqjs/css";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@barqjs/ui";

const accordion = css`
  width: 100%;
  max-width: 32rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
`;

const section = css`
  border-bottom: 1px solid var(--border);
  padding-inline: calc(var(--spacing) * 4);

  &:last-child {
    border-bottom-width: 0;
  }
`;

interface Entry {
  readonly value: string;
  readonly trigger: string;
  readonly content: string;
}

const items: readonly Entry[] = [
  {
    value: "billing",
    trigger: "How does billing work?",
    content:
      "We offer monthly and annual subscription plans. Billing is charged at the beginning of each cycle, and you can cancel anytime. All plans include automatic backups, 24/7 support, and unlimited team members.",
  },
  {
    value: "security",
    trigger: "Is my data secure?",
    content:
      "Yes. We use end-to-end encryption, SOC 2 Type II compliance, and regular third-party security audits. All data is encrypted at rest and in transit using industry-standard protocols.",
  },
  {
    value: "integration",
    trigger: "What integrations do you support?",
    content:
      "We integrate with 500+ popular tools including Slack, Zapier, Salesforce, HubSpot, and more. You can also build custom integrations using our REST API and webhooks.",
  },
];

export default function AccordionBorders() {
  return (
    <Accordion type="single" collapsible defaultValue="billing" class={accordion}>
      <For each={() => items}>
        {(item: Entry) => (
          <AccordionItem value={item.value} class={section}>
            <AccordionTrigger>{item.trigger}</AccordionTrigger>
            <AccordionContent>{item.content}</AccordionContent>
          </AccordionItem>
        )}
      </For>
    </Accordion>
  );
}

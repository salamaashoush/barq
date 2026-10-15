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
    value: "item-1",
    trigger: "How do I reset my password?",
    content:
      "Click on 'Forgot Password' on the login page, enter your email address, and we'll send you a link to reset your password. The link will expire in 24 hours.",
  },
  {
    value: "item-2",
    trigger: "Can I change my subscription plan?",
    content:
      "Yes, you can upgrade or downgrade your plan at any time from your account settings. Changes will be reflected in your next billing cycle.",
  },
  {
    value: "item-3",
    trigger: "What payment methods do you accept?",
    content:
      "We accept all major credit cards, PayPal, and bank transfers. All payments are processed securely through our payment partners.",
  },
];

export default function AccordionBasic() {
  return (
    <Accordion type="single" collapsible defaultValue="item-1" class={accordion}>
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

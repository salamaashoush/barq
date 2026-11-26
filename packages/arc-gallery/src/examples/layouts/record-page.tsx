import { createMemo, createSignal } from "@barqjs/core";
import {
  Button,
  Chip,
  Currency,
  DescriptionList,
  FormattedDate,
  type HeaderAlert,
  type HeaderFact,
  List,
  ListItem,
  PageHeader,
  PanelToolbar,
  RecordLayout,
  RecordPager,
  RecordSection,
  ResponsiveTabs,
  Status,
  Text,
  toast,
} from "@barqjs/arc";
import { AlarmClock } from "@barqjs/lucide/icons/alarm-clock";
import { Building2 } from "@barqjs/lucide/icons/building-2";
import { Globe } from "@barqjs/lucide/icons/globe";
import { Mail } from "@barqjs/lucide/icons/mail";

import { INVOICES, INVOICE_STATUS, type Invoice } from "../../data/operations.ts";

const PAYMENTS = [
  { id: "pay-1", method: "Bank transfer", amount: 1200, on: "2026-10-12" },
  { id: "pay-2", method: "Card ending 4242", amount: 340.5, on: "2026-10-28" },
];

const HISTORY = [
  { id: "h-1", what: "Sent to the customer", on: "2026-10-01" },
  { id: "h-2", what: "Viewed by the customer", on: "2026-10-03" },
  { id: "h-3", what: "Reminder sent", on: "2026-10-20" },
];

interface OverviewProps {
  invoice: Invoice;
}

function Overview(props: OverviewProps) {
  return (
    <RecordLayout
      stickyRail
      rail={
        <RecordSection heading="Details" variant="plain">
          <DescriptionList
            layout="stacked"
            items={[
              { term: "Customer", details: props.invoice.customer },
              { term: "Billing email", details: props.invoice.email },
              { term: "Region", details: props.invoice.region },
              { term: "Issued", details: <FormattedDate value={props.invoice.issued} /> },
            ]}
          />
        </RecordSection>
      }
    >
      <RecordSection
        heading="Lines"
        description="What the customer is billed for."
        onEdit={() => toast("Edit the lines")}
        editLabel="Edit the lines"
      >
        <DescriptionList
          align="end"
          items={[
            { term: "Team plan, 12 seats", details: <Currency value={1440} currency="USD" /> },
            { term: "Extra storage, 200 GB", details: <Currency value={100.5} currency="USD" /> },
            { term: "Total", details: <Currency value={props.invoice.amount} currency="USD" /> },
          ]}
        />
      </RecordSection>
      <RecordSection
        heading="Notes"
        variant="ruled"
        onEdit={() => toast("Edit the notes")}
        editLabel="Edit the notes"
      >
        <Text size="sm" color="muted">
          Net 30. The customer asked for the purchase order number on every invoice from November.
        </Text>
      </RecordSection>
    </RecordLayout>
  );
}

function Payments() {
  return (
    <>
      <PanelToolbar
        description="Payments received against this invoice."
        actions={
          <Button size="sm" variant="outline" onPress={() => toast("Record a payment")}>
            Record a payment
          </Button>
        }
      />
      <List aria-label="Payments" items={PAYMENTS}>
        {(payment) => (
          <ListItem
            title={payment.method}
            description={<FormattedDate value={payment.on} />}
            meta={<Currency value={payment.amount} currency="USD" />}
          />
        )}
      </List>
    </>
  );
}

function History() {
  return (
    <>
      <PanelToolbar heading="History" description="Everything that happened to it, newest last." />
      <List aria-label="History" items={HISTORY}>
        {(entry) => <ListItem title={entry.what} meta={<FormattedDate value={entry.on} />} />}
      </List>
    </>
  );
}

export default function RecordPage() {
  const [at, setAt] = createSignal(3);
  function invoice(): Invoice {
    return INVOICES[at()] ?? (INVOICES[0] as Invoice);
  }
  const facts = createMemo((): HeaderFact[] => [
    { label: "Customer", value: [<Building2 aria-hidden="true" />, invoice().customer] },
    { label: "Billing email", value: [<Mail aria-hidden="true" />, invoice().email] },
    { label: "Region", value: [<Globe aria-hidden="true" />, invoice().region] },
  ]);
  const alerts = createMemo((): HeaderAlert[] =>
    invoice().status === "overdue"
      ? [{ label: "Overdue by 12 days", tone: "danger", icon: <AlarmClock /> }]
      : [],
  );
  return (
    <div>
      <PageHeader
        align="start"
        heading={invoice().number}
        mark={<Status tone={INVOICE_STATUS[invoice().status].tone} />}
        badges={
          <Chip size="sm" variant="subtle" tone={INVOICE_STATUS[invoice().status].tone}>
            {INVOICE_STATUS[invoice().status].label}
          </Chip>
        }
        facts={facts()}
        alerts={alerts()}
        actions={
          <>
            <RecordPager
              position={at() + 1}
              count={INVOICES.length}
              onPrevious={at() > 0 ? () => setAt(at() - 1) : undefined}
              onNext={at() < INVOICES.length - 1 ? () => setAt(at() + 1) : undefined}
              previousLabel="Previous invoice"
              nextLabel="Next invoice"
            />
            <Button variant="outline" onPress={() => toast("Invoice sent again")}>
              Send again
            </Button>
          </>
        }
      />
      <ResponsiveTabs
        aria-label="Invoice"
        param="invoice-tab"
        items={[
          { id: "overview", label: "Overview" },
          { id: "payments", label: "Payments", count: PAYMENTS.length },
          { id: "history", label: "History" },
          { id: "disputes", label: "Disputes", hidden: invoice().status !== "overdue" },
        ]}
      >
        {(tab) =>
          tab.id === "overview" ? (
            <Overview invoice={invoice()} />
          ) : tab.id === "payments" ? (
            <Payments />
          ) : tab.id === "history" ? (
            <History />
          ) : (
            <PanelToolbar description="No disputes were raised on this invoice." />
          )
        }
      </ResponsiveTabs>
    </div>
  );
}

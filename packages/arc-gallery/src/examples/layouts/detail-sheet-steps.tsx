import { createSignal } from "@barqjs/core";
import {
  Button,
  Currency,
  DescriptionList,
  DetailSheet,
  FormattedDate,
  List,
  ListItem,
  Status,
  toast,
} from "@barqjs/arc";

import { INVOICES, INVOICE_STATUS, type Invoice } from "../../data/operations.ts";

const ROWS = INVOICES.slice(0, 8);

export default function DetailSheetSteps() {
  const [at, setAt] = createSignal<number | null>(null);
  function open(): Invoice | undefined {
    const index = at();
    return index === null ? undefined : ROWS[index];
  }
  function step(by: number): (() => void) | undefined {
    const index = at();
    if (index === null) return undefined;
    const next = index + by;
    return next < 0 || next >= ROWS.length ? undefined : () => setAt(next);
  }
  return (
    <>
      <List
        aria-label="Invoices"
        items={ROWS}
        getTextValue={(invoice) => invoice.number}
        onAction={(key) => setAt(ROWS.findIndex((invoice) => invoice.id === key))}
      >
        {(invoice) => (
          <ListItem
            title={invoice.number}
            description={invoice.customer}
            meta={<Currency value={invoice.amount} currency="USD" />}
            actions={
              <Status tone={INVOICE_STATUS[invoice.status].tone}>
                {INVOICE_STATUS[invoice.status].label}
              </Status>
            }
          />
        )}
      </List>
      <DetailSheet
        open={at() !== null}
        onOpenChange={(next) => {
          if (!next) setAt(null);
        }}
        heading={open()?.number ?? ""}
        description={open()?.customer}
        steps={{
          position: (at() ?? 0) + 1,
          count: ROWS.length,
          onPrevious: step(-1),
          onNext: step(1),
          previousLabel: "Previous invoice",
          nextLabel: "Next invoice",
        }}
        footer={
          <Button variant="outline" onPress={() => toast("Invoice sent again")}>
            Send again
          </Button>
        }
      >
        <DescriptionList
          items={[
            { term: "Status", details: INVOICE_STATUS[open()?.status ?? "draft"].label },
            { term: "Billing email", details: open()?.email ?? "" },
            { term: "Region", details: open()?.region ?? "" },
            { term: "Issued", details: <FormattedDate value={open()?.issued ?? "2026-11-01"} /> },
            {
              term: "Amount",
              details: <Currency value={open()?.amount ?? 0} currency="USD" />,
            },
          ]}
        />
      </DetailSheet>
    </>
  );
}

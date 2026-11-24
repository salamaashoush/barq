/** Code from Acme's services, in each language the code examples show. */
export const SNIPPETS: Readonly<Record<string, string>> = {
  typescript: `interface Invoice {
  id: string;
  customer: string;
  total: number;
  paidAt?: Date;
}

export function overdue(invoices: Invoice[], now = new Date()): Invoice[] {
  const month = 30 * 24 * 60 * 60 * 1000;
  return invoices.filter((invoice) => !invoice.paidAt && now.getTime() - month > 0);
}
`,
  python: `from dataclasses import dataclass


@dataclass
class Seat:
    email: str
    role: str = "member"


def billable(seats: list[Seat]) -> int:
    """Admins and members are billed; guests are free."""
    return sum(1 for seat in seats if seat.role != "guest")
`,
  sql: `select c.name, count(i.id) as invoices, sum(i.total) as billed
from customers c
join invoices i on i.customer_id = c.id
where i.issued_at >= date '2026-01-01'
group by c.name
order by billed desc
limit 10;
`,
  json: `{
  "name": "acme-billing",
  "region": "eu-west-1",
  "replicas": 3,
  "features": { "sso": true, "auditLog": false }
}
`,
  css: `.invoice-total {
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  border-block-start: 1px solid var(--border);
}
`,
  yaml: `service: api-gateway
image: registry.example.com/acme/api-gateway:2.4.1
env:
  LOG_LEVEL: info
  API_TOKEN: \${API_TOKEN}
`,
  markdown: `# Release notes

- **Billing**: invoices total in the customer's currency.
- **SSO**: SAML for Acme Enterprise.
`,
};

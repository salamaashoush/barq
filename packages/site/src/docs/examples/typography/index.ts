import type { ComponentDoc, Demo } from "../../registry.ts";
import TypographyBlockquote from "./typography-blockquote.tsx";
import typographyBlockquote from "./typography-blockquote.tsx?raw";
import TypographyDemo from "./typography-demo.tsx";
import typographyDemo from "./typography-demo.tsx?raw";
import TypographyH1 from "./typography-h1.tsx";
import typographyH1 from "./typography-h1.tsx?raw";
import TypographyH2 from "./typography-h2.tsx";
import typographyH2 from "./typography-h2.tsx?raw";
import TypographyH3 from "./typography-h3.tsx";
import typographyH3 from "./typography-h3.tsx?raw";
import TypographyH4 from "./typography-h4.tsx";
import typographyH4 from "./typography-h4.tsx?raw";
import TypographyInlineCode from "./typography-inline-code.tsx";
import typographyInlineCode from "./typography-inline-code.tsx?raw";
import TypographyLarge from "./typography-large.tsx";
import typographyLarge from "./typography-large.tsx?raw";
import TypographyLead from "./typography-lead.tsx";
import typographyLead from "./typography-lead.tsx?raw";
import TypographyList from "./typography-list.tsx";
import typographyList from "./typography-list.tsx?raw";
import TypographyMuted from "./typography-muted.tsx";
import typographyMuted from "./typography-muted.tsx?raw";
import TypographyP from "./typography-p.tsx";
import typographyP from "./typography-p.tsx?raw";
import TypographyRtl from "./typography-rtl.tsx";
import typographyRtl from "./typography-rtl.tsx?raw";
import TypographySmall from "./typography-small.tsx";
import typographySmall from "./typography-small.tsx?raw";
import TypographyTable from "./typography-table.tsx";
import typographyTable from "./typography-table.tsx?raw";

export const demos: readonly Demo[] = [
  {
    align: "start",
    size: "auto",
    code: typographyDemo,
    component: TypographyDemo,
  },
  {
    title: "h1",
    code: typographyH1,
    component: TypographyH1,
  },
  {
    title: "h2",
    code: typographyH2,
    component: TypographyH2,
  },
  {
    title: "h3",
    code: typographyH3,
    component: TypographyH3,
  },
  {
    title: "h4",
    code: typographyH4,
    component: TypographyH4,
  },
  {
    title: "p",
    code: typographyP,
    component: TypographyP,
  },
  {
    title: "blockquote",
    code: typographyBlockquote,
    component: TypographyBlockquote,
  },
  {
    title: "table",
    code: typographyTable,
    component: TypographyTable,
  },
  {
    title: "list",
    code: typographyList,
    component: TypographyList,
  },
  {
    title: "Inline code",
    code: typographyInlineCode,
    component: TypographyInlineCode,
  },
  {
    title: "Lead",
    code: typographyLead,
    component: TypographyLead,
  },
  {
    title: "Large",
    code: typographyLarge,
    component: TypographyLarge,
  },
  {
    title: "Small",
    code: typographySmall,
    component: TypographySmall,
  },
  {
    title: "Muted",
    code: typographyMuted,
    component: TypographyMuted,
  },
  {
    title: "RTL",
    note: "Plain elements need no provider. Put `dir` on an element you own and write the styles with logical properties, so the quote's rule and the list's indent follow the text.",
    align: "start",
    size: "auto",
    rtl: true,
    code: typographyRtl,
    component: TypographyRtl,
  },
];

export const doc: ComponentDoc = {
  slug: "typography",
  title: "Typography",
  description: "Styles for headings, paragraphs, lists...etc",
  add: false,
  usage:
    'import { css } from "@barqjs/css";\n\nconst lead = css`\n  font-size: 1.25rem;\n  line-height: 1.75rem;\n  color: var(--muted-foreground);\n`;\n\n<p class={lead}>A modal dialog that interrupts the user.</p>',
  demos,
};

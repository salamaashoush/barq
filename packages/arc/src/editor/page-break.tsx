import { variants } from "@barqjs/css";
import { SeparatorHorizontal } from "@barqjs/lucide/icons/separator-horizontal";

import { useArcMessages } from "../components/messages.ts";
import { arcLayer as arc } from "../layer.ts";
import { edge, fg, gap, layout, rounded, space, type } from "../style/index.ts";
import { type Block, type BlockProps, defineBlock } from "./blocks.tsx";

export const pageBreakStyles = variants({
  slots: {
    // Paper turns the page after it; a screen reads on without it.
    root: arc({ breakAfter: "page" }),
    marker: arc(layout.row, gap[3], rounded.md, type.caption, type.medium, fg.muted, {
      paddingBlock: space.x1,
      userSelect: "none",
      "@media print": { display: "none" },
    }),
    rule: arc(layout.grow, edge.top, { borderTopStyle: "dashed", height: "0px" }),
  },
});

function PageBreakView(props: BlockProps<Record<string, never>>) {
  const messages = useArcMessages();
  const cls = pageBreakStyles();
  return (
    <div class={cls.root} data-slot="page-break" aria-hidden={props.editable ? undefined : "true"}>
      {props.editable ? (
        <div class={cls.marker} role="separator" aria-label={messages().pageBreak}>
          <span class={cls.rule} />
          <span>{messages().pageBreak}</span>
          <span class={cls.rule} />
        </div>
      ) : null}
    </div>
  );
}

function breaksPage(element: HTMLElement): Record<string, never> | null {
  return element.hasAttribute("data-page-break") ||
    /(?:page-)?break-(?:before|after)\s*:\s*(?:always|page)/i.test(
      element.getAttribute("style") ?? "",
    )
    ? {}
    : null;
}

/**
 * A page break: where a printed copy starts a new page, so a second part can
 * start on a sheet of its own. The editor shows it as a dashed line with its
 * name; a screen reads on past it.
 */
export const PageBreakBlock: Block<Record<string, never>> = defineBlock<Record<string, never>>({
  type: "pagebreak",
  label: (messages) => messages.pageBreak,
  group: (messages) => messages.layoutBlocks,
  icon: () => <SeparatorHorizontal />,
  keywords: ["print", "page", "break", "new page"],
  defaultData: () => ({}),
  component: PageBreakView,
  fromHtml: { div: breaksPage, hr: breaksPage, br: breaksPage },
  toHtml: () => {
    const element = document.createElement("div");
    element.setAttribute("data-page-break", "");
    element.style.breakAfter = "page";
    return element;
  },
});

import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import { ComponentPreview } from "../preview.tsx";
import RtlExample from "./snippets/rtl/rtl-example.tsx";
import example from "./snippets/rtl/rtl-example.tsx?raw";

export const sections: readonly DocsSection[] = [
  { id: "setup", label: "Set the direction" },
  { id: "logical", label: "What turns by itself" },
  { id: "physical", label: "What stays where it is" },
  { id: "icons", label: "Icons" },
];

export function Body() {
  return (
    <>
      <p>
        The components support right-to-left languages such as Arabic, Hebrew and Persian. Two
        things set the direction, and you need both.
      </p>

      <h2 class={anchor} id="setup">
        Set the direction
      </h2>
      <p>
        The <code>dir</code> attribute is what makes the browser lay text and every logical property
        out the other way. <code>DirectionProvider</code> is the half CSS cannot reach: the arrow
        keys, the side a submenu opens on and the end a slider starts from. The provider renders no
        element, so put <code>dir</code> on <code>{"<html>"}</code> or on a wrapper you own.
      </p>
      <ComponentPreview code={example} rtl>
        <RtlExample />
      </ComponentPreview>
      <p>
        <code>useDirection()</code> reads the direction in scope from a component of your own.
      </p>

      <h2 class={anchor} id="logical">
        What turns by itself
      </h2>
      <p>
        The components are written with logical properties, <code>padding-inline-start</code> and{" "}
        <code>inset-inline-end</code> rather than left and right, so their layout follows{" "}
        <code>dir</code> with nothing to configure. Horizontal arrow keys follow the direction in
        menus, tabs, the carousel and the questionnaire. Write your own styles the same way.
      </p>
      <CodeBlock
        code={`margin-inline-start: auto;\npadding-inline-end: calc(var(--spacing) * 2);`}
      />

      <h2 class={anchor} id="physical">
        What stays where it is
      </h2>
      <p>
        A side that is physical stays physical: a sheet opened with <code>side="left"</code> comes
        from the left in either direction, and a tooltip's arrow points at its trigger. The join
        between the buttons of a horizontal <code>ButtonGroup</code> is written with physical
        corners and does not mirror.
      </p>

      <h2 class={anchor} id="icons">
        Icons
      </h2>
      <p>
        An icon that points, an arrow or a chevron, has to be turned by hand. Rotate it under{" "}
        <code>[dir="rtl"]</code>, as the arrow in the example above does.
      </p>
    </>
  );
}

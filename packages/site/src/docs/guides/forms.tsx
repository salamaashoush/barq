import { anchor, type DocsSection } from "../../docs.tsx";
import { CodeBlock } from "../code.tsx";
import { ComponentPreview } from "../preview.tsx";
import anatomy from "./snippets/forms/anatomy.tsx?raw";
import BugReport from "./snippets/forms/bug-report.tsx";
import bugReport from "./snippets/forms/bug-report.tsx?raw";

export const sections: readonly DocsSection[] = [
  { id: "install", label: "Installation" },
  { id: "anatomy", label: "Anatomy" },
  { id: "form", label: "A complete form" },
  { id: "validation", label: "Validation" },
  { id: "errors", label: "Displaying errors" },
  { id: "reset", label: "Resetting" },
];

export function Body() {
  return (
    <>
      <p>
        Forms are built with <code>@barqjs/form</code>, the TanStack Form adapter, and the{" "}
        <code>Field</code> components. The form library owns the values and the validation, and{" "}
        <code>Field</code>, <code>FieldLabel</code>, <code>FieldDescription</code> and{" "}
        <code>FieldError</code> are the markup around each control. There is no <code>Form</code>{" "}
        component.
      </p>

      <h2 class={anchor} id="install">
        Installation
      </h2>
      <CodeBlock code="bun add @barqjs/form" />

      <h2 class={anchor} id="anatomy">
        Anatomy
      </h2>
      <p>
        <code>createForm</code> returns the form. <code>form.Field</code> names one value and hands
        its children an accessor: call <code>field()</code> where a value is used, so the binding
        that reads it is the one that updates.
      </p>
      <CodeBlock code={anatomy} />

      <h2 class={anchor} id="form">
        A complete form
      </h2>
      <p>
        A bug report with a title and a description. Submit it empty to see the errors, and filled
        in to see what the form hands <code>onSubmit</code>.
      </p>
      <ComponentPreview code={bugReport} align="start" size="auto">
        <BugReport />
      </ComponentPreview>

      <h2 class={anchor} id="validation">
        Validation
      </h2>
      <p>
        A validator is a function from the value to an error message, or <code>undefined</code> when
        the value is fine. <code>validators</code> says when each one runs: <code>onChange</code>,{" "}
        <code>onBlur</code>, <code>onSubmit</code>, and the <code>Async</code> forms of each, which
        take a debounce.
      </p>

      <h2 class={anchor} id="errors">
        Displaying errors
      </h2>
      <p>
        Three things show an invalid field. <code>isInvalid</code> on <code>Field</code> colours the
        label and the description, <code>aria-invalid</code> on the control draws its ring and tells
        a screen reader, and <code>FieldError</code> lists the messages from{" "}
        <code>field().state.meta.errors</code>.
      </p>

      <h2 class={anchor} id="reset">
        Resetting
      </h2>
      <p>
        <code>form.reset()</code> puts every value back to its default and clears the errors.
      </p>
    </>
  );
}

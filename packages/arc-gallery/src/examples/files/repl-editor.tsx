import { Repl, type ReplInputField } from "@barqjs/arc";
import { CodeEditor } from "@barqjs/arc/code";

import { Calculator } from "./data.ts";

interface EditorFieldProps {
  field: ReplInputField;
}

function EditorField(props: EditorFieldProps) {
  return (
    <CodeEditor
      value={props.field.value()}
      onChange={(text) => props.field.setValue(text)}
      language="typescript"
      lineNumbers={false}
      label={props.field.label}
      id={props.field.id}
      onView={(view) => {
        function onKey(event: KeyboardEvent): void {
          const head = view.state.selection.main;
          const line = view.state.doc.lineAt(head.head).number;
          const caret = {
            onFirstLine: head.empty && line === 1,
            onLastLine: head.empty && line === view.state.doc.lines,
          };
          if (props.field.keyDown(event, caret)) event.stopImmediatePropagation();
        }
        view.contentDOM.addEventListener("keydown", onKey, true);
        return () => view.contentDOM.removeEventListener("keydown", onKey, true);
      }}
    />
  );
}

export default function ReplEditorExample() {
  const calculator = new Calculator();
  return (
    <Repl
      aria-label="Calculator in an editor"
      language="typescript"
      height={220}
      input={(field) => <EditorField field={field} />}
      onSubmit={(code, signal) => calculator.run(code, signal)}
    />
  );
}

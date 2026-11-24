import type { Demos } from "../../gallery/types.ts";
import ArcForm from "./arc-form.tsx";
import arcForm from "./arc-form.tsx?raw";
import CreateArcForm from "./create-arc-form.tsx";
import createArcForm from "./create-arc-form.tsx?raw";
import FormSheet from "./form-sheet.tsx";
import formSheet from "./form-sheet.tsx?raw";
import WithArcForm from "./with-arc-form.tsx";
import withArcForm from "./with-arc-form.tsx?raw";
import Wizard from "./wizard.tsx";
import wizard from "./wizard.tsx?raw";

export const demos: Demos = {
  "arc-form": { component: ArcForm, code: arcForm },
  "with-arc-form": { component: WithArcForm, code: withArcForm },
  "create-arc-form": { component: CreateArcForm, code: createArcForm },
  wizard: { component: Wizard, code: wizard },
  "form-sheet": { component: FormSheet, code: formSheet },
};

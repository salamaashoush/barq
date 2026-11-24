import type { Demos } from "../../gallery/types.ts";
import Chips from "./chips.tsx";
import chips from "./chips.tsx?raw";
import EmptyStates from "./empty-state.tsx";
import emptyState from "./empty-state.tsx?raw";
import Layout from "./layout-stack.tsx";
import layout from "./layout-stack.tsx?raw";
import StatusAndIndicator from "./status.tsx";
import status from "./status.tsx?raw";
import TextHelpers from "./text-helpers.tsx";
import textHelpers from "./text-helpers.tsx?raw";
import Tokens from "./tokens.tsx";
import tokens from "./tokens.tsx?raw";
import Treatments from "./treatments.tsx";
import treatments from "./treatments.tsx?raw";
import Typography from "./typography.tsx";
import typography from "./typography.tsx?raw";

export const demos: Demos = {
  tokens: { component: Tokens, code: tokens },
  treatments: { component: Treatments, code: treatments },
  layout: { component: Layout, code: layout },
  typography: { component: Typography, code: typography },
  "text-helpers": { component: TextHelpers, code: textHelpers },
  status: { component: StatusAndIndicator, code: status },
  chips: { component: Chips, code: chips },
  "empty-state": { component: EmptyStates, code: emptyState },
};

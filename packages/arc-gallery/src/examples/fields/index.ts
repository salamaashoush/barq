import type { Demos } from "../../gallery/types.ts";
import AddressFiles from "./address-files.tsx";
import addressFiles from "./address-files.tsx?raw";
import Checklist from "./checklist.tsx";
import checklist from "./checklist.tsx?raw";
import ChoiceGroups from "./choice-groups.tsx";
import choiceGroups from "./choice-groups.tsx?raw";
import InlineEditing from "./inline-edit.tsx";
import inlineEdit from "./inline-edit.tsx?raw";
import Limits from "./limits.tsx";
import limits from "./limits.tsx?raw";
import OptionRules from "./option-rules.tsx";
import optionRules from "./option-rules.tsx?raw";
import Repeaters from "./repeaters.tsx";
import repeaters from "./repeaters.tsx?raw";
import SelectDetail from "./select-detail.tsx";
import selectDetail from "./select-detail.tsx?raw";
import TextFields from "./text-fields.tsx";
import textFields from "./text-fields.tsx?raw";
import ThemeAndMedia from "./theme-and-media.tsx";
import themeAndMedia from "./theme-and-media.tsx?raw";

export const demos: Demos = {
  "text-fields": { component: TextFields, code: textFields },
  "inline-edit": { component: InlineEditing, code: inlineEdit },
  "choice-groups": { component: ChoiceGroups, code: choiceGroups },
  checklist: { component: Checklist, code: checklist },
  "select-detail": { component: SelectDetail, code: selectDetail },
  "theme-and-media": { component: ThemeAndMedia, code: themeAndMedia },
  limits: { component: Limits, code: limits },
  "option-rules": { component: OptionRules, code: optionRules },
  repeaters: { component: Repeaters, code: repeaters },
  "address-files": { component: AddressFiles, code: addressFiles },
};

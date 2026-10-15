import { installTheme, type ThemeSelection } from "@barqjs/ui";

const docs: ThemeSelection = { base: "stone", scope: "[data-theme='docs']", dark: "media" };

installTheme(docs);

export default docs;

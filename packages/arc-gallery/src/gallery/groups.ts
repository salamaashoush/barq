import type { NavGroup, NavIcon } from "@barqjs/arc";
import { Bell } from "@barqjs/lucide/icons/bell";
import { ChartColumn } from "@barqjs/lucide/icons/chart-column";
import { ClipboardList } from "@barqjs/lucide/icons/clipboard-list";
import { CodeXml } from "@barqjs/lucide/icons/code-xml";
import { Compass } from "@barqjs/lucide/icons/compass";
import { FilePen } from "@barqjs/lucide/icons/file-pen";
import { FolderTree } from "@barqjs/lucide/icons/folder-tree";
import { FormInput } from "@barqjs/lucide/icons/form-input";
import { Gauge } from "@barqjs/lucide/icons/gauge";
import { Hash } from "@barqjs/lucide/icons/hash";
import { History } from "@barqjs/lucide/icons/history";
import { House } from "@barqjs/lucide/icons/house";
import { Image } from "@barqjs/lucide/icons/image";
import { KeyRound } from "@barqjs/lucide/icons/key-round";
import { Layers } from "@barqjs/lucide/icons/layers";
import { LayoutDashboard } from "@barqjs/lucide/icons/layout-dashboard";
import { ListFilter } from "@barqjs/lucide/icons/list-filter";
import { LockKeyhole } from "@barqjs/lucide/icons/lock-keyhole";
import { MessageSquareMore } from "@barqjs/lucide/icons/message-square-more";
import { MessagesSquare } from "@barqjs/lucide/icons/messages-square";
import { MessageSquareWarning } from "@barqjs/lucide/icons/message-square-warning";
import { MousePointerClick } from "@barqjs/lucide/icons/mouse-pointer-click";
import { PanelsTopLeft } from "@barqjs/lucide/icons/panels-top-left";
import { PanelBottom } from "@barqjs/lucide/icons/panel-bottom";
import { Palette } from "@barqjs/lucide/icons/palette";
import { Settings } from "@barqjs/lucide/icons/settings";
import { Shapes } from "@barqjs/lucide/icons/shapes";
import { Table2 } from "@barqjs/lucide/icons/table-2";
import { TextCursorInput } from "@barqjs/lucide/icons/text-cursor-input";

import { catalog as actions } from "../examples/actions/catalog.ts";
import { catalog as auth } from "../examples/auth/catalog.ts";
import { catalog as charts } from "../examples/charts/catalog.ts";
import { catalog as chat } from "../examples/chat/catalog.ts";
import { catalog as code } from "../examples/code/catalog.ts";
import { catalog as collaboration } from "../examples/collaboration/catalog.ts";
import { catalog as data } from "../examples/data/catalog.ts";
import { catalog as diagram } from "../examples/diagram/catalog.ts";
import { catalog as editor } from "../examples/editor/catalog.ts";
import { catalog as feedback } from "../examples/feedback/catalog.ts";
import { catalog as fields } from "../examples/fields/catalog.ts";
import { catalog as files } from "../examples/files/catalog.ts";
import { catalog as exampleApp } from "../examples/example-app/catalog.ts";
import { catalog as formatting } from "../examples/formatting/catalog.ts";
import { catalog as forms } from "../examples/forms/catalog.ts";
import { catalog as foundations } from "../examples/foundations/catalog.ts";
import { catalog as inputs } from "../examples/inputs/catalog.ts";
import { catalog as layouts } from "../examples/layouts/catalog.ts";
import { catalog as media } from "../examples/media/catalog.ts";
import { catalog as metrics } from "../examples/metrics/catalog.ts";
import { catalog as navigation } from "../examples/navigation/catalog.ts";
import { catalog as notifications } from "../examples/notifications/catalog.ts";
import { catalog as overlays } from "../examples/overlays/catalog.ts";
import { catalog as records } from "../examples/records/catalog.ts";
import { catalog as secrets } from "../examples/secrets/catalog.ts";
import { catalog as settings } from "../examples/settings/catalog.ts";
import { catalog as views } from "../examples/views/catalog.ts";
import { catalog as workbench } from "../examples/workbench/catalog.ts";
import type { GroupCatalog } from "./types.ts";

export interface Group {
  readonly catalog: GroupCatalog;
  readonly icon: NavIcon;
}

export interface Section {
  readonly label: string;
  readonly groups: readonly Group[];
}

export const SECTIONS: readonly Section[] = [
  {
    label: "Foundations",
    groups: [
      { catalog: foundations, icon: Palette },
      { catalog: formatting, icon: Hash },
    ],
  },
  {
    label: "Components",
    groups: [
      { catalog: inputs, icon: TextCursorInput },
      { catalog: fields, icon: FormInput },
      { catalog: actions, icon: MousePointerClick },
      { catalog: overlays, icon: Layers },
      { catalog: feedback, icon: MessageSquareWarning },
      { catalog: navigation, icon: Compass },
      { catalog: data, icon: Table2 },
      { catalog: views, icon: ListFilter },
      { catalog: records, icon: History },
      { catalog: media, icon: Image },
      { catalog: charts, icon: ChartColumn },
      { catalog: metrics, icon: Gauge },
    ],
  },
  {
    label: "Patterns",
    groups: [
      { catalog: layouts, icon: PanelsTopLeft },
      { catalog: forms, icon: ClipboardList },
      { catalog: auth, icon: LockKeyhole },
      { catalog: settings, icon: Settings },
      { catalog: secrets, icon: KeyRound },
      { catalog: notifications, icon: Bell },
      { catalog: collaboration, icon: MessageSquareMore },
    ],
  },
  {
    label: "Suites",
    groups: [
      { catalog: editor, icon: FilePen },
      { catalog: chat, icon: MessagesSquare },
      { catalog: code, icon: CodeXml },
      { catalog: files, icon: FolderTree },
      { catalog: workbench, icon: PanelBottom },
      { catalog: diagram, icon: Shapes },
      { catalog: exampleApp, icon: LayoutDashboard },
    ],
  },
];

export const GROUPS: readonly Group[] = SECTIONS.flatMap((section) => section.groups);

export function pathOf(catalog: GroupCatalog): string {
  return `/${catalog.slug}`;
}

export const NAVIGATION: readonly NavGroup[] = [
  { items: [{ label: "Overview", to: "/", exact: true, icon: House }] },
  ...SECTIONS.map((section) => ({
    label: section.label,
    items: section.groups.map((group) => ({
      label: group.catalog.title,
      to: pathOf(group.catalog),
      icon: group.icon,
      badge: String(group.catalog.examples.length),
    })),
  })),
];

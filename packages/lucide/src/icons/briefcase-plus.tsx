import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function BriefcasePlus(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M13.354 20H4a2 2 0 01-2-2V8a2 2 0 012-2h16a2 2 0 012 2v3.354" />
      <path d="M16 11.354V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
      <path d="M16 17h6" />
      <path d="M19 14v6" />
    </svg>
  );
}

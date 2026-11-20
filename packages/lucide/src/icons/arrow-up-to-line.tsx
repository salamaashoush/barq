import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowUpToLine(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M5 3h14" />
      <path d="m18 13-6-6-6 6" />
      <path d="M12 7v14" />
    </svg>
  );
}

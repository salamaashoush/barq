import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ArrowRightFromLine(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M3 5v14" />
      <path d="M21 12H7" />
      <path d="m15 18 6-6-6-6" />
    </svg>
  );
}

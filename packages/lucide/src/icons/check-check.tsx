import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CheckCheck(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}

import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Diff(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 3v14" />
      <path d="M5 10h14" />
      <path d="M5 21h14" />
    </svg>
  );
}

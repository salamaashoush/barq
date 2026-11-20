import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GripVertical(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="5" r="1" />
      <circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="5" r="1" />
      <circle cx="15" cy="19" r="1" />
    </svg>
  );
}

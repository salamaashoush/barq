import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CirclePile(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="19" r="2" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="20" cy="19" r="2" />
      <circle cx="4" cy="19" r="2" />
      <circle cx="8" cy="12" r="2" />
    </svg>
  );
}

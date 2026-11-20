import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterZ(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 8h5.501a.5.5 0 0 1 .37.836L9.13 15.164A.5.5 0 0 0 9.5 16H15" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

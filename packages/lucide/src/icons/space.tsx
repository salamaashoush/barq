import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Space(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1" />
    </svg>
  );
}

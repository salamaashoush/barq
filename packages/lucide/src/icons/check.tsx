import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Check(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function CircleLetterI(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 16V8" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

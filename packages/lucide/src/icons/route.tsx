import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function Route(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M9 5h8.5a1 1 0 010 7h-11a1 1 0 000 7H15" />
      <circle cx="18" cy="19" r="3" />
      <circle cx="6" cy="5" r="3" />
    </svg>
  );
}

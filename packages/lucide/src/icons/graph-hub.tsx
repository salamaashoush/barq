import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function GraphHub(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <circle cx="12" cy="7" r="4" />
      <circle cx="4" cy="19" r="2" />
      <circle cx="12" cy="19" r="2" />
      <circle cx="20" cy="19" r="2" />
      <path d="M8 7a4 4 0 0 0-4 4v6" />
      <path d="M12 11v6" />
      <path d="M16 7a4 4 0 0 1 4 4v6" />
    </svg>
  );
}

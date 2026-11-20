import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function DiagramFlowHorizontal(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M8 12h.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 003.5 3.5h.5" />
      <path d="M8.5 12A3.5 3.5 0 0012 8.5 3.5 3.5 0 0115.5 5h.5" />
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <rect x="16" y="2" width="6" height="6" rx="1" />
      <rect x="2" y="9" width="6" height="6" rx="1" />
    </svg>
  );
}

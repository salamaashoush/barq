import { cells } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function FileDatabase(props: IconProps) {
  return (
    <svg {...iconProps(cells(props))}>
      <path d="M12 12v8a5 2 0 01-10 0v-8" />
      <path d="M12 16a5 2 0 01-10 0" />
      <path d="M14 2v5a1 1 0 001 1h5" />
      <path d="M4 6.3V4a2 2 0 012-2h8a2.4 2.4 0 011.706.706l3.588 3.588A2.4 2.4 0 0120 8v12a2 2 0 01-2 2h-2.43" />
      <ellipse cx="7" cy="12" rx="5" ry="2" />
    </svg>
  );
}

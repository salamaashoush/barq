import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function ListTodo(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M13 5h8" />
      <path d="M13 12h8" />
      <path d="M13 19h8" />
      <path d="m3 17 2 2 4-4" />
      <rect x="3" y="4" width="6" height="6" rx="1" />
    </svg>
  );
}

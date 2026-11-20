import type { Incoming } from "@barqjs/core";

import { type IconProps, iconProps } from "../icon.ts";

export function MailQuestionMark(props: Incoming<IconProps>) {
  return (
    <svg {...iconProps(props)}>
      <path d="M22 10.35V6a2 2 0 00-2-2H4a2 2 0 00-2 2v12a2 2 0 002 2h12.3" />
      <path d="m22 7-8.97 5.7a2 2 0 01-2.06 0L2 7" />
      <path d="M20 18.5c.5-1 2-1 2-2.5a2 2 0 00-2-2 2.5 2.5 0 00-2 1" />
      <path d="M20 22h.01" />
    </svg>
  );
}

/**
 * Reset, ported from `apps/v4/app/(app)/(create)/components/reset-button.tsx`.
 *
 * An `<AlertDialog size="sm">` rather than a plain button, because resetting
 * throws away a configuration somebody may have spent a while on and there is
 * no undo here. Upstream's dialog is driven from a provider so the keyboard
 * shortcut can open it; this one owns its own open state and the menu calls the
 * same reset directly, which is one fewer indirection for the same behaviour.
 */

import type { Incoming } from "@barqjs/core";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@barqjs/ui";

import type { Design } from "./params.ts";

export interface ResetDialogProps {
  design: Design;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResetDialog(props: Incoming<ResetDialogProps>) {
  return (
    <AlertDialog isOpen={props.isOpen()} onOpenChange={props.onOpenChange()}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
          <AlertDialogDescription>
            This will reset all customization options to their default values.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onPress={() => props.design().reset()}>Reset</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

---
"@barqjs/arc": minor
"@barqjs/aria": patch
---

arc gains the keys, secrets and connections product settings kept building by hand.

- arc `SecretField`, `StoredSecretField`, `SecretReferenceField`, `FileOrPasteField` and `CopyableField`: secrets typed, kept, referenced and pasted from a file, and values to copy.
- arc `MaskedValue`, `OneTimeSecret`, `RedactedSecret` and `RedactedText`: secrets shown on request, shown once, and taken out of text.
- arc `PermissionScopePicker` and `scopeSummary`, and `CredentialBindingList`: scopes to grant, and where each secret comes from.
- arc `ApiKeyManager`, `ActiveSessionsList`, `ConnectedAppsList` and `ConnectionTestDialog`.
- arc `ResponsiveOverlay` keeps a tall dialog inside the screen, its body scrolling, and a table row's inline action no longer also shows in its menu.
- aria `Button` names itself with its progress bar only while one is inside it.

import { MemberInvite, toast } from "@barqjs/arc";

const ROLES = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "billing", label: "Billing" },
  { value: "owner", label: "Owner", isDisabled: true },
];

const MEMBERS = new Set(["salama@example.com", "lina@example.com"]);

export default function MemberInviteExample() {
  return (
    <MemberInvite
      roles={ROLES}
      maxEmails={10}
      validateEmail={(email) => {
        if (MEMBERS.has(email)) return "Already a member";
        if (!email.endsWith("@example.com")) return "Only example.com addresses can join";
        return undefined;
      }}
      onInvite={async (draft) => {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const rejected = draft.emails
          .filter((email) => email.startsWith("bounce"))
          .map((email) => ({ email, reason: "The mailbox does not exist" }));
        const sent = draft.emails.length - rejected.length;
        if (sent > 0)
          toast.success(`Invited ${sent} ${sent === 1 ? "person" : "people"} as ${draft.role}`);
        return { rejected };
      }}
    />
  );
}

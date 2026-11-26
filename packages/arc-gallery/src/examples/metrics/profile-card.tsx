import { Mail } from "@barqjs/lucide/icons/mail";
import { MessageSquare } from "@barqjs/lucide/icons/message-square";
import { Phone } from "@barqjs/lucide/icons/phone";
import { Button, Grid, ProfileCard, Stack } from "@barqjs/arc";

const NOW = "2026-11-26T10:00:00Z";

export default function ProfileCardExample() {
  return (
    <Grid columns={{ base: 1, cqMd: 2 }} gap={6}>
      <ProfileCard
        person={{ name: "Salama Ashoush" }}
        title="Design systems"
        presence="online"
        status={{ emoji: "🎧", text: "Heads down until lunch" }}
        timeZone="Africa/Cairo"
        now={NOW}
        actions={
          <>
            <Button size="sm">
              <MessageSquare aria-hidden="true" />
              Message
            </Button>
            <Button size="sm" variant="outline">
              <Phone aria-hidden="true" />
              Call
            </Button>
          </>
        }
        contacts={[
          {
            key: "email",
            label: "Email",
            value: "salama@example.com",
            href: "mailto:salama@example.com",
            icon: <Mail />,
          },
          {
            key: "phone",
            label: "Phone",
            value: "+20 100 555 0142",
            href: "tel:+201005550142",
            icon: <Phone />,
          },
        ]}
        about="Builds arc and the gallery you are reading. Ask about tokens, charts or right-to-left layout."
      />
      <Stack gap={6}>
        <ProfileCard
          variant="panel"
          person={{ name: "Ana Lima" }}
          title="Year 4 teacher"
          presence="away"
          status={{ emoji: "🌴", text: "On leave", expiresAt: "2026-12-01T00:00:00Z" }}
          timeZone="Europe/Lisbon"
          now={NOW}
          actions={
            <Button size="sm" variant="outline">
              Message
            </Button>
          }
        />
        <ProfileCard person={{ name: "Loading" }} loading />
        <ProfileCard person={{ name: "Removed" }} missing />
      </Stack>
    </Grid>
  );
}

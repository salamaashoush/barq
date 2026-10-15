import { Button, ButtonGroup, ButtonGroupText } from "@barqjs/ui";

export default function ButtonGroupWithText() {
  return (
    <ButtonGroup>
      <ButtonGroupText>https://</ButtonGroupText>
      <Button variant="outline">example.com</Button>
    </ButtonGroup>
  );
}

import { DescriptionList, FormattedDate, Value } from "@barqjs/arc";

interface Member {
  name: string;
  expiresAt: string | null;
  seats: number | null;
  guardian: string | null;
  manager: string | null;
  phone: string;
  grade: string | undefined;
}

const MEMBER: Member = {
  name: "Salama Ashoush",
  expiresAt: null,
  seats: null,
  guardian: null,
  manager: null,
  phone: "",
  grade: undefined,
};

export default function Values() {
  return (
    <DescriptionList
      items={[
        { term: "Name", details: <Value value={MEMBER.name} /> },
        {
          term: "Access expires",
          details: (
            <Value
              value={MEMBER.expiresAt}
              absent="never"
              format={(at) => <FormattedDate value={at} />}
            />
          ),
        },
        { term: "Seats", details: <Value value={MEMBER.seats} absent="noLimit" /> },
        { term: "Manager", details: <Value value={MEMBER.manager} absent="nobody" /> },
        { term: "Guardian", details: <Value value={MEMBER.guardian} absentText="No guardian" /> },
        { term: "Phone", details: <Value value={MEMBER.phone} /> },
        { term: "Grade", details: <Value value={MEMBER.grade} notApplicable /> },
        { term: "Time zone", details: <Value value={undefined} absent="notSet" /> },
      ]}
    />
  );
}

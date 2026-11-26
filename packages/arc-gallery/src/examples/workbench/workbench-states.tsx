import { CheckResults, Grid, ProblemsPanel, TestResults } from "@barqjs/arc";

export default function WorkbenchStates() {
  return (
    <Grid columns={{ base: 1, lg: 3 }} gap={4}>
      <ProblemsPanel problems={[]} isLoading />
      <TestResults tests={[]} onRunAll={() => {}} />
      <CheckResults
        checks={[]}
        errorMessage="The solver could not start: no solver is installed."
      />
    </Grid>
  );
}

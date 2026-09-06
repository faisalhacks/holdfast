import { PageHeader } from "@/components/layout/AppShell";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export default function RunReplayPage() {
  return (
    <>
      <PageHeader
        title="Run replay"
        description="Step through what an agent did, in order, with the inputs it saw at each step."
      />
      <PagePlaceholder
        title="Run replay"
        intent="Reconstruct a single run step by step so a reviewer can see which tool call, extraction, or rule produced the outcome under review."
        planned={[
          "Step timeline with inputs, outputs, and elapsed time per step",
          "Tool and model calls with their prompts and returned payloads",
          "Run summary from the backend",
          "Jump from any exception straight to the step that raised it",
        ]}
      />
    </>
  );
}

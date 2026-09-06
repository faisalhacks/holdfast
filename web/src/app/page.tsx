import { PageHeader } from "@/components/layout/AppShell";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        description="Fleet-level health for every agent workflow in production."
      />
      <PagePlaceholder
        title="Overview"
        intent="A single read on whether the agent fleet is behaving: throughput, autonomy rate, escalation rate, and where the queue is backing up."
        planned={[
          "Autonomy rate and escalation rate per workflow, trended",
          "Queue depth and SLA breach count, with drill-through to the filtered queue",
          "Recent runs that failed or stalled, grouped by cause",
          "Exceptions routed by operational path and next owner",
        ]}
      />
    </>
  );
}

import { PageHeader } from "@/components/layout/AppShell";
import { PagePlaceholder } from "@/components/layout/PagePlaceholder";

export default function AuditLogPage() {
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Immutable record of every decision, override, and rule change."
      />
      <PagePlaceholder
        title="Audit log"
        intent="An export-ready trail an auditor can read without access to the console: who decided what, on what evidence, and under which policy version."
        planned={[
          "Append-only entries for decisions, rule publications, and policy changes",
          "Filter by actor, workflow, policy, and date range",
          "Evidence snapshot attached to each entry, as it existed at decision time",
          "Signed export for external audit",
        ]}
      />
    </>
  );
}

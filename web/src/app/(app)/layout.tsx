import type { ReactNode } from "react";
import { WorkbenchShell } from "@/components/layout/WorkbenchShell";

/** Everything under this group is the workstation: dark, dense, full-height. */
export default function WorkbenchLayout({ children }: { children: ReactNode }) {
  return <WorkbenchShell>{children}</WorkbenchShell>;
}

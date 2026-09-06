import type { ReactNode } from "react";
import { RunBar } from "./RunBar";
import { Sidebar } from "./Sidebar";

export function WorkbenchShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <RunBar />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

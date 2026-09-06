import type { ReactNode } from "react";
import { DemoModeBanner } from "./DemoModeBanner";
import { NavRail } from "./NavRail";
import { RunBar } from "./RunBar";

export function WorkbenchShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col">
        <RunBar />
        <DemoModeBanner />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import { DemoModeBanner } from "./DemoModeBanner";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <DemoModeBanner />
        <main className="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-4 pt-5 pb-4 sm:px-6 sm:pt-6">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm text-ink-faint">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

import type { Metadata } from "next";
import { WorkbenchShell } from "@/components/layout/WorkbenchShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Holdfast — Exception review workstation",
  description:
    "Accounts-payable exception review: typed holds, field-level evidence, and a recorded routing decision.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WorkbenchShell>{children}</WorkbenchShell>
      </body>
    </html>
  );
}

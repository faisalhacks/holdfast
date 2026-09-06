import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Holdfast — Accounts-payable exception review",
  description:
    "Reconciliation exceptions handled with typed payment holds, field-level evidence, and a recorded human routing decision.",
};

/**
 * The root layout owns the document and the tokens, and nothing else.
 *
 * Two surfaces live under it: the light editorial site at `/`, and the dark
 * workstation under `(app)`. Each brings its own shell, so neither has to
 * inherit the other's chrome.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

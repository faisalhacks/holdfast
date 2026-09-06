/** Normalises anything thrown by an adapter into a message the UI can show. */
export function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return "Something went wrong. Try again.";
}

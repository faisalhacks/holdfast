import { buildExceptionFixtures } from "./exceptions";
import type { ExceptionDetail } from "@/lib/api/types";

export interface DemoDataset { exceptions: ExceptionDetail[] }

export function buildDemoDataset(now: Date = new Date()): DemoDataset {
  return { exceptions: buildExceptionFixtures(now) };
}

export { buildExceptionFixtures };

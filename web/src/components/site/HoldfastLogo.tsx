import { cn } from "@/lib/cn";

/*
 * The supplied asset is a 1448x1086 lockup whose artwork occupies only
 * x 187..1261, y 397..678 of a white canvas. Scaling the whole file would give
 * a tiny logo swimming in padding, so the frame crops to the artwork instead:
 * the image is enlarged and offset, and the frame clips it.
 *
 * Percentage margins resolve against the containing block's WIDTH, including
 * margin-top, which is what makes the vertical offset below work.
 *
 *   artwork width  1074 / 1448 = 0.7417  ->  img width 1 / 0.7417 = 134.82%
 *   artwork left    187 / 1448 = 0.1291  ->  -0.1291 * 134.82% = -17.41%
 *   artwork top     397 / 1086 = 0.3656, image height = 134.82% * 0.75
 *                                        ->  -0.3656 * 101.12% = -36.97%
 *
 * The file itself is untouched, so the crop is reversible and the asset stays
 * the single source of truth.
 *
 * There is no dark variant any more. The mark used to be inverted and
 * blend-composited onto the dark workstation; every surface it lands on is now
 * light, so it is simply the artwork, at full fidelity, with nothing done to it.
 */
const FRAME = "relative block overflow-hidden";
const IMAGE = "block w-[134.82%] max-w-none -ml-[17.41%] -mt-[36.97%]";

export function HoldfastLogo({
  className,
  priority = false,
}: {
  /** Sets the width; the frame derives its own height from the artwork. */
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn(FRAME, "aspect-[1074/281]", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/holdfast-logo.png"
        alt="Holdfast"
        width={1448}
        height={1086}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className={IMAGE}
      />
    </span>
  );
}

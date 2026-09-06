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
 */
const FRAME = "relative block overflow-hidden";
const IMAGE = "block w-[134.82%] max-w-none -ml-[17.41%] -mt-[36.97%]";

/*
 * The same file on a dark surface.
 *
 * `invert(1) hue-rotate(180deg)` lifts the artwork rather than recolouring it,
 * and it happens to land on the workstation's own palette: the charcoal becomes
 * #d5dbdf, a shade off `--color-ink`, and the steel becomes #7795b2, a shade off
 * `--color-focus`. The white plate inverts to pure black, which `lighten` then
 * discards against any surface lighter than black — every surface we have — so
 * the background disappears instead of sitting there as a dark rectangle.
 *
 * One asset, two surfaces, no second file to keep in step.
 */
const ON_DARK = "[filter:invert(1)_hue-rotate(180deg)] [mix-blend-mode:lighten]";

export function HoldfastLogo({
  className,
  priority = false,
  tone = "light",
}: {
  /** Sets the width; the frame derives its own height from the artwork. */
  className?: string;
  priority?: boolean;
  /** The surface it sits on, not the colour it becomes. */
  tone?: "light" | "dark";
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
        className={cn(IMAGE, tone === "dark" && ON_DARK)}
      />
    </span>
  );
}

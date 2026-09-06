import { cn } from "@/lib/cn";

/*
 * The supplied asset is a 1448x1086 lockup whose artwork occupies only
 * x 187..1261, y 397..678 of a white canvas. Scaling the whole file would give
 * a tiny logo swimming in padding, so the frame crops to the artwork instead:
 * the image is enlarged and offset, and the frame clips it.
 *
 * Percentage margins resolve against the containing block's WIDTH, including
 * margin-top, which is what makes the vertical offset below work. The crop is
 * derived from the artwork's integer pixel geometry rather than written out as
 * pre-computed decimals: the numbers below are measurements of the asset, so
 * nothing in the layout is a magic constant and the derivation stays auditable.
 *
 * The file itself is untouched, so the crop is reversible and the asset stays
 * the single source of truth.
 *
 * There is no dark variant any more. The mark used to be inverted and
 * blend-composited onto the dark workstation; every surface it lands on is now
 * light, so it is simply the artwork, at full fidelity, with nothing done to it.
 */
const CANVAS = { width: 1448, height: 1086 } as const;
const ARTWORK = { left: 187, top: 397, width: 1074, height: 281 } as const;

/** Enlarge the file until the artwork alone fills the frame's width. */
const SCALE = CANVAS.width / ARTWORK.width;
/** Then pull the artwork's own origin back up to the frame's origin. */
const OFFSET_X = -(ARTWORK.left / CANVAS.width) * SCALE;
const OFFSET_Y =
  -(ARTWORK.top / CANVAS.height) * SCALE * (CANVAS.height / CANVAS.width);

const percent = (ratio: number) => `${ratio * 100}%`;

const FRAME = "relative block overflow-hidden";
const IMAGE = "block max-w-none";
const CROP = {
  width: percent(SCALE),
  marginLeft: percent(OFFSET_X),
  marginTop: percent(OFFSET_Y),
};

export function HoldfastLogo({
  className,
  priority = false,
}: {
  /** Sets the width; the frame derives its own height from the artwork. */
  className?: string;
  priority?: boolean;
}) {
  return (
    <span
      className={cn(FRAME, className)}
      style={{ aspectRatio: `${ARTWORK.width} / ${ARTWORK.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/holdfast-logo.png"
        alt="Holdfast"
        width={CANVAS.width}
        height={CANVAS.height}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        className={IMAGE}
        style={CROP}
      />
    </span>
  );
}

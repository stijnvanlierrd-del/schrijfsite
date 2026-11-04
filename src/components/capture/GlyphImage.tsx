/** Toont een teken op een vaste schrijflijn (basislijn op 69% van de hoogte), zodat varianten vergelijkbaar zijn. */
export function GlyphImage({ url, width, height, baseline, scale = 0.55, alt }: { url: string; width: number; height: number; baseline: number; scale?: number; alt: string }) {
  const top = 66 - baseline * scale;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      style={{ top, height: height * scale, width: width * scale, left: "50%", transform: "translateX(-50%)" }}
      draggable={false}
    />
  );
}

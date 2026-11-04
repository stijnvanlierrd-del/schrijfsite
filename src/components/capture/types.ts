import type { RawGlyph } from "@/lib/hw/types";

export interface ReviewItem {
  key: string;
  raw: RawGlyph;
  url: string;
  ch: string;
  include: boolean;
  warning?: string;
}

let counter = 0;
export function toReviewItems(raws: RawGlyph[], toUrl: (g: RawGlyph) => string): ReviewItem[] {
  return raws.map((raw) => ({
    key: `r${Date.now().toString(36)}${(counter++).toString(36)}`,
    raw,
    url: toUrl(raw),
    ch: raw.ch,
    include: raw.width > 2 && raw.height > 2,
    warning: raw.warning,
  }));
}

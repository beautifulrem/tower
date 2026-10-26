/**
 * Pinyin initials for Chinese titles, so "gwc" finds 购物车 in the palette.
 *
 * There is no table of readings: ICU's pinyin collation (`zh-u-co-pinyin`,
 * present in WebKit and Node) orders Han characters by pinyin, so a
 * character's initial is found by binary search against the first character
 * of each letter group. Twenty-three boundary characters replace a 20 000-
 * entry table; measured against CFStringTransform over the whole CJK block,
 * 25 rare characters (all U+9Fxx extensions) come out wrong. Heteronyms get
 * one reading, as in every initials index.
 */
const BOUNDS = "吖a丷b嚓c咑d妸e发f旮g哈h丌j咔k垃l呣m拏n喔o妑p七q呥r仨s他t屲w夕x丫y帀z";
const chars: string[] = [];
const letters: string[] = [];
for (let i = 0; i < BOUNDS.length; i += 2) {
  chars.push(BOUNDS[i]);
  letters.push(BOUNDS[i + 1]);
}

let collator: Intl.Collator | null | undefined;

function coll(): Intl.Collator | null {
  if (collator === undefined) {
    try {
      const c = new Intl.Collator("zh-u-co-pinyin");
      collator = c.resolvedOptions().collation === "pinyin" ? c : null;
    } catch {
      collator = null;
    }
  }
  return collator;
}

/** Whether pinyin matching works in this runtime (ICU with the zh tailoring). */
export const pinyinAvailable = (): boolean => coll() !== null;

const isHan = (cp: number) => (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);

export const hasHan = (s: string): boolean => [...s].some((c) => isHan(c.codePointAt(0)!));

const cache = new Map<string, string>();

/** The pinyin initial of one Han character, or null when unknown or unsupported. */
export function initialOf(ch: string): string | null {
  const c = coll();
  if (!c || !isHan(ch.codePointAt(0) ?? 0)) return null;
  const hit = cache.get(ch);
  if (hit) return hit;
  let lo = 0;
  let hi = chars.length - 1;
  let ans = "a";
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (c.compare(ch, chars[mid]) >= 0) {
      ans = letters[mid];
      lo = mid + 1;
    } else hi = mid - 1;
  }
  cache.set(ch, ans);
  return ans;
}

/**
 * The text with every Han character replaced by its initial and the rest
 * lower-cased, one output character per input character, so match positions
 * map straight back onto the original.
 */
export function initialsKey(text: string): string {
  let out = "";
  for (const ch of text) out += initialOf(ch) ?? ch.toLowerCase();
  return out;
}

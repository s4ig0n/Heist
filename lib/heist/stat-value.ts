/**
 * What a stat tile shows when its data source has no rows. A count or a sum of nothing is a real zero (no leaks
 * yet). A max, min or average of nothing has no value, so the tile shows a dash: a run with no Heist Score, such
 * as a single-persona case study, must not read as a score of 0.
 */
export function statValueWhenEmpty(aggregation: string | undefined): number | null {
  return aggregation === "max" || aggregation === "min" || aggregation === "avg" ? null : 0;
}

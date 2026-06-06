/** "Year 3" | "3" | "Y3" → 3 ; blank/invalid → 1. */
export function toYearLevel(raw: string | undefined | null): number {
  if (!raw) return 1;
  return parseInt(String(raw).replace(/\D/g, ''), 10) || 1;
}

/** "Sem 1" | "1" → 1 ; blank/invalid → 1. */
export function toSemester(raw: string | undefined | null): number {
  if (!raw) return 1;
  return parseInt(String(raw).replace(/\D/g, ''), 10) || 1;
}

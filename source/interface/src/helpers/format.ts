// Status:: complete
// Formatting helpers — timestamps, relative dates, token abbreviations.

/**
 * Format an ISO 8601 date string to the 24-hour edit window rule:
 * - Within 24-hour window (up to 23 hours 59 mins): shows relative time ("Just now", "5m ago", "2h 15m ago", etc.)
 * - Once it crosses 24 hours: says the exact day it was last edited (e.g. "Oct 15", or "Oct 15, 2025" if previous year).
 */
export function formatCompactDate(isoString?: string | null): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";

  const now = Date.now();
  const diffMs = now - d.getTime();

  const oneMinuteMs = 60 * 1000;
  const oneHourMs = 60 * oneMinuteMs;
  const twentyFourHoursMs = 24 * oneHourMs;

  // 24-hour relative edit window (up to 23h 59m)
  if (diffMs >= 0 && diffMs < twentyFourHoursMs) {
    if (diffMs < oneMinuteMs) {
      return "Just now";
    }
    const diffMinutes = Math.floor(diffMs / oneMinuteMs);
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const hours = Math.floor(diffMs / oneHourMs);
    const mins = Math.floor((diffMs % oneHourMs) / oneMinuteMs);
    if (mins === 0) {
      return `${hours}h ago`;
    }
    return `${hours}h ${mins}m ago`;
  }

  // Once it crosses 24 hours, display the day it was last edited
  const currentYear = new Date().getFullYear();
  if (d.getFullYear() === currentYear) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Format token counts with compact 'k' / 'M' suffix.
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return String(tokens);
}

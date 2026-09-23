/** Dates and names, formatted the one way the whole product uses. */

const MUSCAT = 'Asia/Muscat';

/**
 * Stored UTC, read in Muscat. The server may run anywhere — an ERP that shows
 * a sale on the wrong day because the host is in another timezone is worse
 * than useless, because the number still looks plausible.
 */
export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString('en-GB', {
    timeZone: MUSCAT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    timeZone: MUSCAT,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Two letters for an avatar: "Ali Raza" -> "AR", "Suarza" -> "SU". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts.at(-1)![0]!).toUpperCase();
}

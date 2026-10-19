/**
 * Utility functions for formatting 24-hour HH:MM time strings and intervals
 * into clean, ordinary 12-hour AM/PM citizen-friendly display labels.
 *
 * Examples:
 *   "21:00" -> "9:00 PM"
 *   "21:15" -> "9:15 PM"
 *   "21:30-21:45" -> "9:30–9:45 PM"
 *   "23:00" -> "11:00 PM"
 *   "00:00" -> "12:00 AM"
 *   "12:00" -> "12:00 PM"
 */

export function parseHHMM(timeStr: string): { hours: number; minutes: number } | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  // Support HH:MM and optional :SS (e.g. 21:30 or 21:30:00)
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return { hours, minutes };
}

export function formatSingleTime(timeStr: string): string {
  if (!timeStr || typeof timeStr !== 'string') return timeStr || '';
  const trimmed = timeStr.trim();
  // If already formatted with AM or PM, return as-is
  if (/\b(?:AM|PM)\b/i.test(trimmed)) {
    return trimmed;
  }

  const parsed = parseHHMM(trimmed);
  if (!parsed) return timeStr;

  const { hours, minutes } = parsed;
  const period = hours >= 12 ? 'PM' : 'AM';
  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;
  const minStr = minutes.toString().padStart(2, '0');

  return `${displayHour}:${minStr} ${period}`;
}

export function formatIntervalTo12Hour(startStr: string, endStr: string): string {
  const pStart = parseHHMM(startStr);
  const pEnd = parseHHMM(endStr);

  if (!pStart && !pEnd) {
    return `${startStr}–${endStr}`;
  }
  if (!pStart) return `${startStr}–${formatSingleTime(endStr)}`;
  if (!pEnd) return `${formatSingleTime(startStr)}–${endStr}`;

  const periodStart = pStart.hours >= 12 ? 'PM' : 'AM';
  const periodEnd = pEnd.hours >= 12 ? 'PM' : 'AM';

  let hourStart = pStart.hours % 12;
  if (hourStart === 0) hourStart = 12;
  const minStart = pStart.minutes.toString().padStart(2, '0');

  let hourEnd = pEnd.hours % 12;
  if (hourEnd === 0) hourEnd = 12;
  const minEnd = pEnd.minutes.toString().padStart(2, '0');

  // If both share the same period, concise format: e.g. "9:30–9:45 PM"
  if (periodStart === periodEnd) {
    return `${hourStart}:${minStart}–${hourEnd}:${minEnd} ${periodEnd}`;
  }

  // Cross period, e.g. "11:45 AM – 12:15 PM"
  return `${hourStart}:${minStart} ${periodStart} – ${hourEnd}:${minEnd} ${periodEnd}`;
}

export function formatTo12Hour(timeOrInterval: string | null | undefined): string {
  if (!timeOrInterval || typeof timeOrInterval !== 'string') return '';
  const trimmed = timeOrInterval.trim();

  // If already contains AM or PM and no unformatted interval, return as-is
  if (/\b(?:AM|PM)\b/i.test(trimmed) && !trimmed.includes('-') && !trimmed.includes('–')) {
    return trimmed;
  }

  // Handle intervals formatted like "21:30 - 21:45", "21:30-21:45", or "21:30–21:45"
  if (trimmed.includes('–') || trimmed.includes('-')) {
    const separator = trimmed.includes('–') ? '–' : '-';
    const parts = trimmed.split(separator);
    if (parts.length === 2) {
      const p1 = parseHHMM(parts[0].trim());
      const p2 = parseHHMM(parts[1].trim());
      if (p1 && p2) {
        return formatIntervalTo12Hour(parts[0].trim(), parts[1].trim());
      }
    }
  }

  // Single time
  return formatSingleTime(trimmed);
}

/**
 * Validates whether a time string strictly matches semantic 24-hour HH:MM (00:00 to 23:59).
 * Rejects invalid times like "99:99", "21:75", "25:00".
 */
export function isValid24HourTime(timeStr: string | null | undefined): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  return parseHHMM(timeStr) !== null;
}

/**
 * Calculates duration between two HH:MM time strings in minutes.
 * Handles midnight crossing correctly (e.g. 23:45 to 00:15 returns 30 minutes).
 * Returns null if either timestamp is invalid.
 */
export function calculateDurationMinutes(startStr: string, endStr: string): number | null {
  const pStart = parseHHMM(startStr);
  const pEnd = parseHHMM(endStr);
  if (!pStart || !pEnd) return null;

  const startMins = pStart.hours * 60 + pStart.minutes;
  const endMins = pEnd.hours * 60 + pEnd.minutes;

  if (endMins >= startMins) {
    return endMins - startMins;
  }
  // Midnight crossing: e.g. 23:45 (1425m) to 00:15 (15m) -> 1440 - 1425 + 15 = 30m
  return 1440 - startMins + endMins;
}

/**
 * Formats duration in minutes into a human-readable string (e.g. "20 mins", "1 hr 15 mins").
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || isNaN(minutes) || minutes < 0) return 'N/A';
  if (minutes < 60) return `${minutes} mins`;
  const hrs = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  return `${hrs} hr${hrs > 1 ? 's' : ''} ${remainingMins} mins`;
}
export function formatTo12HourEstimated(timeStr: string | null | undefined): string {
  const formatted = formatTo12Hour(timeStr);
  if (!formatted) return '';
  return `${formatted} (Est.)`;
}

/**
 * Formats a date string (YYYY-MM-DD or standard ISO) into readable IST format: e.g. "11 October 2026"
 */
export function formatDateIST(dateStr: string | null | undefined): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  try {
    const parts = dateStr.trim().split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, monthIndex, day);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  } catch {
    // fallback
  }
  return dateStr;
}

/**
 * Formats delay minutes nicely.
 */
export function formatDelayMinutes(delayMins: number | null | undefined): string {
  if (!delayMins || delayMins <= 0) return 'On Time (0 min delay)';
  return `+${delayMins} min delay`;
}

/**
 * Checks whether full start date-time precedes end date-time, supporting events that cross midnight.
 * e.g. start: 2026-10-11 18:00, end: 2026-10-12 02:00 -> valid!
 */
export function isValidDateTimeRange(
  startDateStr: string | null | undefined,
  startTimeStr: string | null | undefined,
  endDateStr: string | null | undefined,
  endTimeStr: string | null | undefined
): boolean {
  if (!startTimeStr || !endTimeStr) return false;
  const pStart = parseHHMM(startTimeStr);
  const pEnd = parseHHMM(endTimeStr);
  if (!pStart || !pEnd) return false;

  const sDate = startDateStr || '2026-10-11';
  const eDate = endDateStr || sDate;

  // Build timestamps
  try {
    const sParts = sDate.split('-').map(Number);
    const eParts = eDate.split('-').map(Number);
    if (sParts.length !== 3 || eParts.length !== 3) return false;

    const startTimestamp = new Date(sParts[0], sParts[1] - 1, sParts[2], pStart.hours, pStart.minutes).getTime();
    const endTimestamp = new Date(eParts[0], eParts[1] - 1, eParts[2], pEnd.hours, pEnd.minutes).getTime();

    return endTimestamp > startTimestamp;
  } catch {
    return false;
  }
}

/**
 * Calculates duration in minutes from full start date-time to end date-time.
 */
export function calculateDurationFromDateTimes(
  startDateStr: string | null | undefined,
  startTimeStr: string | null | undefined,
  endDateStr: string | null | undefined,
  endTimeStr: string | null | undefined
): number | null {
  if (!startTimeStr || !endTimeStr) return null;
  const pStart = parseHHMM(startTimeStr);
  const pEnd = parseHHMM(endTimeStr);
  if (!pStart || !pEnd) return null;

  const sDate = startDateStr || '2026-10-11';
  const eDate = endDateStr || sDate;

  try {
    const sParts = sDate.split('-').map(Number);
    const eParts = eDate.split('-').map(Number);
    const startTimestamp = new Date(sParts[0], sParts[1] - 1, sParts[2], pStart.hours, pStart.minutes).getTime();
    const endTimestamp = new Date(eParts[0], eParts[1] - 1, eParts[2], pEnd.hours, pEnd.minutes).getTime();

    if (endTimestamp < startTimestamp) return null;
    return Math.round((endTimestamp - startTimestamp) / 60000);
  } catch {
    return null;
  }
}

/**
 * Parses user input in either 12-hour format (e.g., "12:19 pm", "9:30 AM", "12:19pm")
 * or 24-hour format (e.g., "12:19", "21:30", "09:30") into a standardized 24-hour "HH:mm" string.
 * Returns null if the string is invalid or out of range.
 */
export function parseAnyTimeToHHMM(input: string | null | undefined): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // 1. Check for 12-hour format with AM/PM (e.g., "12:19 pm", "9:30 AM", "12:19pm")
  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const min = parseInt(ampmMatch[2], 10);
    const meridiem = ampmMatch[3].toLowerCase();

    if (isNaN(hour) || isNaN(min) || hour < 1 || hour > 12 || min < 0 || min > 59) {
      return null;
    }

    if (meridiem === 'pm' && hour < 12) {
      hour += 12;
    } else if (meridiem === 'am' && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  // 2. Check for standard 24-hour format (e.g., "21:30", "12:19", "9:30")
  const standardMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (standardMatch) {
    const hour = parseInt(standardMatch[1], 10);
    const min = parseInt(standardMatch[2], 10);

    if (isNaN(hour) || isNaN(min) || hour < 0 || hour > 23 || min < 0 || min > 59) {
      return null;
    }

    return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }

  return null;
}

/**
 * Shifts a 24-hour HH:MM time string by a specified number of minutes.
 * Handles cross-midnight wrapping properly (e.g., 23:45 + 30 mins -> 00:15).
 */
export function shiftTimeHHMM(timeStr: string, minutesToAdd: number): string {
  const p = parseHHMM(timeStr);
  if (!p) return timeStr;
  let totalMins = p.hours * 60 + p.minutes + minutesToAdd;
  totalMins = ((totalMins % 1440) + 1440) % 1440;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}


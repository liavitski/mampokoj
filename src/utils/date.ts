/**
 * Formats a timestamp for an `<input type="date">`, whose value must be
 * `YYYY-MM-DD`.
 *
 * The parts are read in UTC deliberately. "Available from" is a calendar date
 * that the schema anchors at UTC midnight, so reading it back in the visitor's
 * local zone would show -- and then save -- a different day for anyone not on
 * UTC. `toISOString().slice(0, 10)` has the same problem in reverse: for a
 * +02:00 timestamp it returns the previous day.
 */
export function toDateInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

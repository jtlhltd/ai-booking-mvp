/**
 * SQL fragments for "since N hours/days ago" that work on Postgres and SQLite.
 * @param {boolean} isPostgres
 */

export function sqlHoursAgo(isPostgres, hours = 1) {
  if (isPostgres) {
    return `NOW() - INTERVAL '${hours} hour${hours === 1 ? '' : 's'}'`;
  }
  return `datetime('now','-${hours} hour${hours === 1 ? '' : 's'}')`;
}

export function sqlDaysAgo(isPostgres, days = 1) {
  if (isPostgres) {
    return `NOW() - INTERVAL '${days} day${days === 1 ? '' : 's'}'`;
  }
  return `datetime('now','-${days} day${days === 1 ? '' : 's'}')`;
}

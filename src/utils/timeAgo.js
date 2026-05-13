/**
 * Format a date as a relative time string in pt-BR.
 *
 * Used by P3-I to display "Editado há X" in ItemPreviewModal and similar.
 * Tolerant to null/undefined/invalid input — returns empty string.
 */
export function formatTimeAgo(input) {
  if (!input) return '';
  let date;
  try {
    date = input instanceof Date ? input : new Date(input);
    if (isNaN(date.getTime())) return '';
  } catch {
    return '';
  }
  const now = Date.now();
  const diffMs = now - date.getTime();
  if (diffMs < 0) return 'agora';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return 'agora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `há ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'ontem';
  if (day < 30) return `há ${day} dias`;
  const month = Math.floor(day / 30);
  if (month < 12) return month === 1 ? 'há 1 mês' : `há ${month} meses`;
  const year = Math.floor(day / 365);
  return year === 1 ? 'há 1 ano' : `há ${year} anos`;
}

export default formatTimeAgo;

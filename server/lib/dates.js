'use strict';

/**
 * dates.js — парсинг исторических дат
 *
 * Фронтенд шлёт даты в форматах:
 *   "12.03.1918"            → точная дата (day)
 *   "12.03.1918 — 05.11.1987" → диапазон (использовать parseRange)
 *   "1918"                  → только год (year)
 *   "март 1918" / "03.1918" → месяц (month)
 *   ""                      → null
 *
 * Возвращаем { date: Date|null, accuracy: 'day'|'month'|'year'|null }.
 * accuracy кладём в Profile/TimelineEvent.dateAccuracy.
 */

const MONTHS_RU = {
  'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'мая': 5, 'май': 5,
  'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10,
  'ноябр': 11, 'декабр': 12,
};

function parseRuMonth(str) {
  const lower = String(str).toLowerCase();
  for (const [key, num] of Object.entries(MONTHS_RU)) {
    if (lower.includes(key)) return num;
  }
  return null;
}

/**
 * Парсит одну дату.
 * @param {string|Date|null} raw
 * @returns date: Date|null, accuracy: 'day'|'month'|'year'|null
 */
function parseDate(raw) {
  if (!raw) return { date: null, accuracy: null };
  if (raw instanceof Date) {
    return { date: raw, accuracy: 'day' };
  }

  const s = String(raw).trim();
  if (!s) return { date: null, accuracy: null };

  // ISO: 1918-03-12 / 1918-03-12T00:00:00Z
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return {
      date: new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])),
      accuracy: 'day',
    };
  }

  // DD.MM.YYYY (или DD/MM/YYYY)
  const dmy = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/);
  if (dmy) {
    const day = +dmy[1], month = +dmy[2], year = +dmy[3];
    if (year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return {
        date: new Date(Date.UTC(year, month - 1, day)),
        accuracy: 'day',
      };
    }
  }

  // MM.YYYY
  const my = s.match(/^(\d{1,2})[.\/](\d{4})$/);
  if (my) {
    const month = +my[1], year = +my[2];
    if (year > 0 && month >= 1 && month <= 12) {
      return {
        date: new Date(Date.UTC(year, month - 1, 1)),
        accuracy: 'month',
      };
    }
  }

  // Русский месяц + год: "март 1918", "12 марта 1918"
  const ruMonth = parseRuMonth(s);
  const yearMatch = s.match(/\b(\d{4})\b/);
  if (ruMonth && yearMatch) {
    const dayMatch = s.match(/\b(\d{1,2})\s/);
    if (dayMatch) {
      const day = +dayMatch[1];
      if (day >= 1 && day <= 31) {
        return {
          date: new Date(Date.UTC(+yearMatch[1], ruMonth - 1, day)),
          accuracy: 'day',
        };
      }
    }
    return {
      date: new Date(Date.UTC(+yearMatch[1], ruMonth - 1, 1)),
      accuracy: 'month',
    };
  }

  // Только год
  if (yearMatch) {
    return {
      date: new Date(Date.UTC(+yearMatch[1], 0, 1)),
      accuracy: 'year',
    };
  }

  // Попытка через нативный Date
  const native = new Date(s);
  if (!isNaN(native.getTime())) {
    return { date: native, accuracy: 'day' };
  }

  return { date: null, accuracy: null };
}

/**
 * Парсит "12.03.1918 — 05.11.1987" → [start, end].
 * Разделители: —, –, -, до, по, "..".
 */
function parseRange(raw) {
  if (!raw) return { start: null, end: null };
  const s = String(raw).trim();

  const parts = s.split(/\s*[—–\-]\s*|\s+до\s+|\s+по\s+|\.\.\s*/);
  if (parts.length === 1) {
    return { start: parseDate(parts[0]), end: null };
  }
  return {
    start: parseDate(parts[0]),
    end: parseDate(parts[1] || null),
  };
}

/**
 * Форматирует Date обратно в исторический вид с учётом accuracy.
 * Для отдачи фронту.
 */
function formatDate(date, accuracy) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  if (accuracy === 'year' || !accuracy) return String(year);
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  if (accuracy === 'month') return `${month}.${year}`;
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}.${month}.${year}`;
}

/**
 * "DD.MM.YYYY — DD.MM.YYYY" для фронта.
 */
function formatRange(startDate, startAcc, endDate, endAcc) {
  const a = formatDate(startDate, startAcc);
  const b = formatDate(endDate, endAcc);
  if (a && b) return `${a} — ${b}`;
  return a || b || '';
}

/**
 * Возвращает год из Date или null.
 */
function getYear(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.getUTCFullYear();
}

module.exports = {
  parseDate,
  parseRange,
  formatDate,
  formatRange,
  getYear,
};
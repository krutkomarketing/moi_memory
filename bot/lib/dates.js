'use strict';

/**
 * dates.js — простой парсер дат для бота.
 * Поддерживает: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY.
 * parseRange("12.03.1950 — 05.11.2020") → { from: Date, to: Date }
 * parseRange("1950-1977")               → { from: Date(1950,0,1), to: Date(1977,0,1) }
 */

const RANGE_SEP = /\s*[–—]\s*|\s+[\-]\s+|(?<=\d{4})-(?=\d{4})/;

function parseSingle(str) {
  if (!str) return null;
  const s = String(str).trim();

  // DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1700 && y <= 2200) {
      return new Date(Date.UTC(y, m - 1, d));
    }
  }

  // YYYY
  const yearOnly = s.match(/^(\d{4})$/);
  if (yearOnly) {
    const y = parseInt(yearOnly[1], 10);
    if (y >= 1700 && y <= 2200) return new Date(Date.UTC(y, 0, 1));
  }

  return null;
}

function parseRange(str) {
  if (!str) return { from: null, to: null };
  const parts = String(str).split(RANGE_SEP).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return { from: parseSingle(parts[0]), to: null };
  return { from: parseSingle(parts[0]), to: parseSingle(parts[1]) };
}

module.exports = { parseSingle, parseRange };
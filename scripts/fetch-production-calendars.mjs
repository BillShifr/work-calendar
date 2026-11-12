#!/usr/bin/env node
/**
 * Обновляет официальные производственные календари РФ (xmlcalendar.ru)
 * и дополняет отсутствующие годы базовым календарём по ст. 112 ТК РФ
 * без постановлений о переносах.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src/domain/production-calendar/data");
const FIXED = [
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
  [1, 7],
  [1, 8],
  [2, 23],
  [3, 8],
  [5, 1],
  [5, 9],
  [6, 12],
  [11, 4],
];

function generateBaseline(year) {
  const months = [];
  for (let month = 1; month <= 12; month += 1) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const special = new Map();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      const isWeekend = wd === 0 || wd === 6;
      const isHoliday = FIXED.some(([m, d]) => m === month && d === day);
      if (isWeekend || isHoliday) special.set(day, "");
    }
    for (const [m, d] of FIXED) {
      if (m !== month) continue;
      const prev = new Date(Date.UTC(year, month - 1, d));
      prev.setUTCDate(prev.getUTCDate() - 1);
      if (prev.getUTCFullYear() !== year || prev.getUTCMonth() + 1 !== month) {
        continue;
      }
      const pd = prev.getUTCDate();
      const pwd = prev.getUTCDay();
      if (pwd !== 0 && pwd !== 6 && !special.has(pd)) special.set(pd, "*");
    }
    months.push({
      month,
      days: [...special.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([d, mark]) => `${d}${mark}`)
        .join(","),
    });
  }
  return {
    year,
    months,
    transitions: [],
    source: "baseline-tk-rf-112",
    note: "Базовый календарь по ст. 112 ТК РФ без постановлений о переносах. Обновляется при публикации официального производственного календаря.",
  };
}

async function fetchOfficial(year) {
  const url = `https://xmlcalendar.ru/data/ru/${year}/calendar.json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  data.source = "xmlcalendar.ru";
  return data;
}

fs.mkdirSync(outDir, { recursive: true });
const startYear = 2024;
const endYear = 2035;

for (let year = startYear; year <= endYear; year += 1) {
  const official = await fetchOfficial(year);
  const data = official ?? generateBaseline(year);
  const target = path.join(outDir, `${year}.json`);
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `${year}: ${official ? "official xmlcalendar.ru" : "baseline ТК РФ"}`,
  );
}

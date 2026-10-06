import { ObjectOperationError } from "./errors.js";

const pad = (value: number, width: number): string => String(value).padStart(width, "0");

export const assertTimeZone = (timeZone: string): string => {
  if (timeZone.trim() === "") {
    throw new ObjectOperationError("error.invalidTimeZone");
  }
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    throw new ObjectOperationError("error.invalidTimeZone");
  }
};

export const formatTimestamp = (date: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const part = (type: string): string => parts.find((entry) => entry.type === type)?.value ?? "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const hour = part("hour");
  const minute = part("minute");
  const second = part("second");
  const asUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const offsetMinutes = Math.round((asUtc - date.getTime()) / 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absolute / 60), 2)}:${pad(absolute % 60, 2)}`;
  const milliseconds = ((date.getTime() % 1000) + 1000) % 1000;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${pad(milliseconds, 3)}${offset}`;
};

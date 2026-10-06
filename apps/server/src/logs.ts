import { randomUUID } from "node:crypto";

export type LogSink = (line: string) => void;

export type RequestLogEntry = {
  readonly event: "request";
  readonly requestId: string;
  readonly method: string;
  readonly path: string;
  readonly status: number;
  readonly durationMs: number;
};

export type ErrorLogEntry = {
  readonly event: "error";
  readonly requestId: string;
  readonly codigo: string;
  readonly mensaje: string;
  readonly stack?: string;
};

export type LogEntry = RequestLogEntry | ErrorLogEntry;

const consoleSink: LogSink = (line) => {
  console.log(line);
};

export const createRequestId = (): string => randomUUID().slice(0, 8);

export const writeLog = (entry: LogEntry, sink: LogSink = consoleSink): void => {
  sink(JSON.stringify(entry));
};

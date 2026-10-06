import { crc32, deflateRawSync } from "node:zlib";

export type ZipEntry = {
  readonly name: string;
  readonly data: Uint8Array;
};

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const VERSION = 20;
const UTF8_FLAG = 0x0800;
const DEFLATE = 8;
const DOS_DATE = 0x21;
const DOS_TIME = 0;
const MAX_ENTRIES = 0xffff;

const concat = (chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
};

const localHeader = (name: Buffer, compressed: Buffer, data: Uint8Array): Buffer => {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_SIGNATURE, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(UTF8_FLAG, 6);
  header.writeUInt16LE(DEFLATE, 8);
  header.writeUInt16LE(DOS_TIME, 10);
  header.writeUInt16LE(DOS_DATE, 12);
  header.writeUInt32LE(crc32(data), 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
};

const centralHeader = (
  name: Buffer,
  compressed: Buffer,
  data: Uint8Array,
  localOffset: number,
): Buffer => {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_SIGNATURE, 0);
  header.writeUInt16LE(VERSION, 4);
  header.writeUInt16LE(VERSION, 6);
  header.writeUInt16LE(UTF8_FLAG, 8);
  header.writeUInt16LE(DEFLATE, 10);
  header.writeUInt16LE(DOS_TIME, 12);
  header.writeUInt16LE(DOS_DATE, 14);
  header.writeUInt32LE(crc32(data), 16);
  header.writeUInt32LE(compressed.length, 20);
  header.writeUInt32LE(data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt32LE(localOffset, 42);
  return header;
};

const endOfCentralDirectory = (
  entries: number,
  centralSize: number,
  centralOffset: number,
): Buffer => {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD_SIGNATURE, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries, 8);
  end.writeUInt16LE(entries, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);
  return end;
};

export const crearZip = (entries: readonly ZipEntry[]): Uint8Array<ArrayBuffer> => {
  if (entries.length > MAX_ENTRIES) {
    throw new Error(`un zip no puede tener más de ${MAX_ENTRIES} entradas`);
  }

  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const compressed = deflateRawSync(entry.data);
    localChunks.push(localHeader(name, compressed, entry.data), name, compressed);
    centralChunks.push(centralHeader(name, compressed, entry.data, offset), name);
    offset += 30 + name.length + compressed.length;
  }

  const central = concat(centralChunks);
  return concat([
    ...localChunks,
    central,
    endOfCentralDirectory(entries.length, central.length, offset),
  ]);
};

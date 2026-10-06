const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID_PATTERN = /^[0-7][0-9A-HJ-KM-NP-TV-Z]{25}$/;
const TIME_CHARS = 10;
const RANDOM_BYTES = 10;

let lastTime = -1;
let lastRandom: Uint8Array | null = null;

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const incrementBytes = (bytes: Uint8Array): void => {
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    const value = (bytes[index] ?? 0) + 1;
    if (value <= 0xff) {
      bytes[index] = value;
      return;
    }
    bytes[index] = 0;
  }
};

const encodeTime = (time: number): string => {
  let remaining = time;
  let encoded = "";
  for (let index = 0; index < TIME_CHARS; index += 1) {
    encoded = CROCKFORD_ALPHABET.charAt(remaining % 32) + encoded;
    remaining = Math.floor(remaining / 32);
  }
  return encoded;
};

const encodeRandom = (bytes: Uint8Array): string => {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  let encoded = "";
  for (let index = 0; index < 16; index += 1) {
    encoded = CROCKFORD_ALPHABET.charAt(Number(value & 31n)) + encoded;
    value >>= 5n;
  }
  return encoded;
};

export const newUlid = (): string => {
  const now = Date.now();
  if (lastRandom !== null && now <= lastTime) {
    incrementBytes(lastRandom);
    return `${encodeTime(lastTime)}${encodeRandom(lastRandom)}`;
  }
  lastTime = now;
  lastRandom = randomBytes(RANDOM_BYTES);
  return `${encodeTime(now)}${encodeRandom(lastRandom)}`;
};

export const isUlid = (value: unknown): value is string =>
  typeof value === "string" && ULID_PATTERN.test(value);

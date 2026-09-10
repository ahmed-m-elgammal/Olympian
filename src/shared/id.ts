import { customAlphabet, nanoid } from 'nanoid';

/**
 * ID generation utilities (spec 02 §3 — "nanoid wrapper").
 *
 * Uses nanoid for collision-safe, URL-friendly IDs. The default alphabet
 * is URL-safe unambiguous (no 0/O/1/l confusion).
 */

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const ID_LENGTH = 16;

/**
 * Generate a random ID. If a prefix is supplied, the ID is formatted as
 * `${prefix}_${nanoid}` so logs and DB rows are easier to read.
 *
 * @example
 *   newId()           // "aB3kQp9xR2mN7vZ1"
 *   newId('save')     // "save_aB3kQp9xR2mN7vZ1"
 *   newId('entity')   // "entity_aB3kQp9xR2mN7vZ1"
 */
export function newId(prefix?: string): string {
  const id = customAlphabet(ALPHABET, ID_LENGTH)();
  return prefix ? `${prefix}_${id}` : id;
}

/** Default nanoid (21 chars, full URL-safe alphabet). Use for opaque IDs. */
export function nanoidString(): string {
  return nanoid();
}

/** Re-export for callers that want the raw nanoid function. */
export { nanoid };

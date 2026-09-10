import { migrationV1 } from './v1';
import type { Migration } from './types';

/**
 * Ordered list of all known migrations. Append new migrations to the end;
 * never insert in the middle, never delete. The migration runner applies
 * every migration whose `version` is greater than the highest version
 * recorded in `schema_version`.
 *
 * Spec reference: 03 §3 ("Locked rule: Never delete a migration").
 */
export const MIGRATIONS: readonly Migration[] = [
  migrationV1,
  // { version: 2, ... } — future migrations go here
];

export type { Migration } from './types';

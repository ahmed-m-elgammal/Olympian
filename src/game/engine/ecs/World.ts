/**
 * ECS `World` — entity registry + typed component storage
 * (spec 07 §1.1, §1.4).
 *
 * Bevy-inspired manual ECS:
 *  - an entity is a numeric id with no data;
 *  - each component type lives in its own `Map<EntityId, payload>` so
 *    iteration over one component type is cache-friendly and systems
 *    never touch components they don't declare;
 *  - an index (`entityComponents`) tracks which component types an
 *    entity has, making destroy + queries O(components on entity).
 *
 * The world is pure data + CRUD — systems live in `../systems/` and are
 * plain functions over the world. It is engine/RN-free and fully
 * unit-testable.
 *
 * @packageDocumentation
 */

import { logger } from '@/shared/log';
import type { ComponentMap, ComponentTypeKey } from './components';

/** Entity handle. Opaque numeric id; 0 is valid. */
export type EntityId = number;

/** Type-map view so `getComponent` infers the payload type. */
export interface ComponentStore {
  get<K extends ComponentTypeKey>(
    entityId: EntityId,
    type: K,
  ): ComponentMap[K] | undefined;
}

export class World {
  /** Next entity id (monotonic; never reused within a world). */
  private nextId: EntityId = 0;
  /** Live entity ids. */
  private readonly entities = new Set<EntityId>();
  /** One map per component type — contiguous per-type storage. */
  private readonly stores = new Map<ComponentTypeKey, Map<EntityId, unknown>>();
  /** Entity → set of component types it carries (for destroy/queries). */
  private readonly entityComponents = new Map<EntityId, Set<ComponentTypeKey>>();

  // -------------------------------------------------------------------------
  // Entities
  // -------------------------------------------------------------------------

  /** Create a new entity with no components. */
  createEntity(): EntityId {
    const id = this.nextId++;
    this.entities.add(id);
    this.entityComponents.set(id, new Set());
    return id;
  }

  /**
   * Destroy an entity and drop all of its components. Unknown ids are
   * ignored (idempotent) so double-destroy is safe.
   */
  destroyEntity(entityId: EntityId): void {
    const comps = this.entityComponents.get(entityId);
    if (!comps) return;
    for (const type of comps) {
      this.stores.get(type)?.delete(entityId);
    }
    this.entityComponents.delete(entityId);
    this.entities.delete(entityId);
  }

  /** Whether the entity exists (not destroyed). */
  isAlive(entityId: EntityId): boolean {
    return this.entities.has(entityId);
  }

  /** Number of live entities. */
  get entityCount(): number {
    return this.entities.size;
  }

  // -------------------------------------------------------------------------
  // Components
  // -------------------------------------------------------------------------

  /**
   * Attach a component to an entity. Adding the same type twice
   * replaces the payload (documented last-wins semantics, matching the
   * spec's `Map.set` behavior).
   */
  addComponent<K extends ComponentTypeKey>(
    entityId: EntityId,
    type: K,
    data: ComponentMap[K],
  ): void {
    if (!this.entities.has(entityId)) {
      logger.warn(`World: addComponent on dead entity ${entityId} (${type})`);
      return;
    }
    let store = this.stores.get(type);
    if (!store) {
      store = new Map<EntityId, ComponentMap[K]>();
      this.stores.set(type, store);
    }
    store.set(entityId, data);
    this.entityComponents.get(entityId)?.add(type);
  }

  /** Read a component; `undefined` when absent. */
  getComponent<K extends ComponentTypeKey>(
    entityId: EntityId,
    type: K,
  ): ComponentMap[K] | undefined {
    return this.stores.get(type)?.get(entityId) as ComponentMap[K] | undefined;
  }

  /** Whether the entity carries the component type. */
  hasComponent(entityId: EntityId, type: ComponentTypeKey): boolean {
    return this.stores.get(type)?.has(entityId) ?? false;
  }

  /** Remove one component. No-op when absent. */
  removeComponent(entityId: EntityId, type: ComponentTypeKey): void {
    this.stores.get(type)?.delete(entityId);
    this.entityComponents.get(entityId)?.delete(type);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  /**
   * All entities carrying **every** listed component type. Iterates the
   * smallest store and filters membership — O(smallest × types). Order
   * is ascending entity id (stable for deterministic systems/tests).
   */
  query(...types: readonly ComponentTypeKey[]): EntityId[] {
    if (types.length === 0) {
      return [...this.entities].sort((a, b) => a - b);
    }
    let smallest = this.stores.get(types[0]);
    if (!smallest) return [];
    for (const type of types.slice(1)) {
      const store = this.stores.get(type);
      if (!store) return [];
      if (store.size < smallest.size) smallest = store;
    }
    /** Whether `id` carries every requested component type. */
    const hasAll = (id: EntityId): boolean => {
      for (const type of types) {
        if (!this.stores.get(type)?.has(id)) return false;
      }
      return true;
    };
    const result: EntityId[] = [];
    for (const id of smallest.keys()) {
      if (hasAll(id)) result.push(id);
    }
    return result.sort((a, b) => a - b);
  }

  /**
   * Direct access to one component store (e.g. for render iteration).
   * Read-only by convention — do not mutate the map.
   */
  getStore<K extends ComponentTypeKey>(type: K): ReadonlyMap<EntityId, ComponentMap[K]> {
    return (this.stores.get(type) ?? new Map()) as ReadonlyMap<EntityId, ComponentMap[K]>;
  }
}

export default World;

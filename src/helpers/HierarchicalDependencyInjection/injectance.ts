import type { LayerOption, Predicate, Role } from '../types';

import { Container } from './container';

/**
 * Registers a class as an injectable in the Container, keyed by role + key + predicate,
 * so it can later be resolved via Container.get / Container.factoryFromInjectable.
 * Returns the class unchanged.
 */
export const injectance = (constructor: any, options: LayerOption, role: Role) => {
  const key: string = options.key;
  const predicate: Predicate = options?.predicate ?? [];
  const name = constructor.prototype.constructor.name;

  Container.addInjectable({
    key,
    name,
    role,
    predicate,
    constructor,
  });

  return constructor;
};

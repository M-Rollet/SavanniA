/* eslint-disable @typescript-eslint/no-shadow */

import type { Injection, LayerOption, Predicate, Role } from '../types';

import { Container } from './container';

/**
 * Replaces a class constructor with a DI-aware wrapper.
 * On instantiation the wrapper reads the `@inject()` metadata stored by the parameter
 * decorators, resolves each dependency from the Container (searching the allowed `roles`
 * in order), then calls the original constructor with the resolved arguments prepended.
 *
 * Also registers the class as an injectable in the Container so it can itself be resolved
 * by other layers.
 */
export const injectance = (constructor: any, options: LayerOption, role: Role, roles: Role[]) => {
  ((constructor: any) => {
    const key: string = options.key;
    const predicate: Predicate = options?.predicate ?? [];
    const name = constructor.prototype.constructor.name;
    const maskConstructor: ObjectConstructor = constructor;
    Container.addInjectable({
      key,
      name,
      role,
      predicate,
      constructor: maskConstructor,
    });
  })(constructor);

  return class extends constructor {
    constructor(...args: any[]) {
      const injections = constructor.injections as Injection[];
      const injectedArgs: any[] =
        injections?.map(({ key, predicate = options?.predicate ?? [] }) => {
          const injectable = roles.reduce((acc: unknown, role: Role) => {
            if (!acc) {
              const store = Container.get(role, key, predicate);
              if (store) {
                return store;
              }
            }

            return acc;
          }, undefined);

          if (injectable) {
            return injectable;
          }
          console.error(`injection ${key} not exist with predicate ${predicate?.join(',')}`);
          return [];
        }) ?? [];
      super(...injectedArgs, ...args);
    }
  };
};

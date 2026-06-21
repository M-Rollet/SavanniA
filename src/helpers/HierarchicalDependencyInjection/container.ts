import type { Injectable, Injectables, InjectedInstance, Instantiated, Predicate, Role } from '../types';
import { samePredicate } from '../utils';

export class Container {
  static instantiated: Instantiated = {
    BOUNDED_CONTEXT: new Map(),
    SERVICE: new Map(),
    STORE: new Map(),
    ACTOR: new Map(),
  };

  static injectables: Injectables = {
    BOUNDED_CONTEXT: new Map(),
    SERVICE: new Map(),
    STORE: new Map(),
    ACTOR: new Map(),
  };

  /** Returns the map of all currently instantiated singletons, keyed by role. */
  static instantiatedSingleton = () => {
    return this.instantiated;
  };

  /** Returns the map of all registered injectable constructors, keyed by role. */
  static instantiates = () => {
    return this.injectables;
  };

  /** Registers an injectable constructor so it can later be resolved by role + key + predicate. */
  static addInjectable = (injectable: Injectable) => {
    const role = injectable.role;
    const key = injectable.key;

    if (!Container.injectables[role].get(key)) {
      Container.injectables[role].set(key, []);
    }

    Container.injectables[role].get(key)?.push(injectable);
  };

  /**
   * Creates a fresh (non-singleton) instance of a registered injectable.
   * Throws if no matching injectable is found.
   */
  static factoryFromInjectable = <T>(role: Role, key: string, predicate: Predicate, args?: Object): T | undefined => {
    const injectable = Container.injectables[role].get(key)?.find(i => samePredicate(i.predicate, predicate));

    if (!injectable) {
      console.error(`No injectable found for ${role} ${key} with predicate ${predicate} because it is not registered`);

      throw new Error(
        `No injectable found for ${role} ${key} with predicate ${predicate} because it is not registered`
      );
    }

    const newObject = new injectable.constructor(args);
    const newObjectCasted: T = newObject as T;
    return newObjectCasted;
  };

  /**
   * Instantiates an injectable and stores it as a singleton.
   * If an instance with the same predicate already exists, returns the cached one.
   */
  static instantiateInjectable = (injectable: Injectable, args?: Object) => {
    try {
      const { role, key } = injectable;
      const instances = Container.instantiated[role].get(key);
      const alreadyExists = instances?.find(({ predicate = [] }) => samePredicate(predicate, injectable.predicate));

      if (alreadyExists) {
        return alreadyExists.instance;
      }

      if (!instances) {
        const injectableInstance: InjectedInstance = {
          predicate: injectable.predicate,
          instance: new injectable.constructor(args),
        };

        Container.instantiated[role].set(key, [injectableInstance]);
        return injectableInstance.instance;
      }

      const injectableInstance: InjectedInstance = {
        predicate: injectable.predicate,
        instance: new injectable.constructor(args),
      };

      Container.instantiated[role].get(key)?.push(injectableInstance);
      return injectableInstance.instance;
    } catch (err: unknown) {
      throw new Error(`Error instantiating a ${injectable.role} object of ${injectable.key}: ${JSON.stringify(err)}`);
    }
  };

  /**
   * Retrieves (or lazily creates) a singleton instance matching role + key + predicate.
   * Returns undefined if no matching injectable is registered.
   */
  static get = (role: Role, key: string, arbitraryPredicate: Predicate = [], args?: Object): any => {
    try {
      const instances = Container.instantiated[role].get(key);
      const alreadyExists = instances?.find(({ predicate = [] }) => samePredicate(predicate, arbitraryPredicate));

      if (alreadyExists) {
        return alreadyExists.instance;
      }

      const injectable: Injectable | undefined = Container.injectables[role]
        .get(key)
        ?.find(({ predicate = [] }) => samePredicate(predicate, arbitraryPredicate));

      if (injectable) {
        return Container.instantiateInjectable(injectable, args);
      }

      return undefined;
    } catch (err) {
      throw new Error(`${err}`);
    }
  };
}

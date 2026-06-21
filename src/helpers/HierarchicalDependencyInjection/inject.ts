import type { Inject, Injection } from '../types';

/**
 * Parameter decorator that marks a constructor argument for dependency injection.
 * Stores injection metadata (key + predicate) on the class so `injectance` can
 * resolve the dependency from the Container at instantiation time.
 */
export const inject = ({ key, predicate }: Inject) => {
  return (target: any, _propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const injection: Injection = {
      index: parameterIndex,
      key,
      predicate,
    };
    const existingInjections: Injection[] = target.injections || [];
    // Accumulates all @inject()-annotated parameters under target.injections.
    Object.defineProperty(target, 'injections', {
      enumerable: false,
      configurable: true,
      writable: false,
      value: [...existingInjections, injection],
    });
  };
};

import type { LayerOption, Role } from '../types';

import { injectance } from './injectance';

/** Marks a class as an Actor — the outermost layer. Can only inject BOUNDED_CONTEXT dependencies. */
export const Actor = (options: LayerOption) => {
  const role: Role = 'ACTOR';
  const roles: Role[] = ['BOUNDED_CONTEXT'];
  return <T extends { new (...args: any[]): {} }>(constructor: T): T | void | any =>
    injectance(constructor, options, role, roles);
};

/** Marks a class as a BoundedContext — the business-logic layer. Can inject SERVICE and STORE. */
export const BoundedContext = (options: LayerOption) => {
  const role: Role = 'BOUNDED_CONTEXT';
  const roles: Role[] = ['SERVICE', 'STORE'];
  return <T extends { new (...args: any[]): {} }>(constructor: T): T | void | any =>
    injectance(constructor, options, role, roles);
};

/** Marks a class as a Service — infrastructure/communication layer. Can inject SERVICE and STORE. */
export const Service = (options: LayerOption) => {
  const role: Role = 'SERVICE';
  const roles: Role[] = ['SERVICE', 'STORE'];
  return <T extends { new (...args: any[]): {} }>(constructor: T): T | void | any =>
    injectance(constructor, options, role, roles);
};

/** Marks a class as a Store — data/state layer. Can only inject other STOREs. */
export const Store = (options: LayerOption) => {
  const role: Role = 'STORE';
  const roles: Role[] = ['STORE'];
  return <T extends { new (...args: any[]): {} }>(constructor: T): T | void | any =>
    injectance(constructor, options, role, roles);
};

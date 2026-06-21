import { Container } from '../../helpers';
import { Activity } from './Model/activity';
import { Users, UsersType } from './Model/users.model';

type ThymioManagerFactoryParams = {
  user: UsersType;
  activity: Activity;
  hosts: string[];
};

type ThymioManagerFactory = (params: ThymioManagerFactoryParams) => Users;

/**
 * Entry point for the ThymioManager DI graph.
 * Resolves and wires the full Actor → BoundedContext → Service → Store chain
 * for the requested user role, activity, and TDM hosts, then returns a Users handle.
 */
export const thymioManagerFactory: ThymioManagerFactory = ({ user, activity, hosts }) => {
  const actor = Container.factoryFromInjectable<Users>('ACTOR', 'User', [user], { activity, hosts });

  if (!actor) {
    throw new Error('ACTOR:User not found');
  }

  return actor;
};

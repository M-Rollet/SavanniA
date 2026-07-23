import { Actor, Container } from '../../../helpers';
import { Activity } from '../Model';
import type IThymioIA from '../Model/thymioIA.model';
import type { Users } from '../Model/users.model';
import type { ThymioStatus } from '../Model/thymio.model';

@Actor({ key: 'User', predicate: ['AllUser'] })
export class AllUser implements Users {
  getRobotsUuids: () => Promise<string[]>;
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: Users['takeControl'];
  setVariables: Users['setVariables'];
  emitEvent: Users['emitEvent'];
  identify: Users['identify'];
  release: Users['release'];

  constructor({ activity, hosts }: { activity: Activity; hosts: string[] }) {
    const thymioIA = Container.factoryFromInjectable<IThymioIA>('BOUNDED_CONTEXT', 'ThymioIA', [], { activity, hosts });
    if (!thymioIA) {
      throw new Error('BOUNDED_CONTEXT:ThymioIA not found');
    }

    this.getRobotsUuids = thymioIA.getRobotsUuids;
    this.getRobotStatus = thymioIA.getRobotStatus;
    this.takeControl = thymioIA.takeControl;
    this.setVariables = thymioIA.setVariables;
    this.emitEvent = thymioIA.emitEvent;
    this.identify = thymioIA.identify;
    this.release = thymioIA.release;
  }
}

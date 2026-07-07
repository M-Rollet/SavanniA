import { BoundedContext, Container } from '../../../helpers';
import { Activity, TdmController } from '../Model';
import type IThymioIA from '../Model/thymioIA.model';

@BoundedContext({ key: 'ThymioIA', predicate: [] })
export class ThymioIA implements IThymioIA {
  private tdmController: TdmController;

  constructor({ hosts }: { activity: Activity; hosts: string[] }) {
    const tdmController = Container.factoryFromInjectable<TdmController>('SERVICE', 'HostController', ['thymio2'], {
      hosts,
    });
    if (!tdmController) {
      throw new Error('SERVICE:HostController not found');
    }
    this.tdmController = tdmController;
  }

  getRobotsUuids = async () => this.tdmController.getRobotsUuids();
  getRobotStatus = (uuid: string) => this.tdmController.getRobotStatus(uuid);

  takeControl = async (
    uuid: string,
    onEvent: (uuid: string, events: { [name: string]: number }) => void = () => {}
  ): Promise<void> => {
    return this.tdmController.takeControl(uuid, onEvent);
  };

  setVariables = (uuid: string, vars: Map<string, number[]>) => this.tdmController.setVariables(uuid, vars);

  emitEvent = (uuid: string, eventName: string) => this.tdmController.emitEvent(uuid, eventName);

  identify = (uuid: string) => this.tdmController.identify(uuid);
}

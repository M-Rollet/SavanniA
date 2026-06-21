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

  /**
   * Locks and initialises a robot, then subscribes to its variable-change events.
   * The optional callback receives the UUID and a map of changed variable names → values.
   */
  takeControl = async (
    uuid: string,
    onVariableChange: (uuid: string, variables: { [name: string]: number }) => void = () => {}
  ): Promise<void> => {
    return this.tdmController.takeControl(uuid, onVariableChange);
  };

  setVariables = (uuid: string, vars: Map<string, number[]>) => this.tdmController.setVariables(uuid, vars);

  identify = (uuid: string) => this.tdmController.identify(uuid);
}

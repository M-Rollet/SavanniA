import { Service, Container, Observable, createObservable } from '../../../helpers';
import { TdmController, TdmClient } from '../Model';

/**
 * Top-level TDM controller that aggregates one ClientDeviceManager per host.
 * Implements TdmController by routing each call to the client that owns the target UUID.
 */
@Service({ key: 'HostController', predicate: ['thymio2'] })
export class Thymio2DeviceManager implements TdmController {
  private hosts: string[] = [];

  readonly clients: Observable<{ [host: string]: TdmClient }> = createObservable({
    key: 'Thymios',
    initialValue: {},
  });

  constructor({ hosts }: { hosts: string[] }) {
    this.init(hosts);
  }

  private init = async (hosts: string[]) => {
    await this.setClients(hosts);
  };

  /** Returns UUIDs of all usable robots across every connected host. */
  getRobotsUuids = async () => {
    const robotsUuidsInAllHost = await Promise.all(
      this.hosts.map(host => new Promise<string[]>(resolve => resolve(this.getRobotsByHost(host))))
    );
    return robotsUuidsInAllHost.reduce((acc, val) => acc.concat(val), []);
  };

  getRobotsByHost = (host: string) => this.clients.state[host].getThymioList();

  /** Finds the client that currently holds the given UUID. */
  getRobotByUuid = (uuid: string) =>
    Object.values(this.clients.state).find(client => client.getThymioList().includes(uuid));

  getRobotStatus = (uuid: string) => this.getRobotByUuid(uuid)?.getRobotStatus(uuid) ?? null;

  takeControl = async (
    uuid: string,
    onEvent: (uuid: string, events: { [name: string]: number }) => void
  ): Promise<void> => {
    const client = this.getRobotByUuid(uuid);
    if (client) {
      await client.takeControl(uuid, onEvent);
    }
  };

  setVariables = async (uuid: string, vars: Map<string, number[]>) => {
    const client = this.getRobotByUuid(uuid);
    if (client) {
      await client.setVariables(uuid, vars);
    }
  };

  emitEvent = async (uuid: string, eventName: string) => {
    const client = this.getRobotByUuid(uuid);
    if (client) {
      await client.emitEvent(uuid, eventName);
    }
  };

  identify = async (uuid: string) => {
    const client = this.getRobotByUuid(uuid);
    if (client) {
      await client.identify(uuid);
    }
  };

  /**
   * Creates a ClientDeviceManager for each host, connects it to TDM,
   * and stores it in the `clients` observable.
   */
  setClients = async (hosts: string[]) =>
    new Promise((resolve, reject) => {
      try {
        this.hosts = hosts;

        this.hosts.forEach(host => {
          const client = Container.factoryFromInjectable<TdmClient>('SERVICE', 'ClientDeviceManager', ['thymio2'], {
            host,
          });

          if (client) {
            client.connectToTDM();
            this.clients.set({ ...this.clients.state, [host]: client });
          }
        });

        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
}

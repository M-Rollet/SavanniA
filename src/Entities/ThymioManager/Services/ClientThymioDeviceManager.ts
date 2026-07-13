import { createClient, INode } from '@mobsya-association/thymio-api';
import { Service, Container, Observable, createObservable } from '../../../helpers';
import { TdmClient, Thymio } from '../Model';
import { tdmConnectionEvents } from '../tdmConnectionEvents';

/**
 * Manages the WebSocket connection to a single TDM host.
 * Maintains a live nodeList of usable Thymio instances and routes
 * control commands (lock, program, events, variables) to the correct node.
 */
@Service({ key: 'ClientDeviceManager', predicate: ['thymio2'] })
export class ClientDeviceManager implements TdmClient {
  private readonly host: string = '';

  readonly nodeList: Observable<{ [uuid: string]: Thymio }> = createObservable({
    key: 'ThymioList',
    initialValue: {},
  });

  constructor({ host }: { host: string }) {
    this.host = host;
  }

  private readonly USABLE_STATUSES = ['available', 'busy', 'ready'];

  /**
   * Merges a delta of changed nodes into the live nodeList.
   * Disconnected nodes are removed; nodes in an unusable status are ignored;
   * existing instances are preserved to avoid breaking in-progress waitForReady() calls.
   */
  private setRobot = (nodes: { nodeId: string; node: INode }[]) => {
    const current = { ...this.nodeList.state };

    nodes.forEach(({ nodeId, node }) => {
      const status = node.statusAsString;

      if (status === 'disconnected') {
        delete current[nodeId];
        return;
      }

      if (!this.USABLE_STATUSES.includes(status)) {
        return;
      }

      // Don't replace an existing instance — recreating would overwrite node.onEvents
      // and break any in-progress waitForReady() on the old instance.
      if (current[nodeId]) {
        return;
      }

      const thymio = Container.factoryFromInjectable<Thymio>('STORE', 'Thymio Store', ['thymio2', 'eventVariable'], {
        uuid: nodeId,
        node,
      });
      if (thymio) {
        current[nodeId] = thymio;
      }
    });

    // Merge delta — onNodesChanged delivers only changed nodes, not the full list.
    this.nodeList.set(current);
  };

  /** Locks and initialises the robot, then subscribes to its robot events (e.g. seq_done). */
  takeControl = async (uuid: string, onEvent: (uuid: string, events: { [name: string]: number }) => void) => {
    const thymio = this.nodeList.state[uuid];
    if (thymio) {
      // Register the callback before initializing so seq_done events are forwarded
      // even if initialize() times out (ready never arrives).
      thymio.onEvent(events => onEvent(uuid, events));
      await thymio.initialize();
    }
  };

  setVariables = async (uuid: string, vars: Map<string, number[]>) => {
    const thymio = this.nodeList.state[uuid];
    if (thymio) {
      await thymio.setVariables(vars);
    }
  };

  emitEvent = async (uuid: string, eventName: string) => {
    const thymio = this.nodeList.state[uuid];
    if (thymio) {
      await thymio.emitEvent(eventName);
    }
  };

  identify = async (uuid: string) => {
    const thymio = this.nodeList.state[uuid];
    if (thymio) {
      await thymio.identify();
    }
  };

  release = async (uuid: string) => {
    const thymio = this.nodeList.state[uuid];
    if (thymio) {
      await thymio.release();
    }
  };

  getRobotStatus = (uuid: string) => this.nodeList.state[uuid]?.status ?? null;

  getThymioList = () =>
    Object.values(this.nodeList.state)
      .filter(thymio => this.USABLE_STATUSES.includes(thymio.status))
      .map(thymio => thymio.uuid);

  /**
   * Opens a WebSocket connection to TDM at `ws://<host>:8597`.
   * Auto-reconnects on close or initial connection failure.
   */
  connectToTDM = () => {
    let connected = false;

    const connect = () => {
      try {
        const client = createClient(`ws://${this.host}:8597`);

        client.onNodesChanged = (nodes: INode[]) => {
          if (!connected) {
            connected = true;
            tdmConnectionEvents.emit(true);
          }
          const catchNodes = nodes.map((node: INode) => {
            const nodeId = node.id.toString().replace(/[^a-zA-Z0-9 -]/g, '');
            return { nodeId, node };
          });
          this.setRobot(catchNodes);
        };

        // When TDM closes (e.g. Thymio Suite restarts), clear the node list and reconnect.
        client.onClose = () => {
          connected = false;
          this.nodeList.set({});
          tdmConnectionEvents.emit(false);
          setTimeout(connect, 2000);
        };
      } catch {
        tdmConnectionEvents.emit(false);
        setTimeout(connect, 2000);
      }
    };

    connect();
  };
}

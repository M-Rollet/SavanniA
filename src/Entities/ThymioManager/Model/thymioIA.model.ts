import type { ThymioStatus } from './thymio.model';

interface IThymioIA {
  getRobotsUuids: () => Promise<string[]>;
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (uuid: string, onEvent?: (uuid: string, events: { [name: string]: number }) => void) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  emitEvent: (uuid: string, eventName: string) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
  release: (uuid: string) => Promise<void>;
}

export default IThymioIA;

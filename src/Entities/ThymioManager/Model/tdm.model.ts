import type { ThymioStatus } from './thymio.model';

export interface TdmController {
  getRobotsUuids: () => Promise<string[]>;
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (
    uuid: string,
    onEvent: (uuid: string, events: { [name: string]: number }) => void
  ) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  emitEvent: (uuid: string, eventName: string) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
}

export interface TdmClient {
  connectToTDM: () => void;
  getThymioList: () => string[];
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (
    uuid: string,
    onEvent: (uuid: string, events: { [name: string]: number }) => void
  ) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  emitEvent: (uuid: string, eventName: string) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
}

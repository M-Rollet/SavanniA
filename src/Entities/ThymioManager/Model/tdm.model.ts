import type { ThymioStatus } from './thymio.model';

export interface TdmController {
  getRobotsUuids: () => Promise<string[]>;
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (
    uuid: string,
    onVariableChange: (uuid: string, variables: { [name: string]: number }) => void
  ) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
}

export interface TdmClient {
  connectToTDM: () => void;
  getThymioList: () => string[];
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (
    uuid: string,
    onVariableChange: (uuid: string, variables: { [name: string]: number }) => void
  ) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
}

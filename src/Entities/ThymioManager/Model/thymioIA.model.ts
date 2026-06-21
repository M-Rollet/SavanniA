import type { ThymioStatus } from './thymio.model';

interface IThymioIA {
  getRobotsUuids: () => Promise<string[]>;
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (
    uuid: string,
    onVariableChange?: (uuid: string, variables: { [name: string]: number }) => void
  ) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
}

export default IThymioIA;

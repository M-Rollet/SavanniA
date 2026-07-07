import type { ThymioStatus } from './thymio.model';

export type UsersType = 'AllUser' | 'Teacher' | 'Student' | 'Admin' | 'Dev';

export interface Users {
  getRobotsUuids: () => Promise<string[]>;
  getRobotStatus: (uuid: string) => ThymioStatus | null;
  takeControl: (
    uuid: string,
    onEvent?: (uuid: string, events: { [name: string]: number }) => void
  ) => Promise<void>;
  setVariables: (uuid: string, vars: Map<string, number[]>) => Promise<void>;
  emitEvent: (uuid: string, eventName: string) => Promise<void>;
  identify: (uuid: string) => Promise<void>;
}

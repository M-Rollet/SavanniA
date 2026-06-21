export type ThymioType = 'thymio2' | 'thymio3' | 'thymioExtension';

export type ThymioStatus = 'unknown' | 'connected' | 'available' | 'busy' | 'ready' | 'disconnected';

/**
 * @interfaces
 */

export type ThymioNode = {
  uuid: string;
  name: string;
  type: ThymioType;
  status: ThymioStatus;
};

export interface Thymio {
  uuid: string;
  name: string;
  type: ThymioType;
  status: ThymioStatus;
  initialize: () => Promise<void>;
  onStatusChanged: (callback: (robot: Robot) => void) => void;
  onVariableChange: (callback: (variables: { [name: string]: number }) => void) => void;
  setVariables: (vars: Map<string, number[]>) => Promise<void>;
  identify: () => Promise<void>;
}

export interface Robot {
  uuid: string;
  name: string;
  type: ThymioType;
  status: ThymioStatus;
}

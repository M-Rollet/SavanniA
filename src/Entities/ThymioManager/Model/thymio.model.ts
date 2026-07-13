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
  onEvent: (callback: (events: { [name: string]: number }) => void) => void;
  setVariables: (vars: Map<string, number[]>) => Promise<void>;
  emitEvent: (eventName: string) => Promise<void>;
  identify: () => Promise<void>;
  /** Releases the lock taken by `initialize()`, so another `takeControl()` (e.g. after an
   * in-app reset, without a full page reload) can re-acquire it — TDM otherwise reports this
   * node as locked/busy forever, since the underlying connection is a page-lifetime singleton
   * that's never itself closed by an in-app reset. */
  release: () => Promise<void>;
}

export interface Robot {
  uuid: string;
  name: string;
  type: ThymioType;
  status: ThymioStatus;
}

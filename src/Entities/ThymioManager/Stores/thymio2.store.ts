import type { Events, INode } from '@mobsya-association/thymio-api';
import { Store } from '../../../helpers';
import { ThymioStatus, Thymio, ThymioType, Robot } from '../Model';
import { mobsya } from '@mobsya-association/thymio-api/dist/thymio_generated';
import { asebaScript, eventsDefinition } from './aesl.resource';

const RETRY_TIMEOUT_MS = 300;
const MAX_RETRIES = 3;

// Mirror of the AESL SEQ_* constants (initialised at robot startup).
const SEQ_NULL = 0;
const SEQ_TEST_NOISE = 1;
const SEQ_TEST_LIGHT_WORKING = 2;
const SEQ_TEST_LIGHT_FAILING = 3;
const SEQ_TEST_IR = 4;
const SEQ_TEST_BATTERY = 5;
const SEQ_MOVE = 7;

type StatusSnapshot = { light: number; seqType: number; fieldMode: number };

// Maps each event name to a predicate that, once true in the status stream,
// confirms the robot processed the command. Events without an entry are sent
// fire-and-forget (no retry).
const EVENT_CONFIRMATIONS: Partial<Record<string, (s: StatusSnapshot) => boolean>> = {
  light_on: s => s.light > 0,
  light_off: s => s.light === 0,
  go_forward: s => s.seqType === SEQ_MOVE,
  go_backward: s => s.seqType === SEQ_MOVE,
  test_sound: s => s.seqType === SEQ_TEST_NOISE,
  test_light: s => s.seqType === SEQ_TEST_LIGHT_WORKING || s.seqType === SEQ_TEST_LIGHT_FAILING,
  test_ir: s => s.seqType === SEQ_TEST_IR,
  test_battery: s => s.seqType === SEQ_TEST_BATTERY,
  set_mode_on: s => s.fieldMode === 1,
  set_mode_off: s => s.fieldMode === 0,
};

@Store({ key: 'Thymio Store', predicate: ['thymio2', 'eventVariable'] })
export class Thymio2EventVariable implements Thymio {
  prox_horizontal = [0, 0, 0, 0, 0, 0, 0];
  prox_ground_delta = [0, 0];
  motor_left_speed = 0;
  motor_right_speed = 0;
  mic_norm = 0;

  uuid: string;
  type: ThymioType = 'thymio2';
  name: string;
  status: ThymioStatus = 'unknown';
  node: INode;

  statusCallback: (robot: Robot) => void = () => {};
  eventCallback: (vars: { [name: string]: number }) => void = () => {};

  private readyResolver: (() => void) | null = null;
  private StatusSnapshot: StatusSnapshot = { light: 0, seqType: SEQ_NULL, fieldMode: 0 };
  private pendingAck: { predicate: (s: StatusSnapshot) => boolean; resolve: (confirmed: boolean) => void } | null =
    null;

  constructor({ uuid, node }: { uuid: string; node: INode }) {
    this.uuid = uuid;
    this.name = node.name;
    this.node = node;
    this.status = mobsya.fb.NodeStatus[node.status] as ThymioStatus;
    node.onStatusChanged = this.onInternalStatusChanged;
    node.onEvents = this.onEventReceived;
  }

  /**
   * Locks the node, uploads the Aseba program, runs it, and awaits the 'ready' event.
   * Must be called before setVariables will work.
   */
  initialize = async () => {
    console.log('[Thymio] locking', this.uuid);
    await this.node.lock();
    // Re-subscribe after lock: locking a node resets TDM-side event monitoring.
    this.node.onEvents = this.onEventReceived;
    // Set up the resolver immediately — before any async round-trips — so that
    // a 'ready' emitted during sendAsebaProgram (some TDM builds auto-run) is
    // not missed.
    const readyPromise = this.waitForReady();
    try {
      console.log('[Thymio] registering events', this.uuid);
      await this.node.setEventsDescriptions(eventsDefinition);
      console.log('[Thymio] sending Aseba program', this.uuid);
      await this.node.sendAsebaProgram(asebaScript, false);
      console.log('[Thymio] running program', this.uuid);
      await this.node.runProgram();
      console.log('[Thymio] waiting for ready event...', this.uuid);
      await readyPromise;
      console.log('[Thymio] ready!', this.uuid);
    } catch (err) {
      this.readyResolver = null;
      await this.node.unlock().catch(() => {});
      throw err;
    }
  };

  onStatusChanged = (callback: (robot: Robot) => void) => {
    this.statusCallback = callback;
  };

  onEvent = (callback: (events: { [name: string]: number }) => void) => {
    this.eventCallback = callback;
  };

  /**
   * Emits an event to the robot. For events with a defined confirmation predicate,
   * waits for the status stream to confirm the command was applied, retrying up to
   * MAX_RETRIES times before throwing. Events without a predicate are fire-and-forget.
   */
  emitEvent = async (eventName: string): Promise<void> => {
    if (!this.node) {
      return;
    }

    const predicate = EVENT_CONFIRMATIONS[eventName];

    if (!predicate) {
      try {
        await this.node.emitEvents(eventName);
      } catch (error) {
        console.error('[Thymio] emitEvent error:', error);
      }
      return;
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        await this.node.emitEvents(eventName);
      } catch (error) {
        console.error(`[Thymio] emitEvent ${eventName} error:`, error);
      }

      const confirmed = await new Promise<boolean>(resolve => {
        this.pendingAck = { predicate, resolve };
        setTimeout(() => resolve(false), RETRY_TIMEOUT_MS);
      });
      this.pendingAck = null;

      if (confirmed) {
        return;
      }
      if (attempt < MAX_RETRIES) {
        console.warn(`[Thymio] ${eventName}: no confirmation, retry ${attempt + 1}/${MAX_RETRIES}`);
      }
    }

    throw new Error(`[Thymio] ${eventName}: no confirmation after ${MAX_RETRIES} retries`);
  };

  setVariables = async (vars: Map<string, number[]>) => {
    if (!this.node) {
      return;
    }
    try {
      await this.node.setVariables(vars as Map<string, any>);
    } catch (error) {
      console.error('[Thymio] setVariables error:', error);
    }
  };

  /**
   * Releases the lock taken by `initialize()`, so a later `takeControl()` on this same node
   * (this store instance is never recreated — see ClientDeviceManager.setRobot) can re-acquire
   * it. Safe to call regardless of current lock state.
   */
  release = async () => {
    if (!this.node) {
      return;
    }
    this.readyResolver = null;
    await this.node.unlock().catch(() => {});
  };

  /**
   * Flashes the robot's top LED to identify it physically.
   * If already initialised ('ready'), uses the Aseba identify sequence (≈2 s).
   * If not yet initialised ('available'), uploads a one-shot flash program, waits, then unlocks.
   */
  identify = async () => {
    if (!this.node) {
      return;
    }
    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    if (this.status === 'ready') {
      try {
        await this.emitEvent('identify');
      } catch (error) {
        console.error('[Thymio] identify error:', error);
      }
    } else if (this.status === 'available') {
      // Robot not yet initialised: lock, upload a one-shot flash program, wait, unlock.
      const flashScript = `
        var count
        var on
        count = 0
        on = 0
        timer.period[0] = 400
        onevent timer0
          if on == 0 then
              call leds.top(32, 32, 32)
              on = 1
          else
              call leds.top(0, 0, 0)
              on = 0
          end
          count += 1
          if count >= 6 then
              call leds.top(0, 0, 0)
              timer.period[0] = 0
          end
      `;
      try {
        await this.node.lock();
        await this.node.setEventsDescriptions([]);
        await this.node.sendAsebaProgram(flashScript, false);
        await this.node.runProgram();
        await delay(2500);
      } catch (error) {
        console.error('[Thymio] identify (pre-init) error:', error);
      } finally {
        await this.node.unlock().catch(() => {});
      }
    }
  };

  private onInternalStatusChanged = (newStatus: number) => {
    this.status = mobsya.fb.NodeStatus[newStatus] as ThymioStatus;
    this.statusCallback({ uuid: this.uuid, name: this.name, type: this.type, status: this.status });
  };

  /** Returns a promise that resolves when the robot emits the 'ready' event, or rejects on timeout. */
  private waitForReady = (timeoutMs = 5000): Promise<void> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.readyResolver = null;
        reject(new Error('Timeout waiting for ready event'));
      }, timeoutMs);

      this.readyResolver = () => {
        clearTimeout(timeout);
        this.readyResolver = null;
        resolve();
      };
    });

  /** Dispatches incoming TDM events to the appropriate handler. */
  private onEventReceived = (events: Events) => {
    if (!events) {
      return;
    }
    events.forEach((value, evt) => {
      switch (evt) {
        case 'ready':
          console.log('[Thymio] ready event received');
          this.readyResolver?.();
          break;
        case 'seq_done':
          this.eventCallback({ seq_done: (value as number[])[0] ?? 0 });
          break;
        case 'status': {
          const arr = (value as number[]) ?? [];
          this.StatusSnapshot = { light: arr[8] ?? 0, seqType: arr[7] ?? 0, fieldMode: arr[9] ?? 0 };
          if (this.pendingAck?.predicate(this.StatusSnapshot)) {
            this.pendingAck.resolve(true);
          }
          this.eventCallback({
            status_battery: arr[0] ?? 0,
            status_mic: arr[1] ?? 0,
            status_prox_0: arr[2] ?? 0,
            status_prox_1: arr[3] ?? 0,
            status_prox_2: arr[4] ?? 0,
            status_prox_3: arr[5] ?? 0,
            status_prox_4: arr[6] ?? 0,
            status_seq_type: arr[7] ?? 0,
            status_light: arr[8] ?? 0,
            status_field_mode: arr[9] ?? 0,
          });
          break;
        }
      }
    });
  };
}

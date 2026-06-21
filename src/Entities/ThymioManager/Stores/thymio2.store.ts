import type { Events, INode } from '@mobsya-association/thymio-api';
import { Store } from '../../../helpers';
import { ThymioStatus, Thymio, ThymioType, Robot } from '../Model';
import { mobsya } from '@mobsya-association/thymio-api/dist/thymio_generated';
import { asebaScript, eventsDefinition } from './aesl.resource';

/**
 * Thymio2 store that maps raw TDM node events to normalised sensor state.
 * All sensor values are normalised to 0–100 (horiz/ground proximity, motors)
 * or 0/1 (mic) by the Aseba program before being emitted as events.
 */
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
    console.log('[Thymio] registering events', this.uuid);
    await this.node.setEventsDescriptions(eventsDefinition);
    console.log('[Thymio] sending Aseba program', this.uuid);
    await this.node.sendAsebaProgram(asebaScript, false);
    // Create the ready promise BEFORE runProgram so the resolver is set
    // before the startup emit fires on the robot.
    const readyPromise = this.waitForReady();
    console.log('[Thymio] running program', this.uuid);
    await this.node.runProgram();
    console.log('[Thymio] waiting for ready event...', this.uuid);
    await readyPromise;
    console.log('[Thymio] ready!', this.uuid);
  };

  onStatusChanged = (callback: (robot: Robot) => void) => {
    this.statusCallback = callback;
  };

  onVariableChange = (callback: (variables: { [name: string]: number }) => void) => {
    this.eventCallback = callback;
  };

  setVariables = async (vars: Map<string, number[]>) => {
    if (!this.node) {
      return;
    }
    console.log('[Thymio] setVariables', Object.fromEntries(vars));
    try {
      await this.node.setVariables(vars as Map<string, any>);
    } catch (error) {
      console.error('[Thymio] setVariables error:', error);
    }
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
      // Single call: Aseba drives the full 3-flash sequence autonomously.
      // identify_tick reset ensures a clean start if called while a previous
      // flash is still running.
      try {
        await this.setVariables(
          new Map([
            ['identify', [1]],
            ['identify_tick', [0]],
          ])
        );
        await delay(2100); // 41 ticks × 50 ms ≈ 2050 ms — keep spinner visible
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
        case 'Prox':
          this.handleProxEvent(value as number[]);
          break;
        case 'SeqDone':
          this.eventCallback({ seq_done: (value as number[])[0] ?? 0 });
          break;
        case 'B_center':
        case 'B_forward':
        case 'B_backward':
        case 'B_left':
        case 'B_right':
          this.handleButtonEvent(evt, value as number[]);
          break;
      }
    });
  };

  /**
   * Unpacks the Prox event payload and fires eventCallback only for values that changed.
   * Payload order: [front×5, back×2, ground×2, motor_left, motor_right, mic] — all normalised by AESL.
   */
  private handleProxEvent = (value: number[]) => {
    const [p0, p1, p2, p3, p4, p5, p6, g0, g1, ml, mr, mic] = value;
    const changed: Record<string, number> = {};

    const front = [p0, p1, p2, p3, p4];
    const back = [p5, p6];

    front.forEach((v, i) => {
      if (this.prox_horizontal[i] !== v) {
        changed[`prox_front_${i}`] = v;
      }
    });
    back.forEach((v, i) => {
      if (this.prox_horizontal[5 + i] !== v) {
        changed[`prox_back_${i}`] = v;
      }
    });
    this.prox_horizontal = [p0, p1, p2, p3, p4, p5, p6];

    if (this.prox_ground_delta[0] !== g0) {
      changed.prox_ground_0 = g0;
    }
    if (this.prox_ground_delta[1] !== g1) {
      changed.prox_ground_1 = g1;
    }
    this.prox_ground_delta = [g0, g1];

    if (this.motor_left_speed !== ml) {
      changed.motor_left_speed = ml ?? 0;
    }
    if (this.motor_right_speed !== mr) {
      changed.motor_right_speed = mr ?? 0;
    }
    this.motor_left_speed = ml ?? 0;
    this.motor_right_speed = mr ?? 0;

    if (this.mic_norm !== mic) {
      changed.mic_norm = mic ?? 0;
    }
    this.mic_norm = mic ?? 0;

    if (Object.keys(changed).length > 0) {
      this.eventCallback(changed);
    }
  };

  // value = [0|1]  (0 = released, 1 = pressed)
  private handleButtonEvent = (evt: string, value: number[]) => {
    const keyMap: Record<string, string> = {
      B_center: 'button_center',
      B_forward: 'button_forward',
      B_backward: 'button_backward',
      B_left: 'button_left',
      B_right: 'button_right',
    };
    const field = keyMap[evt];
    if (field) {
      this.eventCallback({ [field]: value[0] ?? 0 });
    }
  };
}

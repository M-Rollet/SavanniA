export type ColorConfig = {
  light_working: 0 | 1;
  ir_working: 0 | 1;
  motor_noise: 0 | 1;
  /** 0 = low, 1 = mid, 2 = full */
  battery_level: 0 | 1 | 2;
};

export type Profile = {
  priority: number;
  role: string;
  config: ColorConfig;
};

export const MIN_ROBOTS = 3;
export const MAX_ROBOTS = 6; // === CORE_PROFILES.length

// Priority order: success anchor + the two discoveries first, then the minimal-
// pair completer, then the two rules already baked into the start tree.
export const CORE_PROFILES: Profile[] = [
  {
    priority: 1,
    role: 'Success anchor (best robot)',
    config: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 2 },
  },
  {
    priority: 2,
    role: 'Discovery: motor noise -> fails the slope',
    config: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 1 },
  },
  {
    priority: 3,
    role: 'Discovery: broken light -> crashes in the tunnel',
    config: { light_working: 0, ir_working: 1, motor_noise: 0, battery_level: 2 },
  },
  {
    priority: 4,
    role: '2nd success, completes the noise minimal pair (vs priority 2)',
    config: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  {
    priority: 5,
    role: 'Confirms the IR rule (already in the start tree)',
    config: { light_working: 1, ir_working: 0, motor_noise: 0, battery_level: 1 },
  },
  {
    priority: 6,
    role: 'Confirms the battery rule (already in the start tree)',
    config: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 0 },
  },
];

/** Maps a question ID to the event name emitted to the robot to trigger its test sequence. */
export const QUESTION_SEQ_TYPE: Partial<Record<string, string>> = {
  light_working: 'test_light',
  ir_working:    'test_ir',
  motor_noise:   'test_sound',
  battery_low:   'test_battery',
  battery_mid:   'test_battery',
  battery_full:  'test_battery',
};

/** Fallback timeout (ms) if seq_done event never arrives. */
export const SEQ_DURATION_MS: Record<string, number> = {
  test_sound:   5500,  // fwd 2 s + pause 250 ms + back 2 s
  test_light:   3000,  // working ~2 s, failing ~1.5 s
  test_ir:      8000,  // sweep ~7 s
  test_battery: 3000,  // 2 flashes × 5 ticks × 50 ms each
};

/** Pause before auto-answering questions with no physical test (battery). */
export const NO_SEQ_DELAY_MS = 1500;

/** Compute the expected answer to a question given the robot's config. */
export function getAnswerForQuestion(questionId: string, cfg: ColorConfig): 'yes' | 'no' {
  switch (questionId) {
    case 'light_working':
      return cfg.light_working === 1 ? 'yes' : 'no';
    case 'ir_working':
      return cfg.ir_working === 1 ? 'yes' : 'no';
    case 'motor_noise':
      return cfg.motor_noise === 1 ? 'yes' : 'no';
    case 'battery_low':
      return cfg.battery_level === 0 ? 'yes' : 'no';
    case 'battery_mid':
      return cfg.battery_level === 1 ? 'yes' : 'no';
    case 'battery_full':
      return cfg.battery_level === 2 ? 'yes' : 'no';
    default:
      return 'no';
  }
}

import { ALL_CRITERIA, categorizeConfig, type RobotEntry } from './steps/stepDefinitions';

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
  /** Ground truth (via categorizeConfig) — checked against step 3's terrain observation. */
  expectedCategory: 'ready' | 'repair';
};

export const MIN_ROBOTS = 3;
export const MAX_ROBOTS = 6; // === CORE_PROFILES.length

// Priority order: success anchor + the two discoveries first, then the minimal-
// pair completer, then the two rules already baked into the start tree.
//
// The initial tree (see DecisionTree.tsx's INITIAL_TREE) only checks battery_low then
// ir_working — it never looks at light_working or motor_noise. Priorities 2 and 3 are
// deliberately built so the initial tree misclassifies them as ready (battery's fine, IR's
// fine) when they actually need repair — that mismatch, caught during step 3's terrain
// observation, is the "discovery" that motivates refining the tree in step 4.
const CORE_PROFILE_DEFS: { priority: number; role: string; config: ColorConfig }[] = [
  {
    priority: 1,
    role: 'Success anchor (best robot)',
    config: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  {
    priority: 2,
    role: 'Discovery: motor noise -> fails the slope',
    config: { light_working: 0, ir_working: 0, motor_noise: 0, battery_level: 2 },
  },
  {
    priority: 3,
    role: 'Discovery: broken light -> crashes in the tunnel',
    config: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 0 },
  },
  {
    priority: 4,
    role: '2nd success, completes the noise minimal pair (vs priority 2)',
    config: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  {
    priority: 5,
    role: 'Confirms the IR rule (already in the start tree)',
    config: { light_working: 0, ir_working: 1, motor_noise: 1, battery_level: 2 },
  },
  {
    priority: 6,
    role: 'Confirms the battery rule (already in the start tree)',
    config: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 0 },
  },
];

export const CORE_PROFILES: Profile[] = CORE_PROFILE_DEFS.map(p => ({
  ...p,
  expectedCategory: categorizeConfig(p.config),
}));

/** Plain-language, sensor-specific reason a config fails a given check — ties the terrain
 * consequence back to the exact sensor a student can see in the lab data. */
const FAILURE_HINTS = {
  light_working: "ses phares ne s'allument pas — dans le tunnel, il ne verra rien venir.",
  ir_working: 'son capteur de distance ne répond pas — il ne détectera ni obstacles ni passages à faune.',
  motor_noise: 'son moteur fait un bruit inhabituel — sur la pente, il risque de caler.',
  battery_level: "sa batterie est trop faible — il n'ira pas bien loin.",
} as const;

/** Returns the sensor-specific reasons a robot's ground-truth config counts as 'repair' (empty if 'ready'). */
export function getFailureReasons(cfg: ColorConfig): string[] {
  const reasons: string[] = [];
  if (cfg.light_working !== 1) {
    reasons.push(FAILURE_HINTS.light_working);
  }
  if (cfg.ir_working !== 1) {
    reasons.push(FAILURE_HINTS.ir_working);
  }
  if (cfg.battery_level === 0) {
    reasons.push(FAILURE_HINTS.battery_level);
  } else if (cfg.motor_noise === 1 && cfg.battery_level <= 1) {
    reasons.push(FAILURE_HINTS.motor_noise);
  }
  return reasons;
}

/** Maps a question ID to the event name emitted to the robot to trigger its test sequence. */
export const QUESTION_SEQ_TYPE: Partial<Record<string, string>> = {
  light_working: 'test_light',
  ir_working: 'test_ir',
  motor_noise: 'test_sound',
  battery_low: 'test_battery',
  battery_mid: 'test_battery',
  battery_full: 'test_battery',
};

/** Fallback timeout (ms) if seq_done event never arrives. */
export const SEQ_DURATION_MS: Record<string, number> = {
  test_sound: 5500, // fwd 2 s + pause 250 ms + back 2 s
  test_light: 3000, // working ~2 s, failing ~1.5 s
  test_ir: 8000, // sweep ~7 s
  test_battery: 3000, // 2 flashes × 5 ticks × 50 ms each
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

/**
 * Returns the set of `${uuid}-${criterion}` keys whose recorded test result doesn't match
 * the robot's ground-truth config (positional mapping: robotConfigs[i] <-> CORE_PROFILES[i]).
 * Only flags criteria that have actually been filled in — blanks aren't "wrong".
 */
export function getWrongCriteria(
  robotConfigs: { uuid: string }[],
  physicalRobotData: Record<string, RobotEntry>
): Set<string> {
  const wrong = new Set<string>();
  robotConfigs.forEach((r, index) => {
    const cfg = CORE_PROFILES[index]?.config;
    const entry = physicalRobotData[r.uuid];
    if (!cfg || !entry) {
      return;
    }
    ALL_CRITERIA.forEach(c => {
      const value = entry.testResults[c];
      if (value !== undefined && value !== cfg[c]) {
        wrong.add(`${r.uuid}-${c}`);
      }
    });
  });
  return wrong;
}

export function hasWrongCriteria(
  robotConfigs: { uuid: string }[],
  physicalRobotData: Record<string, RobotEntry>
): boolean {
  return getWrongCriteria(robotConfigs, physicalRobotData).size > 0;
}

/**
 * Returns the set of robot uuids whose step-3 terrain observation (ready/repair) doesn't match
 * the ground truth (positional mapping: robotConfigs[i] <-> CORE_PROFILES[i]). Only flags
 * robots that have actually been given an observation — unset ones aren't "wrong" yet.
 */
export function getWrongObservations(
  robotConfigs: { uuid: string }[],
  physicalRobotData: Record<string, RobotEntry>
): Set<string> {
  const wrong = new Set<string>();
  robotConfigs.forEach((r, index) => {
    const expected = CORE_PROFILES[index]?.expectedCategory;
    const observed = physicalRobotData[r.uuid]?.observation?.category;
    if (expected && observed && observed !== expected) {
      wrong.add(r.uuid);
    }
  });
  return wrong;
}

export function hasWrongObservations(
  robotConfigs: { uuid: string }[],
  physicalRobotData: Record<string, RobotEntry>
): boolean {
  return getWrongObservations(robotConfigs, physicalRobotData).size > 0;
}

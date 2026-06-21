import type { RobotColor } from './ScenarioContext';

export type ColorConfig = {
  light_working: 0 | 1;
  ir_working: 0 | 1;
  motor_noise: 0 | 1;
  /** 0 = low, 1 = mid, 2 = full */
  battery_level: 0 | 1 | 2;
};

/** Ground-truth state for each robot colour, sent as SetConfig on test start. */
export const COLOR_CONFIGS: Record<RobotColor, ColorConfig> = {
  red: { light_working: 0, ir_working: 0, motor_noise: 1, battery_level: 0 },
  blue: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 2 },
  green: { light_working: 0, ir_working: 1, motor_noise: 0, battery_level: 1 },
  yellow: { light_working: 1, ir_working: 0, motor_noise: 1, battery_level: 1 },
  orange: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 0 },
  purple: { light_working: 0, ir_working: 1, motor_noise: 0, battery_level: 2 },
  pink: { light_working: 1, ir_working: 0, motor_noise: 0, battery_level: 1 },
  cyan: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
};

/**
 * Maps a question ID to the SeqStart sequence type [0=light, 1=ir, 2=motor].
 * Questions without a physical test (battery) are absent.
 */
export const QUESTION_SEQ_TYPE: Partial<Record<string, number>> = {
  light_working: 0,
  ir_working: 1,
  motor_noise: 2,
};

/** Time (ms) each sequence takes to complete — AESL timer.period[1] = 400ms per step. */
export const SEQ_DURATION_MS: Record<number, number> = {
  0: 4 * 400 + 500, // light: 4 steps
  1: 10 * 400 + 500, // ir:    10 steps (0-9)
  2: 6 * 400 + 500, // motor: 6 steps  (0-5, with gaps at 1 and 4)
};

/** Pause before auto-answering questions with no physical test (battery). */
export const NO_SEQ_DELAY_MS = 1500;

/** Compute the expected answer to a question given the robot's colour config. */
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

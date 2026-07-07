import type { RobotConfig } from '../ScenarioContext';

export type Criterion = 'light_working' | 'ir_working' | 'motor_noise' | 'battery_level';

export const ALL_CRITERIA: Criterion[] = ['light_working', 'ir_working', 'motor_noise', 'battery_level'];

export type RobotEntry = {
  testResults: Partial<Record<Criterion, number>>;
  /** True once the robot has been run through the decision tree down to a leaf. */
  tested: boolean;
  observation: { category: 'ready' | 'repair'; notes: string } | null;
};

export const EMPTY_ROBOT_ENTRY: RobotEntry = { testResults: {}, tested: false, observation: null };

/** Maps a decision-tree question id to the criterion its answer feeds into. */
export function questionIdToCriterion(questionId: string): Criterion | null {
  switch (questionId) {
    case 'light_working':
      return 'light_working';
    case 'ir_working':
      return 'ir_working';
    case 'motor_noise':
      return 'motor_noise';
    case 'battery_low':
    case 'battery_mid':
    case 'battery_full':
      return 'battery_level';
    default:
      return null;
  }
}

export type ExternalRobotEntry = RobotEntry & { id: string; label: string };

export type TutorialItem = { id: string; text: string };

export type StepFeatures = {
  /** Team switch modal (bureau/terrain) is available. */
  teamSwitch: boolean;
  /** Manual operation panel (lights, motors) is available. */
  manualOp: boolean;
  /** Decision tree is shown. */
  treeVisible: boolean;
  /** Decision tree can be edited (add/remove nodes, change questions). */
  treeEditable: boolean;
  /** Data table of collected robot test results is shown. */
  dataTable: boolean;
  /** Terrain observation entry form is shown. */
  observationEntry: boolean;
  /** External (non-physical) robot dataset is injected into the tree/table. */
  externalData: boolean;
  /** Step-by-step algorithm construction mode. */
  algorithmMode: boolean;
  /** Robots can be placed/tested directly against tree nodes. */
  robotPlacementOnTree: boolean;
};

export type CanAdvanceCtx = {
  physicalRobotData: Record<string, RobotEntry>;
  robotConfigs: RobotConfig[];
};

export type StepDef = {
  index: number;
  label: string;
  shortLabel: string;
  features: StepFeatures;
  canAdvance: (ctx: CanAdvanceCtx) => boolean;
  tutorial: TutorialItem[];
};

const NO_FEATURES: StepFeatures = {
  teamSwitch: false,
  manualOp: false,
  treeVisible: false,
  treeEditable: false,
  dataTable: false,
  observationEntry: false,
  externalData: false,
  algorithmMode: false,
  robotPlacementOnTree: false,
};

export const STEP_DEFS: StepDef[] = [
  {
    index: 1,
    label: 'Opération manuelle',
    shortLabel: 'Manuel',
    features: { ...NO_FEATURES, manualOp: true },
    canAdvance: () => true,
    tutorial: [
      { id: 'manual-intro', text: 'Prends en main un robot : allume sa lumière, fais-le avancer et reculer.' },
    ],
  },
  {
    index: 2,
    label: 'Découverte & test',
    shortLabel: 'Découverte',
    features: { ...NO_FEATURES, manualOp: true, treeVisible: true, dataTable: true },
    canAdvance: ({ physicalRobotData, robotConfigs }) =>
      robotConfigs.length > 0 && robotConfigs.every(({ uuid }) => physicalRobotData[uuid]?.tested === true),
    tutorial: [{ id: 'discovery-intro', text: 'Teste chaque robot pour découvrir ses caractéristiques.' }],
  },
  {
    index: 3,
    label: 'Terrain & observations',
    shortLabel: 'Terrain',
    features: { ...NO_FEATURES, observationEntry: true },
    canAdvance: ({ physicalRobotData, robotConfigs }) =>
      robotConfigs.length > 0 && robotConfigs.every(({ uuid }) => physicalRobotData[uuid]?.observation != null),
    tutorial: [{ id: 'terrain-intro', text: 'Direction le terrain : observe chaque robot en conditions réelles.' }],
  },
  {
    index: 4,
    label: "Affiner l'arbre",
    shortLabel: 'Affiner',
    features: {
      ...NO_FEATURES,
      teamSwitch: true,
      treeVisible: true,
      treeEditable: true,
      robotPlacementOnTree: true,
    },
    canAdvance: () => true,
    tutorial: [{ id: 'refine-intro', text: 'Affine ton arbre de décision avec ce que tu as observé sur le terrain.' }],
  },
  {
    index: 5,
    label: 'Données externes',
    shortLabel: 'Externe',
    features: { ...NO_FEATURES, teamSwitch: true, treeVisible: true, treeEditable: true, externalData: true },
    canAdvance: () => true,
    tutorial: [
      { id: 'external-intro', text: 'De nouvelles données arrivent : vérifie que ton arbre les classe bien.' },
    ],
  },
  {
    index: 6,
    label: "Construire l'algorithme",
    shortLabel: 'Algorithme',
    features: { ...NO_FEATURES, teamSwitch: true, algorithmMode: true },
    canAdvance: () => true,
    tutorial: [
      { id: 'algo-intro', text: "Construis l'algorithme étape par étape en choisissant les meilleures questions." },
    ],
  },
  {
    index: 7,
    label: 'Test final',
    shortLabel: 'Final',
    features: { ...NO_FEATURES },
    canAdvance: () => false,
    tutorial: [{ id: 'final-intro', text: 'Vérifie que ton IA choisit les bons robots pour la mission.' }],
  },
];

export function getStepDef(index: number): StepDef {
  const clamped = Math.min(Math.max(index, 1), STEP_DEFS.length);
  return STEP_DEFS[clamped - 1];
}

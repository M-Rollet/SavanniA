import type { RobotConfig } from '../ScenarioContext';

export type Criterion = 'light_working' | 'ir_working' | 'motor_noise' | 'battery_level';

export const ALL_CRITERIA: Criterion[] = ['light_working', 'ir_working', 'motor_noise', 'battery_level'];

export type RobotEntry = {
  testResults: Partial<Record<Criterion, number>>;
  /** Criteria whose value was obtained via a physical tree test — locked from manual editing. */
  lockedCriteria: Partial<Record<Criterion, true>>;
  /** True once the robot has been run through the decision tree down to a leaf. */
  tested: boolean;
  observation: { category: 'ready' | 'repair'; notes: string } | null;
  /** Student's own GO/STAY commitment, made from their step-1 manual observations before the
   * tree announces its verdict (PRIMM's Predict). Optional: entries saved before this field
   * existed won't have it. */
  prediction?: 'ready' | 'repair' | null;
  /** The decision tree's verdict for this robot, captured the first time it reaches a leaf in
   * step 2 (PRIMM's Run). Frozen at the initial tree, so the step-3 reunion can compare what the
   * lab predicted against what the terrain actually showed. Optional for the same back-compat
   * reason as `prediction`. */
  labVerdict?: 'ready' | 'repair' | null;
};

export const EMPTY_ROBOT_ENTRY: RobotEntry = {
  testResults: {},
  lockedCriteria: {},
  tested: false,
  observation: null,
  prediction: null,
  labVerdict: null,
};

/** True once every criterion has a recorded value, regardless of source. */
export function hasAllCriteria(entry: RobotEntry | undefined): boolean {
  return !!entry && ALL_CRITERIA.every(c => entry.testResults[c] !== undefined);
}

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

/** Answers a decision-tree question from recorded test results, or null if that criterion hasn't been tested yet. */
export function answerFromTestResults(
  questionId: string,
  testResults: Partial<Record<Criterion, number>>
): 'yes' | 'no' | null {
  const criterion = questionIdToCriterion(questionId);
  if (!criterion) {
    return null;
  }
  const value = testResults[criterion];
  if (value === undefined) {
    return null;
  }
  if (questionId === 'battery_low') {
    return value === 0 ? 'yes' : 'no';
  }
  if (questionId === 'battery_mid') {
    return value === 1 ? 'yes' : 'no';
  }
  if (questionId === 'battery_full') {
    return value === 2 ? 'yes' : 'no';
  }
  return value === 1 ? 'yes' : 'no';
}

export type ExternalRobotEntry = RobotEntry & { id: string; label: string };

/**
 * Single canonical ground-truth rule for whether a robot config should be sent out or needs
 * repair: light and IR sensors both working, motor not noisy, battery not empty. Used both for
 * the hardcoded external dataset below and (via robotProfiles.ts) for physical robot configs.
 */
export function categorizeConfig(cfg: Partial<Record<Criterion, number>>): 'ready' | 'repair' {
  const ready =
    cfg.light_working === 1 &&
    cfg.ir_working === 1 &&
    (cfg.battery_level ?? 0) > 0 &&
    (cfg.motor_noise === 0 || (cfg.battery_level ?? 0) > 1);
  return ready ? 'ready' : 'repair';
}

function externalObservation(cfg: Record<Criterion, number>): RobotEntry['observation'] {
  return { category: categorizeConfig(cfg), notes: '' };
}

function buildEntries(
  list: readonly { id: string; label: string; cfg: Record<Criterion, number> }[]
): ExternalRobotEntry[] {
  return list.map(({ id, label, cfg }) => ({
    id,
    label,
    testResults: { ...cfg },
    lockedCriteria: {},
    tested: true,
    observation: externalObservation(cfg),
  }));
}

/**
 * A fixed set of non-physical robots injected at step 5 to enlarge the training set.
 * ~1/3 ready, ~2/3 needing repair (matches CORE_PROFILES' ratio), covering every single-,
 * double-, triple-, and quadruple-failure combination of the 4 criteria for a rich, varied
 * dataset to build the algorithm-mode decision tree from (step 6).
 */
export const EXTERNAL_DATASET: ExternalRobotEntry[] = buildEntries([
  // Ready (light + IR working, no motor noise, battery not empty)
  { id: 'external-atlas', label: 'Atlas', cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 2 } },
  { id: 'external-luna', label: 'Luna', cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 } },
  {
    id: 'external-nebula',
    label: 'Nebula',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 2 },
  },
  {
    id: 'external-quasar',
    label: 'Quasar',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  { id: 'external-astra', label: 'Astra', cfg: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 2 } },
  { id: 'external-cosmo', label: 'Cosmo', cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 } },
  {
    id: 'external-stella',
    label: 'Stella',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 2 },
  },
  {
    id: 'external-europa',
    label: 'Europa',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  {
    id: 'external-ganymede',
    label: 'Ganymede',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 1 },
  },
  {
    id: 'external-callisto',
    label: 'Callisto',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  // Needs repair — single failure
  { id: 'external-nova', label: 'Nova', cfg: { light_working: 0, ir_working: 1, motor_noise: 0, battery_level: 2 } },
  { id: 'external-orion', label: 'Orion', cfg: { light_working: 1, ir_working: 0, motor_noise: 0, battery_level: 1 } },
  { id: 'external-vega', label: 'Vega', cfg: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 2 } },
  { id: 'external-rex', label: 'Rex', cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 0 } },
  {
    id: 'external-pulsar',
    label: 'Pulsar',
    cfg: { light_working: 0, ir_working: 1, motor_noise: 0, battery_level: 1 },
  },
  {
    id: 'external-meteor',
    label: 'Meteor',
    cfg: { light_working: 1, ir_working: 0, motor_noise: 0, battery_level: 2 },
  },
  { id: 'external-draco', label: 'Draco', cfg: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 1 } },
  {
    id: 'external-phoenix',
    label: 'Phoenix',
    cfg: { light_working: 1, ir_working: 1, motor_noise: 0, battery_level: 0 },
  },
  // Needs repair — two failures
  {
    id: 'external-andromeda',
    label: 'Andromeda',
    cfg: { light_working: 0, ir_working: 0, motor_noise: 0, battery_level: 2 },
  },
  {
    id: 'external-cassini',
    label: 'Cassini',
    cfg: { light_working: 0, ir_working: 1, motor_noise: 1, battery_level: 2 },
  },
  { id: 'external-io', label: 'Io', cfg: { light_working: 1, ir_working: 0, motor_noise: 1, battery_level: 1 } },
  { id: 'external-ceres', label: 'Ceres', cfg: { light_working: 0, ir_working: 1, motor_noise: 0, battery_level: 0 } },
  {
    id: 'external-pallas',
    label: 'Pallas',
    cfg: { light_working: 1, ir_working: 0, motor_noise: 0, battery_level: 0 },
  },
  { id: 'external-vesta', label: 'Vesta', cfg: { light_working: 1, ir_working: 1, motor_noise: 1, battery_level: 0 } },
  // Needs repair — three or four failures
  {
    id: 'external-hyperion',
    label: 'Hyperion',
    cfg: { light_working: 0, ir_working: 0, motor_noise: 1, battery_level: 2 },
  },
  { id: 'external-rhea', label: 'Rhea', cfg: { light_working: 0, ir_working: 1, motor_noise: 1, battery_level: 0 } },
  { id: 'external-mimas', label: 'Mimas', cfg: { light_working: 1, ir_working: 0, motor_noise: 1, battery_level: 0 } },
  {
    id: 'external-umbriel',
    label: 'Umbriel',
    cfg: { light_working: 0, ir_working: 0, motor_noise: 0, battery_level: 0 },
  },
  { id: 'external-ariel', label: 'Ariel', cfg: { light_working: 0, ir_working: 0, motor_noise: 1, battery_level: 1 } },
  {
    id: 'external-miranda',
    label: 'Miranda',
    cfg: { light_working: 0, ir_working: 0, motor_noise: 1, battery_level: 0 },
  },
]);

/** A decision tree built step-by-step in algorithm mode (step 6). */
export type AlgoTree =
  | { type: 'pending' }
  | { type: 'leaf'; label: 'ready' | 'repair' | null }
  | { type: 'question'; questionId: string; yes: AlgoTree; no: AlgoTree };

export function isAlgoTreeComplete(tree: AlgoTree): boolean {
  if (tree.type === 'pending') {
    return false;
  }
  if (tree.type === 'leaf') {
    return true;
  }
  return isAlgoTreeComplete(tree.yes) && isAlgoTreeComplete(tree.no);
}

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
  /** Data table rows can be opened and edited (vs. read-only). */
  dataEditable: boolean;
  /** Terrain observation entry form is shown. */
  observationEntry: boolean;
  /** External (non-physical) robot dataset is injected into the tree/table. */
  externalData: boolean;
  /** Step-by-step algorithm construction mode. */
  algorithmMode: boolean;
  /** Robots can be placed/tested directly against tree nodes. */
  robotPlacementOnTree: boolean;
};

export type TreeAccuracy = { total: number; correct: number };

export type CanAdvanceCtx = {
  physicalRobotData: Record<string, RobotEntry>;
  robotConfigs: RobotConfig[];
  algorithmTree: AlgoTree | null;
  treeAccuracy: TreeAccuracy | null;
};

export type StepDef = {
  index: number;
  label: string;
  shortLabel: string;
  features: StepFeatures;
  canAdvance: (ctx: CanAdvanceCtx) => boolean;
  tutorial: TutorialItem[];
  /** Shown once as a pop-up when the step is first reached (see StepIntroModal). Steps whose
   * arrival is already announced by a dedicated modal (terrain, external data, final) skip it. */
  intro?: { heading: string; body: string[] };
};

const NO_FEATURES: StepFeatures = {
  teamSwitch: false,
  manualOp: false,
  treeVisible: false,
  treeEditable: false,
  dataTable: false,
  dataEditable: false,
  observationEntry: false,
  externalData: false,
  algorithmMode: false,
  robotPlacementOnTree: false,
};

export const STEP_DEFS: StepDef[] = [
  {
    index: 1,
    label: 'Premières observations',
    shortLabel: 'Observations',
    features: { ...NO_FEATURES, manualOp: true, dataTable: true, dataEditable: true },
    canAdvance: ({ physicalRobotData, robotConfigs }) =>
      robotConfigs.length > 0 && robotConfigs.every(({ uuid }) => physicalRobotData[uuid]?.prediction != null),
    tutorial: [
      {
        id: 'manual-intro',
        text: 'Sélectionne un robot en haut à gauche et teste ses capteurs : phares, moteur, capteurs de distance (approche ta main), batterie. Note ce que tu observes en cliquant sur ce robot dans le tableau. Puis, dans la colonne « Pronostic », donne ton avis pour chaque robot : prêt à partir, ou à réparer ?',
      },
    ],
    intro: {
      heading: 'Phase 1 · Labo — Premières observations',
      body: [
        "Avant d'envoyer un robot dans la savane, un scientifique commence par examiner son matériel lui-même. Allume les phares, fais tourner les moteurs, approche ta main des capteurs, vérifie la batterie.",
        "Note ce que tu observes dans le tableau, robot par robot. Ce sont tes premières impressions — elles ne sont pas encore vérifiées, et c'est normal.",
        "Puis, dans la colonne « Pronostic », engage-toi pour chaque robot : d'après ce que tu as vu, est-il prêt à partir ou à réparer ? Ce n'est pas grave de se tromper — on vérifiera ensuite.",
      ],
    },
  },
  {
    index: 2,
    label: 'Prédiction du labo',
    shortLabel: 'Prédiction',
    features: { ...NO_FEATURES, manualOp: true, treeVisible: true, dataTable: true, dataEditable: true },
    canAdvance: ({ physicalRobotData, robotConfigs }) =>
      robotConfigs.length > 0 &&
      robotConfigs.every(
        ({ uuid }) => physicalRobotData[uuid]?.tested === true && hasAllCriteria(physicalRobotData[uuid])
      ),
    tutorial: [
      {
        id: 'discovery-intro',
        text: "Teste chaque robot dans l'arbre : il mesure ses capteurs et prédit son statut. Si une mesure corrige une de tes observations, la case est marquée d'un point orange. Compare le verdict de l'arbre avec ton pronostic — mais ce ne sont que des prédictions du labo : c'est le terrain qui tranchera.",
      },
    ],
    // Arrival is announced by the dedicated DecisionTreeIntroModal (reflection + graphical
    // explanation of what a decision tree is), so no text intro here.
  },
  {
    index: 3,
    label: 'Tests sur le terrain',
    shortLabel: 'Terrain',
    features: { ...NO_FEATURES, observationEntry: true },
    canAdvance: ({ physicalRobotData, robotConfigs }) =>
      robotConfigs.length > 0 && robotConfigs.every(({ uuid }) => physicalRobotData[uuid]?.observation != null),
    tutorial: [{ id: 'terrain-intro', text: 'Direction le terrain : observe chaque robot en conditions réelles.' }],
  },
  {
    index: 4,
    label: "Améliorer l'arbre",
    shortLabel: 'Affiner',
    features: {
      ...NO_FEATURES,
      teamSwitch: false,
      manualOp: true,
      treeVisible: true,
      treeEditable: true,
      dataTable: true,
      robotPlacementOnTree: true,
    },
    canAdvance: ({ treeAccuracy }) =>
      treeAccuracy !== null && treeAccuracy.total > 0 && treeAccuracy.correct === treeAccuracy.total,
    tutorial: [
      {
        id: 'refine-intro',
        text: "L'arbre ignore une feature — une caractéristique du robot, une colonne du tableau — qui fait échouer certains robots sur le terrain. Trouve-la et ajoute-la, pour que chaque robot soit trié comme le terrain l'a montré.",
      },
    ],
    // Arrival is announced by the dedicated ReunionModal (three-way bilan), so no text intro here.
  },
  {
    index: 5,
    label: 'Données externes',
    shortLabel: 'Externe',
    features: {
      ...NO_FEATURES,
      teamSwitch: true,
      treeVisible: true,
      treeEditable: true,
      dataTable: true,
      externalData: true,
      robotPlacementOnTree: true,
    },
    canAdvance: () => true,
    tutorial: [
      { id: 'external-intro', text: "Essaie de modifier l'arbre pour qu'il trie tous les robots correctement." },
    ],
  },
  {
    index: 6,
    label: "Construire l'algorithme",
    shortLabel: 'Algorithme',
    features: { ...NO_FEATURES, algorithmMode: true, dataTable: true },
    canAdvance: ({ algorithmTree }) => algorithmTree !== null && isAlgoTreeComplete(algorithmTree),
    tutorial: [
      {
        id: 'algo-intro',
        text: 'Teste toutes les questions possibles et garde celle qui fait le moins d’erreurs — c’est la règle que l’algorithme applique à chaque étape.',
      },
    ],
    intro: {
      heading: 'Construire l’algorithme',
      body: [
        "Avec 6 robots, trier à la main reste possible. Mais l'autre équipe vient d'en envoyer 30 de plus — impossible de continuer au feeling.",
        'Il nous faut une méthode automatique qui marche à chaque fois, quel que soit le nombre de robots : à chaque étape, tester toutes les questions possibles et garder celle qui fait le moins d’erreurs. À toi de la découvrir.',
      ],
    },
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

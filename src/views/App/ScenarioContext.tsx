import { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef, type ReactNode } from 'react';
import { Toast } from '@heroui/react/toast';
import { thymioManagerFactory } from '../../Entities/ThymioManager';
import { tdmConnectionEvents } from '../../Entities/ThymioManager/tdmConnectionEvents';
import type { Users } from '../../Entities/ThymioManager/Model/users.model';
import { useLocalStorage } from '../../helpers/useLocalStorage';
import { clearSavedTree } from './components/DecisionTree';
import { getActiveRobotConfigs } from './robotProfiles';
import {
  getStepDef,
  STEP_DEFS,
  type RobotEntry,
  type ExternalRobotEntry,
  type AlgoTree,
  type TreeAccuracy,
} from './steps/stepDefinitions';

export const ROBOT_COLORS = [
  { id: 'red', label: 'Rouge', hex: '#ef4444' },
  { id: 'blue', label: 'Bleu', hex: '#3b82f6' },
  { id: 'green', label: 'Vert', hex: '#22c55e' },
  { id: 'yellow', label: 'Jaune', hex: '#d2e903' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'pink', label: 'Rose', hex: '#ec4899' },
] as const;

export type RobotColor = (typeof ROBOT_COLORS)[number]['id'];

export type RobotConfig = {
  uuid: string;
  color: RobotColor;
};

export type RobotTeam = 'terrain' | 'bureau';

type ScenarioState = {
  user: Users;
  /** 0 = welcome screen, 1-7 = main activity steps (see stepDefinitions.ts). */
  stepIndex: number;
  /** Advance to the next step, if the current step's canAdvance condition is met. */
  advanceStep: () => void;
  /** Jump directly to a given step (used to leave the welcome screen, or to go back). */
  goToStep: (index: number) => void;
  controledRobot: string;
  /** Switch the active robot without re-initializing. */
  selectRobot: (uuid: string) => void;
  /** Lock + program a robot for a session. Optional callback receives variable-change events. */
  initializeRobot: (
    uuid: string,
    onEvent?: (uuid: string, events: { [name: string]: number }) => void
  ) => Promise<void>;
  robotConfigs: RobotConfig[];
  setRobotConfigs: (configs: RobotConfig[]) => void;
  /** The subset of robotConfigs actually available to the student for the current step — steps
   * 1-4 are capped to the first MIN_ROBOTS (by priority/array position) regardless of how many
   * are configured; every other step gets the full list. Use this (not robotConfigs) for
   * anything student-facing — robot selection, table rows, terrain cards, etc. robotConfigs
   * itself stays the full list for admin purposes (SettingsOverlay) and persistence. */
  activeRobotConfigs: RobotConfig[];
  /** Map of robot UUID → team assignment. Empty until set via the team-switch modal (step 4+). */
  robotTeams: Record<string, RobotTeam>;
  setRobotTeams: (teams: Record<string, RobotTeam>) => void;
  /** Test results & terrain observations for real robots, keyed by Thymio UUID. */
  physicalRobotData: Record<string, RobotEntry>;
  setPhysicalRobotData: (data: Record<string, RobotEntry>) => void;
  /** Injected non-physical robot dataset (step 5+), kept separate to avoid UUID collisions. */
  externalDataset: ExternalRobotEntry[];
  setExternalDataset: (data: ExternalRobotEntry[]) => void;
  /** Decision tree built step-by-step in algorithm mode (step 6). */
  algorithmTree: AlgoTree | null;
  setAlgorithmTree: (tree: AlgoTree | null) => void;
  /** Current manually-edited tree (steps 2/4/5), mirrored here so other components (e.g. the data table) can classify robots without depending on the tree component itself. */
  manualTree: AlgoTree | null;
  setManualTree: (tree: AlgoTree | null) => void;
  /** How many tested+observed robots the current manual tree (step 4+) classifies correctly. */
  treeAccuracy: TreeAccuracy | null;
  setTreeAccuracy: (accuracy: TreeAccuracy | null) => void;
  /** True once step 2's end-of-step check has found test results that don't match the ground truth. */
  dataCheckFailed: boolean;
  setDataCheckFailed: (failed: boolean) => void;
  /** True once step 3's end-of-step check has found terrain observations that don't match the ground truth. */
  observationCheckFailed: boolean;
  setObservationCheckFailed: (failed: boolean) => void;
  /** Cells (`${uuid}-${criterion}`) whose manually-entered value was overwritten by a tree test
   * that measured something different — mapped to the earlier manual value, for the DataTable
   * marker's tooltip. Never cleared automatically: it's a running record for the session. */
  correctedCriteria: Record<string, number>;
  setCorrectedCriteria: (data: Record<string, number>) => void;
  /** Guided-tour progress: 0 = inactive. 1-8 = the spotlighted steps (see TourOverlay.tsx). Special
   * values above 99 mark the standard-modal interludes and the "waiting for the robot's row to be
   * completed" pause between them. Persisted so a reload mid-tour resumes instead of restarting. */
  tourStep: number;
  setTourStep: (step: number) => void;
  /** True once the guided tour has been completed or explicitly skipped — prevents it from
   * auto-starting again after step 1's intro modal. */
  tourSeen: boolean;
  setTourSeen: (seen: boolean) => void;
  /** Same as tourSeen, for the step-2 guided tour of the decision tree (started from
   * DecisionTreeIntroModal instead of StepIntroModal). */
  tour2Seen: boolean;
  setTour2Seen: (seen: boolean) => void;
  /** True while DataTable's EditRobotModal is open — the guided tour waits for it to close before
   * showing the next popover, so it never renders behind that modal. */
  editRobotModalOpen: boolean;
  setEditRobotModalOpen: (open: boolean) => void;
  /** Mirrors SoftwareMain's local "testing" state — true while a robot is actively being run
   * through the tree. The step-2 guided tour hides its own highlight while this is true, so the
   * tree's own pan/animation is fully visible instead of fighting the tour's dimmed overlay. */
  robotTestActive: boolean;
  setRobotTestActive: (active: boolean) => void;
  /** Which robot's colored test result is currently shown in the tree — set by SoftwareMain the
   * moment a test reaches a leaf, cleared the moment a different robot gets selected. Unlike
   * physicalRobotData's `tested` flag (permanent, set only once), this flips on every completed
   * run, so the step-2 guided tour can tell a genuinely fresh test apart from a robot that just
   * happens to have been tested earlier — see TourOverlay's step 27 → 28 transition. */
  testResultRobot: string | null;
  setTestResultRobot: (uuid: string | null) => void;
  /** Lets SoftwareMain register a callback that stops any in-progress robot test; called before every step advance. */
  registerStopTesting: (fn: (() => void) | null) => void;
  resetApp: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
};

const user = thymioManagerFactory({ user: 'AllUser', activity: 'ThymioIA', hosts: ['localhost'] });

const ScenarioContext = createContext<ScenarioState | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [stepIndex, setStepIndex] = useLocalStorage<number>('scenario:stepIndex', 0);
  const [controledRobot, setControledRobot] = useLocalStorage<string>('scenario:robot', '');
  const [robotConfigs, setRobotConfigs] = useLocalStorage<RobotConfig[]>('scenario:robots', []);
  const activeRobotConfigs = useMemo(() => getActiveRobotConfigs(robotConfigs, stepIndex), [robotConfigs, stepIndex]);
  const [robotTeams, setRobotTeams] = useLocalStorage<Record<string, RobotTeam>>('scenario:teams', {});
  const [physicalRobotData, setPhysicalRobotData] = useLocalStorage<Record<string, RobotEntry>>(
    'scenario:physicalRobotData',
    {}
  );
  const [externalDataset, setExternalDataset] = useLocalStorage<ExternalRobotEntry[]>('scenario:externalDataset', []);
  const [algorithmTree, setAlgorithmTree] = useState<AlgoTree | null>(null);
  const [manualTree, setManualTree] = useState<AlgoTree | null>(null);
  const [treeAccuracy, setTreeAccuracy] = useState<TreeAccuracy | null>(null);
  const [dataCheckFailed, setDataCheckFailed] = useState(false);
  const [observationCheckFailed, setObservationCheckFailed] = useState(false);
  const [correctedCriteria, setCorrectedCriteria] = useState<Record<string, number>>({});
  const [tourStep, setTourStep] = useLocalStorage<number>('scenario:tourStep', 0);
  const [tourSeen, setTourSeen] = useLocalStorage<boolean>('scenario:tourSeen', false);
  const [tour2Seen, setTour2Seen] = useLocalStorage<boolean>('scenario:tour2Seen', false);
  const [editRobotModalOpen, setEditRobotModalOpen] = useState(false);
  const [robotTestActive, setRobotTestActive] = useState(false);
  const [testResultRobot, setTestResultRobot] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Only ever relevant on step 1 — clear it once the user leaves that step.
  useEffect(() => {
    if (stepIndex !== 1) {
      setDataCheckFailed(false);
    }
  }, [stepIndex]);

  // Only ever relevant on step 3 — clear it once the user leaves that step.
  useEffect(() => {
    if (stepIndex !== 3) {
      setObservationCheckFailed(false);
    }
  }, [stepIndex]);

  // Only ever relevant on step 2 (live single-robot testing) — clear it once the user leaves that
  // step, so the table's colored "just tested" cell doesn't linger (even off-screen) into step 3
  // and beyond, where it could wrongly reappear for whichever robot happens to be selected again.
  useEffect(() => {
    if (stepIndex !== 2) {
      setTestResultRobot(null);
    }
  }, [stepIndex]);

  useEffect(() => {
    let errorToastKey: string | null = null;
    const unsub = tdmConnectionEvents.subscribe(connected => {
      if (connected) {
        if (errorToastKey) {
          Toast.toast.close(errorToastKey);
          errorToastKey = null;
        }
        Toast.toast.success('Connecté à ThymioSuite');
      } else if (!errorToastKey) {
        errorToastKey = Toast.toast.warning('Impossible de se connecter à ThymioSuite', {
          description: "Vérifier que l'application est ouverte",
          timeout: 0,
          isLoading: true,
        });
      }
    });
    return () => {
      unsub();
    };
  }, []);

  const initializeRobot = useCallback(
    (uuid: string, onEvent?: (uuid: string, events: { [name: string]: number }) => void) =>
      user.takeControl(uuid, onEvent),
    []
  );

  const selectRobot = useCallback(
    (uuid: string) => {
      setControledRobot(uuid);
    },
    [setControledRobot]
  );

  const goToStep = useCallback(
    (index: number) => {
      setStepIndex(index);
    },
    [setStepIndex]
  );

  // Lets the current step's UI (e.g. SoftwareMain) register a "stop any running test" callback,
  // invoked right before advancing to the next step.
  const stopTestingRef = useRef<(() => void) | null>(null);
  const registerStopTesting = useCallback((fn: (() => void) | null) => {
    stopTestingRef.current = fn;
  }, []);

  const advanceStep = useCallback(() => {
    const current = getStepDef(stepIndex);
    if (stepIndex >= STEP_DEFS.length) {
      return;
    }
    // activeRobotConfigs (not robotConfigs): steps 1-4's canAdvance checks must only require the
    // robots actually available at that step, not every configured robot.
    if (!current.canAdvance({ physicalRobotData, robotConfigs: activeRobotConfigs, algorithmTree, treeAccuracy })) {
      return;
    }
    stopTestingRef.current?.();
    setStepIndex(stepIndex + 1);
  }, [stepIndex, physicalRobotData, activeRobotConfigs, algorithmTree, treeAccuracy, setStepIndex]);

  // Keep a ref so the auto-assign effect always reads latest teams without re-triggering.
  const robotTeamsRef = useRef(robotTeams);
  robotTeamsRef.current = robotTeams;

  // Auto-assign robots added after team-split (when teams have already been initialized).
  useEffect(() => {
    const currentTeams = robotTeamsRef.current;
    if (Object.keys(currentTeams).length === 0) {
      return;
    } // teams not initialized yet
    const unassigned = robotConfigs.filter(r => !(r.uuid in currentTeams));
    if (unassigned.length === 0) {
      return;
    }

    let tc = Object.values(currentTeams).filter(t => t === 'terrain').length;
    let bc = Object.values(currentTeams).filter(t => t === 'bureau').length;
    const updated = { ...currentTeams };
    for (const r of unassigned) {
      const t: RobotTeam = tc <= bc ? 'terrain' : 'bureau';
      updated[r.uuid] = t;
      if (t === 'terrain') {
        tc++;
      } else {
        bc++;
      }
    }
    setRobotTeams(updated);
  }, [robotConfigs]);

  const resetApp = useCallback(() => {
    clearSavedTree();
    // Owned by StepIntroModal / ReunionModal / DecisionTreeIntroModal's useLocalStorage; safe to
    // clear here because resetting to the welcome screen unmounts SoftwareMain, so the modals
    // re-read storage on next mount.
    localStorage.removeItem('scenario:introSeen');
    localStorage.removeItem('scenario:reunionSeen');
    localStorage.removeItem('scenario:dtIntroSeen');
    setStepIndex(0);
    setControledRobot('');
    setRobotConfigs([]);
    setRobotTeams({});
    setPhysicalRobotData({});
    setExternalDataset([]);
    setAlgorithmTree(null);
    setManualTree(null);
    setTreeAccuracy(null);
    setCorrectedCriteria({});
    setTourStep(0);
    setTourSeen(false);
    setTour2Seen(false);
    setEditRobotModalOpen(false);
  }, [
    setStepIndex,
    setControledRobot,
    setRobotConfigs,
    setRobotTeams,
    setPhysicalRobotData,
    setExternalDataset,
    setTourStep,
    setTourSeen,
    setTour2Seen,
  ]);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  // Memoized so consumers of useScenario() only re-render when a value they actually read
  // changes — without this, every ScenarioProvider render (e.g. the 2s robot-status poll)
  // would hand out a brand-new object and re-render every consumer, tree included.
  const value = useMemo<ScenarioState>(
    () => ({
      user,
      stepIndex,
      advanceStep,
      goToStep,
      controledRobot,
      selectRobot,
      initializeRobot,
      robotConfigs,
      setRobotConfigs,
      activeRobotConfigs,
      robotTeams,
      setRobotTeams,
      physicalRobotData,
      setPhysicalRobotData,
      externalDataset,
      setExternalDataset,
      algorithmTree,
      setAlgorithmTree,
      manualTree,
      setManualTree,
      treeAccuracy,
      setTreeAccuracy,
      dataCheckFailed,
      setDataCheckFailed,
      observationCheckFailed,
      setObservationCheckFailed,
      correctedCriteria,
      setCorrectedCriteria,
      tourStep,
      setTourStep,
      tourSeen,
      setTourSeen,
      tour2Seen,
      setTour2Seen,
      editRobotModalOpen,
      setEditRobotModalOpen,
      robotTestActive,
      setRobotTestActive,
      testResultRobot,
      setTestResultRobot,
      registerStopTesting,
      resetApp,
      isSettingsOpen,
      openSettings,
      closeSettings,
    }),
    [
      stepIndex,
      advanceStep,
      goToStep,
      controledRobot,
      selectRobot,
      initializeRobot,
      robotConfigs,
      setRobotConfigs,
      activeRobotConfigs,
      robotTeams,
      setRobotTeams,
      physicalRobotData,
      setPhysicalRobotData,
      externalDataset,
      setExternalDataset,
      algorithmTree,
      setAlgorithmTree,
      manualTree,
      setManualTree,
      treeAccuracy,
      setTreeAccuracy,
      dataCheckFailed,
      setDataCheckFailed,
      observationCheckFailed,
      setObservationCheckFailed,
      correctedCriteria,
      setCorrectedCriteria,
      tourStep,
      setTourStep,
      tourSeen,
      setTourSeen,
      tour2Seen,
      setTour2Seen,
      editRobotModalOpen,
      setEditRobotModalOpen,
      robotTestActive,
      setRobotTestActive,
      testResultRobot,
      setTestResultRobot,
      registerStopTesting,
      resetApp,
      isSettingsOpen,
      openSettings,
      closeSettings,
    ]
  );

  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioState {
  const ctx = useContext(ScenarioContext);
  if (!ctx) {
    throw new Error('useScenario must be used within ScenarioProvider');
  }
  return ctx;
}

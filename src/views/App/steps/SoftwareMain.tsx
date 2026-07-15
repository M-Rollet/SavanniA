import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { Toast } from '@heroui/react/toast';
import { Sliders, ArrowRightArrowLeft, LogoDrawIo } from '@gravity-ui/icons';
import { ManualOperation } from '../components/ManualOperation';
import { useScenario, ROBOT_COLORS, type RobotTeam } from '../ScenarioContext';
import { TeamModal } from '../components/TeamModal';
import { StepIntroModal } from '../components/StepIntroModal';
import { ReunionModal } from '../components/ReunionModal';
import { DecisionTreeIntroModal } from '../components/DecisionTreeIntroModal';
import { TourOverlay, isLaunchTestLockedByTour } from '../components/TourOverlay';
import { TerrainModal } from '../components/TerrainModal';
import { DataCheckModal } from '../components/DataCheckModal';
import { ExternalDataIntroModal, ExternalDataReadyModal } from '../components/ExternalDataIntroModal';
import { TreeDifficultyModal } from '../components/TreeDifficultyModal';
import { Step7IntroModal } from '../components/Step7IntroModal';
import { FinalTestModal } from '../components/FinalTestModal';
import { TimelinePanel } from '../components/TimelinePanel';
import { DataTable } from '../components/DataTable';
import { DecisionTree, type DecisionTreeHandle, type ValidationError } from '../components/DecisionTree';
import {
  getStepDef,
  STEP_DEFS,
  EMPTY_ROBOT_ENTRY,
  questionIdToCriterion,
  hasAllCriteria,
  classifyWithAlgoTree,
  type RobotEntry,
  type ExternalRobotEntry,
} from './stepDefinitions';
import { CORE_PROFILES, MIN_ROBOTS, QUESTION_SEQ_TYPE, getAnswerForQuestion } from '../robotProfiles';

const SEQ_TIMEOUT_MS = 10000;
// Playful stand-in names for the two synthetic "new robots" (step 5) when their slot has no
// physically-configured robot — picked randomly so re-visiting the step doesn't always show the
// same pair.
const NEW_ROBOT_NICKNAMES = ['Bipbip', 'Zigzag', 'Cluc', 'Bidule', 'Ferro', 'Grelo', 'Clici'];
// Flying-dot size for the tree → table result animation (see `flyToCell`) — kept large enough to
// read clearly as it crosses the whole screen, not just a small tick.
const FLIGHT_DOT_SIZE = 24;
import logo from '../../../assets/logo.svg';
import thymioDefault from '../../../assets/thymio_icon.svg';
import thymioRed from '../../../assets/thymio_icon_red.svg';
import thymioBlue from '../../../assets/thymio_icon_blue.svg';
import thymioGreen from '../../../assets/thymio_icon_green.svg';
import thymioYellow from '../../../assets/thymio_icon_yellow.svg';
import thymioCyan from '../../../assets/thymio_icon_cyan.svg';
import thymioPink from '../../../assets/thymio_icon_pink.svg';

const THYMIO_ICONS: Record<string, string> = {
  red: thymioRed,
  blue: thymioBlue,
  green: thymioGreen,
  yellow: thymioYellow,
  cyan: thymioCyan,
  pink: thymioPink,
};
import type { ThymioStatus } from '../../../Entities/ThymioManager/Model/thymio.model';

type LocalStatus = ThymioStatus | 'connecting';

type SensorData = { battery: number; mic: number; prox: number[]; seqType: number; light: number };
const SENSOR_DEFAULTS: SensorData = { battery: 0, mic: 0, prox: [0, 0, 0, 0, 0], seqType: 0, light: 0 };

type Flight = {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  color: string;
  onComplete: () => void;
};

function proxToDepth(p: number): number {
  if (p < 1) {
    return 0;
  }
  if (p < 15) {
    return 3;
  }
  if (p < 21) {
    return 2;
  }
  return 1;
}

function displayState(s: LocalStatus | undefined): 'ready' | 'connecting' | 'unavailable' {
  if (s === 'ready') {
    return 'ready';
  }
  if (s === 'connecting' || s === 'available') {
    return 'connecting';
  }
  return 'unavailable';
}

export function SoftwareMain() {
  const {
    user,
    robotConfigs,
    robotTeams,
    setRobotTeams,
    controledRobot,
    selectRobot,
    initializeRobot,
    stepIndex,
    physicalRobotData,
    setPhysicalRobotData,
    algorithmTree,
    setTreeAccuracy,
    registerStopTesting,
    externalDataset,
    newRobotsDataset,
    setNewRobotsDataset,
    newRobotsArmed,
    correctedCriteria,
    setCorrectedCriteria,
    setRobotTestActive,
    testResultRobot,
    setTestResultRobot,
    tourStep,
    activeRobotConfigs,
    treeEditCount,
    setTreeEditCount,
    step7DemoActive,
    aiActive,
  } = useScenario();
  const stepDef = useMemo(() => getStepDef(stepIndex), [stepIndex]);
  const isFinalStep = stepDef.index === STEP_DEFS.length;
  const [finalTestReopenToken, setFinalTestReopenToken] = useState(0);
  const showTree = stepDef.features.treeVisible;
  const showManual = stepDef.features.manualOp;
  const showToggle = showTree && showManual;
  const [manualMode, setManualMode] = useState(false);
  const effectiveManualMode = showToggle ? manualMode : showManual;

  // activeRobotConfigs (not robotConfigs): drives both the selector dots and the connection-poll
  // loop below, so steps 1-4 only ever connect/offer the first MIN_ROBOTS robots — the rest quietly
  // pick up once the step advances and activeRobotConfigs opens back up to the full list.
  const controllableRobots = useMemo(
    () =>
      stepDef.features.teamSwitch
        ? activeRobotConfigs.filter(r => robotTeams[r.uuid] === 'bureau')
        : activeRobotConfigs,
    [stepDef.features.teamSwitch, activeRobotConfigs, robotTeams]
  );
  // Steps that place every robot on the tree (4/5/6) show an aggregate view on that tab instead of
  // a single selected robot — there's no per-robot selector there anymore, so a robot picked
  // earlier in "Opération manuelle" shouldn't leave the tab-pill icon colored on the tree tab.
  const showAggregateRobots = stepDef.features.robotPlacementOnTree && !effectiveManualMode;
  const activeColor = robotConfigs.find(r => r.uuid === controledRobot)?.color;
  const thymioIcon = !showAggregateRobots && activeColor ? THYMIO_ICONS[activeColor] : thymioDefault;
  const algorithmDatasetCount = useMemo(
    () =>
      robotConfigs.filter(
        r => hasAllCriteria(physicalRobotData[r.uuid]) && physicalRobotData[r.uuid]?.observation != null
      ).length + externalDataset.length,
    [robotConfigs, physicalRobotData, externalDataset]
  );
  const [testing, setTesting] = useState(false);

  // Mirrored into context so the step-2 guided tour can hide its own highlight while a test is
  // actively running, letting the tree's own pan/animation show through unobstructed.
  useEffect(() => {
    setRobotTestActive(testing);
  }, [testing, setRobotTestActive]);

  // A newly selected robot always starts from a blank slate — see the matching reset in
  // DecisionTree.tsx that clears the tree's own colored path on the same trigger.
  useEffect(() => {
    setTestResultRobot(null);
  }, [controledRobot]);

  // Let the scenario stop any in-progress robot test right before advancing to the next step.
  useEffect(() => {
    registerStopTesting(() => setTesting(false));
    return () => registerStopTesting(null);
  }, [registerStopTesting]);

  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, LocalStatus>>({});
  const [sensorData, setSensorData] = useState<SensorData>(SENSOR_DEFAULTS);
  const [validationErrors, setErrors] = useState<ValidationError[]>([]);
  const connectingRef = useRef(new Set<string>());
  const decisionTreeRef = useRef<DecisionTreeHandle>(null);
  const toastKeyRef = useRef<string | null>(null);
  const autoAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const testingRef = useRef(testing);
  const robotTeamsRef = useRef(robotTeams);
  const controledRobotRef = useRef(controledRobot);
  const activeQuestionRef = useRef<string | null>(null);
  const robotConfigsRef = useRef(robotConfigs);
  const physicalRobotDataRef = useRef(physicalRobotData);
  const statusesRef = useRef(statuses);
  const fieldTestRef = useRef(stepDef.features.fieldTest);
  const algorithmModeRef = useRef(stepDef.features.algorithmMode);
  const algorithmTreeRef = useRef(algorithmTree);
  const correctedCriteriaRef = useRef(correctedCriteria);
  const aiActiveRef = useRef(aiActive);
  useLayoutEffect(() => {
    testingRef.current = testing;
  }, [testing]);
  useLayoutEffect(() => {
    robotTeamsRef.current = robotTeams;
  }, [robotTeams]);
  useLayoutEffect(() => {
    controledRobotRef.current = controledRobot;
  }, [controledRobot]);
  useLayoutEffect(() => {
    activeQuestionRef.current = activeQuestion;
  }, [activeQuestion]);
  useLayoutEffect(() => {
    robotConfigsRef.current = robotConfigs;
  }, [robotConfigs]);
  useLayoutEffect(() => {
    physicalRobotDataRef.current = physicalRobotData;
  }, [physicalRobotData]);
  useLayoutEffect(() => {
    statusesRef.current = statuses;
  }, [statuses]);
  useLayoutEffect(() => {
    fieldTestRef.current = stepDef.features.fieldTest;
  }, [stepDef.features.fieldTest]);
  useLayoutEffect(() => {
    algorithmModeRef.current = stepDef.features.algorithmMode;
  }, [stepDef.features.algorithmMode]);
  useLayoutEffect(() => {
    algorithmTreeRef.current = algorithmTree;
  }, [algorithmTree]);
  useLayoutEffect(() => {
    correctedCriteriaRef.current = correctedCriteria;
  }, [correctedCriteria]);
  useLayoutEffect(() => {
    aiActiveRef.current = aiActive;
  }, [aiActive]);

  // Everyone regroups at the desk when reaching step 4: reset all robots back to "bureau", and
  // always land on the tree tab (not wherever "Opération manuelle" was left at, e.g. from step 2).
  const prevStepIndexRef = useRef(stepIndex);
  useEffect(() => {
    if (stepIndex === 4 && prevStepIndexRef.current !== 4) {
      const allBureau: Record<string, RobotTeam> = {};
      robotConfigsRef.current.forEach(r => {
        allBureau[r.uuid] = 'bureau';
      });
      setRobotTeams(allBureau);
      setManualMode(false);
    }
    prevStepIndexRef.current = stepIndex;
  }, [stepIndex, setRobotTeams]);

  // Any physically-connected robot that has never been run through the lab tree (steps 1-2) gets
  // its lab + terrain data completed straight from its ground-truth profile (CORE_PROFILES[r.profileIndex],
  // same convention as robotProfiles.ts), as soon as terrain testing starts (step 3 onward). This
  // covers both the 5th/6th "new robots" slots — steps 1-4
  // never expose them via activeRobotConfigs, so they're always untested going in — and a robot
  // physically swapped in later for one of the original four (e.g. a broken unit replaced by a
  // spare): there's no way back to steps 1-2's UI for it once the class has moved on, so this is
  // the only way it ever gets data. Robots that DID go through the lab normally already have
  // `tested: true` (steps 1-2's own canAdvance guarantees that before step 3 is reachable), so
  // they're skipped here — their terrain observation still only comes from an actual TerrainModal
  // run. Each robot only ever gets filled once — the `tested` check makes re-running this on every
  // render a no-op afterward.
  useEffect(() => {
    if (stepIndex < 3) {
      return;
    }
    let physicalUpdates: Record<string, RobotEntry> | null = null;
    robotConfigs.forEach(r => {
      const profile = CORE_PROFILES[r.profileIndex];
      if (!profile || physicalRobotData[r.uuid]?.tested) {
        return;
      }
      physicalUpdates = physicalUpdates ?? { ...physicalRobotData };
      physicalUpdates[r.uuid] = {
        ...EMPTY_ROBOT_ENTRY,
        testResults: { ...profile.config },
        tested: true,
        observation: { category: profile.expectedCategory, notes: '' },
      };
    });
    if (physicalUpdates) {
      setPhysicalRobotData(physicalUpdates);
    }
  }, [stepIndex, robotConfigs, physicalRobotData, setPhysicalRobotData]);

  // "De nouveaux robots" step: when the 5th/6th core slots have no real physically-configured
  // robot, a synthetic stand-in fills their place instead (keyed by profileIndex — see
  // DataTable.tsx and DecisionTree.tsx, which both fold newRobotsDataset in
  // alongside real robots for this step). Real robots in those slots are handled by the effect
  // above (not gated the same way — they're already complete by the time this step is reached).
  // Each slot only ever writes once — the "already there?" check makes re-running this on every
  // render a no-op once done. Gated on newRobotsArmed (set by StepIntroModal once the step-5 intro
  // is dismissed) so the new rows appear — and fly in — right after the student sees that modal,
  // instead of silently existing before they ever read it.
  useEffect(() => {
    if (stepIndex !== 5 || !newRobotsArmed) {
      return;
    }
    const newEntries: ExternalRobotEntry[] = [];
    // Shuffled once per run so the two synthetic robots (if both needed) get distinct names.
    const nicknamePool = [...NEW_ROBOT_NICKNAMES].sort(() => Math.random() - 0.5);
    [MIN_ROBOTS, MIN_ROBOTS + 1].forEach(profileIndex => {
      const profile = CORE_PROFILES[profileIndex];
      if (!profile || robotConfigs.some(r => r.profileIndex === profileIndex)) {
        return;
      }
      const id = `new-robot-${profileIndex + 1}`;
      if (newRobotsDataset.some(e => e.id === id)) {
        return;
      }
      newEntries.push({
        id,
        label: nicknamePool[newEntries.length] ?? `${profileIndex - MIN_ROBOTS + 1}`,
        testResults: { ...profile.config },
        tested: true,
        observation: { category: profile.expectedCategory, notes: '' },
      });
    });
    if (newEntries.length > 0) {
      setNewRobotsDataset([...newRobotsDataset, ...newEntries]);
    }
  }, [stepIndex, newRobotsArmed, robotConfigs, newRobotsDataset, setNewRobotsDataset]);

  // Step 8 only: whether the student's own algorithm tree currently classifies this robot as
  // needing repair — mirrors DataTable's live "Prédiction" column (classifyWithAlgoTree over the
  // robot's recorded testResults). Pushed to the robot as `to_repair` so the firmware itself
  // refuses to launch a run and beeps the failure sound instead — the AI decides who goes out,
  // same as it will later decide in the data table. Gated on aiActive (FinalTestModal's toggle):
  // until the student explicitly connects their AI to the robots, every robot gets 0 regardless of
  // what the tree would say. At any other step (no algorithm tree yet) this is always 0 too, so it
  // never affects step 3's raw terrain gathering.
  const computeToRepair = useCallback((uuid: string): 0 | 1 => {
    if (!aiActiveRef.current || !algorithmModeRef.current || !algorithmTreeRef.current) {
      return 0;
    }
    const testResults = physicalRobotDataRef.current[uuid]?.testResults ?? {};
    return classifyWithAlgoTree(algorithmTreeRef.current, testResults) === 'repair' ? 1 : 0;
  }, []);

  // Field-test steps (3 & 8): put every ready robot in field mode (enables the center-button
  // line-follow test) on entry, and take them back out of it again on exit.
  const prevFieldTestRef = useRef(false);
  useEffect(() => {
    const isFieldTest = stepDef.features.fieldTest;
    if (isFieldTest === prevFieldTestRef.current) {
      return;
    }
    prevFieldTestRef.current = isFieldTest;
    const event = isFieldTest ? 'set_mode_on' : 'set_mode_off';
    robotConfigsRef.current.forEach(({ uuid }) => {
      if (statusesRef.current[uuid] !== 'ready') {
        return;
      }
      if (isFieldTest) {
        user.setVariables(uuid, new Map([['to_repair', [computeToRepair(uuid)]]]));
      }
      user.emitEvent(uuid, event).catch((err: unknown) => {
        console.warn(`[SoftwareMain] ${event} failed for ${uuid}:`, err);
      });
    });
  }, [stepDef.features.fieldTest, user, computeToRepair]);

  // Re-sync `to_repair` whenever the algorithm tree changes, or the student flips FinalTestModal's
  // toggle, while step 8's field test is active. The push above only fires once, on the edge where
  // field testing *starts* — it can't by itself cover a robot that was already sitting in the
  // field before the tree had a value to give it (e.g. right after a page reload, DecisionTree.tsx's
  // AlgorithmCanvas needs a render or two to restore its persisted tree into context), nor the
  // moment the student actually activates/deactivates their AI on an already-connected robot. This
  // effect catches both, and is a no-op resend on every other legitimate tree update.
  useEffect(() => {
    if (!stepDef.features.fieldTest || !stepDef.features.algorithmMode) {
      return;
    }
    robotConfigsRef.current.forEach(({ uuid }) => {
      if (statusesRef.current[uuid] !== 'ready') {
        return;
      }
      user.setVariables(uuid, new Map([['to_repair', [computeToRepair(uuid)]]]));
    });
  }, [algorithmTree, aiActive, stepDef.features.fieldTest, stepDef.features.algorithmMode, user, computeToRepair]);

  // Records robot data with a small flying-dot animation from the tree to the corresponding
  // data-table cell (identified by its data-cell="<uuid>-<cellSuffix>" attribute), landing before
  // the value actually appears — falls back to applying immediately if either endpoint isn't found.
  const treeAreaRef = useRef<HTMLDivElement>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const flyToCell = useCallback((uuid: string, cellSuffix: string, onComplete: () => void) => {
    const originEl = treeAreaRef.current;
    const targetEl = document.querySelector(`[data-cell="${uuid}-${cellSuffix}"]`);
    if (originEl && targetEl) {
      const originRect = originEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();
      const color = ROBOT_COLORS.find(c => c.id === robotConfigsRef.current.find(r => r.uuid === uuid)?.color)?.hex;
      setFlights(prev => [
        ...prev,
        {
          id: `${uuid}-${cellSuffix}-${Date.now()}`,
          from: {
            x: originRect.left + originRect.width / 2 - FLIGHT_DOT_SIZE / 2,
            y: originRect.top + originRect.height / 2 - FLIGHT_DOT_SIZE / 2,
          },
          to: {
            x: targetRect.left + targetRect.width / 2 - FLIGHT_DOT_SIZE / 2,
            y: targetRect.top + targetRect.height / 2 - FLIGHT_DOT_SIZE / 2,
          },
          color: color ?? '#3b82f6',
          onComplete,
        },
      ]);
    } else {
      onComplete();
    }
  }, []);

  // Marks the currently-selected robot as tested once its test run reaches a tree leaf, and
  // freezes the tree's verdict there. The `entry.tested` check means the recorded verdict only
  // ever comes from the very first leaf (step 2's initial tree), so labVerdict stays the lab's
  // original prediction even after the tree is edited in step 4 — that frozen value is what the
  // step-4 reunion compares against. Re-running the test later (e.g. after revisiting this robot)
  // still animates and stops the button normally, it just doesn't overwrite that frozen verdict.
  const handleLeafReached = useCallback(
    (_nodeId: string, decision: boolean | null) => {
      const uuid = controledRobotRef.current;
      if (!uuid) {
        return;
      }
      const entry = physicalRobotDataRef.current[uuid] ?? EMPTY_ROBOT_ENTRY;
      const alreadyTested = entry.tested;
      const labVerdict = decision === null ? null : decision ? 'ready' : 'repair';
      flyToCell(uuid, 'prediction', () => {
        if (!alreadyTested) {
          const latest = physicalRobotDataRef.current[uuid] ?? EMPTY_ROBOT_ENTRY;
          setPhysicalRobotData({ ...physicalRobotDataRef.current, [uuid]: { ...latest, tested: true, labVerdict } });
        }
        // The test has reached its verdict — "Arrêter" no longer makes sense; the button now
        // shows disabled for as long as this robot (and its colored result) stays on screen —
        // see testResultRobot, reset the moment a different robot gets selected.
        setTesting(false);
        setTestResultRobot(uuid);
      });
    },
    [flyToCell, setPhysicalRobotData]
  );

  // Records the observed value for the criterion behind the currently-active question.
  const recordCriterionResult = useCallback(
    (value: number) => {
      const uuid = controledRobotRef.current;
      const criterion = activeQuestionRef.current && questionIdToCriterion(activeQuestionRef.current);
      if (!uuid || !criterion) {
        return;
      }
      // No flying-dot animation here (unlike handleLeafReached below) — it's reserved for the
      // final tree verdict landing in the table; intermediate criterion results just update
      // directly.
      const entry = physicalRobotDataRef.current[uuid] ?? EMPTY_ROBOT_ENTRY;
      const priorManualValue = entry.testResults[criterion];
      // A prior value came from the student's own manual entry (step 1) — if the tree's real
      // test measures something else, that's not noise, it's the whole point: flag it so the
      // DataTable can mark the cell instead of silently overwriting it.
      if (priorManualValue !== undefined && priorManualValue !== value) {
        setCorrectedCriteria({ ...correctedCriteriaRef.current, [`${uuid}-${criterion}`]: priorManualValue });
      }
      setPhysicalRobotData({
        ...physicalRobotDataRef.current,
        [uuid]: { ...entry, testResults: { ...entry.testResults, [criterion]: value } },
      });
    },
    [setPhysicalRobotData, setCorrectedCriteria]
  );

  // Guards against answering the same question twice: `seq_done` can arrive together with its
  // status-stream fallback (see Thymio2EventVariable's seq_confirmed — a dropped seq_done is
  // covered by watching status_seq_type fall back to SEQ_NULL instead of relying on a single
  // one-shot packet), and either can occasionally show up as a duplicate. Reset per question in
  // handleActiveQuestion.
  const seqAnsweredRef = useRef(false);

  // Called when the robot confirms a test sequence finished — either the real seq_done event,
  // or its status-stream fallback. Both just mean "the sequence the app started has ended"; the
  // actual answer comes from the config the app already pushed to the robot before starting the
  // test (handleActiveQuestion below), not from either signal's payload.
  const handleSeqDone = useCallback(() => {
    if (!testingRef.current || seqAnsweredRef.current) {
      return;
    }
    const uuid = controledRobotRef.current;
    const questionId = activeQuestionRef.current;
    const criterion = questionId && questionIdToCriterion(questionId);
    const profileIndex = uuid ? robotConfigsRef.current.find(r => r.uuid === uuid)?.profileIndex : undefined;
    const cfg = profileIndex !== undefined ? CORE_PROFILES[profileIndex]?.config : undefined;
    if (!uuid || !questionId || !criterion || !cfg) {
      return;
    }
    seqAnsweredRef.current = true;
    if (autoAnswerTimerRef.current) {
      clearTimeout(autoAnswerTimerRef.current);
      autoAnswerTimerRef.current = null;
    }
    recordCriterionResult(cfg[criterion]);
    decisionTreeRef.current?.answerFrontier(getAnswerForQuestion(questionId, cfg));
  }, [recordCriterionResult]);

  // Guards the field-mode reconciliation below against piling up a second retry for a robot
  // that already has one in flight (the store's own emitEvent already retries a few times
  // internally before giving up — see Thymio2EventVariable.emitEvent's EVENT_CONFIRMATIONS).
  const fieldModeSyncingRef = useRef(new Set<string>());

  const tryConnect = useCallback(
    (uuid: string) => {
      if (connectingRef.current.has(uuid)) {
        return;
      }
      connectingRef.current.add(uuid);
      setStatuses(prev => ({ ...prev, [uuid]: 'connecting' }));
      initializeRobot(uuid, (_u, vars) => {
        if (vars.status_battery !== undefined && uuid === controledRobotRef.current) {
          setSensorData({
            battery: vars.status_battery,
            mic: vars.status_mic ?? 0,
            prox: [
              vars.status_prox_0 ?? 0,
              vars.status_prox_1 ?? 0,
              vars.status_prox_2 ?? 0,
              vars.status_prox_3 ?? 0,
              vars.status_prox_4 ?? 0,
            ],
            seqType: vars.status_seq_type ?? 0,
            light: vars.status_light ?? 0,
          });
        }
        if ((vars.seq_done !== undefined || vars.seq_confirmed !== undefined) && uuid === controledRobotRef.current) {
          handleSeqDone();
        }
        // Self-heal field_mode from the robot's own telemetry (emitted continuously via
        // onevent prox in the firmware) instead of trusting the one-shot set_mode_on/off call
        // to have landed — on page reload several robots reconnect at once and the store's
        // built-in retry (≈1.2 s total) can lose that race under WiFi congestion, silently
        // leaving a robot stuck out of field mode with nothing to correct it afterwards.
        if (vars.status_field_mode !== undefined && !fieldModeSyncingRef.current.has(uuid)) {
          const desired = fieldTestRef.current ? 1 : 0;
          if (vars.status_field_mode !== desired) {
            fieldModeSyncingRef.current.add(uuid);
            user
              .emitEvent(uuid, desired ? 'set_mode_on' : 'set_mode_off')
              .catch((err: unknown) => {
                console.warn('[SoftwareMain] field_mode resync failed for', uuid, err);
              })
              .finally(() => {
                fieldModeSyncingRef.current.delete(uuid);
              });
          }
        }
      })
        .then(async () => {
          connectingRef.current.delete(uuid);
          setStatuses(prev => ({ ...prev, [uuid]: 'ready' }));
          const isField = robotTeamsRef.current[uuid] === 'terrain';
          const profileIndex = robotConfigsRef.current.find(r => r.uuid === uuid)?.profileIndex;
          const cfg = profileIndex !== undefined ? CORE_PROFILES[profileIndex]?.config : undefined;
          const initVars = new Map<string, number[]>([
            ['field_mode', [isField ? 1 : 0]],
            ['to_repair', [computeToRepair(uuid)]],
          ]);
          if (cfg) {
            initVars.set('light_working', [cfg.light_working]);
            initVars.set('ir_working', [cfg.ir_working]);
            initVars.set('motor_noise', [cfg.motor_noise]);
            initVars.set('battery_level', [cfg.battery_level]);
          }
          await user.setVariables(uuid, initVars);
          console.log('[SoftwareMain] emitting set_battery, cfg:', cfg, 'uuid:', uuid);
          if (cfg) {
            user.emitEvent(uuid, 'set_battery');
          }
          // Robot connected mid-field-test (e.g. reconnect): put it straight into field mode.
          if (fieldTestRef.current) {
            user.emitEvent(uuid, 'set_mode_on').catch((err: unknown) => {
              console.warn('[SoftwareMain] set_mode_on on connect failed for', uuid, err);
            });
          }
        })
        .catch((err: unknown) => {
          connectingRef.current.delete(uuid);
          // Show greyed — the next poll will retry if TDM reports the robot available again.
          setStatuses(prev => ({ ...prev, [uuid]: 'disconnected' }));
          console.warn('[SoftwareMain] initializeRobot failed (will retry):', err);
        });
    },
    [initializeRobot, user, handleSeqDone, computeToRepair]
  );

  // Poll TDM every 2 s; auto-connect any robot that becomes 'available'.
  useEffect(() => {
    const poll = () => {
      controllableRobots.forEach(({ uuid }) => {
        if (connectingRef.current.has(uuid)) {
          return;
        }
        const tdm = user.getRobotStatus(uuid);
        setStatuses(prev => ({ ...prev, [uuid]: tdm ?? 'disconnected' }));
        if (tdm === 'available') {
          tryConnect(uuid);
        }
      });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [controllableRobots, user, tryConnect]);

  const prevRobotRef = useRef<string>('');
  const sensorDataRef = useRef<SensorData>(SENSOR_DEFAULTS);
  sensorDataRef.current = sensorData;
  useEffect(() => {
    const prevRobot = prevRobotRef.current;
    prevRobotRef.current = controledRobot;
    if (prevRobot && sensorDataRef.current.light > 0) {
      user.emitEvent(prevRobot, 'light_off');
    }
    setSensorData(SENSOR_DEFAULTS);
  }, [controledRobot]);

  // Deselect if the selected robot is no longer ready.
  useEffect(() => {
    if (controledRobot && displayState(statuses[controledRobot]) !== 'ready') {
      selectRobot('');
    }
  }, [statuses, controledRobot, selectRobot]);

  // Deselect if the selected robot is reassigned to the field team.
  useEffect(() => {
    if (controledRobot && !controllableRobots.some(r => r.uuid === controledRobot)) {
      selectRobot('');
    }
  }, [controllableRobots, controledRobot, selectRobot]);

  // Propagate team changes to already-initialised robots. Skipped during field-test steps (3 & 8)
  // — there, every robot must be in field_mode regardless of team, and that's already enforced by
  // the dedicated fieldTest effect above; letting this one run too would clobber that with stale
  // team assignments (e.g. leftover 'bureau' from a previous step-4 visit).
  useEffect(() => {
    if (stepDef.features.fieldTest) {
      return;
    }
    robotConfigs.forEach(({ uuid }) => {
      if (statuses[uuid] !== 'ready') {
        return;
      }
      const isField = robotTeams[uuid] === 'terrain';
      user.setVariables(uuid, new Map([['field_mode', [isField ? 1 : 0]]]));
    });
  }, [robotTeams, stepDef.features.fieldTest]);

  const robotReady = !!controledRobot && statuses[controledRobot] === 'ready';
  // True while the currently selected robot's colored test result is still the one showing in the
  // tree — "Lancer le test" stays disabled (not offered as "Arrêter") for that window, but re-
  // enables the moment a different robot is selected, even if that one was tested before too.
  const testResultVisible = !!controledRobot && testResultRobot === controledRobot;
  const treeValid = validationErrors.length === 0;
  // Clear any pending auto-answer when testing stops.
  useEffect(() => {
    if (!testing) {
      if (autoAnswerTimerRef.current) {
        clearTimeout(autoAnswerTimerRef.current);
        autoAnswerTimerRef.current = null;
      }
      setActiveQuestion(null);
    }
  }, [testing]);

  // Fired by DecisionTree whenever the frontier question changes.
  // Sends SetConfig + SeqStart to the robot, then schedules an automatic
  // Oui/Non answer derived from the robot's colour config.
  const handleActiveQuestion = useCallback(
    (questionId: string | null) => {
      setActiveQuestion(questionId);
      if (autoAnswerTimerRef.current) {
        clearTimeout(autoAnswerTimerRef.current);
        autoAnswerTimerRef.current = null;
      }
      seqAnsweredRef.current = false;
      console.log('[SoftwareMain] handleActiveQuestion', questionId, 'robot:', controledRobot);
      if (!questionId || !controledRobot) {
        return;
      }
      const profileIndex = robotConfigs.find(r => r.uuid === controledRobot)?.profileIndex;
      const cfg = profileIndex !== undefined ? CORE_PROFILES[profileIndex]?.config : undefined;
      if (!cfg) {
        return;
      }

      const seqEvent = QUESTION_SEQ_TYPE[questionId];

      // Push config variables, then emit the event that starts the sequence.
      const vars = new Map<string, number[]>([
        ['light_working', [cfg.light_working]],
        ['ir_working', [cfg.ir_working]],
        ['motor_noise', [cfg.motor_noise]],
        ['battery_level', [cfg.battery_level]],
        ['line_follow', [0]],
      ]);
      user.setVariables(controledRobot, vars);
      if (seqEvent) {
        user.emitEvent(controledRobot, seqEvent);
      }

      // If the robot doesn't emit seq_done within 6 s, surface an error and stop the test.
      autoAnswerTimerRef.current = setTimeout(() => {
        autoAnswerTimerRef.current = null;
        if (!testingRef.current) {
          return;
        }
        setTesting(false);
        if (toastKeyRef.current) {
          Toast.toast.close(toastKeyRef.current);
        }
        const key = Toast.toast.warning('Robot sans réponse', {
          description: `Le robot n'a pas réagi dans les ${Math.round(
            SEQ_TIMEOUT_MS / 1000
          )} secondes. Vérifiez la connexion.`,
          timeout: SEQ_TIMEOUT_MS,
        });
        toastKeyRef.current = key;
      }, SEQ_TIMEOUT_MS);
    },
    [controledRobot, robotConfigs, user]
  );

  const handleLaunchTest = useCallback(() => {
    if (testing) {
      setTesting(false);
      return;
    }
    if (!treeValid) {
      if (toastKeyRef.current) {
        Toast.toast.close(toastKeyRef.current);
      }
      const first = validationErrors[0];
      const key = Toast.toast.warning('Arbre incomplet', {
        description: first.message,
        timeout: SEQ_TIMEOUT_MS,
        actionProps: {
          children: 'Voir',
          variant: 'secondary',
          onPress: () => {
            decisionTreeRef.current?.focusAndHighlight(first.nodeId);
            if (toastKeyRef.current) {
              Toast.toast.close(toastKeyRef.current);
              toastKeyRef.current = null;
            }
          },
        },
      });
      toastKeyRef.current = key;
      return;
    }
    setTesting(true);
  }, [testing, treeValid, validationErrors]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--color-beige-light)' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-6 py-2 border-b shrink-0">
        <img src={logo} alt="SavannIA" className="h-8 mt-1" />
      </header>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Programme (2/3) */}
        <div
          data-tour="left-panel"
          className="flex flex-col gap-4 p-4 border-r overflow-hidden"
          style={{ flex: '4 1 0' }}
        >
          <div className="flex flex-col flex-1 min-h-0">
            {/* Action row */}
            <div className="shrink-0 flex items-center gap-3">
              {/* Tab pill */}
              <div
                data-tour="robot-selector"
                className="flex items-center gap-2 bg-gray-50 border border-b-0 border-gray-100 rounded-t-xl px-3 py-1"
              >
                <img src={thymioIcon} alt="Robot :" className="h-10 mr-1 transition-all duration-300" />

                {stepDef.features.algorithmMode ? (
                  <span className="text-sm font-medium text-gray-600 px-1">
                    {algorithmDatasetCount} robot{algorithmDatasetCount > 1 ? 's' : ''}
                  </span>
                ) : showAggregateRobots ? (
                  <span className="text-sm font-medium text-gray-600 px-1">
                    {activeRobotConfigs.length + newRobotsDataset.length + externalDataset.length} robot
                    {activeRobotConfigs.length + newRobotsDataset.length + externalDataset.length > 1 ? 's' : ''}
                  </span>
                ) : (
                  <>
                    <div className="flex gap-2 items-center">
                      {controllableRobots.map(({ uuid, color }) => {
                        const c = ROBOT_COLORS.find(x => x.id === color)!;
                        const ds = displayState(statuses[uuid]);
                        const isSelected = controledRobot === uuid && ds === 'ready';
                        // Other robots only become selectable again once no test is running at
                        // all — not just between questions — so switching mid-test always
                        // requires explicitly stopping it (Arrêter) first.
                        const locked = testing;

                        return (
                          <RobotDot
                            key={uuid}
                            hex={c.hex}
                            label={c.label}
                            displayState={ds}
                            selected={isSelected}
                            locked={locked}
                            onClick={() => {
                              if (ds !== 'ready' || locked) {
                                return;
                              }
                              selectRobot(uuid);
                            }}
                          />
                        );
                      })}
                      {controllableRobots.length === 0 && <span className="text-xs text-gray-400">—</span>}
                    </div>

                    {showTree && !effectiveManualMode && (
                      <>
                        <div className="w-px h-4 bg-gray-200 mx-1" />
                        <div data-tour="launch-test-button">
                          <Button
                            variant={!testing && !treeValid && robotReady ? 'secondary' : 'primary'}
                            size="sm"
                            isDisabled={
                              !testing && (!robotReady || testResultVisible || isLaunchTestLockedByTour(tourStep))
                            }
                            onPress={handleLaunchTest}
                            className={testing ? '!bg-red-500' : ''}
                          >
                            {testing ? '■ Arrêter' : '▶ Lancer le test'}
                          </Button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="flex-1" />

              {stepDef.features.teamSwitch && (
                <Button variant="outline" size="sm" isDisabled={testing} onPress={() => setTeamModalOpen(true)}>
                  <ArrowRightArrowLeft />
                  Tests terrain
                </Button>
              )}

              {showToggle &&
                (manualMode ? (
                  <Button variant="primary" size="sm" onPress={() => setManualMode(false)} className="!bg-gray-700">
                    <LogoDrawIo />
                    Arbre de décision
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onPress={() => {
                      setTesting(false);
                      setManualMode(true);
                    }}
                    className="!bg-gray-700"
                  >
                    <Sliders />
                    Opération manuelle
                  </Button>
                ))}
            </div>

            {/* Main content: tree or manual operation */}
            <div
              ref={treeAreaRef}
              data-tour="tree-zone"
              className="flex-1 min-h-0 rounded-xl rounded-tl-none overflow-hidden border border-gray-100 bg-white"
            >
              {stepDef.features.algorithmMode ? (
                step7DemoActive ? (
                  <DecisionTree key="algorithm-demo" mode="algorithm" previewMode />
                ) : (
                  <DecisionTree key="algorithm-real" mode="algorithm" frozen={stepDef.features.fieldTest} />
                )
              ) : !showTree && !showManual ? (
                <div className="w-full h-full flex items-center justify-center">
                  <p className="text-gray-300 text-sm">Cette étape sera bientôt disponible</p>
                </div>
              ) : effectiveManualMode ? (
                <ManualOperation
                  robotId={controledRobot}
                  disabled={!robotReady}
                  onEmitEvent={event => user.emitEvent(controledRobot, event)}
                  arc={sensorData.battery / 224}
                  level={sensorData.mic / 255}
                  radar={sensorData.prox.map(proxToDepth)}
                />
              ) : (
                <DecisionTree
                  ref={decisionTreeRef}
                  testing={testing}
                  editable={stepDef.features.treeEditable}
                  deletable={stepDef.features.treeDeletable}
                  robotPlacement={stepDef.features.robotPlacementOnTree}
                  onValidationChange={setErrors}
                  onActiveQuestionChange={handleActiveQuestion}
                  onLeafReached={handleLeafReached}
                  onClassificationChange={setTreeAccuracy}
                  onStructuralEdit={() => setTreeEditCount(treeEditCount + 1)}
                />
              )}
            </div>
          </div>
        </div>

        {/* Right — Timeline + Data (1/3) */}
        <div className="flex flex-col overflow-hidden" style={{ flex: '2 1 0' }}>
          <div className="flex flex-col gap-3 px-5 py-4 border-b overflow-y-auto" style={{ flex: '1.15 1 0' }}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 shrink-0">
              Journal de mission
            </h3>
            <TimelinePanel />
            {isFinalStep && (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onPress={() => setFinalTestReopenToken(t => t + 1)}
              >
                Test final
              </Button>
            )}
          </div>

          <div data-tour="table-zone" className="flex flex-col gap-3 px-5 py-4 overflow-y-auto" style={{ flex: '1 1 0' }}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 shrink-0">Observations</h3>
            {stepDef.features.dataTable ? (
              <DataTable />
            ) : (
              <div className="flex-1 min-h-0 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                <p className="text-gray-300 text-sm">À définir</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {stepDef.features.teamSwitch && <TeamModal isOpen={teamModalOpen} onClose={() => setTeamModalOpen(false)} />}
      <StepIntroModal />
      <TourOverlay />
      <DecisionTreeIntroModal />
      <ReunionModal />
      <TerrainModal />
      <ExternalDataIntroModal />
      <ExternalDataReadyModal />
      <TreeDifficultyModal />
      <Step7IntroModal />
      <FinalTestModal reopenToken={finalTestReopenToken} />
      <DataCheckModal />

      <AnimatePresence>
        {flights.map(f => (
          <motion.div
            key={f.id}
            className="fixed rounded-full z-[100] pointer-events-none"
            style={{
              backgroundColor: f.color,
              width: FLIGHT_DOT_SIZE,
              height: FLIGHT_DOT_SIZE,
              boxShadow: `0 0 0 4px ${f.color}33, 0 2px 8px rgba(0,0,0,0.35)`,
            }}
            initial={{ left: f.from.x, top: f.from.y, opacity: 1, scale: 0.6 }}
            animate={{
              left: f.to.x,
              top: f.to.y,
              // Stays fully opaque for most of the flight — only fades in the last stretch, right
              // before landing — instead of visibly fading through the whole middle of the trip.
              opacity: [1, 1, 0],
              scale: [0.6, 1.4, 0.5],
            }}
            transition={{
              duration: 1,
              ease: 'easeInOut',
              // A nested per-property transition doesn't inherit duration/ease from the parent —
              // without repeating them here, opacity was falling back to Framer Motion's default
              // (much shorter) tween, fading the dot out way earlier than the rest of the flight.
              opacity: { duration: 1, ease: 'easeInOut', times: [0, 0.8, 1] },
            }}
            onAnimationComplete={() => {
              f.onComplete();
              setFlights(prev => prev.filter(x => x.id !== f.id));
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ── RobotDot ─────────────────────────────────────────────── */

function RobotDot({
  hex,
  label,
  displayState: ds,
  selected,
  locked = false,
  onClick,
}: {
  hex: string;
  label: string;
  displayState: 'ready' | 'connecting' | 'unavailable';
  selected: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  const clickable = ds === 'ready' && !locked;

  return (
    <div className="relative w-8 h-8" title={`${label} — ${ds}`}>
      {/* Spinning ring while connecting */}
      {ds === 'connecting' && (
        <span
          className="absolute inset-0 rounded-full border-2 border-gray-600 animate-spin pointer-events-none"
          style={{ borderTopColor: 'transparent' }}
        />
      )}

      <button
        onClick={onClick}
        disabled={!clickable}
        style={{
          backgroundColor: hex,
          opacity: ds === 'ready' ? (locked && !selected ? 0.35 : 1) : 0.35,
        }}
        className={`absolute inset-0 rounded-full border-3 flex items-center justify-center
          text-white text-sm font-bold leading-none transition-all
          ${
            clickable
              ? selected
                ? 'border-gray-900 scale-110 shadow cursor-pointer'
                : 'border-transparent hover:border-gray-400 hover:scale-105 cursor-pointer'
              : 'border-transparent cursor-default'
          }`}
      >
        {selected && '✓'}
      </button>
    </div>
  );
}

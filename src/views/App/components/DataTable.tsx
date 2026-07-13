import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckShape, Ban } from '@gravity-ui/icons';
import { ROBOT_COLORS, useScenario } from '../ScenarioContext';
import {
  classifyWithAlgoTree,
  EMPTY_ROBOT_ENTRY,
  getStepDef,
  hasAllCriteria,
  type Criterion,
  type RobotEntry,
} from '../steps/stepDefinitions';
import { getWrongCriteria } from '../robotProfiles';
import { EditRobotModal, BOOL_OPTIONS, NOISE_OPTIONS, BATTERY_OPTIONS } from './EditRobotModal';
import { TOUR_ADVANCE_DELAY_MS, TOUR_INTERLUDE_2, TOUR4_STEP, isPredictionLockedByTour } from './TourOverlay';
import './TreeNodes.css';

// New-row fly-in animation (external dataset / new robots) — stagger delay per row and each row's
// own duration. Shared with ExternalDataIntroModal, which times its follow-up modal off these.
export const ROW_STAGGER_S = 0.05;
export const ROW_DURATION_S = 0.15;

const CRITERIA: Criterion[] = ['light_working', 'ir_working', 'motor_noise', 'battery_level'];

const CRITERIA_LABELS: Record<Criterion, string[]> = {
  light_working: ['Lumière'],
  ir_working: ['Capteurs', 'distance'],
  motor_noise: ['Bruit', 'moteur'],
  battery_level: ['Batterie'],
};

const CRITERIA_OPTIONS: Record<Criterion, { value: number; label: string }[]> = {
  light_working: BOOL_OPTIONS,
  ir_working: BOOL_OPTIONS,
  motor_noise: NOISE_OPTIONS,
  battery_level: BATTERY_OPTIONS,
};

function formatValue(criterion: Criterion, value: number | undefined): string {
  if (value === undefined) {
    return '–';
  }
  return CRITERIA_OPTIONS[criterion].find(o => o.value === value)?.label ?? '–';
}

function formatResult(category: 'ready' | 'repair' | undefined): string {
  if (!category) {
    return '–';
  }
  return category === 'ready' ? 'Partir' : 'Réparer';
}

/** Read-only ready/repair display — same icon convention as the editable Pronostic buttons below
 * (and the rest of the app). `invert` is for use on a robot-color background (live tree result),
 * where green/amber would clash — falls back to plain white text instead. */
function ResultBadge({ category, invert = false }: { category: 'ready' | 'repair' | undefined; invert?: boolean }) {
  if (!category) {
    return <span className="text-gray-300">–</span>;
  }
  const ready = category === 'ready';
  const Icon = ready ? CheckShape : Ban;
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        invert ? 'text-white font-medium' : ready ? 'text-green-700' : 'text-amber-700'
      }`}
    >
      <Icon width={11} height={11} />
      {formatResult(category)}
    </span>
  );
}

type Row = {
  key: string;
  label: string;
  color?: string;
  uuid?: string;
  entry: RobotEntry | undefined;
  isExternal: boolean;
  arrivalIndex?: number;
};

export function DataTable() {
  const {
    stepIndex,
    activeRobotConfigs: robotConfigs,
    physicalRobotData,
    setPhysicalRobotData,
    externalDataset,
    newRobotsDataset,
    dataCheckFailed,
    algorithmTree,
    manualTree,
    correctedCriteria,
    controledRobot,
    testResultRobot,
    tourStep,
    setTourStep,
    setEditRobotModalOpen,
  } = useScenario();
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The guided tour waits for this modal to close before showing its next popover.
  useEffect(() => {
    setEditRobotModalOpen(editingUuid !== null);
  }, [editingUuid, setEditRobotModalOpen]);

  // Keeps the newly-arrived rows (external dataset / new robots) in view while they fly in.
  // Rather than an instant/native smooth-scroll (which reaches the bottom well before the later,
  // staggered rows have actually appeared), this animates scrollTop in step with the same total
  // duration as the row stagger itself, so the view "follows" the last row into place instead of
  // jumping ahead and leaving the student waiting at an already-bottomed-out scroll position.
  const externalRowCount = externalDataset.length + newRobotsDataset.length;
  useEffect(() => {
    const container = scrollRef.current;
    if (externalRowCount === 0 || !container) {
      return;
    }
    const settleMs = ((externalRowCount - 1) * ROW_STAGGER_S + ROW_DURATION_S) * 1000;
    const startTop = container.scrollTop;
    const targetTop = container.scrollHeight - container.clientHeight;
    const startTime = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / settleMs, 1);
      container.scrollTop = startTop + (targetTop - startTop) * t;
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [externalRowCount]);

  const stepDef = getStepDef(stepIndex);
  const activeTree = stepDef.features.algorithmMode ? algorithmTree : manualTree;
  // Terrain result column only appears once terrain observations exist (step 3 onward — step 3
  // itself has no data table, so in practice this first shows at step 4).
  const showResult = stepIndex >= 3;
  // The student's own GO/STAY commitment (PRIMM Predict): filled inline here in step 1 (their guess
  // from observation alone), then shown read-only in step 2 beside the tree's live verdict so
  // agreement or disagreement is visible the moment a robot lands on a leaf.
  const showPrediction = stepIndex === 1 || stepIndex === 2;
  const canEditPrediction = stepIndex === 1;
  // The live tree classification is meaningless at step 1 — no tree exists yet.
  const showLiveTree = stepIndex !== 1;
  const wrongCells = useMemo(
    () => (dataCheckFailed ? getWrongCriteria(robotConfigs, physicalRobotData) : null),
    [dataCheckFailed, robotConfigs, physicalRobotData]
  );

  const rows: Row[] = [
    ...robotConfigs.map(r => {
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      return {
        key: r.uuid,
        label: colorDef?.label ?? r.color,
        color: colorDef?.hex,
        uuid: r.uuid,
        entry: physicalRobotData[r.uuid],
        isExternal: false,
      };
    }),
    ...newRobotsDataset.map((e, i) => ({
      key: e.id,
      label: e.label,
      color: '#94a3b8',
      uuid: undefined,
      entry: e as RobotEntry,
      isExternal: true,
      arrivalIndex: i,
    })),
    ...externalDataset.map((e, i) => ({
      key: e.id,
      label: e.label,
      color: '#94a3b8',
      uuid: undefined,
      entry: e as RobotEntry,
      isExternal: true,
      arrivalIndex: i,
    })),
  ];

  const editingLabel = rows.find(r => r.uuid === editingUuid)?.label ?? '';

  // The tour's mid-objective is "any one robot with a full row" — not necessarily the one
  // originally selected — so step 8 targets whichever robot actually got there first.
  const tourTargetUuid = robotConfigs.find(r => hasAllCriteria(physicalRobotData[r.uuid]))?.uuid;

  const setPrediction = (uuid: string, prediction: 'ready' | 'repair') => {
    const entry = physicalRobotData[uuid] ?? EMPTY_ROBOT_ENTRY;
    setPhysicalRobotData({ ...physicalRobotData, [uuid]: { ...entry, prediction } });
    if (tourStep === 8 && uuid === tourTargetUuid) {
      setTimeout(() => setTourStep(TOUR_INTERLUDE_2), TOUR_ADVANCE_DELAY_MS);
    }
  };

  if (rows.length === 0) {
    return <p className="text-gray-300 text-sm">Aucun robot configuré</p>;
  }

  return (
    <div ref={scrollRef} className="overflow-auto rounded-xl border border-gray-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left align-top font-medium text-gray-400 px-3 py-2 border border-gray-200">Robot</th>
            {CRITERIA.map(c => (
              <th
                key={c}
                className="text-left align-top font-medium text-gray-400 px-2 py-2 leading-tight border border-gray-200"
              >
                {CRITERIA_LABELS[c].map(word => (
                  <span key={word} className="block">
                    {word}
                  </span>
                ))}
              </th>
            ))}
            {showPrediction && (
              <th className="text-left align-top font-medium text-gray-400 px-2 py-2 border border-gray-200">
                Pronostic
              </th>
            )}
            {showLiveTree && (
              <th className="text-left align-top font-medium text-gray-400 px-2 py-2 border border-gray-200">
                Prédiction
              </th>
            )}
            {showResult && (
              <th className="text-left align-top font-medium text-gray-400 px-2 py-2 border border-gray-200">
                Terrain
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            // Steps 1-3: the prediction only appears once a robot has actually been run through
            // the tree (same "tested" condition step 2 requires to advance) — it doesn't silently
            // update from data typed straight into the table. From step 4 on it tracks live.
            const canPredict = stepIndex > 3 || row.entry?.tested === true;
            const predicted =
              activeTree && canPredict ? classifyWithAlgoTree(activeTree, row.entry?.testResults ?? {}) : null;
            const observed = row.entry?.observation?.category;
            const mismatch = showResult && !!predicted && !!observed && predicted !== observed;
            // Same condition as the tree's own colored path (see DecisionTree.tsx): stays lit in
            // the robot's color from the moment its test lands here until a different robot gets
            // selected, not just for the instant the flying dot arrives.
            const isLiveResult = !!row.uuid && row.uuid === testResultRobot;
            const rowTourAttr =
              tourStep === 8 && row.uuid && row.uuid === tourTargetUuid
                ? 'prediction-row'
                : tourStep === 27 && row.uuid && row.uuid === controledRobot
                ? 'tree-result-row'
                : tourStep === TOUR4_STEP && mismatch
                ? 'mismatched-row'
                : row.uuid && row.uuid === controledRobot
                ? 'selected-robot-row'
                : undefined;
            return (
              <motion.tr
                key={row.key}
                data-tour={rowTourAttr}
                initial={row.isExternal ? { opacity: 0, x: 24 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: ROW_DURATION_S, delay: (row.arrivalIndex ?? 0) * ROW_STAGGER_S }}
                onClick={() => {
                  if (!row.uuid) {
                    return;
                  }
                  setEditingUuid(row.uuid);
                  if (tourStep === 5 && row.uuid === controledRobot) {
                    setTourStep(6);
                  }
                }}
                className={`hover:bg-gray-50/60 transition-colors ${row.uuid ? 'cursor-pointer' : ''}`}
              >
                <td className="px-3 py-2 border border-gray-100">
                  <span className="flex items-center gap-2">
                    {row.color ? (
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    ) : (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-gray-300" />
                    )}
                    {row.label}
                  </span>
                </td>
                {CRITERIA.map(c => {
                  const value = row.entry?.testResults[c];
                  const isWrong = !!row.uuid && wrongCells?.has(`${row.uuid}-${c}`);
                  const priorManualValue = row.uuid ? correctedCriteria[`${row.uuid}-${c}`] : undefined;
                  const isCorrected = priorManualValue !== undefined;
                  return (
                    <td
                      key={c}
                      data-cell={row.uuid ? `${row.uuid}-${c}` : undefined}
                      title={
                        isCorrected
                          ? `Tu avais noté « ${formatValue(c, priorManualValue)} », le test mesure « ${formatValue(
                              c,
                              value
                            )} ».`
                          : undefined
                      }
                      className={`relative px-2 py-2 text-gray-600 overflow-hidden ${
                        isWrong
                          ? 'bg-yellow-100 border-2 border-yellow-300'
                          : isCorrected
                          ? 'border-2 border-amber-300'
                          : 'border border-gray-100'
                      }`}
                    >
                      {isCorrected && (
                        <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                      )}
                      <motion.span
                        key={value ?? 'empty'}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="inline-block"
                      >
                        {formatValue(c, value)}
                      </motion.span>
                    </td>
                  );
                })}
                {showPrediction && (
                  <td className="px-1 py-1.5 border border-gray-100">
                    {row.uuid && canEditPrediction ? (
                      <div className="node flex gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          data-value="true"
                          data-selected={row.entry?.prediction === 'ready' || undefined}
                          onClick={() => setPrediction(row.uuid!, 'ready')}
                          disabled={isPredictionLockedByTour(tourStep)}
                          title="Prêt à partir"
                          className="decision-btn flex items-center justify-center px-1.5 py-1 rounded-md border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <CheckShape width={12} height={12} />
                        </button>
                        <button
                          data-value="false"
                          data-selected={row.entry?.prediction === 'repair' || undefined}
                          onClick={() => setPrediction(row.uuid!, 'repair')}
                          disabled={isPredictionLockedByTour(tourStep)}
                          title="À réparer"
                          className="decision-btn flex items-center justify-center px-1.5 py-1 rounded-md border transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Ban width={12} height={12} />
                        </button>
                      </div>
                    ) : (
                      <span className="px-1">
                        <ResultBadge category={row.entry?.prediction ?? undefined} />
                      </span>
                    )}
                  </td>
                )}
                {showLiveTree && (
                  <td
                    data-cell={row.uuid ? `${row.uuid}-prediction` : undefined}
                    className={`px-2 py-2 overflow-hidden transition-[background-color,box-shadow] duration-300 ${
                      isLiveResult
                        ? 'border border-gray-100'
                        : mismatch
                        ? 'bg-red-100 border-2 border-red-300 text-gray-600'
                        : 'border border-gray-100 text-gray-600'
                    }`}
                    style={{
                      backgroundColor: isLiveResult ? row.color : undefined,
                      // A colored inset ring instead of an actual table border: on a border-collapse
                      // table, a real border here fights the shared 1px gray grid line with the
                      // adjacent cell/row, which is what produced the ugly seam at the cell's edges.
                      boxShadow: isLiveResult ? `inset 0 0 0 2px ${row.color}` : undefined,
                    }}
                  >
                    <motion.span
                      key={predicted ?? 'empty'}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="inline-block transition-colors duration-300"
                    >
                      <ResultBadge category={predicted ?? undefined} invert={isLiveResult} />
                    </motion.span>
                  </td>
                )}
                {showResult && (
                  <td
                    className={`px-2 py-2 ${mismatch ? 'bg-red-100 border-2 border-red-300' : 'border border-gray-100'}`}
                  >
                    <ResultBadge category={observed} />
                  </td>
                )}
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      <EditRobotModal uuid={editingUuid} label={editingLabel} onClose={() => setEditingUuid(null)} />
    </div>
  );
}

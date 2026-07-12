import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { ArrowRight, ArrowChevronDown, Check } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { STEP_DEFS, getStepDef, phaseForStep, PHASES } from '../steps/stepDefinitions';
import { hasWrongCriteria } from '../robotProfiles';
import { TOUR_WAIT_ROW_COMPLETE } from './TourOverlay';

export function TimelinePanel() {
  const {
    stepIndex,
    advanceStep,
    physicalRobotData,
    activeRobotConfigs: robotConfigs,
    algorithmTree,
    treeAccuracy,
    setDataCheckFailed,
    tourStep,
  } = useScenario();
  const current = getStepDef(stepIndex);
  const canAdvance = current.canAdvance({ physicalRobotData, robotConfigs, algorithmTree, treeAccuracy });
  const isLastStep = stepIndex >= STEP_DEFS.length;
  const testedCount = robotConfigs.filter(r => physicalRobotData[r.uuid]?.tested === true).length;

  // The mission journal is a phase accordion: only the phase you're currently in is expanded, so
  // upcoming phases aren't explained before you reach them. Entering a new phase auto-opens it.
  const [expandedPhase, setExpandedPhase] = useState<string>(() => phaseForStep(stepIndex).id);
  const activeStepRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    setExpandedPhase(phaseForStep(stepIndex).id);
  }, [stepIndex]);
  // Keep the active step in view inside the capped accordion.
  useEffect(() => {
    activeStepRef.current?.scrollIntoView({ block: 'nearest' });
  }, [stepIndex, expandedPhase]);

  // Step 1's completeness gate (canAdvance) doesn't check correctness — do that here, right before
  // moving on, so a full-but-wrong table blocks advancement with an explanation instead of letting
  // a student carry mistaken manual observations into step 2's tree test.
  const handleAdvance = () => {
    if (stepIndex === 1 && hasWrongCriteria(robotConfigs, physicalRobotData)) {
      setDataCheckFailed(true);
      return;
    }
    advanceStep();
  };

  // Live "ticks off" progress counter for the steps that have a measurable completion condition.
  const progress = (() => {
    if (stepIndex === 2 && robotConfigs.length > 0) {
      return `${testedCount}/${robotConfigs.length} robots testés`;
    }
    if (stepIndex === 4 && treeAccuracy && treeAccuracy.total > 0) {
      return `${treeAccuracy.correct}/${treeAccuracy.total} robots correctement classés`;
    }
    return null;
  })();

  // Steps 5 (free advance) and 7 (last) have no real "objectif atteint" moment to celebrate.
  const showCelebration = canAdvance && !isLastStep && stepIndex !== 5;

  return (
    <div className="flex flex-col gap-4">
      {/* Phase accordion — capped with its own scroll so the consigne and advance button below it
          stay visible even when a phase with many steps is expanded. */}
      <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
        {PHASES.map(phase => {
          const expanded = expandedPhase === phase.id;
          const phaseActive = phase.steps.includes(stepIndex);
          const phaseDone = phase.steps.every(s => s < stepIndex);
          return (
            <div key={phase.id} className="flex flex-col">
              <button
                onClick={() => setExpandedPhase(expanded ? '' : phase.id)}
                className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                  phaseActive ? phase.accentBgSoft : 'hover:bg-gray-50'
                }`}
              >
                <img src={phase.icon} alt="" className="w-4 h-4 shrink-0 object-contain" />
                <span
                  className={`flex-1 text-xs font-semibold uppercase tracking-wide ${
                    phaseActive ? phase.accentText : 'text-gray-400'
                  }`}
                >
                  {phase.label}
                </span>
                {phaseDone && <Check width={12} height={12} className="text-green-500" />}
                <ArrowChevronDown
                  width={12}
                  height={12}
                  className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              {expanded && (
                <ol className="flex flex-col gap-2 pl-3 pt-2">
                  {phase.steps.map(stepIdx => {
                    const def = getStepDef(stepIdx);
                    const done = stepIdx < stepIndex;
                    const active = stepIdx === stepIndex;
                    return (
                      <li key={stepIdx} ref={active ? activeStepRef : undefined} className="flex items-center gap-3">
                        <span
                          className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors ${
                            done
                              ? 'bg-green-500 border-green-500 text-white'
                              : active
                              ? `${phase.accentBorder} ${phase.accentText}`
                              : 'border-gray-200 text-gray-300'
                          }`}
                        >
                          {done ? <Check width={12} height={12} /> : stepIdx}
                        </span>
                        <span
                          className={`text-sm ${
                            active
                              ? 'font-semibold text-gray-800'
                              : done
                              ? 'text-gray-400 line-through'
                              : 'text-gray-400'
                          }`}
                        >
                          {def.label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          );
        })}
      </div>

      {/* Consigne, split into the pedagogical "why" and the one thing to do now. */}
      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="flex gap-2 text-sm">
          <span className="shrink-0 leading-5">🎯</span>
          <span className="text-gray-600">
            <span className="font-semibold text-gray-800">Objectif</span> — {current.objective}
          </span>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="shrink-0 leading-5">▶️</span>
          <span className="text-gray-600">
            <span className="font-semibold text-gray-800">Action</span> — {current.action}
          </span>
        </div>

        {progress && <span className="pl-7 text-xs font-semibold text-gray-800">{progress}</span>}

        <AnimatePresence>
          {showCelebration && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18 }}
              className="self-start flex items-center gap-1.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold px-3 py-1"
            >
              <Check width={12} height={12} /> Objectif atteint !
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {tourStep === TOUR_WAIT_ROW_COMPLETE && (
        <p className="text-xs font-semibold text-gray-800">🎯 Termine de remplir les données de ce robot.</p>
      )}

      {!isLastStep && (
        <Button variant="primary" size="sm" isDisabled={!canAdvance} onPress={handleAdvance} className="self-start">
          Étape suivante
          <ArrowRight />
        </Button>
      )}
    </div>
  );
}

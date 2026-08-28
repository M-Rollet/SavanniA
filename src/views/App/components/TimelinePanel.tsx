import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { ArrowRight, Check, Star, Play, ChevronDown, ChevronUp } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { STEP_DEFS, PHASES, getStepDef } from '../steps/stepDefinitions';
import { hasWrongCriteria } from '../robotProfiles';
import { TOUR_WAIT_ROW_COMPLETE } from './TourOverlay';
import { FirstTreeModal } from './FirstTreeModal';
import step1 from '../../../assets/step_1.png';
import step2 from '../../../assets/step_2.png';
import step3 from '../../../assets/step_3.png';
import step4 from '../../../assets/step_4.png';
import step5 from '../../../assets/step_5.png';
import step6 from '../../../assets/step_6.png';
import step7 from '../../../assets/step_7.png';
import step8 from '../../../assets/step_8.png';

const STEP_IMAGES: Record<number, string> = {
  1: step1,
  2: step2,
  3: step3,
  4: step4,
  5: step5,
  6: step6,
  7: step7,
  8: step8,
};

const phaseOfStep = (stepIndex: number) => PHASES.find(p => p.steps.includes(stepIndex))!;

/** Compact horizontal progress rail — replaces showing the full illustrated mission map on every
 * single step. The map's only information that actually changes step-to-step is "which node is
 * lit", so a small dot row carries that at a fraction of the size; the full map (still useful for
 * the "journey so far" framing) is one tap away instead of a fixture. */
function ProgressRail({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEP_DEFS.map(s => {
        const phase = phaseOfStep(s.index);
        const state = s.index < stepIndex ? 'done' : s.index === stepIndex ? 'current' : 'todo';
        return (
          <div
            key={s.index}
            title={s.label}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              state === 'todo' ? 'bg-gray-200' : `${phase.accentBg} ${state === 'done' ? 'opacity-60' : ''}`
            } ${state === 'current' ? 'ring-2 ring-offset-1 ring-[var(--color-rpi-navy)]' : ''}`}
          />
        );
      })}
    </div>
  );
}

export function TimelinePanel() {
  const {
    stepIndex,
    advanceStep,
    goToStep,
    physicalRobotData,
    activeRobotConfigs: robotConfigs,
    algorithmTree,
    treeAccuracy,
    dataCheckFailed,
    setDataCheckFailed,
    tourStep,
    giveUpAvailable,
    step7DemoActive,
    algorithmBuildActive,
  } = useScenario();
  const current = getStepDef(stepIndex);
  const phase = phaseOfStep(stepIndex);
  const canAdvance = current.canAdvance({
    physicalRobotData,
    robotConfigs,
    algorithmTree,
    treeAccuracy,
    step7DemoActive,
    algorithmBuildActive,
  });
  const isLastStep = stepIndex >= STEP_DEFS.length;
  const testedCount = robotConfigs.filter(r => physicalRobotData[r.uuid]?.tested === true).length;

  const [showFullMap, setShowFullMap] = useState(false);

  // A reflection beat on the first tree, shown right when leaving step 2 — see FirstTreeModal.
  const [firstTreeModalOpen, setFirstTreeModalOpen] = useState(false);

  // Step 1's completeness gate (canAdvance) doesn't check correctness — do that here, right before
  // moving on, so a full-but-wrong table blocks advancement with an explanation instead of letting
  // a student carry mistaken manual observations into step 2's tree test.
  const handleAdvance = () => {
    if (stepIndex === 1 && hasWrongCriteria(robotConfigs, physicalRobotData)) {
      setDataCheckFailed(true);
      return;
    }
    if (stepIndex === 2) {
      setFirstTreeModalOpen(true);
      return;
    }
    advanceStep();
  };

  // Once the step-1 check has failed once, keep the button disabled until every highlighted cell
  // is actually corrected — otherwise it stayed clickable and just re-showed the same modal.
  const blockedByDataCheck = stepIndex === 1 && dataCheckFailed && hasWrongCriteria(robotConfigs, physicalRobotData);

  // Live "ticks off" progress counter for the steps that have a measurable completion condition,
  // as a {current, total, label} triple rather than a preformatted string, so it can drive an
  // actual bar rather than just a caption.
  const progress = (() => {
    if (stepIndex === 2 && robotConfigs.length > 0) {
      return { current: testedCount, total: robotConfigs.length, label: 'robots testés' };
    }
    if (stepIndex === 4 && treeAccuracy && treeAccuracy.total > 0) {
      return { current: treeAccuracy.correct, total: treeAccuracy.total, label: 'robots correctement classés' };
    }
    return null;
  })();

  // The last step has no real "objectif atteint" moment to celebrate.
  const showCelebration = canAdvance && !isLastStep;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`font-heading text-xs font-bold uppercase tracking-wide ${phase.accentText}`}>
          {phase.label}
        </span>
        <span className="text-xs font-semibold text-gray-400">
          Étape {stepIndex}/{STEP_DEFS.length}
        </span>
      </div>
      <ProgressRail stepIndex={stepIndex} />

      <button
        onClick={() => setShowFullMap(v => !v)}
        className="self-start inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-600"
      >
        {showFullMap ? <ChevronUp width={12} height={12} /> : <ChevronDown width={12} height={12} />}
        Voir la carte de mission
      </button>
      <AnimatePresence>
        {showFullMap && (
          <motion.img
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            src={STEP_IMAGES[stepIndex]}
            alt={`Étape ${stepIndex}`}
            className="w-full h-auto rounded-lg overflow-hidden"
          />
        )}
      </AnimatePresence>

      {/* Consigne, split into the pedagogical "why" (light caption) and the one thing to do now
          (emphasised card) — the action is what a student needs first, the objective is context. */}
      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <Star width={12} height={12} />
          <span className="font-medium">Objectif —</span> {current.objective}
        </span>
        <div className={`rounded-xl px-3 py-2.5 flex gap-2 ${phase.accentBgSoft}`}>
          <Play width={14} height={14} className={`shrink-0 mt-0.5 ${phase.accentText}`} />
          <div className="flex flex-col gap-1">
            <span className={`font-heading text-xs font-bold uppercase tracking-wide ${phase.accentText}`}>Action</span>
            <span className="text-sm text-gray-800">{current.action}</span>
          </div>
        </div>

        {progress && (
          <div className="flex items-center gap-2 pt-0.5">
            <div className="flex-1 h-1.5 rounded-full bg-gray-150 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--color-rpi-navy)] transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-semibold text-gray-600 whitespace-nowrap">
              {progress.current}/{progress.total} {progress.label}
            </span>
          </div>
        )}

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
        <p className="text-xs font-semibold text-gray-800">Termine de remplir les données de ce robot.</p>
      )}

      {!isLastStep && (
        <div className="sticky bottom-0 -mx-4 px-4 py-2 bg-gradient-to-t from-white via-white to-transparent self-start flex items-center gap-2 w-[calc(100%+2rem)]">
          <Button
            variant="primary"
            size="sm"
            className="!bg-[var(--color-rpi-navy)] hover:!bg-[var(--color-rpi-navy-dark)]"
            isDisabled={!canAdvance || blockedByDataCheck}
            onPress={handleAdvance}
          >
            Étape suivante
            <ArrowRight />
          </Button>
          {stepIndex === 6 && giveUpAvailable && (
            <Button variant="ghost" size="sm" onPress={() => goToStep(stepIndex + 1)}>
              Abandonner
            </Button>
          )}
        </div>
      )}

      <FirstTreeModal
        isOpen={firstTreeModalOpen}
        onConfirm={() => {
          setFirstTreeModalOpen(false);
          advanceStep();
        }}
      />
    </div>
  );
}

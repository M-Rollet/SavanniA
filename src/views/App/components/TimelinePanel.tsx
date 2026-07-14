import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { ArrowRight, Check, Star, Play } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { STEP_DEFS, getStepDef } from '../steps/stepDefinitions';
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
  } = useScenario();
  const current = getStepDef(stepIndex);
  const canAdvance = current.canAdvance({ physicalRobotData, robotConfigs, algorithmTree, treeAccuracy });
  const isLastStep = stepIndex >= STEP_DEFS.length;
  const testedCount = robotConfigs.filter(r => physicalRobotData[r.uuid]?.tested === true).length;

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

  // The last step has no real "objectif atteint" moment to celebrate.
  const showCelebration = canAdvance && !isLastStep;

  return (
    <div className="flex flex-col gap-2">
      {/* Step illustration — replaces the old phase accordion with a single image per step. */}
      <img src={STEP_IMAGES[stepIndex]} alt={`Étape ${stepIndex}`} className="w-full h-auto rounded-lg" />

      {/* Consigne, split into the pedagogical "why" and the one thing to do now. */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2 text-sm">
          <span className="shrink-0 h-5 inline-flex items-center gap-1 whitespace-nowrap">
            <Star width={14} height={14} />
            <span className="font-semibold text-gray-800">Objectif</span>
            <span>—</span>
          </span>
          <span className="text-gray-600">{current.objective}</span>
        </div>
        <div className="flex gap-2 text-sm">
          <span className="shrink-0 h-5 inline-flex items-center gap-1 whitespace-nowrap">
            <Play width={14} height={14} />
            <span className="font-semibold text-gray-800">Action</span>
            <span>—</span>
          </span>
          <span className="text-gray-600">{current.action}</span>
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
        <p className="text-xs font-semibold text-gray-800"><Star /> Termine de remplir les données de ce robot.</p>
      )}

      {!isLastStep && (
        <div className="self-start flex items-center gap-2">
          <Button variant="primary" size="sm" isDisabled={!canAdvance || blockedByDataCheck} onPress={handleAdvance}>
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

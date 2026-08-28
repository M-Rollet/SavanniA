import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight } from '@gravity-ui/icons';
import { STEP_DEFS, PHASES } from '../App/steps/stepDefinitions';
import step1 from '../../assets/step_1.png';
import step2 from '../../assets/step_2.png';
import step3 from '../../assets/step_3.png';
import step4 from '../../assets/step_4.png';
import step5 from '../../assets/step_5.png';
import step6 from '../../assets/step_6.png';
import step7 from '../../assets/step_7.png';
import step8 from '../../assets/step_8.png';

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

/** Which PRIMM phase each step exercises (see PrimmOverview) -- shown as a tag on each slide so
 * the framework introduced earlier on the page is visibly threaded through the walkthrough,
 * rather than mentioned once and dropped. */
const PRIMM_STAGE: Record<number, string> = {
  1: 'Predict',
  2: 'Run',
  3: 'Investigate',
  4: 'Modify',
  5: 'Modify',
  6: 'Modify',
  7: 'Make',
  8: 'Make',
};

const phaseOfStep = (stepIndex: number) => PHASES.find(p => p.steps.includes(stepIndex))!;

const slide = { duration: 0.35, ease: 'easeInOut' as const };
const slideVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 80 : -80 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -80 : 80 }),
};

export function StepCarousel({ facilitatorTips }: { facilitatorTips: Record<number, string> }) {
  const [index, setIndex] = useState(0); // 0-based, step = index + 1
  const [direction, setDirection] = useState<1 | -1>(1);

  const goTo = (next: number, dir: 1 | -1) => {
    setDirection(dir);
    setIndex(Math.max(0, Math.min(STEP_DEFS.length - 1, next)));
  };

  const stepIndex = index + 1;
  const step = STEP_DEFS[index];
  const phase = phaseOfStep(stepIndex);

  return (
    <div className="flex flex-col gap-4">
      {/* Dot / number strip -- doubles as a mini map of the 8 steps, coloured by phase */}
      <div className="flex items-center justify-center gap-1.5 flex-wrap">
        {STEP_DEFS.map((s, i) => {
          const p = phaseOfStep(s.index);
          const isActive = i === index;
          return (
            <button
              key={s.index}
              onClick={() => goTo(i, i > index ? 1 : -1)}
              aria-label={`Étape ${s.index}`}
              className={`w-8 h-8 rounded-full font-heading text-sm font-bold flex items-center justify-center transition-all ${
                isActive
                  ? `${p.accentBg} text-white scale-110 ring-2 ring-offset-2 ring-[var(--color-rpi-navy)]`
                  : `${p.accentBgSoft} ${p.accentText}`
              }`}
            >
              {s.index}
            </button>
          );
        })}
      </div>

      <div className="relative bg-white border border-gray-200 rounded-2xl overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={stepIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={slide}
            className="flex flex-col md:flex-row"
          >
            <img
              src={STEP_IMAGES[stepIndex]}
              alt={`Carte de mission, étape ${stepIndex} en surbrillance`}
              className="w-full md:w-2/5 shrink-0 object-cover bg-gray-50"
            />
            <div className="p-5 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${phase.accentBgSoft} ${phase.accentText}`}
                >
                  {phase.label}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--color-rpi-navy)] text-white">
                  PRIMM · {PRIMM_STAGE[stepIndex]}
                </span>
              </div>
              <p className="font-heading font-bold text-lg text-gray-800">
                Étape {stepIndex} — {step.label}
              </p>
              <p className="text-sm">
                <span className="font-medium">Objectif —</span> {step.objective}
              </p>
              <p className="text-sm">
                <span className="font-medium">Action —</span> {step.action}
              </p>
              {facilitatorTips[stepIndex] && (
                <p className="text-sm italic text-gray-500 mt-1">{facilitatorTips[stepIndex]}</p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={() => goTo(index - 1, -1)}
          disabled={index === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-rpi-navy)] hover:bg-[var(--color-rpi-navy-dark)] text-white font-bold text-sm px-4 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ArrowLeft width={14} height={14} />
          Précédente
        </button>
        <span className="text-xs text-gray-400">
          {stepIndex} / {STEP_DEFS.length}
        </span>
        <button
          onClick={() => goTo(index + 1, 1)}
          disabled={index === STEP_DEFS.length - 1}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--color-rpi-navy)] hover:bg-[var(--color-rpi-navy-dark)] text-white font-bold text-sm px-4 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          Suivante
          <ArrowRight width={14} height={14} />
        </button>
      </div>
    </div>
  );
}

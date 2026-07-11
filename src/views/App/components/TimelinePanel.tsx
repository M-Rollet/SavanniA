import { Button } from '@heroui/react';
import { ArrowRight, Check } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { STEP_DEFS, getStepDef, hasAllCriteria } from '../steps/stepDefinitions';
import { hasWrongCriteria } from '../robotProfiles';

/** Step index -> phase heading shown just above that step in the timeline. */
const PHASE_STARTS: Record<number, string> = {
  1: 'Phase 1 · Labo',
  3: 'Phase 2 · Terrain',
  4: 'Phase 3 · Bilan & optimisation',
};

export function TimelinePanel() {
  const { stepIndex, advanceStep, physicalRobotData, robotConfigs, algorithmTree, treeAccuracy, setDataCheckFailed } =
    useScenario();
  const current = getStepDef(stepIndex);
  const canAdvance = current.canAdvance({ physicalRobotData, robotConfigs, algorithmTree, treeAccuracy });
  const isLastStep = stepIndex >= STEP_DEFS.length;
  const filledCount = robotConfigs.filter(r => hasAllCriteria(physicalRobotData[r.uuid])).length;
  const testedCount = robotConfigs.filter(r => physicalRobotData[r.uuid]?.tested === true).length;

  // Step 2's completeness gate (canAdvance) doesn't check correctness — do that here, right before
  // actually moving on, so a full-but-wrong table blocks advancement with an explanation instead of
  // silently letting the user through. (Step 1's Predict gate is handled by its canAdvance, which
  // requires every robot to have an inline pronostic.)
  const handleAdvance = () => {
    if (stepIndex === 2 && hasWrongCriteria(robotConfigs, physicalRobotData)) {
      setDataCheckFailed(true);
      return;
    }
    advanceStep();
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Actionable consigne (instructions + how-to + advance) is ordered above the full step list
          so it stays visible without scrolling the narrow sidebar; the list is reference below. */}
      <ol className="flex flex-col gap-2 order-3 border-t pt-3">
        {STEP_DEFS.flatMap(step => {
          const done = step.index < stepIndex;
          const active = step.index === stepIndex;
          const phaseLabel = PHASE_STARTS[step.index];
          const items = [];
          if (phaseLabel) {
            items.push(
              <li
                key={`phase-${step.index}`}
                className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-1 first:mt-0"
              >
                {phaseLabel}
              </li>
            );
          }
          items.push(
            <li key={step.index} className="flex items-center gap-3">
              <span
                className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-semibold transition-colors ${
                  done
                    ? 'bg-green-500 border-green-500 text-white'
                    : active
                    ? 'border-gray-800 text-gray-800'
                    : 'border-gray-200 text-gray-300'
                }`}
              >
                {done ? <Check width={12} height={12} /> : step.index}
              </span>
              <span
                className={`text-sm ${
                  active ? 'font-semibold text-gray-800' : done ? 'text-gray-400 line-through' : 'text-gray-400'
                }`}
              >
                {step.label}
              </span>
            </li>
          );
          return items;
        })}
      </ol>

      <div className="flex flex-col gap-2 order-1">
        {current.tutorial.map(item => (
          <p key={item.id} className="text-sm text-gray-600">
            {item.text}
            {stepIndex === 2 && item.id === 'discovery-intro' && robotConfigs.length > 0 && (
              <>
                <span className="block mt-1 text-xs font-semibold text-gray-800">
                  {testedCount}/{robotConfigs.length} robots testés
                </span>
                <span className="block text-xs font-semibold text-gray-800">
                  {filledCount}/{robotConfigs.length} robots avec données complètes
                </span>
              </>
            )}
            {stepIndex === 4 && item.id === 'refine-intro' && treeAccuracy && treeAccuracy.total > 0 && (
              <span className="block mt-1 text-xs font-semibold text-gray-800">
                {treeAccuracy.correct}/{treeAccuracy.total} robots correctement classés
              </span>
            )}
          </p>
        ))}

        {stepIndex === 4 && (
          <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Comment faire</span>
            <p className="text-xs text-gray-600">
              Une <span className="font-medium text-red-600">croix rouge</span> = robot mal trié. Trouve la{' '}
              <span className="font-medium">feature</span> (colonne du tableau) que l'arbre n'utilise pas encore mais
              qui explique l'échec, puis modifie l'arbre :
            </p>
            <ul className="flex flex-col gap-1 text-xs text-gray-600">
              <li className="flex gap-1.5">
                <span className="text-gray-400">›</span>
                <span>
                  <span className="font-medium">+ Question</span> sous une branche → choisis la feature à tester dans le
                  menu.
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-gray-400">›</span>
                <span>Clique sur une question pour la remplacer par une autre feature.</span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-gray-400">›</span>
                <span>
                  <span className="font-medium">+ Décision</span> au bout d'une branche : « Prêt » ou « À réparer ».
                </span>
              </li>
              <li className="flex gap-1.5">
                <span className="text-gray-400">›</span>
                <span>
                  La <span className="font-medium">croix ✕</span> en haut d'un bloc le supprime.
                </span>
              </li>
            </ul>
            <p className="text-xs text-gray-600">
              Objectif : que toutes les pastilles deviennent <span className="font-medium text-green-600">vertes</span>.
            </p>
          </div>
        )}
      </div>

      {!isLastStep && (
        <Button
          variant="primary"
          size="sm"
          isDisabled={!canAdvance}
          onPress={handleAdvance}
          className="self-start order-2"
        >
          Étape suivante
          <ArrowRight />
        </Button>
      )}
    </div>
  );
}

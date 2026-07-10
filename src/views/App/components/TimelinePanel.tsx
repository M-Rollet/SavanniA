import { Button } from '@heroui/react';
import { ArrowRight, Check } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { STEP_DEFS, getStepDef, hasAllCriteria } from '../steps/stepDefinitions';
import { hasWrongCriteria } from '../robotProfiles';

export function TimelinePanel() {
  const { stepIndex, advanceStep, physicalRobotData, robotConfigs, algorithmTree, treeAccuracy, setDataCheckFailed } =
    useScenario();
  const current = getStepDef(stepIndex);
  const canAdvance = current.canAdvance({ physicalRobotData, robotConfigs, algorithmTree, treeAccuracy });
  const isLastStep = stepIndex >= STEP_DEFS.length;
  const filledCount = robotConfigs.filter(r => hasAllCriteria(physicalRobotData[r.uuid])).length;
  const testedCount = robotConfigs.filter(r => physicalRobotData[r.uuid]?.tested === true).length;

  // Step 2's completeness gate (canAdvance) doesn't check correctness — do that here, right
  // before actually moving on, so a full-but-wrong table blocks advancement with an explanation
  // instead of silently letting the user through.
  const handleAdvance = () => {
    if (stepIndex === 2 && hasWrongCriteria(robotConfigs, physicalRobotData)) {
      setDataCheckFailed(true);
      return;
    }
    advanceStep();
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-2">
        {STEP_DEFS.map(step => {
          const done = step.index < stepIndex;
          const active = step.index === stepIndex;
          return (
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
        })}
      </ol>

      <div className="flex flex-col gap-2 border-t pt-3">
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
      </div>

      {!isLastStep && (
        <Button variant="primary" size="sm" isDisabled={!canAdvance} onPress={handleAdvance} className="self-start">
          Étape suivante
          <ArrowRight />
        </Button>
      )}
    </div>
  );
}

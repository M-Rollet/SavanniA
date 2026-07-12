import { useScenario } from '../ScenarioContext';
import { CheckFailedModal } from './CheckFailedModal';

/** Notifies the user that some step-1 manual observations don't match the robot's ground truth. */
export function DataCheckModal() {
  const { dataCheckFailed } = useScenario();

  return (
    <CheckFailedModal
      failed={dataCheckFailed}
      title="Certaines observations semblent fausses"
      messages={[
        'Le tableau est complet, mais certaines valeurs ne correspondent pas à ce qui a été observé sur les robots.',
        "Retourne dans l'interface manuelle pour vérifier les cases surlignées en jaune dans le tableau et corrige les.",
      ]}
    />
  );
}

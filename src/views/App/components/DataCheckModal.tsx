import { useScenario } from '../ScenarioContext';
import { CheckFailedModal } from './CheckFailedModal';

/** Notifies the user that some step-1 manual observations don't match the robot's ground truth. */
export function DataCheckModal() {
  const { dataCheckFailed } = useScenario();

  return (
    <CheckFailedModal
      failed={dataCheckFailed}
      title="Certaines valeurs semblent inexactes"
      messages={[
        "Le tableau est complet, mais certaines valeurs ne correspondent pas à ce qu'on peut observer sur les robots.",
        "Retourne vérifier les cases surlignées en jaune dans le tableau et corrige les.",
      ]}
    />
  );
}

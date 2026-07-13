import { useEffect, useState } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowDownToLine } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { getStepDef, EXTERNAL_DATASET } from '../steps/stepDefinitions';
import { useLocalStorage } from '../../../helpers/useLocalStorage';
import { ROW_STAGGER_S, ROW_DURATION_S } from './DataTable';

// The "ready" modal only opens once DataTable's row fly-in animation has actually finished
// (see DataTable's own scroll-follow effect, timed off the same constants), not the instant the
// dataset is set.
const ROWS_SETTLE_MS = ((EXTERNAL_DATASET.length - 1) * ROW_STAGGER_S + ROW_DURATION_S) * 1000;

export function ExternalDataIntroModal() {
  const { stepIndex, externalDataset, setExternalDataset } = useScenario();

  const stepDef = getStepDef(stepIndex);
  const isOpen = stepDef.features.externalData && externalDataset.length === 0;

  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Toujours plus de données !</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <p className="text-gray-600 text-sm">
                Une autre équipe de scientifiques ont testés des robots sur le terrain et ont centralisé leurs observations. Ils viennent de nous les envoyer pour améliorer notre arbre de décision.
              </p>
              <p className="text-gray-600 text-sm">
                Tu vas pouvoir regarder comment les robots qu'ils nous envoient sont triés par notre arbre de décision et tenter de faire en sorte qu'ils soient tous correctement catégorisés.
              </p>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onPress={() => setExternalDataset(EXTERNAL_DATASET)}>
                <ArrowDownToLine width={14} height={14} />
                Télécharger les données
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

/**
 * Shown once the downloaded rows have finished flying into the table (see ROWS_SETTLE_MS above) —
 * the follow-up beat to ExternalDataIntroModal's download prompt.
 */
export function ExternalDataReadyModal() {
  const { stepIndex, externalDataset } = useScenario();
  const [seen, setSeen] = useLocalStorage<boolean>('scenario:externalDataReadySeen', false);
  const [settled, setSettled] = useState(false);

  const stepDef = getStepDef(stepIndex);
  const active = stepDef.features.externalData && externalDataset.length > 0;

  useEffect(() => {
    if (!active) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), ROWS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [active]);

  const isOpen = active && settled && !seen;
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Un paquet de données !</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <p className="text-gray-600 text-sm">
                Il y a maintenant beaucoup plus de robots, arriveras-tu à modifier l'arbre pour qu'ils soient tous
                triés correctement ?
              </p>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onPress={() => setSeen(true)}>
                J'essaie
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { Modal, useOverlayState, Button } from '@heroui/react';
import { useScenario } from '../ScenarioContext';
import { getStepDef, EXTERNAL_DATASET } from '../steps/stepDefinitions';

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
                Vous allez pouvoir regarder comment les robots qu'ils ont observés sont triés par votre arbre de décision et tenter de faire en sorte qu'ils soient tous correctement catégorisés.
              </p>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onPress={() => setExternalDataset(EXTERNAL_DATASET)}>
                Télécharger leurs données
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { Modal, useOverlayState } from '@heroui/react';
import { useScenario } from '../ScenarioContext';
import { getStepDef } from '../steps/stepDefinitions';
import finalImage from '../../../assets/final.png';

export function FinalTestModal() {
  const { stepIndex } = useScenario();

  const stepDef = getStepDef(stepIndex);
  const isOpen = stepDef.index === 7;

  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="cover">
          <Modal.Dialog>
            <Modal.Body className="flex flex-col items-center justify-center gap-6 py-16 text-center">
              <h2 className="text-4xl font-semibold text-gray-800">Mission accomplie !</h2>
              <p className="text-gray-600 text-base max-w-2xl">
                Ce que tu viens de construire n'est pas une boîte noire magique : c'est une suite de questions oui/non
                que toi, puis l'algorithme, avez choisies — dans l'ordre qui trie le mieux tes robots. C'est ça, une
                intelligence artificielle : des règles, pas de la magie.
              </p>
              <p className="text-gray-600 text-base max-w-2xl">
                Tu peux maintenant tester les robots sur le terrain et voir que ton arbre fonctionne parfaitement. Bravo
                !
              </p>
              <img src={finalImage} alt="" className="max-w-2xl w-full rounded-xl" />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowRight } from '@gravity-ui/icons';

interface Props {
  isOpen: boolean;
  onConfirm: () => void;
}

/**
 * Shown once every robot has been tested against the step-2 tree, right when the student presses
 * "Étape suivante" — a beat of reflection on the tree they just built before jumping into the
 * terrain tests. Only "Allons-y" can leave (no backdrop/Escape dismissal), and pressing it is what
 * actually advances the step (TerrainModal then self-opens on arriving at step 3).
 */
export function FirstTreeModal({ isOpen, onConfirm }: Props) {
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Notre premier arbre</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <p className="text-gray-600 text-sm">
                Que penses-tu de ce premier arbre ? Est-ce qu'il suffit pour trier les robots ? Est-ce qu'il y a assez de questions ?
              </p>
              <p className="text-gray-600 text-sm">
                Maintenant, nous allons voir comment se comportent les robots sur le terrain.
              </p>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onPress={onConfirm}>
                Allons-y
                <ArrowRight />
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

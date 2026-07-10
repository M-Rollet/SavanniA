import { Modal, useOverlayState, Button } from '@heroui/react';

export type AlgorithmValidateModalStatus = 'reject' | 'success' | 'complete';

type Props = {
  status: AlgorithmValidateModalStatus | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function AlgorithmValidateModal({ status, onClose, onConfirm }: Props) {
  const state = useOverlayState({
    isOpen: status !== null,
    onOpenChange: open => {
      if (!open) {
        onClose();
      }
    },
  });

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            {status === 'reject' && (
              <>
                <Modal.Header>
                  <Modal.Heading>Ce n'est pas la meilleure question</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-3">
                  <p className="text-gray-600 text-sm">
                    Cette question n'est pas idéale ici. Compare bien les possibilités et choisis celle qui te semble mieux.
                  </p>
                  <p className="text-gray-600 text-sm">Essaie une autre question dans le menu déroulant !</p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="primary" onPress={onClose}>
                    Réessayer
                  </Button>
                </Modal.Footer>
              </>
            )}

            {status === 'success' && (
              <>
                <Modal.Header>
                  <Modal.Heading>Bonne question !</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-3">
                  <p className="text-gray-600 text-sm">
                    Cette question minimise le nombre d'erreurs de catégorisation possibles à cette étape.
                  </p>
                  <p className="text-gray-600 text-sm">
                    C'est la logique à adopter pour chaque partie de l'arbre.
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="primary" onPress={onConfirm}>
                    Suivant
                  </Button>
                </Modal.Footer>
              </>
            )}

            {status === 'complete' && (
              <>
                <Modal.Header>
                  <Modal.Heading>Parfait, l'arbre prend forme !</Modal.Heading>
                </Modal.Header>
                <Modal.Body className="flex flex-col gap-3">
                  <p className="text-gray-600 text-sm">
                    Tu as choisi les deux premières questions de ton algorithme, celles qui ont le plus d'impact.
                  </p>
                  <p className="text-gray-600 text-sm">
                    À partir de maintenant, l'algorithme continue tout seul : à chaque étape, il teste toutes les
                    questions restantes et garde toujours celle avec le moins d'erreurs, jusqu'à ce que chaque groupe
                    de robots soit parfaitement trié.
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="primary" onPress={onConfirm}>
                    Construire le reste
                  </Button>
                </Modal.Footer>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

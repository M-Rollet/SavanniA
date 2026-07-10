import { useEffect, useRef, useState } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';

type Props = {
  /** Whenever this flips from false to true, the modal (re-)opens even if previously dismissed. */
  failed: boolean;
  title: string;
  messages: string[];
  confirmLabel?: string;
};

/**
 * Generic "something you entered doesn't match the ground truth" notice. Dismissing it only
 * hides the modal — it never clears the `failed` flag itself, so callers can keep whatever
 * highlight they're driving from that flag active until the underlying data is actually fixed.
 */
export function CheckFailedModal({ failed, title, messages, confirmLabel = 'Compris' }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const prevFailedRef = useRef(failed);

  useEffect(() => {
    if (failed && !prevFailedRef.current) {
      setDismissed(false);
    }
    prevFailedRef.current = failed;
  }, [failed]);

  const isOpen = failed && !dismissed;
  const state = useOverlayState({
    isOpen,
    onOpenChange: open => {
      if (!open) {
        setDismissed(true);
      }
    },
  });

  return (
    <Modal state={state}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <p key={i} className="text-gray-600 text-sm">
                  {m}
                </p>
              ))}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onPress={() => setDismissed(true)}>
                {confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

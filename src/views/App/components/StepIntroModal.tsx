import { useEffect, useRef } from 'react';
import { Modal, useOverlayState } from '@heroui/react';
import { ArrowRight } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { getStepDef } from '../steps/stepDefinitions';
import { useLocalStorage } from '../../../helpers/useLocalStorage';

/** Ignore dismiss attempts this soon after the modal opens — guards the mount window. */
const ARM_DELAY_MS = 500;

/**
 * One-time arrival pop-up shown when a step that defines an `intro` is first reached — the
 * attention-grabbing counterpart to the persistent (but easy to miss) sidebar tutorial text.
 * Dismissal is remembered in localStorage so reloads mid-step don't re-show it.
 *
 * Dismissal is deliberately hard to trigger by accident: backdrop clicks and Escape are
 * disabled, and the button is a raw <button> whose handler requires a trusted user event —
 * synthetic clicks (observed intermittently from the overlay/toast stack shortly after mount)
 * must not silently mark the intro as seen, or it would never be shown again.
 */
export function StepIntroModal() {
  const { stepIndex, tourSeen, setTourStep } = useScenario();
  const [seenSteps, setSeenSteps] = useLocalStorage<number[]>('scenario:introSeen', []);

  const stepDef = getStepDef(stepIndex);
  const intro = stepDef.intro;
  const isOpen = stepIndex >= 1 && !!intro && !seenSteps.includes(stepIndex);

  const openedAtRef = useRef(0);
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
    }
  }, [isOpen]);

  const handleDismissClick = (e: React.MouseEvent) => {
    if (!e.isTrusted || Date.now() - openedAtRef.current < ARM_DELAY_MS) {
      return;
    }
    setSeenSteps([...seenSteps, stepIndex]);
    // The guided interface tour picks up right where step 1's intro leaves off, the first time.
    if (stepIndex === 1 && !tourSeen) {
      setTourStep(1);
    }
  };

  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  if (!intro) {
    return null;
  }

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{intro.heading}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {intro.body.map((paragraph, i) => (
                <p key={i} className="text-gray-600 text-sm">
                  {paragraph}
                </p>
              ))}
            </Modal.Body>

            <Modal.Footer>
              <button
                data-testid="step-intro-dismiss"
                onClick={handleDismissClick}
                className="text-sm font-medium px-5 py-2 rounded-full border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                C'est parti
                <ArrowRight width={14} height={14} />
              </button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { useScenario } from '../ScenarioContext';

const TIME_TRIGGER_MS = 3 * 60 * 1000;
const EDIT_TRIGGER_COUNT = 5;
const EDIT_TRIGGER_SETTLE_MS = 2000;

/**
 * Step 6's escape valve: with 30+ external robots and a hand-built single tree, reaching 100%
 * correct (now required to advance — see stepDefinitions.ts) can genuinely be out of reach. Offers
 * to skip ahead either after 3 minutes on the step, or after 5 structural edits (question changes
 * or node deletions — not leaf decision toggles) followed by a 2s settle pause. "Je continue à
 * essayer" rearms both triggers and reveals a persistent "Abandonner" button in TimelinePanel for
 * the rest of this step-6 visit.
 *
 * Both triggers set `pendingOpen` rather than opening the modal directly — a separate effect only
 * flips it into `isOpen` once no DecisionNode question dropdown is open, so the modal never pops
 * up on top of an open dropdown (which renders behind the modal backdrop, half-hidden).
 */
export function TreeDifficultyModal() {
  const { stepIndex, goToStep, treeEditCount, setTreeEditCount, setGiveUpAvailable, questionDropdownOpen } =
    useScenario();
  const [armedAt, setArmedAt] = useState(() => Date.now());
  const [isOpen, setIsOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);

  // Fresh arm cycle every time step 6 is (re)entered.
  useEffect(() => {
    if (stepIndex === 6) {
      setArmedAt(Date.now());
      setTreeEditCount(0);
      setIsOpen(false);
      setPendingOpen(false);
      setGiveUpAvailable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Trigger A: 3 minutes since armed.
  useEffect(() => {
    if (stepIndex !== 6) {
      return;
    }
    const timer = setTimeout(() => setPendingOpen(true), Math.max(TIME_TRIGGER_MS - (Date.now() - armedAt), 0));
    return () => clearTimeout(timer);
  }, [stepIndex, armedAt]);

  // Trigger B: 5 qualifying edits, then a 2s settle pause.
  useEffect(() => {
    if (stepIndex !== 6 || treeEditCount < EDIT_TRIGGER_COUNT) {
      return;
    }
    const timer = setTimeout(() => setPendingOpen(true), EDIT_TRIGGER_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [stepIndex, treeEditCount]);

  // Only actually open once a pending trigger has fired and no question dropdown is in the way —
  // re-checked whenever the dropdown closes.
  useEffect(() => {
    if (pendingOpen && !questionDropdownOpen) {
      setIsOpen(true);
      setPendingOpen(false);
    }
  }, [pendingOpen, questionDropdownOpen]);

  const handleContinue = () => {
    setArmedAt(Date.now());
    setTreeEditCount(0);
    setIsOpen(false);
    setGiveUpAvailable(true);
  };

  const handleAbandon = () => {
    setIsOpen(false);
    goToStep(stepIndex + 1);
  };

  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>C'est difficile&nbsp;!</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <p className="text-gray-600 text-sm">
                Avec toutes ces données, ça devient vite très compliqué de trouver l'arbre parfait à la main.
              </p>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" onPress={handleContinue}>
                Je continue à essayer
              </Button>
              <Button variant="secondary" onPress={handleAbandon}>
                Abandonner
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

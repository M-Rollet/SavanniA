import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowRight, ArrowLeft } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { useLocalStorage } from '../../../helpers/useLocalStorage';

/**
 * PRIMM handoff from Predict to Run, shown once on arriving at step 2: first a metacognitive nudge
 * ("how did you decide?"), then a plain-language + graphical answer to "what is a decision tree?"
 * before the student watches the real one classify their robots.
 */
export function DecisionTreeIntroModal() {
  const { stepIndex, tour2Seen, setTourStep, controledRobot } = useScenario();
  const [seen, setSeen] = useLocalStorage<boolean>('scenario:dtIntroSeen', false);
  const [page, setPage] = useState<0 | 1>(0);

  const isOpen = stepIndex === 2 && !seen;
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={page}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    {page === 0 ? 'Comment as-tu choisi ?' : 'Et le programme, comment décide-t-il ?'}
                  </motion.span>
                </AnimatePresence>
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4 min-h-[8rem]">
              <AnimatePresence mode="wait">
                {page === 0 ? (
                  <motion.div
                    key={0}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-gray-600 text-sm">
                      Pour chaque robot, tu as décidé « prêt à partir » ou « à réparer ». Mais comment, exactement ? Sur quels indices t'es-tu appuyé ?
                    </p>
                    <p className="text-gray-600 text-sm">
                      Peut-être plusieurs à la fois, un peu à l'instinct — et sans forcément suivre toujours la même règle. Serais-tu capable d'expliquer ta méthode à quelqu'un d'autre, mot pour mot ?
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={1}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-gray-600 text-sm">
                      Le programme, lui, ne peut pas deviner. Il suit une liste de questions et prend sa décision selon les réponses. C'est ce qu'on appelle un <span className="font-semibold">arbre de décision</span>.
                    </p>
                    <p className="text-gray-600 text-sm">
                      Nous allons tout de suite découvrir à quoi ça ressemble !
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </Modal.Body>

            <Modal.Footer className="w-full">
              <div className="flex-1 flex justify-start">
                {page === 1 && (
                  <Button variant="ghost" onPress={() => setPage(0)}>
                    <ArrowLeft />
                    Retour
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`w-2 h-2 rounded-full ${page === 0 ? 'bg-gray-800' : 'bg-gray-200'}`} />
                <span className={`w-2 h-2 rounded-full ${page === 1 ? 'bg-gray-800' : 'bg-gray-200'}`} />
              </div>
              <div className="flex-1 flex justify-end">
                {page === 0 ? (
                  <Button variant="primary" onPress={() => setPage(1)}>
                    Suivant
                    <ArrowRight />
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    onPress={() => {
                      setSeen(true);
                      // Picks up right where this modal leaves off, the first time — walks the
                      // student through the real tree (see TourOverlay's step-2 tour). Starts on
                      // robot selection (19) only if none is picked yet — skipping straight to the
                      // tree (20) otherwise, so that popover never has a reason to flash on screen.
                      if (!tour2Seen) {
                        setTourStep(controledRobot ? 20 : 19);
                      }
                    }}
                  >
                    Voir l'arbre
                    <ArrowRight />
                  </Button>
                )}
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

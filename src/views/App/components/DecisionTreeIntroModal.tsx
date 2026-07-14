import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowRight, ArrowLeft } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { useLocalStorage } from '../../../helpers/useLocalStorage';
import tree1 from '../../../assets/tree_1.png';
import tree2 from '../../../assets/tree_2.png';
import tree3 from '../../../assets/tree_3.png';
import tree4 from '../../../assets/tree_4.png';

type Page = 0 | 1 | 2 | 3 | 4;

const LAST_PAGE: Page = 4;

const TITLES: Record<Page, string> = {
  0: 'Comment as-tu choisi ?',
  1: 'Et le programme, comment décide-t-il ?',
  2: 'Les arbres de décision',
  3: 'Les arbres de décision',
  4: 'Les arbres de décision',
};

/**
 * PRIMM handoff from Predict to Run, shown once on arriving at step 2: first a metacognitive nudge
 * ("how did you decide?"), then a plain-language + graphical answer to "what is a decision tree?"
 * before the student watches the real one classify their robots.
 */
export function DecisionTreeIntroModal() {
  const { stepIndex, tour2Seen, setTourStep, controledRobot } = useScenario();
  const [seen, setSeen] = useLocalStorage<boolean>('scenario:dtIntroSeen', false);
  const [page, setPage] = useState<Page>(0);

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
                    {TITLES[page]}
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
                ) : page === 1 ? (
                  <motion.div
                    key={1}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-gray-600 text-sm">
                      Le programme, lui, ne peut pas deviner. Il suit une liste de questions et prend sa décision selon les réponses. C'est ce qu'on appelle un <span className="font-semibold">arbre de décision</span>. Mais qu'est-ce que c'est exactement ?
                    </p>
                    <p className="text-gray-600 text-sm">
                      Un arbre de décision, c'est une suite de questions, posées les unes après les autres. Selon les résultats, on suit un chemin différent dans l'arbre et on arrive à une conclusion.
                    </p>
                    <img src={tree1} alt="Arbre de décision" className="w-full h-auto rounded-lg" />
                    <p className="text-gray-600 text-sm">
                      Mais pourquoi ça s'appelle un arbre ? Parce qu'il a la forme d'un arbre retourné !
                    </p>
                  </motion.div>
                ) : page === 2 ? (
                  <motion.div
                    key={2}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-gray-600 text-sm">
                      Dans un arbre de décision, les questions sont appelées des <span className="font-semibold">noeuds</span>. C'est là que l'arbre se sépare.
                    </p>
                    <img src={tree2} alt="Arbre de décision" className="w-full h-auto rounded-lg" />
                  </motion.div>
                ) : page === 3 ? (
                  <motion.div
                    key={3}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-gray-600 text-sm">
                      Après un noeud, il y a plusieurs <span className="font-semibold">branches</span> selon le résultat.
                    </p>
                    <img src={tree3} alt="Arbre de décision" className="w-full h-auto rounded-lg" />
                  </motion.div>
                ) : (
                  <motion.div
                    key={4}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4"
                  >
                    <p className="text-gray-600 text-sm">
                      Toutes les branches se terminent toujours par une <span className="font-semibold">feuille</span>. C'est là qu'on a la conclusion de toutes les réponses aux questions parcourues.
                    </p>
                    <img src={tree4} alt="Arbre de décision" className="w-full h-auto rounded-lg" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Modal.Body>

            <Modal.Footer className="w-full">
              <div className="flex-1 flex justify-start">
                {page > 0 && (
                  <Button variant="ghost" onPress={() => setPage((page - 1) as Page)}>
                    <ArrowLeft />
                    Retour
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {([0, 1, 2, 3, 4] as Page[]).map((p) => (
                  <span key={p} className={`w-2 h-2 rounded-full ${page === p ? 'bg-gray-800' : 'bg-gray-200'}`} />
                ))}
              </div>
              <div className="flex-1 flex justify-end">
                {page < LAST_PAGE ? (
                  <Button variant="primary" onPress={() => setPage((page + 1) as Page)}>
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

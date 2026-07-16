import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal, useOverlayState, Button, Switch } from '@heroui/react';
import { ArrowRight, ArrowLeft, CheckShape } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { getStepDef, STEP_DEFS } from '../steps/stepDefinitions';
import treeIcon from '../../../assets/final_1.png';
import robotIcon from '../../../assets/final_2.png';
import finalImage from '../../../assets/final.png';

type Props = {
  /** Bumped by the sidebar "Test final" button to reopen the modal after it's been dismissed. */
  reopenToken?: number;
};

const LAST_PAGE = 1;

const TITLES = ['Notre IA est prête', 'Mission accomplie\u00A0!'];

// Each dash is a real DOM pill (not a gradient) so it can actually have rounded corners — a
// gradient's color stops are hard edges, there's no border-radius on a background-image.
const DASH_WIDTH = 10;
const DASH_GAP = 8;
const DASH_UNIT = DASH_WIDTH + DASH_GAP;
// Comfortably tiles past the track's fixed 20rem width (see the -6.25rem insets below) so the
// looped translateX never reveals a gap at either edge.
const DASH_COUNT = 24;

/** Horizontal connector between the tree and robot icons — a dashed track that's static and grey
 * while the AI is disconnected, and turns amber and animates its dashes rightward once `active`
 * (the toggle) is on, reading as "data flowing from the AI to the robot". */
function ConnectorLine({ active }: { active: boolean }) {
  const color = active ? 'var(--color-amber-400)' : 'var(--color-mist-200)';
  return (
    <div className="relative h-[6px] w-full overflow-hidden">
      <motion.div
        className="absolute inset-y-0 flex items-center"
        // Starts one dash-unit to the left of the track (already-hidden buffer) so animating
        // toward positive x — which slides the strip rightward — never uncovers a gap on either
        // edge before the loop's instant jump back to x=0 (imperceptible: exactly one repeat unit).
        style={{ gap: DASH_GAP, left: -DASH_UNIT }}
        animate={{ x: active ? [0, DASH_UNIT] : 0 }}
        transition={active ? { duration: 0.5, repeat: Infinity, ease: 'linear' } : { duration: 0.2 }}
      >
        {Array.from({ length: DASH_COUNT }).map((_, i) => (
          <span
            key={i}
            className="h-[6px] w-[10px] rounded-full shrink-0 transition-colors duration-200"
            style={{ backgroundColor: color }}
          />
        ))}
      </motion.div>
    </div>
  );
}

export function FinalTestModal({ reopenToken = 0 }: Props) {
  const { stepIndex, aiActive, setAiActive } = useScenario();

  const stepDef = getStepDef(stepIndex);
  const reached = stepDef.index === STEP_DEFS.length;

  const [dismissed, setDismissed] = useState(false);
  const [page, setPage] = useState(0);
  const prevReachedRef = useRef(reached);
  const prevReopenTokenRef = useRef(reopenToken);
  useEffect(() => {
    if (reached && !prevReachedRef.current) {
      setDismissed(false);
    }
    prevReachedRef.current = reached;
  }, [reached]);
  useEffect(() => {
    if (reopenToken !== prevReopenTokenRef.current) {
      prevReopenTokenRef.current = reopenToken;
      setDismissed(false);
    }
  }, [reopenToken]);

  const isOpen = reached && !dismissed;
  // Always land back on page 0 on open — aiActive itself is left untouched (it mirrors the
  // robots' actual to_repair state, not just this dialog's navigation position).
  useEffect(() => {
    if (isOpen) {
      setPage(0);
    }
  }, [isOpen]);

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
        <Modal.Container size="cover">
          <Modal.Dialog>
            <Modal.Body>
              <AnimatePresence mode="wait">
                {page === 0 ? (
                  <motion.div
                    key={0}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center gap-6 py-16 text-center"
                  >
                    <h2 className="text-4xl font-semibold text-gray-800">{TITLES[0]}</h2>
                    <p className="text-gray-600 text-base max-w-2xl text-justify">
                      Ce que tu viens de construire n'est pas une boîte noire magique&nbsp;: c'est une suite de questions
                      oui/non que toi, puis l'algorithme, avez choisies — dans l'ordre qui trie le mieux tes robots.
                      C'est ça, une intelligence artificielle&nbsp;: <span className="font-semibold">des règles, pas de la magie</span>.
                    </p>
                    <p className="text-gray-600 text-base max-w-2xl text-justify">
                      Active l'interrupteur ci-dessous pour <span className="font-semibold">connecter ton IA aux robots</span>, puis va voir sur le terrain
                      si les robots partent en mission ou pas. Les robots qui partent devraient tous réussir à
                      revenir, c'était le but de notre intelligence artificielle.
                    </p>

                    <div className="relative flex items-center justify-center gap-30 py-4">
                      <img
                        src={treeIcon}
                        alt="L'IA (arbre de décision)"
                        className="relative z-10 w-50 h-50 object-contain"
                      />
                      <img
                        src={robotIcon}
                        alt="Robot Thymio"
                        className="relative z-10 w-50 h-50 object-contain"
                      />

                      {/* Line spans center-to-center: each image is w-50 (12.5rem), so inset
                          6.25rem (half its width) from each side lands exactly on both centers. */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 z-0"
                        style={{ left: '6.25rem', right: '6.25rem' }}
                      >
                        <ConnectorLine active={aiActive} />
                      </div>

                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                        <Switch size="lg" isSelected={aiActive} onChange={setAiActive} aria-label="Activer l'IA sur les robots">
                          <Switch.Control className={`bg-mist-200 shadow-sm ${aiActive ? "bg-amber-400" : ""}`}>
                            <Switch.Thumb />
                          </Switch.Control>
                        </Switch>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key={1}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col items-center justify-center gap-6 py-16 text-center"
                  >
                    <h2 className="text-4xl font-semibold text-gray-800">{TITLES[1]}</h2>
                    <p className="text-gray-600 text-base max-w-2xl text-justify">
                      Notre objectif est atteint, les robots sont maintenant triés automatiquement au départ du circuit. Plus aucun risque de perdre des robots dans la nature.
                    </p>
                    <p className="text-gray-600 text-base max-w-2xl w-full text-justify">Voici ce que tu as appris en cours de route&nbsp;:</p>
                    <ul className="flex flex-col gap-2.5 max-w-2xl w-full text-left">
                      <li className="flex items-start gap-2.5 text-gray-600 text-base">
                        <CheckShape className="shrink-0 mt-0.5 text-green-600" width={16} height={16} />
                        <span>
                          Tu as construit ta propre IA pièce par pièce, question après question. Tu sais maintenant qu'il n'y a pas de magie là-dedans, seulement des règles.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600 text-base">
                        <CheckShape className="shrink-0 mt-0.5 text-green-600" width={16} height={16} />
                        <span>
                          Comment fonctionne un arbre de décision&nbsp;: des questions posées dans le bon ordre, jusqu'au verdict.
                        </span>
                      </li>
                      <li className="flex items-start gap-2.5 text-gray-600 text-base">
                        <CheckShape className="shrink-0 mt-0.5 text-green-600" width={16} height={16} />
                        <span>
                          Quand il y a trop de données pour trier à la main, un algorithme bien choisi peut nous aider à trouver la logique.
                        </span>
                      </li>
                    </ul>
                    <img src={finalImage} alt="Circuit en huit avec les robots Thymio" className="max-w-2xl w-full rounded-xl" />
                  </motion.div>
                )}
              </AnimatePresence>
            </Modal.Body>

            <Modal.Footer>
              {page > 0 && (
                <Button variant="ghost" onPress={() => setPage(0)}>
                  <ArrowLeft />
                </Button>
              )}
              {page < LAST_PAGE ? (
                <Button variant="secondary" onPress={() => setPage(1)}>
                  <ArrowRight />
                </Button>
              ) : (
                <Button variant="secondary" onPress={() => setDismissed(true)}>
                  <ArrowRight />
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

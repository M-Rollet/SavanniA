import { useState } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowRight, ArrowLeft } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { useLocalStorage } from '../../../helpers/useLocalStorage';

/** Small, friendly illustration of a decision tree: one question, yes/no branches, more questions,
 * final decisions. Deliberately concrete (phares / batterie) so a 13-year-old maps it straight onto
 * the real tree they're about to use. */
function DecisionTreeGraphic() {
  const qBox = { fill: '#ffffff', stroke: '#cbd5e1' };
  const repair = { fill: '#fffbeb', stroke: '#fcd34d', text: '#b45309' };
  const ready = { fill: '#f0fdf4', stroke: '#86efac', text: '#15803d' };
  const line = '#cbd5e1';
  const labelColor = '#64748b';

  return (
    <svg viewBox="0 0 410 240" className="w-full h-auto" role="img" aria-label="Exemple d'arbre de décision">
      {/* Branches */}
      <g stroke={line} strokeWidth={1.5} fill="none">
        <path d="M170 48 L110 104" />
        <path d="M230 48 L296 104" />
        <path d="M282 138 L256 192" />
        <path d="M332 138 L352 192" />
      </g>

      {/* Branch labels */}
      <g fontSize="10" fill={labelColor} fontWeight="600" textAnchor="middle">
        <text x="126" y="78">
          Non
        </text>
        <text x="278" y="78">
          Oui
        </text>
        <text x="252" y="166">
          Non
        </text>
        <text x="350" y="166">
          Oui
        </text>
      </g>

      {/* Root question */}
      <g>
        <rect x="140" y="12" width="120" height="36" rx="8" fill={qBox.fill} stroke={qBox.stroke} strokeWidth={1.5} />
        <text x="200" y="34" textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">
          Phares allumés ?
        </text>
      </g>

      {/* Left leaf — repair */}
      <g>
        <rect
          x="40"
          y="104"
          width="110"
          height="34"
          rx="8"
          fill={repair.fill}
          stroke={repair.stroke}
          strokeWidth={1.5}
        />
        <text x="95" y="125" textAnchor="middle" fontSize="11" fontWeight="600" fill={repair.text}>
          À réparer
        </text>
      </g>

      {/* Right question */}
      <g>
        <rect x="245" y="104" width="120" height="34" rx="8" fill={qBox.fill} stroke={qBox.stroke} strokeWidth={1.5} />
        <text x="305" y="125" textAnchor="middle" fontSize="12" fontWeight="600" fill="#334155">
          Batterie pleine ?
        </text>
      </g>

      {/* Sub-left leaf — repair */}
      <g>
        <rect
          x="205"
          y="192"
          width="98"
          height="34"
          rx="8"
          fill={repair.fill}
          stroke={repair.stroke}
          strokeWidth={1.5}
        />
        <text x="254" y="213" textAnchor="middle" fontSize="11" fontWeight="600" fill={repair.text}>
          À réparer
        </text>
      </g>

      {/* Sub-right leaf — ready */}
      <g>
        <rect x="305" y="192" width="98" height="34" rx="8" fill={ready.fill} stroke={ready.stroke} strokeWidth={1.5} />
        <text x="354" y="213" textAnchor="middle" fontSize="11" fontWeight="600" fill={ready.text}>
          Prêt à partir
        </text>
      </g>
    </svg>
  );
}

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
                {page === 0 ? 'Comment as-tu choisi ?' : 'Et le programme, comment décide-t-il ?'}
              </Modal.Heading>
            </Modal.Header>

            {page === 0 ? (
              <>
                <Modal.Body className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-800" />
                    <span className="w-2 h-2 rounded-full bg-gray-200" />
                  </div>
                  <p className="text-gray-600 text-sm">
                    Pour chaque robot, tu as décidé « prêt à partir » ou « à réparer ». Mais comment, exactement ? Sur
                    quels indices t'es-tu appuyé ?
                  </p>
                  <p className="text-gray-600 text-sm">
                    Sûrement plusieurs à la fois, un peu à l'instinct — et sans forcément suivre toujours la même règle.
                    Serais-tu capable d'expliquer ta méthode à quelqu'un d'autre, mot pour mot ?
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="primary" onPress={() => setPage(1)}>
                    Suivant
                    <ArrowRight />
                  </Button>
                </Modal.Footer>
              </>
            ) : (
              <>
                <Modal.Body className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-200" />
                    <span className="w-2 h-2 rounded-full bg-gray-800" />
                  </div>
                  <p className="text-gray-600 text-sm">
                    Le programme, lui, ne devine pas. Il suit un{' '}
                    <span className="font-semibold">arbre de décision</span> : il pose une question à la fois et, selon
                    la réponse — oui ou non — il descend une branche, jusqu'à une décision.
                  </p>

                  <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                    <DecisionTreeGraphic />
                  </div>

                  <p className="text-gray-500 text-xs text-center">
                    Comme au « Qui est-ce ? » : chaque question élimine des possibilités, jusqu'à la réponse finale.
                  </p>
                </Modal.Body>
                <Modal.Footer>
                  <Button variant="ghost" onPress={() => setPage(0)}>
                    <ArrowLeft />
                    Retour
                  </Button>
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
                    Voir l'arbre en action
                    <ArrowRight />
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

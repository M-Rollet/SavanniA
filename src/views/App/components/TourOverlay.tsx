import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ChevronLeft, ChevronRight, CheckShape, Ban, Xmark } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { hasAllCriteria } from '../steps/stepDefinitions';

// Special tourStep values beyond the 8 spotlighted steps of the step-1 tour (see TOUR_STEPS below).
export const TOUR_INTERLUDE_1 = 100;
export const TOUR_WAIT_ROW_COMPLETE = 101;
export const TOUR_INTERLUDE_2 = 200;

// Step-2 tour (decision-tree walkthrough): spotlighted steps numbered 19-27, ending in this
// interlude. Kept in a distinct range from the step-1 tour above so both can share the same
// tourStep/TOUR_STEPS machinery without colliding.
export const TOUR2_INTERLUDE = 300;

// Step-4 tour (editing the tree): spotlighted steps numbered 40-42, ending in this interlude.
export const TOUR3_INTERLUDE = 400;

// Step-5 tour: two popovers, no interlude — the last one finishes the tour directly (see the
// special-case in handleOk below). Started from StepIntroModal the same way as the step-1 tour.
export const TOUR4_STEP = 50;
export const TOUR4_STEP_LEAF = 51;

/** Pause between the student completing what a "wait" popover asked for and the tour moving on
 * to the next one, so the result of their action is visible before the spotlight jumps. */
export const TOUR_ADVANCE_DELAY_MS = 700;

/** Prediction buttons stay disabled everywhere in the table while the tour still has something
 * else it wants the student to do first — they only unlock once step 8 is reached. */
export function isPredictionLockedByTour(tourStep: number): boolean {
  return (tourStep > 0 && tourStep < 8) || tourStep === TOUR_INTERLUDE_1 || tourStep === TOUR_WAIT_ROW_COMPLETE;
}

/** "Lancer le test" stays disabled while the step-2 tour is still walking through how the tree
 * itself works — it only unlocks once the tour actually asks the student to launch a test (step
 * 26), so they don't jump ahead of the explanation. */
export function isLaunchTestLockedByTour(tourStep: number): boolean {
  return tourStep >= 19 && tourStep <= 25;
}

/** Inline ready/repair badge for tour copy — same icon + color convention used everywhere else
 * (DataTable, TerrainModal, ReunionModal): CheckShape/green for ready, Ban/amber for repair. */
function StatusLabel({ ready }: { ready: boolean }) {
  const Icon = ready ? CheckShape : Ban;
  return (
    <span
      className={
        'inline-flex items-center gap-1 align-middle text-xs font-medium px-2 py-0.5 rounded-full bg-gray-900 text-white'
      }
    >
      <Icon width={11} height={11} />
      {ready ? 'Prêt à partir' : 'À réparer'}
    </span>
  );
}

type TourStepDef = {
  target: string;
  text: ReactNode;
  /** 'ok' = popover shows a button the student clicks to move on. 'wait' = no button; advancing
   * that step is wired into the real action's handler elsewhere (see each component's tourStep check). */
  advanceOn: 'ok' | 'wait';
  /** Gap between the highlight ring and the target's own edge. Defaults to PAD. */
  padding?: number;
  /** Popover position relative to the target. Defaults to 'auto' (below, or above if no room).
   * 'top' forces above regardless of available space. */
  placement?: 'auto' | 'right' | 'top';
  /** Step-2 tour only: shows Chevron back/next controls instead of the step-1 tour's plain OK
   * button. */
  chevronNav?: boolean;
  /** Back-navigation target for a chevronNav step; omitted on the first step of that tour. */
  back?: number;
  /** Overrides the default tourStep + 1 advance target — needed when "next" has to jump to an
   * interlude modal outside the step's own numeric range (e.g. 26 → TOUR2_INTERLUDE). */
  next?: number;
};

// Placeholder copy — refine later.
const TOUR_STEPS: Record<number, TourStepDef> = {
  1: {
    target: '[data-tour="left-panel"]',
    text: "Voici ton espace de travail. C'est ici que tu vas observer et contrôler chaque robot.",
    advanceOn: 'ok',
    padding: 0,
    placement: 'right',
  },
  2: {
    target: '[data-tour="robot-selector"]',
    text: 'Sélectionne un robot pour commencer.',
    advanceOn: 'wait',
  },
  3: {
    target: '[data-tour="light-button"]',
    text: 'Allume la lumière du robot avec ce bouton, regarde le résultat, puis éteins-la à nouveau.',
    advanceOn: 'wait',
  },
  4: {
    target: '[data-tour="table-zone"]',
    text: "C'est ici que tu vas noter tes observations pour chaque robot.",
    advanceOn: 'ok',
  },
  5: {
    target: '[data-tour="selected-robot-light-cell"]',
    text: "Clique sur la case Lumière de ton robot, et indique si elle fonctionne, d'après ce que tu as observé.",
    advanceOn: 'wait',
  },
  8: {
    target: '[data-tour="prediction-row"]',
    text: (
      <>
        Donne maintenant ton pronostic pour ce robot. Penses-tu qu'il est <StatusLabel ready /> ou{' '}
        <StatusLabel ready={false} />
        {'\u00A0?'}
      </>
    ),
    advanceOn: 'wait',
  },

  // ── Step-2 tour: how the decision tree itself works ──────────────────────────────
  // 19 has no chevronNav: it's a plain instruction with nothing to click yet (see PopoverCard).
  19: {
    target: '[data-tour="robot-selector"]',
    text: "Sélectionne d'abord un robot.",
    advanceOn: 'wait',
  },
  20: {
    target: '[data-testid="rf__node-root"]',
    text: 'Voici le point de départ : le robot qui va être testé par le programme.',
    advanceOn: 'ok',
    chevronNav: true,
    back: 19,
  },
  21: {
    target: '[data-testid="rf__node-d1"]',
    text: "Chaque question du programme ressemble à ceci : une seule question, et deux réponses possibles — Oui ou Non. C'est un noeud !",
    advanceOn: 'ok',
    chevronNav: true,
    back: 20,
  },
  22: {
    target: '[data-testid="rf__edge-d1-yes-l1"]',
    text: 'Si la réponse est « Oui », le programme suit cette branche.',
    advanceOn: 'ok',
    chevronNav: true,
    back: 21,
  },
  23: {
    // Targets the actual card, not xyflow's node wrapper: the wrapper's box is fixed to the
    // layout engine's estimated height (see getNodeHeight('leaf') in treeLayout.ts), but the
    // real leaf card auto-sizes to its content and can render taller, spilling past that
    // estimate — highlighting the wrapper alone clips the bottom of the card off.
    target: '[data-testid="rf__node-l1"] .node-card',
    placement: 'top',
    text: (
      <>
        Ici, plus de question : c'est une décision finale. Le robot est classé <StatusLabel ready />. C'est une feuille de l'arbre.
      </>
    ),
    advanceOn: 'ok',
    chevronNav: true,
    back: 22,
  },
  24: {
    target: '[data-testid="rf__edge-d1-no-l2"]',
    text: 'Si la réponse est « Non », le programme suit cette autre branche.',
    advanceOn: 'ok',
    chevronNav: true,
    back: 23,
  },
  25: {
    // Same wrapper-vs-card sizing note as step 23 above.
    target: '[data-testid="rf__node-l2"] .node-card',
    placement: 'top',
    text: (
      <>
        Dans ce cas, le robot est classé <StatusLabel ready={false} />. Quel que soit le chemin, l'arbre se termine
        toujours par une décision.
      </>
    ),
    advanceOn: 'ok',
    chevronNav: true,
    back: 24,
  },
  26: {
    target: '[data-tour="launch-test-button"]',
    text: "À toi de jouer : clique sur « Lancer le test » pour voir le programme parcourir l'arbre en direct, question après question.",
    advanceOn: 'wait',
    chevronNav: true,
    back: 25,
  },
  27: {
    target: '[data-tour="tree-result-row"]',
    text: "Voici la décision de l'arbre pour ce robot. Compare-la à ton propre pronostic, juste à côté.",
    advanceOn: 'ok',
    chevronNav: true,
    back: 26,
    next: TOUR2_INTERLUDE,
  },

  // ── Step-4 tour: how to edit the tree ─────────────────────────────────────────────
  40: {
    target: '[data-testid="rf__node-d1"]',
    text: 'Tu peux modifier la question, selon ce qui te semble pertinent.',
    advanceOn: 'ok',
    chevronNav: true,
  },
  41: {
    // Same wrapper-vs-card sizing note as the step-2 tour's leaf steps above.
    target: '[data-testid="rf__node-l1"] .node-card',
    text: 'Tu peux aussi modifier la décision qui est prise.',
    advanceOn: 'ok',
    chevronNav: true,
    back: 40,
  },
  42: {
    target: '[data-testid="rf__node-l1"] [data-tour="leaf-placements"]',
    text: "Tu peux voir quels robots sont arrivés ici avec l'arbre, et s'ils sont bien ou mal classés.",
    advanceOn: 'ok',
    chevronNav: true,
    back: 41,
    next: TOUR3_INTERLUDE,
  },

  // ── Step-5 tour: badly-classified new robots, then deleting a leaf to add a new question ──────
  [TOUR4_STEP]: {
    target: '[data-tour="mismatched-row"]',
    text: 'Certains des nouveaux robots ne sont pas triés correctement...',
    advanceOn: 'ok',
    placement: 'top',
  },
  [TOUR4_STEP_LEAF]: {
    // Same wrapper-vs-card sizing note as the step-2/step-4 tours' leaf steps above.
    target: '[data-testid="rf__node-l1"] .node-card',
    text: (
      <>
        Peut-être qu'une seule question ne suffit pas, il faut en poser une deuxième pour trier correctement les
        robots...
        <br />
        Clique sur{' '}
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white border border-gray-200 text-gray-400 align-text-bottom">
          <Xmark width={12} height={12} />
        </span>{' '}
        pour supprimer la décision et poser une question ici à la place.
      </>
    ),
    advanceOn: 'ok',
    placement: 'right',
  },
};

export type Rect = { top: number; left: number; width: number; height: number };

/** Tracks a `[data-tour="..."]` target's viewport rect via rAF polling — robust to modal-open
 * animations and layout shifts that a ResizeObserver alone wouldn't catch. When the selector
 * matches more than one element (e.g. several wrong table rows), the spotlight covers their union
 * — every match at once — rather than just the first. Exported for reuse by anything else that
 * needs to anchor UI to a `[data-tour="..."]` element outside the tour itself (see
 * Step7IntroModal's pre-build card). */
export function useTourTargetRect(selector: string | null): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const els = document.querySelectorAll<HTMLElement>(selector);
      if (els.length > 0) {
        let top = Infinity;
        let left = Infinity;
        let right = -Infinity;
        let bottom = -Infinity;
        els.forEach(el => {
          const r = el.getBoundingClientRect();
          top = Math.min(top, r.top);
          left = Math.min(left, r.left);
          right = Math.max(right, r.left + r.width);
          bottom = Math.max(bottom, r.top + r.height);
        });
        const next = { top, left, width: right - left, height: bottom - top };
        setRect(prev =>
          prev &&
          prev.top === next.top &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
            ? prev
            : next
        );
      } else {
        setRect(null);
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [selector]);

  return rect;
}

const PAD = 8;
const POPOVER_WIDTH = 300;
const GAP = 14;

/** Which stepIndex a given tourStep value belongs to, or null if inactive/unowned. Used by the
 * safety net below so each tour only stays live on its own step. */
function tourStepOwnerStep(tourStep: number): number | null {
  if (tourStep === 0) {
    return null;
  }
  if (
    (tourStep >= 1 && tourStep <= 8) ||
    tourStep === TOUR_INTERLUDE_1 ||
    tourStep === TOUR_WAIT_ROW_COMPLETE ||
    tourStep === TOUR_INTERLUDE_2
  ) {
    return 1;
  }
  if ((tourStep >= 19 && tourStep <= 27) || tourStep === TOUR2_INTERLUDE) {
    return 2;
  }
  if ((tourStep >= 40 && tourStep <= 42) || tourStep === TOUR3_INTERLUDE) {
    return 4;
  }
  if (tourStep >= TOUR4_STEP && tourStep <= TOUR4_STEP_LEAF) {
    return 5;
  }
  return null;
}

export function TourOverlay() {
  const {
    stepIndex,
    tourStep,
    setTourStep,
    setTourSeen,
    setTour2Seen,
    setTour3Seen,
    setTour4Seen,
    controledRobot,
    robotConfigs,
    physicalRobotData,
    robotTestActive,
    testResultRobot,
  } = useScenario();

  // Safety net: never leave a tour's overlay active outside the step it belongs to (e.g. if the
  // user somehow advances mid-tour), so a stray overlay can't strand the app on another step.
  useEffect(() => {
    const owner = tourStepOwnerStep(tourStep);
    if (owner !== null && owner !== stepIndex) {
      setTourStep(0);
    }
  }, [stepIndex, tourStep, setTourStep]);

  // Step 2 → 3: advances shortly after a robot gets selected.
  useEffect(() => {
    if (tourStep === 2 && controledRobot) {
      const timer = setTimeout(() => setTourStep(3), TOUR_ADVANCE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [tourStep, controledRobot, setTourStep]);

  // Step-2 tour, step 19 → 20: same idea as step 2 → 3 above — the tour always opens on "select a
  // robot" first, so a returning student who already has one selected just breezes through it.
  useEffect(() => {
    if (tourStep === 19 && controledRobot) {
      const timer = setTimeout(() => setTourStep(20), TOUR_ADVANCE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [tourStep, controledRobot, setTourStep]);

  // Waiting-for-row-completion → step 8: any robot (not necessarily the one originally selected)
  // reaching a full row satisfies the mid-objective.
  useEffect(() => {
    if (
      tourStep === TOUR_WAIT_ROW_COMPLETE &&
      robotConfigs.some(({ uuid }) => hasAllCriteria(physicalRobotData[uuid]))
    ) {
      const timer = setTimeout(() => setTourStep(8), TOUR_ADVANCE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [tourStep, robotConfigs, physicalRobotData, setTourStep]);

  // Step-2 tour, step 26 → 27: advances once the selected robot's test actually reaches a leaf.
  // Deliberately keyed on testResultRobot (set fresh on every completed run), not
  // physicalRobotData's permanent `tested` flag — that flag stays true forever once a robot has
  // EVER been tested, which would let the tour skip straight past requiring a new test if the
  // currently selected robot just happened to already be tested (e.g. re-visiting the tour).
  useEffect(() => {
    if (tourStep === 26 && controledRobot && testResultRobot === controledRobot) {
      const timer = setTimeout(() => setTourStep(27), TOUR_ADVANCE_DELAY_MS);
      return () => clearTimeout(timer);
    }
  }, [tourStep, controledRobot, testResultRobot, setTourStep]);

  // Step-2 tour, step 26: once the student actually launches the test, get out of the way
  // entirely — no dimming, no ring, no popover — so the tree's own pan/animation through the
  // questions is fully visible. Kept suppressed through testResultRobot matching too (not just
  // while `robotTestActive`): SoftwareMain sets those two flags back to back, but this component
  // only learns about `robotTestActive` a render later (it's mirrored through context), so
  // without that check the launch-button popover could flash back on screen for that gap before
  // the effect above advances to step 27. The overlay picks back up there, directly on the result
  // row, once the flying-dot animation to the table has already landed.
  const suppressed = tourStep === 26 && (robotTestActive || testResultRobot === controledRobot);
  const stepDef = suppressed ? null : TOUR_STEPS[tourStep] ?? null;
  const rect = useTourTargetRect(stepDef?.target ?? null);
  const pad = stepDef?.padding ?? PAD;

  const finishTour = () => {
    setTourSeen(true);
    setTourStep(0);
  };

  const finishTour2 = () => {
    setTour2Seen(true);
    setTourStep(0);
  };

  const finishTour3 = () => {
    setTour3Seen(true);
    setTourStep(0);
  };

  const finishTour4 = () => {
    setTour4Seen(true);
    setTourStep(0);
  };

  // The step-5 tour has no interlude modal after it — its last popover's own "OK" ends the tour
  // directly instead of advancing to another TOUR_STEPS entry.
  const handleOk = stepDef
    ? () => (tourStep === TOUR4_STEP_LEAF ? finishTour4() : setTourStep(stepDef.next ?? tourStep + 1))
    : () => {};
  const handleBack = stepDef?.back !== undefined ? () => setTourStep(stepDef.back!) : undefined;

  return (
    <>
      {stepDef &&
        rect &&
        createPortal(
          <div className="fixed inset-0 z-[99999] pointer-events-none">
            {/* Invisible click-catchers around the highlighted box — pointer-events-auto so they
                (and only they) block clicks; the wrapper itself is pointer-events-none so the
                "hole" over the target stays fully interactive underneath. The actual dimming is
                painted by the highlight ring's box-shadow below, so its rounded corners are
                honoured instead of these strips' square ones. */}
            <div
              className="fixed pointer-events-auto transition-all duration-300"
              style={{ top: 0, left: 0, right: 0, height: Math.max(0, rect.top - pad) }}
            />
            <div
              className="fixed pointer-events-auto transition-all duration-300"
              style={{ top: rect.top + rect.height + pad, left: 0, right: 0, bottom: 0 }}
            />
            <div
              className="fixed pointer-events-auto transition-all duration-300"
              style={{
                top: rect.top - pad,
                left: 0,
                width: Math.max(0, rect.left - pad),
                height: rect.height + pad * 2,
              }}
            />
            <div
              className="fixed pointer-events-auto transition-all duration-300"
              style={{
                top: rect.top - pad,
                left: rect.left + rect.width + pad,
                right: 0,
                height: rect.height + pad * 2,
              }}
            />

            {/* Highlight ring around the target — its box-shadow spread dims the rest of the
                viewport, following this box's own rounded-lg corners for a properly rounded
                cutout instead of the sharp corners a plain rectangular mask would give. */}
            <div
              className="fixed rounded-lg border-2 border-white pointer-events-none transition-all duration-300"
              style={{
                top: rect.top - pad,
                left: rect.left - pad,
                width: rect.width + pad * 2,
                height: rect.height + pad * 2,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
              }}
            />

            {/* Popover: 'right' places it beside the target, vertically centered; 'auto' places it
                below the target if there's room, otherwise above; 'top' always places it above. */}
            {(() => {
              const placement = stepDef.placement ?? 'auto';

              if (placement === 'right') {
                const centerY = rect.top + rect.height / 2;
                const clampedTop = Math.min(Math.max(centerY, 120), window.innerHeight - 120);
                const left = rect.left + rect.width + pad + GAP;

                return (
                  <div
                    className="fixed pointer-events-auto transition-all duration-300"
                    style={{ top: clampedTop, left, width: POPOVER_WIDTH, transform: 'translate(0, -50%)' }}
                  >
                    <div
                      className="absolute top-1/2 -left-1.5 w-3 h-3 bg-white"
                      style={{ transform: 'translateY(-50%) rotate(45deg)' }}
                    />
                    <PopoverCard stepDef={stepDef} onOk={handleOk} onBack={handleBack} />
                  </div>
                );
              }

              const spaceBelow = window.innerHeight - (rect.top + rect.height + pad);
              const placeBelow = placement !== 'top' && spaceBelow > 140;
              const centerX = rect.left + rect.width / 2;
              const clampedLeft = Math.min(
                Math.max(centerX, POPOVER_WIDTH / 2 + 12),
                window.innerWidth - POPOVER_WIDTH / 2 - 12
              );
              const top = placeBelow ? rect.top + rect.height + pad + GAP : rect.top - pad - GAP;

              return (
                <div
                  className="fixed pointer-events-auto transition-all duration-300"
                  style={{
                    top,
                    left: clampedLeft,
                    width: POPOVER_WIDTH,
                    transform: placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
                  }}
                >
                  <div
                    className={`absolute left-1/2 w-3 h-3 bg-white ${placeBelow ? '-top-1.5' : '-bottom-1.5'}`}
                    style={{ transform: 'translateX(-50%) rotate(45deg)' }}
                  />
                  <PopoverCard stepDef={stepDef} onOk={handleOk} onBack={handleBack} />
                </div>
              );
            })()}
          </div>,
          document.body
        )}

      <TourInterludeModal
        isOpen={tourStep === TOUR_INTERLUDE_1}
        text="Bien joué ! Continue maintenant à remplir les données de ce robot (capteurs de distance, bruit moteur, batterie) en cliquant sur les autres cases de sa ligne dans le tableau."
        onDismiss={() => setTourStep(TOUR_WAIT_ROW_COMPLETE)}
      />

      <TourInterludeModal
        isOpen={tourStep === TOUR_INTERLUDE_2}
        text="Parfait ! Tu sais maintenant comment observer un robot et donner ton pronostic. Fais de même pour tous les autres robots avant de passer à l'étape suivante."
        onDismiss={finishTour}
      />

      <TourInterludeModal
        isOpen={tourStep === TOUR2_INTERLUDE}
        text="Teste maintenant chaque robot, un par un, pour voir comment le programme les classe."
        onDismiss={finishTour2}
      />

      <TourInterludeModal
        isOpen={tourStep === TOUR3_INTERLUDE}
        text="Essaie de trouver un paramètre qui est lié au résultat sur le terrain, et de choisir la question en fonction."
        onDismiss={finishTour3}
      />
    </>
  );
}

function PopoverCard({ stepDef, onOk, onBack }: { stepDef: TourStepDef; onOk: () => void; onBack?: () => void }) {
  // The step-2 tour shows Chevron navigation controls; the step-1 tour keeps its original plain
  // "OK" button, unchanged.
  const showNav = stepDef.chevronNav === true;

  return (
    <div className="relative bg-white rounded-xl shadow-xl p-4 flex flex-col gap-3">
      <p className="text-sm text-gray-700">{stepDef.text}</p>
      {showNav ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            aria-label="Étape précédente"
            isDisabled={!onBack}
            onPress={onBack}
          >
            <ChevronLeft />
          </Button>
          {stepDef.advanceOn === 'ok' && (
            <Button variant="primary" size="sm" onPress={onOk}>
              Suivant
              <ChevronRight />
            </Button>
          )}
        </div>
      ) : (
        stepDef.advanceOn === 'ok' && (
          <Button variant="primary" size="sm" className="self-end" onPress={onOk}>
            OK
          </Button>
        )
      )}
    </div>
  );
}

function TourInterludeModal({ isOpen, text, onDismiss }: { isOpen: boolean; text: string; onDismiss: () => void }) {
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Body className="flex flex-col gap-3">
              <p className="text-gray-600 text-sm">{text}</p>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="primary" onPress={onDismiss}>
                Compris
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

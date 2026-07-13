import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowRight, ArrowLeft, CheckShape } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { useLocalStorage } from '../../../helpers/useLocalStorage';
import { useTourTargetRect } from './TourOverlay';
import thymioTrue from '../../../assets/thymio_true.png';
import thymioFalse from '../../../assets/thymio_false.png';
import thymioSort from '../../../assets/thymio_sort.png';
import './TreeNodes.css';

// Gini impurity for a single boolean (ready/not) proportion — 0 when pure, 0.5 at an even split.
// Duplicated (not imported) from DecisionTree.tsx deliberately: this operates on the modal's own
// invented illustrative patterns, not real DatasetEntry/testResults data.
function gini(pTrue: number): number {
  return 2 * pTrue * (1 - pTrue);
}

function weightedGini(groups: boolean[][]): number {
  const total = groups.reduce((n, g) => n + g.length, 0);
  if (total === 0) {
    return 0;
  }
  return groups.reduce((sum, g) => {
    const p = g.length === 0 ? 0 : g.filter(Boolean).length / g.length;
    return sum + (g.length / total) * gini(p);
  }, 0);
}

function RobotIcon({ ready, size = 18 }: { ready: boolean; size?: number }) {
  return (
    <img
      src={ready ? thymioTrue : thymioFalse}
      alt={ready ? 'Prêt à partir' : 'À réparer'}
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  );
}

function RobotCluster({
  pattern,
  arrangement = 'random',
  size = 18,
  perRow,
}: {
  pattern: boolean[];
  arrangement?: 'random' | 'sorted';
  size?: number;
  /** Lays icons out in a fixed-width grid instead of a free-flowing wrap — used for the standalone
   * group comparisons, where bigger, evenly-gridded icons read more clearly than a packed wrap. */
  perRow?: number;
}) {
  const ordered = arrangement === 'sorted' ? [...pattern].sort((a, b) => Number(b) - Number(a)) : pattern;
  if (perRow) {
    return (
      <div
        className="grid gap-2.5 justify-items-center p-3 rounded-xl bg-gray-50 border border-gray-300"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {ordered.map((ready, i) => (
          <RobotIcon key={i} ready={ready} size={size} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 justify-center content-start w-32 min-h-[72px] p-2 rounded-lg bg-gray-50 border border-gray-300">
      {ordered.map((ready, i) => (
        <RobotIcon key={i} ready={ready} size={size} />
      ))}
    </div>
  );
}

function GroupCard({ label, pattern }: { label: string; pattern: boolean[] }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <RobotCluster pattern={pattern} size={32} perRow={4} />
    </div>
  );
}

// Geometry for QuestionNodePreview's connector lines, hand-computed from the sizing constants
// used below (card width; RobotCluster's size=32/perRow=4 grid: 4×32 icons + 3×10 gaps (gap-2.5)
// + 2×12 padding (p-3); the gap-4 between the two clusters). If any of those change, these need
// updating too — there's no live measurement, since it's just a static illustration.
const NODE_CARD_WIDTH = 200;
const CLUSTER_WIDTH = 4 * 32 + 3 * 10 + 2 * 12; // 182
const CLUSTER_ROW_GAP = 16; // gap-4
const CLUSTER_ROW_WIDTH = CLUSTER_WIDTH * 2 + CLUSTER_ROW_GAP; // 380
const CONNECTOR_HEIGHT = 14;

/** Diagonal connectors from each Oui/Non tab's own center (25%/75% of the card, matching the real
 * DecisionNode's actual handle positions) down to its cluster's center below — straight verticals
 * can't do this without a gap, since the card is narrower than the two-cluster row beneath it. */
function QuestionConnectors() {
  const cardLeft = (CLUSTER_ROW_WIDTH - NODE_CARD_WIDTH) / 2;
  const ouiTabX = cardLeft + NODE_CARD_WIDTH * 0.25;
  const nonTabX = cardLeft + NODE_CARD_WIDTH * 0.75;
  const ouiClusterX = CLUSTER_WIDTH / 2;
  const nonClusterX = CLUSTER_WIDTH + CLUSTER_ROW_GAP + CLUSTER_WIDTH / 2;
  return (
    <svg width={CLUSTER_ROW_WIDTH} height={CONNECTOR_HEIGHT} className="block">
      <line x1={ouiTabX} y1={0} x2={ouiClusterX} y2={CONNECTOR_HEIGHT} stroke="#9ca3af" strokeWidth={1.5} />
      <line x1={nonTabX} y1={0} x2={nonClusterX} y2={CONNECTOR_HEIGHT} stroke="#9ca3af" strokeWidth={1.5} />
    </svg>
  );
}

/** Static replica of the real tree's DecisionNode card (see DecisionNode.tsx / TreeNodes.css) —
 * same header + Oui/Non tab strip, so the comparison already looks like the node the student will
 * actually build with in the next step. The two branches below are plain robot-cluster surfaces
 * (not full LeafNode cards): there's no "decision" being made here, just a count per branch. */
function QuestionNodePreview({
  label,
  oui,
  non,
  giniValue,
}: {
  label: string;
  oui: boolean[];
  non: boolean[];
  /** Floating pill above the card — same shape/position as the real tree's DecisionNode giniBadge
   * (see DecisionNode.tsx), just amber-200 here instead of green/red. Undefined hides it (page 3,
   * before Gini is introduced). */
  giniValue?: number;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="node" style={{ width: NODE_CARD_WIDTH, position: 'relative', overflow: 'visible' }}>
        {giniValue !== undefined && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full text-xs font-bold shadow-sm z-20 whitespace-nowrap bg-amber-200 text-amber-900"
          >
            Gini : {giniValue.toFixed(2)}
          </motion.div>
        )}
        <div className="node-card rounded-xl bg-white shadow-sm border transition-all">
          <div className="px-3 pt-3 pb-2 border-b border-gray-100 text-center">
            <span className="text-base text-gray-950">{label}</span>
          </div>
          <div className="flex">
            <div className="node-tab-yes flex-1 py-2 text-sm font-medium rounded-bl-xl text-center">Oui</div>
            <div className="w-px bg-gray-100" />
            <div className="node-tab-no flex-1 py-2 text-sm font-medium rounded-br-xl text-center">Non</div>
          </div>
        </div>
      </div>
      <QuestionConnectors />
      <div className="flex gap-4">
        <RobotCluster pattern={oui} size={32} perRow={4} />
        <RobotCluster pattern={non} size={32} perRow={4} />
      </div>
    </div>
  );
}

type Choice = 'A' | 'B' | 'equal';

/** A/B/équivalent multiple-choice used by the three comparison exercises. Real quiz behaviour: a
 * wrong pick shakes that button and lets the student try again (Suivant stays locked); only the
 * correct pick locks the exercise in, shows the positive (green) explanation, and unlocks Suivant
 * via `onAnswered`. */
function ChoiceExercise({
  children,
  question,
  correct,
  feedback,
  labelA,
  labelB,
  labelEqual,
  onAnswered,
}: {
  children: ReactNode;
  /** The actual prompt ("D'après toi, lequel...?") — rendered just above the answer options,
   * separate from whatever setup/context text the caller puts above the visual comparison. */
  question: ReactNode;
  correct: Choice;
  feedback: string;
  labelA: string;
  labelB: string;
  labelEqual: string;
  onAnswered: () => void;
}) {
  const [solved, setSolved] = useState(false);
  const [shaking, setShaking] = useState<Choice | null>(null);

  const pick = (choice: Choice) => {
    if (solved) {
      return;
    }
    if (choice === correct) {
      setSolved(true);
      onAnswered();
    } else {
      setShaking(choice);
      setTimeout(() => setShaking(null), 400);
    }
  };

  const options: { id: Choice; label: string }[] = [
    { id: 'A', label: labelA },
    { id: 'B', label: labelB },
    { id: 'equal', label: labelEqual },
  ];

  return (
    <div className="flex flex-col gap-3 items-center w-full mt-5">
      {children}
      <p className="text-gray-700 text-sm font-medium self-start mt-8">{question}</p>
      <div className="flex flex-wrap gap-2 justify-start self-start">
        {options.map(opt => (
          <motion.button
            key={opt.id}
            onClick={() => pick(opt.id)}
            disabled={solved}
            animate={shaking === opt.id ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
            transition={{ duration: 0.4 }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              solved && opt.id === correct
                ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                : shaking === opt.id
                ? 'bg-red-50 border-red-300 text-red-600'
                : solved
                ? 'border-gray-100 text-gray-300'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {opt.label}
          </motion.button>
        ))}
      </div>
      {solved && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
          className="flex gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 self-stretch"
        >
          <CheckShape width={16} height={16} className="text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-emerald-800 text-sm">{feedback}</p>
        </motion.div>
      )}
    </div>
  );
}

// ── Page 1: two standalone groups, pick the better-sorted one (correct: B) ──
const P1_A = [true, false, false, true, false, true, false, true];
const P1_B = [false, true, false, true, true, true, true, true];

// ── Page 2: same idea, but tied — arrangement/order never changes mixedness (correct: equal) ──
const P2_A = [true, false, true, true, false, false, true, false];
const P2_B = [false, false, false, false, true, true, true, true];

// ── Pages 3 & 4: two candidate questions, each splitting the same starting group (correct: B) ──
const P34_QA = {
  oui: [true, false, true, true, false, false, true, false],
  non: [false, true, false, false, true, false, true, true],
};
const P34_QB = {
  oui: [false, true, false, false, false, false, false, true],
  non: [true, true, false, false, true, true, true, true],
};

// ── Page 5: final quiz — the two splits differ by a single robot (one moved from Question A's
// Oui branch to Question B's Non branch), so by eye they look about as good as each other. Their
// Gini scores (0.38 vs 0.43) are close but clearly distinct — the point is that this is exactly
// the kind of call where guessing stops working and the score becomes the tiebreaker.
const P5_QA = {
  oui: [true, true, false, true, false, true, false, false, true, false, true, false],
  non: [true, false, true, false, false, true, false, false, false, true, false, true],
};
const P5_QB = {
  oui: [true, false, true, false, true, true, true, false, true, true, false, false],
  non: [false, true, false, true, false, true, false, false, false, false, false, true],
};

const HEADINGS = [
  'Trop de robots pour trier à la main',
  'Trié ou mélangé ?',
  'Trié ou mélangé ?',
  "Le lien avec l'arbre",
  'Une mesure du mélange',
  'Un dernier défi',
];

function PageDots({ page, count }: { page: number; count: number }) {
  return (
    <div className="flex gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full transition-colors ${
            i === page ? 'bg-blue-600' : i < page ? 'bg-blue-200' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  );
}

export function Step7IntroModal() {
  const { stepIndex, setStep7DemoActive, setAlgorithmBuildArmed } = useScenario();
  const [seen, setSeen] = useLocalStorage<boolean>('scenario:step7IntroSeen', false);
  const [page, setPage] = useState(0);
  const [answeredThisPage, setAnsweredThisPage] = useState(false);
  const [showGiniA, setShowGiniA] = useState(false);
  const [showGiniB, setShowGiniB] = useState(false);

  const active = stepIndex === 7 && !seen;
  const QUIZ_PAGE = 5;
  const LAST_PAGE = 6;
  // Dots represent the 6 "real" pages (0-5, the last being the final quiz) — the pre-build card
  // (page 6) isn't a page the student reads through, so it gets no dots at all.
  const DOT_COUNT = QUIZ_PAGE + 1;
  const showPreBuildCard = active && page === LAST_PAGE;
  const [buildStarted, setBuildStarted] = useState(false);
  // Anchors the pre-build card just outside the real tree panel's right edge (see SoftwareMain's
  // [data-tour="tree-zone"]) instead of a fixed viewport position, so it tracks the actual layout.
  const treeRect = useTourTargetRect(showPreBuildCard ? '[data-tour="tree-zone"]' : null);

  useEffect(() => {
    setAnsweredThisPage(false);
  }, [page]);

  // Page 4: the two Gini badges fade in one after the other, not both at once with the rest of
  // the page's content — gives the reveal a beat instead of dumping the answer immediately.
  useEffect(() => {
    setShowGiniA(false);
    setShowGiniB(false);
    if (page !== 4) {
      return;
    }
    const t1 = setTimeout(() => setShowGiniA(true), 1000);
    const t2 = setTimeout(() => setShowGiniB(true), 1600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [page]);

  // The auto-build demo runs on the real tree panel (see SoftwareMain's step7DemoActive swap),
  // and only starts once the student explicitly clicks "Construire" — not just by reaching this
  // page. Driven by buildStarted rather than page/active directly: handleBuild below also calls
  // finish() in the same click, which flips `active` false a render later — if this were still
  // keyed on `active`, that would immediately cancel the build right as it starts. Resets if the
  // student backs out of this page without building.
  useEffect(() => {
    setStep7DemoActive(buildStarted);
  }, [buildStarted, setStep7DemoActive]);

  useEffect(() => {
    if (page !== LAST_PAGE) {
      setBuildStarted(false);
    }
  }, [page]);

  const isOpen = active && page < LAST_PAGE;
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  const goNext = () => setPage(p => Math.min(p + 1, LAST_PAGE));
  const goBack = () => setPage(p => Math.max(p - 1, 0));

  const finish = () => {
    setSeen(true);
  };

  const handleBuild = () => {
    setBuildStarted(true);
    setAlgorithmBuildArmed(true);
    finish();
  };

  const gap34A = weightedGini([P34_QA.oui, P34_QA.non]);
  const gap34B = weightedGini([P34_QB.oui, P34_QB.non]);

  // Pages 1-3 require an answer before moving on (a genuine reveal, not a gate the student can
  // skip past without engaging); pages 0 and 4 are plain narration/reveal, always free to advance.
  const canGoNext = page === 1 || page === 2 || page === 3 || page === QUIZ_PAGE ? answeredThisPage : true;

  return (
    <>
      <Modal state={state}>
        <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
          <Modal.Container size="lg">
            {/* size="lg" caps out at 32rem — too narrow for two question-node previews side by
                side (see QuestionNodePreview). Inline style, not a className override: this
                library merges classes via tailwind-merge, which won't reliably beat the
                component's own non-Tailwind BEM size class in the cascade. */}
            <Modal.Dialog style={{ maxWidth: '56rem' }}>
              <Modal.Header>
                <div className="flex flex-col gap-2 w-full">
                  <PageDots page={page} count={DOT_COUNT} />
                  <Modal.Heading>
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={page}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        {HEADINGS[page]}
                      </motion.span>
                    </AnimatePresence>
                  </Modal.Heading>
                </div>
              </Modal.Header>

              <Modal.Body className="min-h-[35rem]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={page}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -16 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col gap-4 h-full"
                  >
                    {/* ── Page 0: why we need this ── */}
                    {page === 0 && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Avec 6 robots, trier à la main restait possible. Mais une autre équipe vient d'en envoyer 30
                          de plus — impossible de continuer au feeling ! Il nous faut une méthode qui marche à tous les
                          coups, quel que soit le nombre de robots. Découvrons comment un ordinateur s'y prend.
                        </p>
                        <div className="flex-1 flex items-center justify-center">
                          <img src={thymioSort} alt="" className="max-w-full max-h-60 object-contain" />
                        </div>
                      </>
                    )}

                    {/* ── Page 1: which group is better sorted? (correct: B) ── */}
                    {page === 1 && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Il nous faut un moyen pour évaluer si les robots sont bien triés ou non. Commençons par
                          comparer ces groupes de robots selon notre intuition.
                        </p>
                        <ChoiceExercise
                          correct="B"
                          question={
                            <>
                              D'après toi, lequel a été le <b>mieux trié</b> ?
                            </>
                          }
                          labelA="Groupe A"
                          labelB="Groupe B"
                          labelEqual="Aussi mélangés l'un que l'autre"
                          feedback="C'est juste, le groupe est plus pur. Il a une majorité de robots prêts à partir."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-10 justify-center">
                            <GroupCard label="Groupe A" pattern={P1_A} />
                            <GroupCard label="Groupe B" pattern={P1_B} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 2: same idea, but tied (correct: equal) ── */}
                    {page === 2 && (
                      <>
                        <p className="text-gray-600 text-sm">Continuons avec cet autre exemple.</p>
                        <ChoiceExercise
                          correct="equal"
                          question="D'après toi, lequel a été le mieux trié ?"
                          labelA="Groupe A"
                          labelB="Groupe B"
                          labelEqual="Aussi mélangés l'un que l'autre"
                          feedback="Exactement ! Les deux groupes ont la même répartition de robots (4-4), l'ordre des robots n'a pas d'importance."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-6 justify-center">
                            <GroupCard label="Groupe A" pattern={P2_A} />
                            <GroupCard label="Groupe B" pattern={P2_B} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 3: connect to decision trees — compare two candidate questions ── */}
                    {page === 3 && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Quand on construit un arbre de décision, chaque question sépare les robots en deux groupes :
                          ceux qui répondent Oui, et ceux qui répondent Non.
                        </p>
                        <ChoiceExercise
                          correct="B"
                          question="Laquelle de ces deux questions sépare le mieux les deux groupes ?"
                          labelA="Question A"
                          labelB="Question B"
                          labelEqual="Aussi mélangées l'une que l'autre"
                          feedback="C'est juste. La question B sépare les robots en deux groupes plus purs que la question A. Ici on devrait choisir la question B pour construire le meilleur arbre."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-8 justify-center">
                            <QuestionNodePreview label="Question A" oui={P34_QA.oui} non={P34_QA.non} />
                            <QuestionNodePreview label="Question B" oui={P34_QB.oui} non={P34_QB.non} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 4: introduce the Gini score, reveal it on pages 3's questions ── */}
                    {page === 4 && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Pour les petits groupes, on peut deviner à l'œil. Mais avec 30 robots ou plus, ce n'est plus
                          possible. Les scientifiques utilisent une formule, appelée{' '}
                          <span className="font-medium">le critère de Gini</span>, pour donner un score à chaque
                          question.
                        </p>
                        <p className="text-gray-600 text-sm">
                          Pas besoin de connaître la formule — il suffit de savoir lire le résultat. Plus le score est
                          bas, plus les groupes sont purs (c'est mieux !). Si le score est haut, les groupes sont
                          mélangés (c'est moins bien).
                        </p>
                        <div className="flex gap-8 justify-center py-10">
                          <QuestionNodePreview
                            label="Question A"
                            oui={P34_QA.oui}
                            non={P34_QA.non}
                            giniValue={showGiniA ? gap34A : undefined}
                          />
                          <QuestionNodePreview
                            label="Question B"
                            oui={P34_QB.oui}
                            non={P34_QB.non}
                            giniValue={showGiniB ? gap34B : undefined}
                          />
                        </div>
                        <p className="text-gray-600 text-sm">
                          On peut voir que la question B a un score plus bas que la question A. Notre intuition était
                          bonne !
                        </p>
                      </>
                    )}

                    {/* ── Page 5: final quiz — splits differ by a single robot, genuinely hard to
                        call by eye, so the Gini score is shown right away instead of revealed after. ── */}
                    {page === QUIZ_PAGE && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Pour finir, un vrai défi : cette fois, les deux options se ressemblent énormément. Un seul
                          robot change de groupe entre les deux questions.
                        </p>
                        <ChoiceExercise
                          correct="B"
                          question="En te basant sur le score de Gini, laquelle est la meilleure question ?"
                          labelA="Question A"
                          labelB="Question B"
                          labelEqual="Aussi mélangées l'une que l'autre"
                          feedback="Bravo ! À l'œil, ces deux questions se valaient presque. Mais le score de Gini ne se trompe pas : la question B sépare un peu mieux les robots."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-8 justify-center">
                            <QuestionNodePreview
                              label="Question A"
                              oui={P5_QA.oui}
                              non={P5_QA.non}
                              giniValue={weightedGini([P5_QA.oui, P5_QA.non])}
                            />
                            <QuestionNodePreview
                              label="Question B"
                              oui={P5_QB.oui}
                              non={P5_QB.non}
                              giniValue={weightedGini([P5_QB.oui, P5_QB.non])}
                            />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </Modal.Body>

              <Modal.Footer>
                <Button variant="ghost" onPress={goBack} isDisabled={page === 0}>
                  <ArrowLeft />
                  Retour
                </Button>
                <Button variant="primary" onPress={goNext} isDisabled={!canGoNext}>
                  Suivant
                  <ArrowRight />
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Pre-build card: anchored just outside the real tree panel's right edge (not a blocking
          modal over it), and doesn't start the build itself — that only happens once "Construire"
          is clicked (see handleBuild/buildStarted above). No dots: this isn't one of the numbered
          pages the student reads through. Waits for treeRect since it's positioned relative to
          the tree panel's actual measured position, not a fixed viewport guess. */}
      {showPreBuildCard &&
        treeRect &&
        createPortal(
          <div
            className="fixed z-[9999] w-[340px] max-w-[85vw]"
            style={{
              left: treeRect.left + treeRect.width + 16,
              top: treeRect.top + treeRect.height / 2,
              transform: 'translateY(-50%)',
            }}
          >
            <div className="relative bg-white rounded-xl shadow-xl border border-gray-100 p-4 flex flex-col gap-3">
              <div
                className="absolute top-1/2 -left-1.5 w-3 h-3 bg-white border-l border-b border-gray-100"
                style={{ transform: 'translateY(-50%) rotate(45deg)' }}
              />
              <p className="text-gray-600 text-sm">
                Maintenant, laissons notre algorithme construire l'arbre en choisissant toujours la question avec la
                plus petite valeur de Gini.
              </p>
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" onPress={goBack}>
                  <ArrowLeft />
                  Retour
                </Button>
                <Button variant="primary" size="sm" onPress={handleBuild}>
                  Construire
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

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
  size = 18,
  perRow,
}: {
  pattern: boolean[];
  size?: number;
  /** Lays icons out in a fixed-width grid instead of a free-flowing wrap — used for the standalone
   * group comparisons, where bigger, evenly-gridded icons read more clearly than a packed wrap. */
  perRow?: number;
}) {
  if (perRow) {
    return (
      <div
        className="grid gap-2.5 justify-items-center p-3 rounded-xl bg-gray-50 border border-gray-300"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {pattern.map((ready, i) => (
          <RobotIcon key={i} ready={ready} size={size} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1 justify-center content-start w-32 min-h-[72px] p-2 rounded-lg bg-gray-50 border border-gray-300">
      {pattern.map((ready, i) => (
        <RobotIcon key={i} ready={ready} size={size} />
      ))}
    </div>
  );
}

/** A single set of robots already divided in two by a rule — same bordered "cluster" surface as
 * RobotCluster's perRow variant, just cut down the middle by a vertical line so the two halves
 * read as one split set rather than two unrelated groups (contrast with QuestionNodePreview's two
 * separate cluster boxes, which represent an actual Oui/Non decision-node branch). */
function SplitSet({
  left,
  right,
  size = 32,
  perRow = 3,
}: {
  left: boolean[];
  right: boolean[];
  size?: number;
  perRow?: number;
}) {
  return (
    <div className="flex rounded-xl border border-gray-800 overflow-hidden">
      <div
        className="grid gap-2.5 justify-items-center p-3 bg-mist-50"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {left.map((ready, i) => (
          <RobotIcon key={i} ready={ready} size={size} />
        ))}
      </div>
      <div className="w-px bg-gray-800 self-stretch" />
      <div
        className="grid gap-2.5 justify-items-center p-3 bg-mist-400"
        style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}
      >
        {right.map((ready, i) => (
          <RobotIcon key={i} ready={ready} size={size} />
        ))}
      </div>
    </div>
  );
}

function SplitGroupCard({ label, left, right }: { label: string; left: boolean[]; right: boolean[] }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-sm font-semibold text-gray-700">{label}</span>
      <SplitSet left={left} right={right} />
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
   * (see DecisionNode.tsx), just amber-200 here instead of green/red. Undefined hides it (page 4,
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

type ChoiceOption = { id: string; label: string };

/** Multiple-choice used by all the comparison/judgement exercises (3-way A/B/équivalent, or the
 * 4-way "how well sorted" scale on page 1). Real quiz behaviour: a wrong pick shakes that button
 * and lets the student try again (Suivant stays locked); only the correct pick locks the exercise
 * in, shows the positive (green) explanation, and unlocks Suivant via `onAnswered`. */
function ChoiceExercise({
  children,
  question,
  correct,
  feedback,
  options,
  onAnswered,
}: {
  children: ReactNode;
  /** The actual prompt ("D'après toi, lequel...?") — rendered just above the answer options,
   * separate from whatever setup/context text the caller puts above the visual comparison. */
  question: ReactNode;
  correct: string;
  feedback: string;
  options: ChoiceOption[];
  onAnswered: () => void;
}) {
  const [solved, setSolved] = useState(false);
  const [shaking, setShaking] = useState<string | null>(null);

  const pick = (choice: string) => {
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

// Standard "A / B / équivalent" option triple shared by every split-comparison exercise (pages
// 2, 3, 4 and the final quiz) — only the A/B noun and the gender agreement on "mélangé(e)s" change.
const abEqualOptions = (labelA: string, labelB: string, labelEqual: string): ChoiceOption[] => [
  { id: 'A', label: labelA },
  { id: 'B', label: labelB },
  { id: 'equal', label: labelEqual },
];

// ── Page 1: a single split set, judge how well it's been done (correct: "Bien trié") — only 2
// robots out of 12 are on the wrong side, so it reads as a good split without being flawless. ──
const P1_SPLIT = {
  left: [true, true, false, true, true, true],
  right: [false, false, false, false, true, false],
};

// ── Page 2: two different split sets, pick the better one (correct: B) — A barely separates
// anything (3-3 on both sides), B cleanly sorts into mostly-left/mostly-right. ──
const P2_SPLIT_A = {
  left: [true, true, false, false, true, false],
  right: [false, true, false, true, false, true],
};
const P2_SPLIT_B = {
  left: [true, true, true, false, true, true],
  right: [false, true, false, false, false, false],
};

// ── Page 2.5 (index 3): two split sets with the exact same per-side proportions (5-1 and 1-5),
// just reshuffled — arrangement never changes how mixed a side is (correct: equal). ──
const P25_SPLIT_A = {
  left: [true, true, true, true, false, true],
  right: [false, true, false, false, false, false],
};
const P25_SPLIT_B = {
  left: [true, true, false, true, true, true],
  right: [false, false, false, true, false, false],
};

// ── Pages 4 & 5: two candidate questions, each splitting the same starting group (correct: B) ──
const P45_QA = {
  oui: [true, false, true, true, false, false, true, false],
  non: [false, true, false, false, true, false, false, true],
};
const P45_QB = {
  oui: [false, true, false, false, false, false, false, false],
  non: [true, true, false, false, true, true, true, true],
};

// ── Page 6: final quiz — the two splits differ by a single robot (one moved from Question A's
// Oui branch to Question B's Non branch), so by eye they look about as good as each other. Their
// Gini scores (0.38 vs 0.43) are close but clearly distinct — the point is that this is exactly
// the kind of call where guessing stops working and the score becomes the tiebreaker.
const P6_QA = {
  oui: [true, true, false, true, false, true, false, false, true, false, true, false],
  non: [true, false, true, false, false, true, false, false, false, true, false, true],
};
const P6_QB = {
  oui: [true, false, true, false, true, true, true, false, true, true, false, false],
  non: [false, true, false, true, false, true, false, false, false, false, false, true],
};

const HEADINGS = [
  'Trop de robots pour trier à la main',
  'Bien trié ou mal trié ?',
  'Le meilleur tri',
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
  const GINI_REVEAL_PAGE = 5;
  const QUIZ_PAGE = 6;
  const LAST_PAGE = 7;
  // Dots represent the 7 "real" pages (0-6, the last being the final quiz) — the pre-build card
  // (page 7) isn't a page the student reads through, so it gets no dots at all.
  const DOT_COUNT = QUIZ_PAGE + 1;
  const showPreBuildCard = active && page === LAST_PAGE;
  const [buildStarted, setBuildStarted] = useState(false);
  // Anchors the pre-build card just outside the real tree panel's right edge (see SoftwareMain's
  // [data-tour="tree-zone"]) instead of a fixed viewport position, so it tracks the actual layout.
  const treeRect = useTourTargetRect(showPreBuildCard ? '[data-tour="tree-zone"]' : null);

  useEffect(() => {
    setAnsweredThisPage(false);
  }, [page]);

  // Page 5: the two Gini badges fade in one after the other, not both at once with the rest of
  // the page's content — gives the reveal a beat instead of dumping the answer immediately.
  useEffect(() => {
    setShowGiniA(false);
    setShowGiniB(false);
    if (page !== GINI_REVEAL_PAGE) {
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

  const gini45A = weightedGini([P45_QA.oui, P45_QA.non]);
  const gini45B = weightedGini([P45_QB.oui, P45_QB.non]);

  // Pages 1-4 require an answer before moving on (a genuine reveal, not a gate the student can
  // skip past without engaging); pages 0 and 5 are plain narration/reveal, always free to advance.
  const canGoNext = [1, 2, 3, 4, QUIZ_PAGE].includes(page) ? answeredThisPage : true;

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

                    {/* ── Page 1: a single split set, judge the split quality (correct: "Bien trié") ── */}
                    {page === 1 && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Il nous faut un moyen pour évaluer si des robots sont bien triés ou non. Regarde ce groupe :
                          la ligne au milieu représente un partage en deux, comme si une règle avait envoyé chaque
                          robot à gauche ou à droite.
                        </p>
                        <ChoiceExercise
                          correct="medium"
                          question="D'après toi, ce partage est-il :"
                          options={[
                            { id: 'very-bad', label: 'Très mal trié' },
                            { id: 'medium', label: 'Moyennement trié' },
                            { id: 'perfect', label: 'Parfaitement trié' },
                          ]}
                          feedback="Bien vu ! Il reste quelques robots du mauvais côté, donc ce n'est pas parfait — mais la grande majorité est bien placée : c'est un bon partage."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex justify-center">
                            <SplitSet left={P1_SPLIT.left} right={P1_SPLIT.right} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 2: compare two split sets (correct: B) ── */}
                    {page === 2 && (
                      <>
                        <p className="text-gray-600 text-sm">Comparons maintenant deux partages selon notre intuition.</p>
                        <ChoiceExercise
                          correct="B"
                          question={
                            <>
                              D’après toi, quel partage est le plus réussi ?
                            </>
                          }
                          options={abEqualOptions('Partage A', 'Partage B', "Aussi triés l'un que l'autre")}
                          feedback="C'est juste, les deux moitiés du partage B sont plus pures : les robots prêts à partir et ceux à réparer sont bien séparés."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-10 justify-center">
                            <SplitGroupCard label="Partage A" left={P2_SPLIT_A.left} right={P2_SPLIT_A.right} />
                            <SplitGroupCard label="Partage B" left={P2_SPLIT_B.left} right={P2_SPLIT_B.right} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 3 (2.5): same idea, but tied — arrangement never changes mixedness (correct: equal) ── */}
                    {page === 3 && (
                      <>
                        <p className="text-gray-600 text-sm">Continuons avec cet autre exemple.</p>
                        <ChoiceExercise
                          correct="equal"
                          question="D’après toi, quel partage est le plus réussi ?"
                          options={abEqualOptions('Partage A', 'Partage B', "Aussi triés l'un que l'autre")}
                          feedback="Exactement ! Les deux partages ont la même répartition dans chaque moitié (5 contre 1) : seul l'ordre des robots change, pas la qualité du partage."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-10 justify-center">
                            <SplitGroupCard label="Partage A" left={P25_SPLIT_A.left} right={P25_SPLIT_A.right} />
                            <SplitGroupCard label="Partage B" left={P25_SPLIT_B.left} right={P25_SPLIT_B.right} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 4: connect to decision trees — compare two candidate questions ── */}
                    {page === 4 && (
                      <>
                        <p className="text-gray-600 text-sm">
                          Quand on construit un arbre de décision, chaque question sépare les robots en deux groupes :
                          ceux qui répondent Oui, et ceux qui répondent Non.
                        </p>
                        <ChoiceExercise
                          correct="B"
                          question="Laquelle de ces deux questions sépare le mieux les deux groupes ?"
                          options={abEqualOptions('Question A', 'Question B', "C'est la même chose")}
                          feedback="C'est juste. La question B sépare les robots en deux groupes plus purs que la question A. Ici on devrait choisir la question B pour construire le meilleur arbre."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-8 justify-center">
                            <QuestionNodePreview label="Question A" oui={P45_QA.oui} non={P45_QA.non} />
                            <QuestionNodePreview label="Question B" oui={P45_QB.oui} non={P45_QB.non} />
                          </div>
                        </ChoiceExercise>
                      </>
                    )}

                    {/* ── Page 5: introduce the Gini score, reveal it on page 4's questions ── */}
                    {page === GINI_REVEAL_PAGE && (
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
                            oui={P45_QA.oui}
                            non={P45_QA.non}
                            giniValue={showGiniA ? gini45A : undefined}
                          />
                          <QuestionNodePreview
                            label="Question B"
                            oui={P45_QB.oui}
                            non={P45_QB.non}
                            giniValue={showGiniB ? gini45B : undefined}
                          />
                        </div>
                        <p className="text-gray-600 text-sm">
                          On peut voir que la question B a un score plus bas que la question A. Notre intuition était
                          bonne !
                        </p>
                      </>
                    )}

                    {/* ── Page 6: final quiz — splits differ by a single robot, genuinely hard to
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
                          options={abEqualOptions('Question A', 'Question B', "C'est la même chose")}
                          feedback="Bravo ! À l'œil, ces deux questions se valaient presque. Mais le score de Gini ne se trompe pas : la question B sépare un peu mieux les robots."
                          onAnswered={() => setAnsweredThisPage(true)}
                        >
                          <div className="flex gap-8 justify-center">
                            <QuestionNodePreview
                              label="Question A"
                              oui={P6_QA.oui}
                              non={P6_QA.non}
                              giniValue={weightedGini([P6_QA.oui, P6_QA.non])}
                            />
                            <QuestionNodePreview
                              label="Question B"
                              oui={P6_QB.oui}
                              non={P6_QB.non}
                              giniValue={weightedGini([P6_QB.oui, P6_QB.non])}
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

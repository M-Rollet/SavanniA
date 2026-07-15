import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  applyNodeChanges,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { RootNode, type RootNodeData } from './RootNode';
import { DecisionNode, type DecisionNodeData } from './DecisionNode';
import { LeafNode, type LeafNodeData, type RobotPlacement } from './LeafNode';
import { EditRobotModal } from './EditRobotModal';
import { QUESTIONS } from './questions';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import {
  answerFromTestResults,
  ALL_CRITERIA,
  getStepDef,
  type Criterion,
  type RobotEntry,
  type AlgoTree,
} from '../steps/stepDefinitions';
import {
  layoutTree,
  getNodeWidth,
  getNodeHeight,
  getAncestorQuestionIds,
  getDescendantQuestionIds,
  getAncestorDecisionCount,
  getDescendants,
  ANIM_DURATION,
  PAN_DURATION,
  PAN_BUFFER,
  FOCUS_ZOOM,
  easeInOut,
} from './treeLayout';

export type ValidationError = { nodeId: string; message: string };
export type DecisionTreeHandle = {
  focusAndHighlight: (nodeId: string) => void;
  answerFrontier: (handle: 'yes' | 'no') => void;
};

const NODE_TYPES: NodeTypes = { root: RootNode, decision: DecisionNode, leaf: LeafNode };

/** Robot currently shown in the read-only detail modal opened from a tree leaf's placement dots. */
type ViewingRobot = { uuid: string; label: string; entryOverride?: RobotEntry };

// ════════════════════════════════════════════════════════════════════════
// Shared pure helpers
// ════════════════════════════════════════════════════════════════════════

function validateTree(nodes: Node[], edges: Edge[]): ValidationError[] {
  if (!edges.some(e => e.source === 'root')) {
    return [{ nodeId: 'root', message: "L'arbre de décision est vide" }];
  }
  const errors: ValidationError[] = [];
  for (const node of nodes) {
    if (node.type === 'decision') {
      if (!node.data.questionId) {
        errors.push({ nodeId: node.id, message: 'Question non sélectionnée' });
      }
      if (!edges.some(e => e.source === node.id && e.sourceHandle === 'yes')) {
        errors.push({ nodeId: node.id, message: 'Branche "Oui" manquante' });
      }
      if (!edges.some(e => e.source === node.id && e.sourceHandle === 'no')) {
        errors.push({ nodeId: node.id, message: 'Branche "Non" manquante' });
      }
    }
    if (node.type === 'leaf' && (node.data.decision === null || node.data.decision === undefined)) {
      errors.push({ nodeId: node.id, message: 'Décision non sélectionnée' });
    }
  }
  return errors;
}

function computeActivePath(edges: Edge[], activeHandles: Map<string, 'yes' | 'no'>): Set<string> {
  const onPath = new Set<string>(['root']);
  let current = 'root';
  while (true) {
    const handle = current === 'root' ? 'out' : activeHandles.get(current);
    if (!handle) {
      break;
    }
    const edge = edges.find(e => e.source === current && e.sourceHandle === handle);
    if (!edge) {
      break;
    }
    onPath.add(edge.target);
    current = edge.target;
  }
  return onPath;
}

/** Returns the nodeId of the last reachable node on the active path (decision or leaf), or null. */
function getActiveFrontierNodeId(edges: Edge[], activeHandles: Map<string, 'yes' | 'no'>): string | null {
  let current = 'root';
  while (true) {
    const handle = current === 'root' ? 'out' : activeHandles.get(current);
    if (!handle) {
      break;
    }
    const edge = edges.find(e => e.source === current && e.sourceHandle === handle);
    if (!edge) {
      break;
    }
    current = edge.target;
  }
  return current === 'root' ? null : current;
}

/** Returns the questionId of the deepest unanswered decision node on the active path, or null. */
function getActiveFrontierQuestion(
  nodes: Node[],
  edges: Edge[],
  activeHandles: Map<string, 'yes' | 'no'>
): string | null {
  const nodeId = getActiveFrontierNodeId(edges, activeHandles);
  if (!nodeId) {
    return null;
  }
  const node = nodes.find(n => n.id === nodeId);
  if (node?.type !== 'decision') {
    return null;
  }
  return (node.data.questionId as string | null) ?? null;
}

/** Walks the tree from the root using recorded test results; returns the leaf node reached, or null if stuck. */
function walkToLeaf(testResults: Partial<Record<Criterion, number>>, nodes: Node[], edges: Edge[]): Node | null {
  const rootEdge = edges.find(e => e.source === 'root' && e.sourceHandle === 'out');
  if (!rootEdge) {
    return null;
  }
  let current = rootEdge.target;
  let node = nodes.find(n => n.id === current);
  while (node?.type === 'decision') {
    const questionId = node.data.questionId as string | null;
    const answer = questionId ? answerFromTestResults(questionId, testResults) : null;
    if (!answer) {
      return null; // stuck: this criterion hasn't been tested
    }
    const edge = edges.find(e => e.source === current && e.sourceHandle === answer);
    if (!edge) {
      return null; // dead end: this branch isn't built yet
    }
    current = edge.target;
    node = nodes.find(n => n.id === current);
  }
  return node?.type === 'leaf' ? node : null;
}

// ── Algorithm mode: dataset & mixedness (Gini) helpers ──────────────────────
type DatasetEntry = {
  id: string;
  label: string;
  color: string;
  category: 'ready' | 'repair';
  testResults: Partial<Record<Criterion, number>>;
};

/** Gini impurity of a set of entries — 0 when every entry shares the same category, up to 0.5 at
 * an even 50/50 split (binary classification: ready vs. repair). This is the "how mixed is this
 * group" score introduced in Step7IntroModal. */
function giniImpurity(entries: DatasetEntry[]): number {
  if (entries.length === 0) {
    return 0;
  }
  const pReady = entries.filter(e => e.category === 'ready').length / entries.length;
  const pRepair = 1 - pReady;
  return 1 - (pReady * pReady + pRepair * pRepair);
}

/** Weighted-average Gini impurity across a question's two resulting branches — the score a
 * decision tree minimizes when choosing which question to ask at a node. */
function giniForQuestion(entries: DatasetEntry[], questionId: string): number {
  const yes = entries.filter(e => answerFromTestResults(questionId, e.testResults) === 'yes');
  const no = entries.filter(e => answerFromTestResults(questionId, e.testResults) === 'no');
  const total = yes.length + no.length;
  if (total === 0) {
    return 0;
  }
  return (yes.length / total) * giniImpurity(yes) + (no.length / total) * giniImpurity(no);
}

/**
 * Forces the two branches of a question to opposite categories and picks whichever of the two
 * possible opposite-assignments (yes=ready/no=repair vs. yes=repair/no=ready) yields fewer errors
 * — this is just the majority-vote label for each branch, independent of how the question itself
 * gets chosen (see giniForQuestion above for that).
 */
function resolveBranchCategories(
  yesEntries: DatasetEntry[],
  noEntries: DatasetEntry[]
): { yesReady: boolean; noReady: boolean } {
  const readyCount = (list: DatasetEntry[]) => list.filter(e => e.category === 'ready').length;
  const yesReadyCount = readyCount(yesEntries);
  const yesRepairCount = yesEntries.length - yesReadyCount;
  const noReadyCount = readyCount(noEntries);
  const noRepairCount = noEntries.length - noReadyCount;

  const errorsA = yesRepairCount + noReadyCount; // yes=ready, no=repair
  const errorsB = yesReadyCount + noRepairCount; // yes=repair, no=ready

  return errorsA <= errorsB ? { yesReady: true, noReady: false } : { yesReady: false, noReady: true };
}

function majorityCategory(entries: DatasetEntry[]): boolean {
  if (entries.length === 0) {
    return true;
  }
  const ready = entries.filter(e => e.category === 'ready').length;
  return ready * 2 >= entries.length;
}

function isPureSet(entries: DatasetEntry[]): boolean {
  if (entries.length === 0) {
    return true;
  }
  return entries.every(e => e.category === entries[0].category);
}

/** Walks from the root down to nodeId, filtering the dataset by every question/answer along the way. */
function computeEntriesForNode(nodeId: string, nodes: Node[], edges: Edge[], dataset: DatasetEntry[]): DatasetEntry[] {
  const parentOf = new Map<string, { parentId: string; handle: string }>();
  for (const e of edges) {
    parentOf.set(e.target, { parentId: e.source, handle: e.sourceHandle ?? '' });
  }
  const path: { nodeId: string; handle: string }[] = [];
  let cur = nodeId;
  while (cur !== 'root') {
    const p = parentOf.get(cur);
    if (!p) {
      return [];
    }
    path.unshift({ nodeId: p.parentId, handle: p.handle });
    cur = p.parentId;
  }
  let entries = dataset;
  for (const step of path) {
    if (step.nodeId === 'root') {
      continue;
    }
    const node = nodes.find(n => n.id === step.nodeId);
    const questionId = node?.data.questionId as string | null | undefined;
    if (!questionId) {
      break;
    }
    entries = entries.filter(e => answerFromTestResults(questionId, e.testResults) === step.handle);
  }
  return entries;
}

function toAlgoTree(nodeId: string, nodes: Node[], edges: Edge[]): AlgoTree {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) {
    return { type: 'pending' };
  }
  if (node.type === 'leaf') {
    const d = node.data.decision as boolean | null;
    return { type: 'leaf', label: d === null || d === undefined ? null : d ? 'ready' : 'repair' };
  }
  if (node.type === 'decision') {
    const questionId = node.data.questionId as string | null;
    if (!questionId) {
      return { type: 'pending' };
    }
    const yesEdge = edges.find(e => e.source === nodeId && e.sourceHandle === 'yes');
    const noEdge = edges.find(e => e.source === nodeId && e.sourceHandle === 'no');
    return {
      type: 'question',
      questionId,
      yes: yesEdge ? toAlgoTree(yesEdge.target, nodes, edges) : { type: 'pending' },
      no: noEdge ? toAlgoTree(noEdge.target, nodes, edges) : { type: 'pending' },
    };
  }
  return { type: 'pending' };
}

// ════════════════════════════════════════════════════════════════════════
// Manual mode persistence (steps 2 / 4 / 5)
// ════════════════════════════════════════════════════════════════════════

// Bump whenever INITIAL_TREE's structure below changes (different questions, edges, or leaf
// ids) — a saved tree from an older version is otherwise indistinguishable from a student's
// legitimate step-4/5 edits, so it would get loaded as-is and silently mask the new starting
// tree (and break anything that targets its fixed node/edge ids, e.g. the step-2 guided tour).
const TREE_VERSION = 2;
const STORAGE_KEY = `savannia-decision-tree-v${TREE_VERSION}`;

export function clearSavedTree() {
  localStorage.removeItem(STORAGE_KEY);
}

// Shown on first access (no saved tree in localStorage).
// Edit nodes/edges below to change the pre-built starting tree.
// Use fixed string IDs (not random UUIDs) so the structure is predictable.
// Available questionId values: 'light_working' | 'ir_working' | 'motor_noise'
//                              | 'battery_low' | 'battery_mid' | 'battery_full'
// Leaf `decision` values: true (robot OK) | false (robot KO)
// Remember to bump TREE_VERSION above whenever this structure changes.
const INITIAL_TREE: { nodes: Node[]; edges: Edge[] } = (() => {
  const edges: Edge[] = [
    { id: 'root-out-d1', source: 'root', sourceHandle: 'out', target: 'd1' },
    { id: 'd1-yes-l1', source: 'd1', sourceHandle: 'yes', target: 'l1' }, // battery low → KO
    { id: 'd1-no-l2', source: 'd1', sourceHandle: 'no', target: 'l2' },
    //{ id: 'd2-no-l2', source: 'd2', sourceHandle: 'no', target: 'l2' },
    //{ id: 'd2-yes-l3', source: 'd2', sourceHandle: 'yes', target: 'l3' },
  ];
  const nodes: Node[] = [
    { id: 'root', type: 'root', position: { x: 0, y: 0 }, data: {} },
    { id: 'd1', type: 'decision', position: { x: 0, y: 0 }, data: { questionId: 'light_working' } },
    //{ id: 'd2', type: 'decision', position: { x: 0, y: 0 }, data: { questionId: 'ir_working' } },
    { id: 'l1', type: 'leaf', position: { x: 0, y: 0 }, data: { decision: true } },
    { id: 'l2', type: 'leaf', position: { x: 0, y: 0 }, data: { decision: false } },
    //{ id: 'l3', type: 'leaf', position: { x: 0, y: 0 }, data: { decision: true } },
  ];
  return { nodes: layoutTree(nodes, edges), edges };
})();

function loadTree(): { nodes: Node[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] };
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && parsed.nodes.some(n => n.id === 'root')) {
        // Re-run layout so positions are always consistent regardless of what was saved.
        return { nodes: layoutTree(parsed.nodes, parsed.edges), edges: parsed.edges };
      }
    }
  } catch {
    // ignore parse/quota errors
  }
  return INITIAL_TREE;
}

// ════════════════════════════════════════════════════════════════════════
// Shared animation + structural mutations (used by both canvases)
// ════════════════════════════════════════════════════════════════════════

function useTreeMutations(
  nodesRef: React.MutableRefObject<Node[]>,
  edgesRef: React.MutableRefObject<Edge[]>,
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  // Manual mode deliberately pans the camera to each node it touches. Algorithm mode builds
  // nodes off-camera far more often (auto-build especially), where panning ahead of a node
  // that doesn't exist yet made the tree flash empty before it flew in — so it opts out and
  // relies on a bounds-based fitView instead (see AlgorithmCanvas).
  focusOnMutate = true
) {
  const { setCenter, fitView } = useReactFlow();
  const animRafRef = useRef<number | null>(null);
  const panTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // startOverrides: initial position for newly added nodes (keyed by id).
  // By default, new nodes (not in nodesRef) would start at their target
  // position. Passing the parent's position here makes them slide in.
  const animateToNodes = useCallback(
    (targetNodes: Node[], startOverrides?: Record<string, { x: number; y: number }>) => {
      if (animRafRef.current) {
        cancelAnimationFrame(animRafRef.current);
        animRafRef.current = null;
      }

      // Build start-position map: existing nodes use their current positions,
      // new nodes use the provided override (parent position), or fall back to
      // target if no override is given.
      const startPositions = new Map(nodesRef.current.map(n => [n.id, n.position]));
      if (startOverrides) {
        for (const [id, pos] of Object.entries(startOverrides)) {
          startPositions.set(id, pos);
        }
      }

      const startTime = performance.now();

      setNodes(
        targetNodes.map(n => ({
          ...n,
          position: startPositions.get(n.id) ?? n.position,
        }))
      );

      function tick() {
        const t = Math.min((performance.now() - startTime) / ANIM_DURATION, 1);
        const ease = easeInOut(t);
        setNodes(
          targetNodes.map(n => {
            const sx = startPositions.get(n.id)?.x ?? n.position.x;
            const sy = startPositions.get(n.id)?.y ?? n.position.y;
            return {
              ...n,
              position: {
                x: Math.round(sx + (n.position.x - sx) * ease),
                y: Math.round(sy + (n.position.y - sy) * ease),
              },
            };
          })
        );
        if (t < 1) {
          animRafRef.current = requestAnimationFrame(tick);
        } else {
          animRafRef.current = null;
        }
      }
      animRafRef.current = requestAnimationFrame(tick);
    },
    [nodesRef, setNodes]
  );

  // Pans the viewport to the focus node first, then swaps edges and animates the new layout in.
  const focusThenAnimate = useCallback(
    (
      targetNodes: Node[],
      nextEdges: Edge[],
      focusNodeId: string | null,
      startOverrides?: Record<string, { x: number; y: number }>
    ) => {
      if (panTimerRef.current) {
        clearTimeout(panTimerRef.current);
      }

      const focusNode = focusNodeId ? targetNodes.find(n => n.id === focusNodeId) : null;

      if (focusNode) {
        const cx = focusNode.position.x + getNodeWidth(focusNode.type) / 2;
        const cy = focusNode.position.y + getNodeHeight(focusNode.type) / 2;
        setCenter(cx, cy, { zoom: FOCUS_ZOOM, duration: PAN_DURATION });
      }

      panTimerRef.current = setTimeout(
        () => {
          setEdges(nextEdges);
          animateToNodes(targetNodes, startOverrides);
          panTimerRef.current = null;
        },
        focusNode ? PAN_DURATION + PAN_BUFFER : 0
      );
    },
    [setCenter, setEdges, animateToNodes]
  );

  // Adds a bare (unconfigured) decision node as the tree's very first node, under root. Returns
  // the new node's id (used by algorithm mode's preview to seed it straight into the auto-build
  // queue — see AlgorithmCanvas's previewMode).
  const addFirstChild = useCallback(() => {
    const newId = crypto.randomUUID();
    const nextEdges = [
      ...edgesRef.current,
      { id: `root-out-${newId}`, source: 'root', sourceHandle: 'out', target: newId },
    ];
    const nextNodes = [
      ...nodesRef.current,
      { id: newId, type: 'decision', position: { x: 0, y: 0 }, data: { questionId: null, validated: false } },
    ];
    const laid = layoutTree(nextNodes, nextEdges);
    const root = nodesRef.current.find(n => n.id === 'root');
    const overrides = root ? { [newId]: root.position } : undefined;
    if (focusOnMutate) {
      focusThenAnimate(laid, nextEdges, newId, overrides);
    } else {
      setEdges(nextEdges);
      animateToNodes(laid, overrides);
    }
    return newId;
  }, [edgesRef, nodesRef, focusThenAnimate, animateToNodes, setEdges, focusOnMutate]);

  // Removes a node and its whole subtree, panning to where it was before relaying out.
  const deleteNode = useCallback(
    (nodeId: string, onAfterDelete?: (removedIds: Set<string>) => void) => {
      const deletedNode = nodesRef.current.find(n => n.id === nodeId);

      const toRemove = new Set([nodeId, ...getDescendants(nodeId, edgesRef.current)]);
      const nextEdges = edgesRef.current.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target));
      const nextNodes = nodesRef.current.filter(n => !toRemove.has(n.id));
      const laid = layoutTree(nextNodes, nextEdges);
      onAfterDelete?.(toRemove);

      if (deletedNode && focusOnMutate) {
        const cx = deletedNode.position.x + getNodeWidth(deletedNode.type) / 2;
        const cy = deletedNode.position.y + getNodeHeight(deletedNode.type) / 2;
        setCenter(cx, cy, { zoom: FOCUS_ZOOM, duration: PAN_DURATION });
        if (panTimerRef.current) {
          clearTimeout(panTimerRef.current);
        }
        panTimerRef.current = setTimeout(() => {
          setEdges(nextEdges);
          animateToNodes(laid);
          panTimerRef.current = null;
        }, PAN_DURATION + PAN_BUFFER);
      } else {
        setEdges(nextEdges);
        animateToNodes(laid);
      }
    },
    [nodesRef, edgesRef, setCenter, setEdges, animateToNodes, focusOnMutate]
  );

  return { animateToNodes, focusThenAnimate, addFirstChild, deleteNode, fitView };
}

// ════════════════════════════════════════════════════════════════════════
// Algorithm mode: auto-build cadence + Valider overlay
// ════════════════════════════════════════════════════════════════════════

const AUTO_STEP_MS = 700;
const AUTO_SETTLE_MS = 600;
// Comfortably longer than the pan/zoom triggered when a node's children appear (fitView's own
// ANIM_DURATION+60 pre-delay plus its 400ms transition, ~760ms total — see the boundsKey effect
// below) — otherwise the next node starts flashing candidate questions while the camera's still
// mid-move from the previous one.
const AUTO_FINALIZE_MS = 1000;

// ════════════════════════════════════════════════════════════════════════
// Manual tree canvas — steps 2 / 4 / 5: user builds/edits the tree freely
// and can run robots through it.
// ════════════════════════════════════════════════════════════════════════

// Delay between the last question resolving (its own colored answer + edge) and the leaf it
// leads to being revealed (colored result + animation, camera pan, onLeafReached). Both this
// delay and SoftwareMain's flying-dot animation (1s) start from the same seq_done event and run
// in parallel, not back-to-back — this has to clear the flight's landing time *plus* a real pause
// after, or the leaf reveal lands right on top of the last value and the wait goes unnoticed.
const LEAF_REACH_DELAY_MS = 1400;

type ManualTreeProps = {
  testing: boolean;
  /** Whether the tree structure (nodes, questions, decisions) can be edited. Defaults to true. */
  editable?: boolean;
  /** Whether nodes can be deleted — subset of `editable`. Defaults to true. */
  deletable?: boolean;
  onValidationChange?: (errors: ValidationError[]) => void;
  onActiveQuestionChange?: (questionId: string | null) => void;
  /** Fired once when the active test path reaches a leaf node, with that leaf's decision
   * (true = ready, false = repair, null = undecided). */
  onLeafReached?: (nodeId: string, decision: boolean | null) => void;
  /** Show which tested robots land on which leaf, and whether that matches their terrain observation. */
  robotPlacement?: boolean;
  /** Reports how many tested+observed robots the current tree classifies correctly, whenever it changes. */
  onClassificationChange?: (stats: { total: number; correct: number }) => void;
  /** Fired on every structural edit — a question change or a node deletion. Does NOT fire for leaf
   * decision changes (true/false toggles) or adding a node. */
  onStructuralEdit?: () => void;
};

const ManualTreeCanvas = forwardRef<DecisionTreeHandle, ManualTreeProps>(function ManualTreeCanvas(
  {
    testing,
    editable = true,
    deletable = true,
    robotPlacement = false,
    onValidationChange,
    onActiveQuestionChange,
    onLeafReached,
    onClassificationChange,
    onStructuralEdit,
  },
  ref
) {
  const {
    controledRobot,
    activeRobotConfigs: robotConfigs,
    physicalRobotData,
    externalDataset,
    newRobotsDataset,
    setManualTree,
    stepIndex,
  } = useScenario();
  const stepFeatures = getStepDef(stepIndex).features;
  const [nodes, setNodes] = useState<Node[]>(() => loadTree().nodes);
  const [edges, setEdges] = useState<Edge[]>(() => loadTree().edges);
  const [activeHandles, setActiveHandles] = useState<Map<string, 'yes' | 'no'>>(new Map());
  // Set right when a question resolves into a leaf, and cleared LEAF_REACH_DELAY_MS later — while
  // set, the leaf is held back out of the active path/frontier, so its own colored result +
  // animation lands as a separate, later beat instead of appearing in the same instant as the
  // question's own answer.
  const [pendingLeafId, setPendingLeafId] = useState<string | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const [viewingRobot, setViewingRobot] = useState<ViewingRobot | null>(null);
  const { setCenter } = useReactFlow();

  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  const activeHandlesRef = useRef<Map<string, 'yes' | 'no'>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leafDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onValidationRef = useRef(onValidationChange);
  const onActiveQuestionRef = useRef(onActiveQuestionChange);
  const onLeafReachedRef = useRef(onLeafReached);
  useLayoutEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useLayoutEffect(() => {
    edgesRef.current = edges;
  }, [edges]);
  useLayoutEffect(() => {
    activeHandlesRef.current = activeHandles;
  }, [activeHandles]);
  useLayoutEffect(() => {
    onValidationRef.current = onValidationChange;
  }, [onValidationChange]);
  useLayoutEffect(() => {
    onActiveQuestionRef.current = onActiveQuestionChange;
  }, [onActiveQuestionChange]);
  useLayoutEffect(() => {
    onLeafReachedRef.current = onLeafReached;
  }, [onLeafReached]);
  const onClassificationRef = useRef(onClassificationChange);
  useLayoutEffect(() => {
    onClassificationRef.current = onClassificationChange;
  }, [onClassificationChange]);

  // A fresh test run always starts from a blank path — cleared right when testing STARTS, not
  // when it stops, so a just-completed run's colored path can persist after SoftwareMain flips
  // `testing` back to false on natural completion (see handleLeafReached there). Switching robots
  // clears it separately, below, regardless of testing state.
  useEffect(() => {
    if (testing) {
      setActiveHandles(new Map());
      setPendingLeafId(null);
    } else if (leafDelayTimerRef.current) {
      clearTimeout(leafDelayTimerRef.current);
      leafDelayTimerRef.current = null;
    }
  }, [testing]);

  useEffect(() => {
    setActiveHandles(new Map());
    setPendingLeafId(null);
  }, [controledRobot]);

  // ── Persist tree to localStorage (debounced, no positions) ──
  useEffect(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            nodes: nodes.map(({ id, type, data }) => ({ id, type, position: { x: 0, y: 0 }, data })),
            edges: edges.map(({ id, source, sourceHandle, target }) => ({ id, source, sourceHandle, target })),
          })
        );
      } catch {
        // ignore quota errors
      }
    }, 500);
  }, [nodes, edges]);

  const { animateToNodes, focusThenAnimate, addFirstChild, deleteNode } = useTreeMutations(
    nodesRef,
    edgesRef,
    setNodes,
    setEdges
  );

  // Wraps the raw mutation so node deletion counts as a "structural edit" — kept separate from
  // deleteNode itself since that's shared with algorithm mode, which doesn't report this.
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      onStructuralEdit?.();
      deleteNode(nodeId);
    },
    [deleteNode, onStructuralEdit]
  );

  // Mirror the tree as an AlgoTree in context so other components (e.g. the data table) can
  // classify robots without depending on this component's internal node/edge representation.
  useEffect(() => {
    const rootEdge = edges.find(e => e.source === 'root' && e.sourceHandle === 'out');
    setManualTree(rootEdge ? toAlgoTree(rootEdge.target, nodes, edges) : { type: 'pending' });
  }, [nodes, edges, setManualTree]);

  const onPlacementClick = useCallback(
    (uuid: string) => {
      const physical = robotConfigs.find(r => r.uuid === uuid);
      if (physical) {
        const colorDef = ROBOT_COLORS.find(c => c.id === physical.color);
        setViewingRobot({ uuid, label: colorDef?.label ?? physical.color });
        return;
      }
      const ext = externalDataset.find(e => e.id === uuid);
      if (ext) {
        setViewingRobot({ uuid, label: ext.label, entryOverride: ext });
      }
    },
    [robotConfigs, externalDataset]
  );

  // ── Robot info ────────────────────────────────────────────
  const robotInfo = useMemo(() => {
    // Steps that place every robot on the tree (4/5/6) show an aggregate count instead of a
    // single selected robot — there's no per-robot selector on this tab for those steps anymore.
    if (stepFeatures.robotPlacementOnTree) {
      const count = robotConfigs.length + newRobotsDataset.length + externalDataset.length;
      return { color: '#a1a1a1', label: `${count} robot${count > 1 ? 's' : ''}`, colorId: '' };
    }
    const config = robotConfigs.find(r => r.uuid === controledRobot);
    if (!config) {
      return { color: '#a1a1a1', label: 'Robot', colorId: '' };
    }
    const colorDef = ROBOT_COLORS.find(c => c.id === config.color);
    return {
      color: colorDef?.hex ?? '#a1a1a1',
      label: colorDef?.label ?? config.color,
      colorId: config.color,
    };
  }, [stepFeatures.robotPlacementOnTree, controledRobot, robotConfigs, newRobotsDataset, externalDataset]);

  // ── Robot placement: which leaf does each tested robot land on? ──
  const { leafPlacements, classificationStats } = useMemo(() => {
    const map = new Map<string, RobotPlacement[]>();
    const stats = { total: 0, correct: 0 };
    if (!robotPlacement) {
      return { leafPlacements: map, classificationStats: stats };
    }

    const addPlacement = (entry: RobotEntry, uuid: string, color: string, label: string, countTowardStats: boolean) => {
      if (
        countTowardStats &&
        entry.observation?.category != null &&
        ALL_CRITERIA.every(c => entry.testResults[c] !== undefined)
      ) {
        stats.total += 1;
      }
      const leaf = walkToLeaf(entry.testResults, nodes, edges);
      if (!leaf) {
        return;
      }
      const predictedReady = leaf.data.decision as boolean | null;
      const observedCategory = entry.observation?.category ?? null;
      const matches =
        predictedReady === null || observedCategory === null ? null : predictedReady === (observedCategory === 'ready');
      if (countTowardStats && matches === true) {
        stats.correct += 1;
      }
      const placement: RobotPlacement = { uuid, color, label, matches };
      map.set(leaf.id, [...(map.get(leaf.id) ?? []), placement]);
    };

    for (const r of robotConfigs) {
      const entry = physicalRobotData[r.uuid];
      if (!entry) {
        continue;
      }
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      addPlacement(entry, r.uuid, colorDef?.hex ?? '#a1a1a1', colorDef?.label ?? r.color, true);
    }
    // Stand-ins for the 5th/6th core robots (see ScenarioContext's newRobotsDataset) — these
    // DO count toward stats: the "De nouveaux robots" step's canAdvance needs them to, whether
    // or not that robot slot has real hardware behind it.
    for (const e of newRobotsDataset) {
      addPlacement(e, e.id, '#94a3b8', e.label, true);
    }
    // externalDataset only counts toward stats on the "Données externes" step itself — on later
    // steps (algorithm mode) it's along for the ride but shouldn't gate canAdvance.
    for (const e of externalDataset) {
      addPlacement(e, e.id, '#94a3b8', e.label, stepFeatures.externalData);
    }
    return { leafPlacements: map, classificationStats: stats };
  }, [
    robotPlacement,
    robotConfigs,
    physicalRobotData,
    newRobotsDataset,
    externalDataset,
    nodes,
    edges,
    stepFeatures.externalData,
  ]);

  useEffect(() => {
    if (robotPlacement) {
      onClassificationRef.current?.(classificationStats);
    }
  }, [robotPlacement, classificationStats]);

  // ── Mutations ─────────────────────────────────────────────
  const addChild = useCallback(
    (parentId: string, handle: 'yes' | 'no', type: 'decision' | 'leaf') => {
      const newId = crypto.randomUUID();
      const nextEdges = [
        ...edgesRef.current,
        { id: `${parentId}-${handle}-${newId}`, source: parentId, sourceHandle: handle, target: newId },
      ];
      const nextNodes = [
        ...nodesRef.current,
        {
          id: newId,
          type,
          position: { x: 0, y: 0 },
          data: type === 'decision' ? { questionId: null } : { decision: null },
        },
      ];
      const laid = layoutTree(nextNodes, nextEdges);

      // New node slides in from its parent's current position
      const parent = nodesRef.current.find(n => n.id === parentId);
      focusThenAnimate(laid, nextEdges, newId, parent ? { [newId]: parent.position } : undefined);
    },
    [focusThenAnimate]
  );

  const onChangeQuestion = useCallback(
    (nodeId: string, questionId: string) => {
      onStructuralEdit?.();
      setNodes(nodesRef.current.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, questionId } } : n)));
    },
    [onStructuralEdit]
  );

  const onChangeDecision = useCallback((nodeId: string, decision: boolean) => {
    setNodes(nodesRef.current.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, decision } } : n)));
  }, []);

  const onSetActiveHandle = useCallback((nodeId: string, handle: 'yes' | 'no') => {
    setActiveHandles(prev => new Map(prev).set(nodeId, handle));
  }, []);

  // ── Imperative handle (focus + highlight a node) ──────────
  useImperativeHandle(
    ref,
    () => ({
      focusAndHighlight(nodeId: string) {
        const node = nodesRef.current.find(n => n.id === nodeId);
        if (node) {
          const cx = node.position.x + getNodeWidth(node.type) / 2;
          const cy = node.position.y + getNodeHeight(node.type) / 2;
          setCenter(cx, cy, { zoom: FOCUS_ZOOM, duration: PAN_DURATION });
        }
        if (highlightTimerRef.current) {
          clearTimeout(highlightTimerRef.current);
        }
        setHighlightedNodeId(nodeId);
        highlightTimerRef.current = setTimeout(() => setHighlightedNodeId(null), 2000);
      },
      answerFrontier(handle: 'yes' | 'no') {
        let current = 'root';
        while (true) {
          const h = current === 'root' ? 'out' : activeHandlesRef.current.get(current);
          if (!h) {
            break;
          }
          const edge = edgesRef.current.find(e => e.source === current && e.sourceHandle === h);
          if (!edge) {
            break;
          }
          current = edge.target;
        }
        if (current === 'root') {
          return;
        }
        const node = nodesRef.current.find(n => n.id === current);
        if (node?.type !== 'decision') {
          return;
        }

        // Resolve the question node itself right away — its own answer colors in immediately.
        setActiveHandles(prev => new Map(prev).set(current, handle));

        if (leafDelayTimerRef.current) {
          clearTimeout(leafDelayTimerRef.current);
          leafDelayTimerRef.current = null;
        }
        const nextEdge = edgesRef.current.find(e => e.source === current && e.sourceHandle === handle);
        const nextNode = nextEdge && nodesRef.current.find(n => n.id === nextEdge.target);
        if (nextNode?.type === 'leaf') {
          setPendingLeafId(nextNode.id);
          leafDelayTimerRef.current = setTimeout(() => {
            leafDelayTimerRef.current = null;
            setPendingLeafId(null);
          }, LEAF_REACH_DELAY_MS);
        }
      },
    }),
    [setCenter]
  );

  // ── Validation ────────────────────────────────────────────
  useEffect(() => {
    onValidationRef.current?.(validateTree(nodes, edges));
  }, [nodes, edges]);

  // ── Frontier question (deepest unanswered node during test) ─
  const activeFrontierQuestion = useMemo(
    () => (testing ? getActiveFrontierQuestion(nodes, edges, activeHandles) : null),
    [testing, nodes, edges, activeHandles]
  );
  useEffect(() => {
    onActiveQuestionRef.current?.(activeFrontierQuestion);
  }, [activeFrontierQuestion]);

  // ── Auto-pan to frontier node during test ─────────────────
  const frontierNodeId = useMemo(
    () => (testing ? getActiveFrontierNodeId(edges, activeHandles) : null),
    [testing, edges, activeHandles]
  );
  useEffect(() => {
    // While the frontier is a leaf being held back (see pendingLeafId above), skip the pan and
    // onLeafReached — both fire once the delay clears and this effect re-runs.
    if (!frontierNodeId || frontierNodeId === pendingLeafId) {
      return;
    }
    const node = nodesRef.current.find(n => n.id === frontierNodeId);
    if (!node) {
      return;
    }
    const cx = node.position.x + getNodeWidth(node.type) / 2;
    const cy = node.position.y + getNodeHeight(node.type) / 2;
    setCenter(cx, cy, { zoom: FOCUS_ZOOM, duration: PAN_DURATION });
    if (node.type === 'leaf') {
      onLeafReachedRef.current?.(node.id, (node.data.decision as boolean | null) ?? null);
    }
  }, [frontierNodeId, pendingLeafId, setCenter]);

  // ── Active path (excludes a leaf still being held back — see pendingLeafId) ──
  const activePath = useMemo(() => {
    const path = computeActivePath(edges, activeHandles);
    if (pendingLeafId) {
      path.delete(pendingLeafId);
    }
    return path;
  }, [edges, activeHandles, pendingLeafId]);

  // True while actively testing, or right after a completed run whose colored path hasn't been
  // cleared yet (see the reset effects above) — drives the same visual styling as `testing` used
  // to alone, but keeps that styling alive past the button-level `testing` flipping back to false
  // on natural completion.
  const showActivePath = testing || activeHandles.size > 0;

  // ── Enrich edges ──────────────────────────────────────────
  const enrichedEdges = useMemo(() => {
    if (!showActivePath) {
      return edges;
    }
    return edges.map(e =>
      activePath.has(e.source) && activePath.has(e.target)
        ? { ...e, style: { stroke: robotInfo.color, strokeWidth: 2 } }
        : { ...e, style: { stroke: '#cbd5e1', strokeWidth: 1.5, opacity: 0.3 } }
    );
  }, [edges, activePath, robotInfo.color, showActivePath]);

  // ── Enrich nodes ──────────────────────────────────────────
  const enrichedNodes = useMemo(
    () =>
      nodes.map(node => {
        if (node.type === 'root') {
          const d: RootNodeData = {
            colorId: robotInfo.colorId,
            robotLabel: robotInfo.label,
            isMulti: stepFeatures.robotPlacementOnTree,
            hasChild: edges.some(e => e.source === 'root'),
            onAddFirstChild: addFirstChild,
            testing: showActivePath,
            editable,
            highlighted: highlightedNodeId === node.id,
          };
          return {
            ...node,
            data: d as Record<string, unknown>,
            width: getNodeWidth('root', stepFeatures.robotPlacementOnTree),
            height: getNodeHeight('root', false, stepFeatures.robotPlacementOnTree),
          };
        }
        if (node.type === 'decision') {
          const d: DecisionNodeData = {
            questionId: node.data.questionId as string | null,
            usedHandles: {
              yes: edges.some(e => e.source === node.id && e.sourceHandle === 'yes'),
              no: edges.some(e => e.source === node.id && e.sourceHandle === 'no'),
            },
            ancestorQuestionIds: getAncestorQuestionIds(node.id, nodes, edges),
            descendantQuestionIds: getDescendantQuestionIds(node.id, nodes, edges),
            ancestorCount: getAncestorDecisionCount(node.id, edges),
            highlighted: highlightedNodeId === node.id,
            onAddChild: addChild,
            onChangeQuestion,
            onSetActiveHandle,
            onDelete: handleDeleteNode,
            testing: showActivePath,
            editable,
            deletable,
            activeHandle: activeHandles.get(node.id) ?? null,
            isOnActivePath: activePath.has(node.id),
          };
          const hasAddButtons = editable && !testing && (!d.usedHandles.yes || !d.usedHandles.no);
          return {
            ...node,
            data: d as Record<string, unknown>,
            width: getNodeWidth('decision'),
            height: getNodeHeight('decision', hasAddButtons),
          };
        }
        if (node.type === 'leaf') {
          const d: LeafNodeData = {
            decision: node.data.decision as boolean | null,
            isOnActivePath: activePath.has(node.id),
            highlighted: highlightedNodeId === node.id,
            testing: showActivePath,
            editable,
            deletable,
            placements: leafPlacements.get(node.id) ?? [],
            onChangeDecision,
            onDelete: handleDeleteNode,
            onPlacementClick,
          };
          return {
            ...node,
            data: d as Record<string, unknown>,
            width: getNodeWidth('leaf'),
            height: getNodeHeight('leaf'),
          };
        }
        return node;
      }),
    [
      nodes,
      edges,
      robotInfo,
      addFirstChild,
      addChild,
      handleDeleteNode,
      onChangeQuestion,
      onSetActiveHandle,
      onChangeDecision,
      onPlacementClick,
      testing,
      showActivePath,
      editable,
      deletable,
      activeHandles,
      activePath,
      highlightedNodeId,
      leafPlacements,
      stepFeatures.robotPlacementOnTree,
    ]
  );

  const onNodesChange: OnNodesChange = useCallback(changes => {
    const filtered = changes.filter(c => c.type !== 'position');
    if (filtered.length) {
      setNodes(ns => applyNodeChanges(filtered, ns));
    }
  }, []);

  const onEdgesChange: OnEdgesChange = useCallback(
    changes => {
      const removedIds = changes.filter((c): c is { type: 'remove'; id: string } => c.type === 'remove').map(c => c.id);
      if (!removedIds.length) {
        return;
      }

      const removed = edgesRef.current.filter(e => removedIds.includes(e.id));
      const toRemove = new Set<string>();
      for (const re of removed) {
        toRemove.add(re.target);
        getDescendants(re.target, edgesRef.current).forEach(id => toRemove.add(id));
      }
      const nextEdges = edgesRef.current.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target));
      const nextNodes = nodesRef.current.filter(n => !toRemove.has(n.id));
      setEdges(nextEdges);
      animateToNodes(layoutTree(nextNodes, nextEdges));
    },
    [animateToNodes]
  );

  return (
    <div style={{ width: '100%', height: '100%', '--robot-color': robotInfo.color } as React.CSSProperties}>
      <ReactFlow
        nodes={enrichedNodes}
        edges={enrichedEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ selectable: false, style: { stroke: '#808080', strokeWidth: 1.5 } }}
        fitView
        fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
      >
        <Controls />
      </ReactFlow>
      <EditRobotModal
        uuid={viewingRobot?.uuid ?? null}
        label={viewingRobot?.label ?? ''}
        entryOverride={viewingRobot?.entryOverride}
        onClose={() => setViewingRobot(null)}
      />
    </div>
  );
});

// ════════════════════════════════════════════════════════════════════════
// Algorithm mode persistence (step 7 build + step 8 frozen final test)
// ════════════════════════════════════════════════════════════════════════

// Bump whenever the auto-build's node/edge shape changes incompatibly — same reasoning as
// TREE_VERSION above.
const ALGO_TREE_VERSION = 1;
const ALGO_STORAGE_KEY = `savannia-algo-tree-v${ALGO_TREE_VERSION}`;

export function clearSavedAlgoTree() {
  localStorage.removeItem(ALGO_STORAGE_KEY);
}

// Without this, every remount of the real (non-preview) canvas — a page reload while sitting at
// step 8 being the main case — found an empty tree and replayed the whole animated auto-build
// from scratch (see the seed effect below), which also left `algorithmTree` in context transiently
// null/pending right when SoftwareMain needs a stable classification to gate the physical run
// (`to_repair`). Returns null (not a fallback tree) when nothing's saved — algorithm mode has no
// equivalent of manual mode's pre-built INITIAL_TREE, it always starts from an empty root.
function loadAlgoTree(): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const raw = localStorage.getItem(ALGO_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] };
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && parsed.nodes.some(n => n.id === 'root')) {
        return { nodes: layoutTree(parsed.nodes, parsed.edges), edges: parsed.edges };
      }
    }
  } catch {
    // ignore parse/quota errors
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════
// Algorithm tree canvas — step 7: the tree is built via the guided
// question → auto-categorize → validate flow, ending in an automatic build.
// ════════════════════════════════════════════════════════════════════════

function AlgorithmCanvas({
  dataset,
  previewMode = false,
  frozen = false,
}: {
  dataset: DatasetEntry[];
  previewMode?: boolean;
  /** Step 8 only: once true, the tree is never auto-rebuilt again — not on remount (page reload)
   * and not when the dataset changes (e.g. a new robot connecting) — since the whole point of the
   * final test is to run the exact tree that was validated at the end of step 7. Classifying a
   * newly-arrived robot still works fine against a frozen tree; it just doesn't trigger a rebuild. */
  frozen?: boolean;
}) {
  const { setAlgorithmTree, algorithmBuildArmed, setStep7DemoActive, setAlgorithmBuildActive } = useScenario();

  // previewMode (Step7IntroModal's throwaway demo) never touches storage — see the demo/real
  // split at SoftwareMain's algorithmMode branch.
  const [nodes, setNodes] = useState<Node[]>(
    () =>
      (!previewMode && loadAlgoTree()?.nodes) || [{ id: 'root', type: 'root', position: { x: 0, y: 0 }, data: {} }]
  );
  const [edges, setEdges] = useState<Edge[]>(() => (!previewMode && loadAlgoTree()?.edges) || []);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoBuildQueue, setAutoBuildQueue] = useState<string[]>([]);
  const [viewingRobot, setViewingRobot] = useState<ViewingRobot | null>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const datasetRef = useRef(dataset);
  const autoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Tracks whether previewMode's own auto-build has been seeded, so the completion effect below
  // (which watches autoBuildQueue emptying out) can tell "finished" apart from "hasn't started yet".
  const demoBuildStartedRef = useRef(false);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  datasetRef.current = dataset;

  const { animateToNodes, addFirstChild, deleteNode, fitView } = useTreeMutations(
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    false
  );

  // The whole tree always builds itself automatically now — no manual "+" to start, no picking
  // the first questions by hand. Seed the very first decision node straight into the auto-build
  // queue as soon as the tree is empty (both on first mount and after a dataset change resets it),
  // for both the real step-7 canvas and Step7IntroModal's previewMode demo alike. Gated on
  // algorithmBuildArmed (set once Step7IntroModal's "Construire" is pressed) so the real canvas —
  // mounted behind that modal the whole time it's open — never starts building itself silently in
  // the background while the student is still reading through the intro. Also gated on `frozen`
  // (step 8): loadAlgoTree() should already have restored a complete tree by the time this step is
  // reachable, but this is the defensive backstop against ever silently re-triggering a build
  // there (e.g. cleared storage) instead of just showing whatever's there.
  useEffect(() => {
    if (frozen || edges.length > 0 || !algorithmBuildArmed) {
      return;
    }
    const id = addFirstChild();
    setAutoBuildQueue([id]);
    demoBuildStartedRef.current = true;
  }, [edges.length, addFirstChild, algorithmBuildArmed, frozen]);

  // Reports to context whether whichever canvas is currently mounted (demo or real) still has a
  // node actively cycling through candidate questions. A node already looks structurally complete
  // (type 'question' with two 'leaf' children — see toAlgoTree/isAlgoTreeComplete) as soon as the
  // *first* candidate is tried, well before the auto-build has compared every candidate, settled
  // on the best one, and possibly recursed into impure leaves — so step 7's canAdvance needs this
  // on top of the structural check, or "Étape suivante" would unlock mid-animation.
  useEffect(() => {
    setAlgorithmBuildActive(autoBuildQueue.length > 0);
  }, [autoBuildQueue, setAlgorithmBuildActive]);

  // Unmount-only reset (stable setter, so this cleanup never fires between renders — only when
  // this canvas instance itself goes away) so a build interrupted mid-flight — e.g. navigating
  // away from step 7 while the queue is non-empty — can't leave the flag stuck true forever.
  useEffect(() => {
    return () => setAlgorithmBuildActive(false);
  }, [setAlgorithmBuildActive]);

  // previewMode is a one-shot hands-off animation (Step7IntroModal's demo, mounted with no
  // Controls and pointer-events disabled — see the wrapper div below). Once its own auto-build
  // queue has drained, hand control back to the real canvas (SoftwareMain's step7DemoActive
  // swap) so the student gets an interactive tree again. Without this, nothing ever flips
  // step7DemoActive back off: the non-interactive demo stays mounted forever and the real canvas
  // — the only one that persists to localStorage — never gets a chance to build or save anything.
  useEffect(() => {
    if (!previewMode || !demoBuildStartedRef.current || autoBuildQueue.length > 0) {
      return;
    }
    setStep7DemoActive(false);
  }, [autoBuildQueue, previewMode, setStep7DemoActive]);

  const onPlacementClick = useCallback(
    (uuid: string) => {
      const entry = dataset.find(e => e.id === uuid);
      if (!entry) {
        return;
      }
      setViewingRobot({
        uuid,
        label: entry.label,
        entryOverride: {
          testResults: entry.testResults,
          tested: true,
          observation: { category: entry.category, notes: '' },
        },
      });
    },
    [dataset]
  );

  const datasetKey = dataset
    .map(e => e.id)
    .sort()
    .join(',');
  const initializedKeyRef = useRef(datasetKey);
  useEffect(() => {
    // Frozen (step 8): a robot connecting mid-final-test changes the dataset's id set, but the
    // tree that was validated at the end of step 7 must keep running unchanged — it still
    // classifies that robot fine, it just doesn't get rebuilt around it. `initializedKeyRef` is
    // deliberately left stale here, so if the student later steps back to an unfrozen step, the
    // mismatch is still there and a normal rebuild resumes.
    if (frozen || datasetKey === initializedKeyRef.current) {
      return;
    }
    initializedKeyRef.current = datasetKey;
    setNodes([{ id: 'root', type: 'root', position: { x: 0, y: 0 }, data: {} }]);
    setEdges([]);
    setAutoBuildQueue([]);
  }, [datasetKey, frozen]);

  // Now that the real (non-preview) canvas no longer pre-builds itself in the background while
  // Step7IntroModal is still open (see algorithmBuildArmed above), it's the previewMode demo —
  // mounted right as "Construire" is pressed — that actually performs the build, so it must write
  // its result to context too instead of discarding it.
  useEffect(() => {
    const rootEdge = edges.find(e => e.source === 'root' && e.sourceHandle === 'out');
    setAlgorithmTree(rootEdge ? toAlgoTree(rootEdge.target, nodes, edges) : { type: 'pending' });
  }, [nodes, edges, setAlgorithmTree]);

  // ── Persist tree to localStorage (debounced, no positions) — same pattern as the manual tree
  // above; see loadAlgoTree() for why this exists. Skipped for previewMode, which never loads from
  // storage either. ──
  useEffect(() => {
    if (previewMode) {
      return;
    }
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      try {
        localStorage.setItem(
          ALGO_STORAGE_KEY,
          JSON.stringify({
            nodes: nodes.map(({ id, type, data }) => ({ id, type, position: { x: 0, y: 0 }, data })),
            edges: edges.map(({ id, source, sourceHandle, target }) => ({ id, source, sourceHandle, target })),
          })
        );
      } catch {
        // ignore quota errors
      }
    }, 500);
  }, [nodes, edges, previewMode]);

  // ── Core mutation: assign a question to a decision node, always auto-categorizing both
  //    branches with opposite categories (whichever pairing minimizes total error). ──
  const applyQuestionToNode = useCallback(
    (nodeId: string, questionId: string) => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const node = currentNodes.find(n => n.id === nodeId);
      if (!node) {
        return;
      }
      const wasFirstPick = !node.data.questionId;
      const entries = computeEntriesForNode(nodeId, currentNodes, currentEdges, datasetRef.current);
      const yesEntries = entries.filter(e => answerFromTestResults(questionId, e.testResults) === 'yes');
      const noEntries = entries.filter(e => answerFromTestResults(questionId, e.testResults) === 'no');
      const { yesReady, noReady } = resolveBranchCategories(yesEntries, noEntries);

      if (wasFirstPick) {
        const yesId = `${nodeId}-yes`;
        const noId = `${nodeId}-no`;
        const nextEdges = [
          ...currentEdges,
          { id: `${nodeId}-e-yes`, source: nodeId, sourceHandle: 'yes', target: yesId },
          { id: `${nodeId}-e-no`, source: nodeId, sourceHandle: 'no', target: noId },
        ];
        const nextNodes = [
          ...currentNodes.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, questionId } } : n)),
          { id: yesId, type: 'leaf', position: { x: 0, y: 0 }, data: { decision: yesReady } },
          { id: noId, type: 'leaf', position: { x: 0, y: 0 }, data: { decision: noReady } },
        ];
        setEdges(nextEdges);
        // New leaves slide out from their parent question node.
        animateToNodes(layoutTree(nextNodes, nextEdges), { [yesId]: node.position, [noId]: node.position });
      } else {
        const yesEdge = currentEdges.find(e => e.source === nodeId && e.sourceHandle === 'yes');
        const noEdge = currentEdges.find(e => e.source === nodeId && e.sourceHandle === 'no');
        const nextNodes = currentNodes.map(n => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, questionId } };
          }
          if (yesEdge && n.id === yesEdge.target) {
            return { ...n, data: { decision: yesReady } };
          }
          if (noEdge && n.id === noEdge.target) {
            return { ...n, data: { decision: noReady } };
          }
          return n;
        });
        setNodes(nextNodes);
      }
    },
    [animateToNodes]
  );

  // ── Locks a node in and converts its impure leaf children into fresh decision nodes, queued
  //    for the auto-build cycle. ──
  const resolveChildren = useCallback(
    (nodeId: string): string[] => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const yesEdge = currentEdges.find(e => e.source === nodeId && e.sourceHandle === 'yes');
      const noEdge = currentEdges.find(e => e.source === nodeId && e.sourceHandle === 'no');

      let nextNodes = currentNodes;
      const toQueue: string[] = [];

      for (const edge of [yesEdge, noEdge]) {
        if (!edge) {
          continue;
        }
        const leafId = edge.target;
        const leafEntries = computeEntriesForNode(leafId, currentNodes, currentEdges, datasetRef.current);
        if (isPureSet(leafEntries)) {
          continue; // keep as leaf, already correctly categorized
        }
        nextNodes = nextNodes.map(n =>
          n.id === leafId ? { id: leafId, type: 'decision', position: n.position, data: { questionId: null } } : n
        );
        toQueue.push(leafId);
      }

      animateToNodes(layoutTree(nextNodes, currentEdges));
      return toQueue;
    },
    [animateToNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId, removedIds => {
        setAutoBuildQueue(q => q.filter(id => !removedIds.has(id)));
      });
    },
    [deleteNode]
  );

  const noop = useCallback(() => {}, []);

  // ── Auto-build: drains the queue one node at a time, cycling through every candidate question ──
  useEffect(() => {
    if (autoBuildQueue.length === 0) {
      return;
    }
    const nodeId = autoBuildQueue[0];
    const entries = computeEntriesForNode(nodeId, nodesRef.current, edgesRef.current, datasetRef.current);
    const usedIds = getAncestorQuestionIds(nodeId, nodesRef.current, edgesRef.current);
    const candidates = QUESTIONS.filter(q => !usedIds.includes(q.id));

    if (isPureSet(entries) || candidates.length === 0) {
      const label = majorityCategory(entries);
      animateToNodes(
        layoutTree(
          nodesRef.current.map(n =>
            n.id === nodeId ? { id: nodeId, type: 'leaf', position: n.position, data: { decision: label } } : n
          ),
          edgesRef.current
        )
      );
      setAutoBuildQueue(q => q.slice(1));
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const step = () => {
      if (cancelled) {
        return;
      }
      applyQuestionToNode(nodeId, candidates[i].id);
      i++;
      if (i < candidates.length) {
        timers.push(setTimeout(step, AUTO_STEP_MS));
      } else {
        timers.push(
          setTimeout(() => {
            if (cancelled) {
              return;
            }
            const best = [...candidates].sort(
              (a, b) => giniForQuestion(entries, a.id) - giniForQuestion(entries, b.id)
            )[0];
            applyQuestionToNode(nodeId, best.id);
            timers.push(
              setTimeout(() => {
                if (cancelled) {
                  return;
                }
                const toQueue = resolveChildren(nodeId);
                setAutoBuildQueue(q => [...q.slice(1), ...toQueue]);
              }, AUTO_FINALIZE_MS)
            );
          }, AUTO_SETTLE_MS)
        );
      }
    };
    step();
    autoTimersRef.current = timers;
    return () => {
      cancelled = true;
      for (const t of timers) {
        clearTimeout(t);
      }
    };
  }, [autoBuildQueue, applyQuestionToNode, resolveChildren, animateToNodes]);

  // ── Keep the whole tree in view as it grows ─────────────────
  // Algorithm mode never pans the camera to a specific node (see useTreeMutations), so this
  // is its only viewport-adjustment mechanism. Keyed on a bounds signature (including each
  // node's width/height, not just its x/y) rather than raw nodes/edges references: re-
  // categorizing a leaf during auto-build cycling changes neither node count nor position,
  // so it shouldn't restart a fitView transition — only genuine layout changes (new nodes, a
  // leaf swapping into a wider decision card, a deletion) should.
  const boundsKey = useMemo(() => {
    if (nodes.length === 0) {
      return '';
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.position.x);
      minY = Math.min(minY, n.position.y);
      maxX = Math.max(maxX, n.position.x + getNodeWidth(n.type));
      maxY = Math.max(maxY, n.position.y + getNodeHeight(n.type));
    }
    return `${nodes.length}:${minX},${minY},${maxX},${maxY}`;
  }, [nodes]);
  useEffect(() => {
    // fitView reads xyflow's internal store, which mirrors whatever `nodes` currently holds —
    // and `nodes` is still mid-slide for the ANIM_DURATION of the position animation triggered
    // by this same change. Firing immediately would fit to a transient mid-slide snapshot and
    // could leave the true final layout out of frame. Waiting for the slide to settle first
    // also naturally coalesces bursts of rapid changes (auto-build cycling) into a single
    // adjustment instead of restarting one fitView transition on top of another.
    const timer = setTimeout(() => {
      fitView({ padding: 0.3, maxZoom: 1, duration: 400 });
    }, ANIM_DURATION + 60);
    return () => clearTimeout(timer);
  }, [boundsKey, fitView]);

  // ── Enrich nodes for rendering ──────────────────────────────
  const enrichedNodes = useMemo(() => {
    const result: Node[] = nodes.map(node => {
      if (node.type === 'root') {
        const d: RootNodeData = {
          colorId: '',
          robotLabel: '',
          isMulti: true,
          hasChild: edges.some(e => e.source === 'root'),
          onAddFirstChild: noop,
          testing: false,
          editable: false,
          highlighted: false,
        };
        return {
          ...node,
          data: d as Record<string, unknown>,
          width: getNodeWidth('root', true),
          height: getNodeHeight('root', false, true),
        };
      }
      if (node.type === 'decision') {
        const depth = getAncestorDecisionCount(node.id, edges) + 1;
        const questionId = node.data.questionId as string | null;
        // Shown on every question, locked in or not — not just the one currently being chosen —
        // so the whole tree keeps its Gini scores visible as it grows.
        const giniBadge = questionId
          ? giniForQuestion(computeEntriesForNode(node.id, nodes, edges, dataset), questionId)
          : undefined;
        const d: DecisionNodeData = {
          questionId,
          // Always reported as "used" — algorithm mode auto-creates both branches, no manual add.
          usedHandles: { yes: true, no: true },
          ancestorQuestionIds: getAncestorQuestionIds(node.id, nodes, edges),
          descendantQuestionIds: getDescendantQuestionIds(node.id, nodes, edges),
          ancestorCount: depth - 1,
          highlighted: false,
          onAddChild: noop,
          onChangeQuestion: noop,
          onSetActiveHandle: noop,
          onDelete: handleDeleteNode,
          testing: false,
          editable: false,
          deletable: true,
          activeHandle: null,
          isOnActivePath: false,
          giniBadge,
        };
        return {
          ...node,
          data: d as Record<string, unknown>,
          width: getNodeWidth('decision'),
          height: getNodeHeight('decision', false),
        };
      }
      if (node.type === 'leaf') {
        const entries = computeEntriesForNode(node.id, nodes, edges, dataset);
        const decision = node.data.decision as boolean | null;
        const placements: RobotPlacement[] = entries.map(e => ({
          uuid: e.id,
          color: e.color,
          label: e.label,
          matches: decision === null || decision === undefined ? null : decision === (e.category === 'ready'),
        }));
        const d: LeafNodeData = {
          decision,
          isOnActivePath: false,
          highlighted: false,
          testing: false,
          // Categorization is always automatic in algorithm mode — never user-editable.
          editable: false,
          deletable: true,
          placements,
          onChangeDecision: noop,
          onDelete: handleDeleteNode,
          onPlacementClick,
        };
        return {
          ...node,
          data: d as Record<string, unknown>,
          width: getNodeWidth('leaf'),
          height: getNodeHeight('leaf'),
        };
      }
      return node;
    });

    return result;
  }, [nodes, edges, dataset, handleDeleteNode, onPlacementClick, noop]);

  return (
    // Preview mode is a hands-off demo: no clicking into the dropdown, delete buttons, or pan/zoom
    // controls — just watch the auto-build cycle run.
    <div className="w-full h-full relative" style={previewMode ? { pointerEvents: 'none' } : undefined}>
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ selectable: false, style: { stroke: '#808080', strokeWidth: 1.5 } }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
        // The auto-build often grows the tree wider/deeper than the default 0.5 floor can fit —
        // without a lower floor, fitView (and the zoom-out control) get stuck clipping the tree's
        // outer branches with no way to zoom out far enough to see or pan to them.
        minZoom={0.1}
      >
        {!previewMode && <Controls />}
      </ReactFlow>
      {!previewMode && (
        <EditRobotModal
          uuid={viewingRobot?.uuid ?? null}
          label={viewingRobot?.label ?? ''}
          entryOverride={viewingRobot?.entryOverride}
          onClose={() => setViewingRobot(null)}
        />
      )}
    </div>
  );
}

function AlgorithmTreeCanvas({
  previewMode = false,
  frozen = false,
}: {
  previewMode?: boolean;
  frozen?: boolean;
}) {
  const { robotConfigs, physicalRobotData, newRobotsDataset, externalDataset } = useScenario();

  const dataset: DatasetEntry[] = [
    ...robotConfigs.flatMap((r): DatasetEntry[] => {
      const entry = physicalRobotData[r.uuid];
      if (!entry || !ALL_CRITERIA.every(c => entry.testResults[c] !== undefined)) {
        return [];
      }
      const category = entry.observation?.category;
      if (!category) {
        return [];
      }
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      return [
        {
          id: r.uuid,
          label: colorDef?.label ?? r.color,
          color: colorDef?.hex ?? '#a1a1a1',
          testResults: entry.testResults,
          category,
        },
      ];
    }),
    // Stand-ins for the 5th/6th core robots (see ScenarioContext's newRobotsDataset) — folded in
    // here too so "avec 6 robots" (this step's intro) holds even without 6 physical units.
    ...newRobotsDataset.flatMap((e): DatasetEntry[] => {
      const category = e.observation?.category;
      return category ? [{ id: e.id, label: e.label, color: '#94a3b8', testResults: e.testResults, category }] : [];
    }),
    ...externalDataset.flatMap((e): DatasetEntry[] => {
      const category = e.observation?.category;
      return category ? [{ id: e.id, label: e.label, color: '#94a3b8', testResults: e.testResults, category }] : [];
    }),
  ];

  if (dataset.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-gray-300 text-sm">Aucune donnée disponible pour construire l'algorithme.</p>
      </div>
    );
  }

  return <AlgorithmCanvas dataset={dataset} previewMode={previewMode} frozen={frozen} />;
}

// ════════════════════════════════════════════════════════════════════════
// Public component
// ════════════════════════════════════════════════════════════════════════

export type DecisionTreeProps = {
  /** 'manual' (default): free-form editing + robot testing (steps 2/4/5/6).
   *  'algorithm': guided question → auto-categorize → validate flow (step 7). */
  mode?: 'manual' | 'algorithm';
  /** 'algorithm' mode only: skips the interactive 2-level manual phase and auto-builds the whole
   * tree hands-off, using the real dataset — Step7IntroModal's live preview of the algorithm. */
  previewMode?: boolean;
  /** 'algorithm' mode only: step 8 — freezes the built tree (see AlgorithmCanvas's `frozen`). */
  frozen?: boolean;
} & Partial<ManualTreeProps>;

export const DecisionTree = forwardRef<DecisionTreeHandle, DecisionTreeProps>(function DecisionTree(
  { mode = 'manual', previewMode, frozen, ...manualProps },
  ref
) {
  return (
    <ReactFlowProvider key={mode}>
      {mode === 'algorithm' ? (
        <AlgorithmTreeCanvas previewMode={previewMode} frozen={frozen} />
      ) : (
        <ManualTreeCanvas ref={ref} testing={false} {...manualProps} />
      )}
    </ReactFlowProvider>
  );
});

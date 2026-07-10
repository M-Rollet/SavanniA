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
  useViewport,
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
import { ValidateCard, VALIDATE_WIDTH } from './ValidateCard';
import { AlgorithmValidateModal, type AlgorithmValidateModalStatus } from './AlgorithmValidateModal';
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

// ── Algorithm mode: dataset & error-count helpers ──────────────────────
type DatasetEntry = {
  id: string;
  label: string;
  color: string;
  category: 'ready' | 'repair';
  testResults: Partial<Record<Criterion, number>>;
};

/**
 * Forces the two branches of a question to opposite categories and picks whichever of the two
 * possible opposite-assignments (yes=ready/no=repair vs. yes=repair/no=ready) yields fewer errors.
 */
function resolveBranchCategories(
  yesEntries: DatasetEntry[],
  noEntries: DatasetEntry[]
): { yesReady: boolean; noReady: boolean; errorCount: number } {
  const readyCount = (list: DatasetEntry[]) => list.filter(e => e.category === 'ready').length;
  const yesReadyCount = readyCount(yesEntries);
  const yesRepairCount = yesEntries.length - yesReadyCount;
  const noReadyCount = readyCount(noEntries);
  const noRepairCount = noEntries.length - noReadyCount;

  const errorsA = yesRepairCount + noReadyCount; // yes=ready, no=repair
  const errorsB = yesReadyCount + noRepairCount; // yes=repair, no=ready

  if (errorsA <= errorsB) {
    return { yesReady: true, noReady: false, errorCount: errorsA };
  }
  return { yesReady: false, noReady: true, errorCount: errorsB };
}

function errorCountForQuestion(entries: DatasetEntry[], questionId: string): number {
  const yes = entries.filter(e => answerFromTestResults(questionId, e.testResults) === 'yes');
  const no = entries.filter(e => answerFromTestResults(questionId, e.testResults) === 'no');
  return resolveBranchCategories(yes, no).errorCount;
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

const STORAGE_KEY = 'savannia-decision-tree';

export function clearSavedTree() {
  localStorage.removeItem(STORAGE_KEY);
}

// Shown on first access (no saved tree in localStorage).
// Edit nodes/edges below to change the pre-built starting tree.
// Use fixed string IDs (not random UUIDs) so the structure is predictable.
// Available questionId values: 'light_working' | 'ir_working' | 'motor_noise'
//                              | 'battery_low' | 'battery_mid' | 'battery_full'
// Leaf `decision` values: true (robot OK) | false (robot KO)
const INITIAL_TREE: { nodes: Node[]; edges: Edge[] } = (() => {
  const edges: Edge[] = [
    { id: 'root-out-d1', source: 'root', sourceHandle: 'out', target: 'd1' },
    { id: 'd1-yes-l1', source: 'd1', sourceHandle: 'yes', target: 'l1' }, // battery low → KO
    { id: 'd1-no-d2', source: 'd1', sourceHandle: 'no', target: 'd2' },
    { id: 'd2-yes-l2', source: 'd2', sourceHandle: 'yes', target: 'l2' },
    { id: 'd2-no-l3', source: 'd2', sourceHandle: 'no', target: 'l3' },
  ];
  const nodes: Node[] = [
    { id: 'root', type: 'root', position: { x: 0, y: 0 }, data: {} },
    { id: 'd1', type: 'decision', position: { x: 0, y: 0 }, data: { questionId: 'battery_low' } },
    { id: 'd2', type: 'decision', position: { x: 0, y: 0 }, data: { questionId: 'motor_noise' } },
    { id: 'l1', type: 'leaf', position: { x: 0, y: 0 }, data: { decision: false } },
    { id: 'l2', type: 'leaf', position: { x: 0, y: 0 }, data: { decision: false } },
    { id: 'l3', type: 'leaf', position: { x: 0, y: 0 }, data: { decision: true } },
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

  // Adds a bare (unconfigured) decision node as the tree's very first node, under root.
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

const AUTO_STEP_MS = 350;
const AUTO_SETTLE_MS = 400;
const AUTO_FINALIZE_MS = 500;

type PendingValidation = { nodeId: string; x: number; y: number; onValidate: () => void };

/**
 * Renders Valider buttons as plain HTML, positioned by hand-replicating xyflow's own
 * viewport transform (translate + scale) — kept outside `.react-flow__pane` so its clicks
 * are never intercepted by the pane's native pan/drag gesture recognizer.
 */
function ValidateOverlay({ targets }: { targets: PendingValidation[] }) {
  const { x, y, zoom } = useViewport();

  if (targets.length === 0) {
    return null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {targets.map(t => (
          <div key={t.nodeId} className="absolute pointer-events-auto" style={{ left: t.x, top: t.y }}>
            <ValidateCard onValidate={t.onValidate} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Manual tree canvas — steps 2 / 4 / 5: user builds/edits the tree freely
// and can run robots through it.
// ════════════════════════════════════════════════════════════════════════

// Delay between the last question resolving (its own colored answer + edge) and the leaf it
// leads to being revealed (colored result + animation, camera pan, onLeafReached). Both this
// delay and SoftwareMain's flying-dot animation (0.8s) start from the same seq_done event and run
// in parallel, not back-to-back — this has to clear the flight's landing time *plus* a real pause
// after, or the leaf reveal lands right on top of the last value and the wait goes unnoticed.
const LEAF_REACH_DELAY_MS = 1200;

type ManualTreeProps = {
  testing: boolean;
  /** Whether the tree structure (nodes, questions, decisions) can be edited. Defaults to true. */
  editable?: boolean;
  onValidationChange?: (errors: ValidationError[]) => void;
  onActiveQuestionChange?: (questionId: string | null) => void;
  /** Fired once when the active test path reaches a leaf node. */
  onLeafReached?: (nodeId: string) => void;
  /** Show which tested robots land on which leaf, and whether that matches their terrain observation. */
  robotPlacement?: boolean;
  /** Reports how many tested+observed robots the current tree classifies correctly, whenever it changes. */
  onClassificationChange?: (stats: { total: number; correct: number }) => void;
};

const ManualTreeCanvas = forwardRef<DecisionTreeHandle, ManualTreeProps>(function ManualTreeCanvas(
  {
    testing,
    editable = true,
    robotPlacement = false,
    onValidationChange,
    onActiveQuestionChange,
    onLeafReached,
    onClassificationChange,
  },
  ref
) {
  const { controledRobot, robotConfigs, physicalRobotData, externalDataset, setManualTree, stepIndex } = useScenario();
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

  useEffect(() => {
    if (!testing) {
      setActiveHandles(new Map());
      setPendingLeafId(null);
      if (leafDelayTimerRef.current) {
        clearTimeout(leafDelayTimerRef.current);
        leafDelayTimerRef.current = null;
      }
    }
  }, [testing]);

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
    // Steps that place every robot on the tree (4/5) show an aggregate count instead of a single
    // selected robot — there's no per-robot selector on this tab for those steps anymore.
    if (stepFeatures.robotPlacementOnTree) {
      const count = robotConfigs.length + externalDataset.length;
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
  }, [stepFeatures.robotPlacementOnTree, controledRobot, robotConfigs, externalDataset]);

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
        entry.observation != null &&
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
    for (const e of externalDataset) {
      addPlacement(e, e.id, '#94a3b8', e.label, false);
    }
    return { leafPlacements: map, classificationStats: stats };
  }, [robotPlacement, robotConfigs, physicalRobotData, externalDataset, nodes, edges]);

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

  const onChangeQuestion = useCallback((nodeId: string, questionId: string) => {
    setNodes(nodesRef.current.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, questionId } } : n)));
  }, []);

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
      onLeafReachedRef.current?.(node.id);
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

  // ── Enrich edges ──────────────────────────────────────────
  const enrichedEdges = useMemo(() => {
    if (!testing) {
      return edges;
    }
    return edges.map(e =>
      activePath.has(e.source) && activePath.has(e.target)
        ? { ...e, style: { stroke: robotInfo.color, strokeWidth: 2 } }
        : { ...e, style: { stroke: '#cbd5e1', strokeWidth: 1.5, opacity: 0.3 } }
    );
  }, [edges, activePath, robotInfo.color, testing]);

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
            testing,
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
            onDelete: deleteNode,
            testing,
            editable,
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
            testing,
            editable,
            placements: leafPlacements.get(node.id) ?? [],
            onChangeDecision,
            onDelete: deleteNode,
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
      deleteNode,
      onChangeQuestion,
      onSetActiveHandle,
      onChangeDecision,
      onPlacementClick,
      testing,
      editable,
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
// Algorithm tree canvas — step 6: the tree is built via the guided
// question → auto-categorize → validate flow, ending in an automatic build.
// ════════════════════════════════════════════════════════════════════════

function AlgorithmCanvas({ dataset }: { dataset: DatasetEntry[] }) {
  const { setAlgorithmTree } = useScenario();

  const [nodes, setNodes] = useState<Node[]>(() => [{ id: 'root', type: 'root', position: { x: 0, y: 0 }, data: {} }]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [autoBuildQueue, setAutoBuildQueue] = useState<string[]>([]);
  const [validateModal, setValidateModal] = useState<{ nodeId: string; status: AlgorithmValidateModalStatus } | null>(
    null
  );
  // Per-node set of question ids the user has already tried (selected) at least once —
  // the Valider button only shows once every candidate has been tried.
  const [triedIds, setTriedIds] = useState<Map<string, Set<string>>>(new Map());
  const [viewingRobot, setViewingRobot] = useState<ViewingRobot | null>(null);

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const datasetRef = useRef(dataset);
  const validateModalRef = useRef(validateModal);
  const autoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  nodesRef.current = nodes;
  edgesRef.current = edges;
  datasetRef.current = dataset;
  validateModalRef.current = validateModal;

  const { animateToNodes, addFirstChild, deleteNode, fitView } = useTreeMutations(
    nodesRef,
    edgesRef,
    setNodes,
    setEdges,
    false
  );

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
          lockedCriteria: {},
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
    if (datasetKey !== initializedKeyRef.current) {
      initializedKeyRef.current = datasetKey;
      setNodes([{ id: 'root', type: 'root', position: { x: 0, y: 0 }, data: {} }]);
      setEdges([]);
      setAutoBuildQueue([]);
      setValidateModal(null);
      setTriedIds(new Map());
    }
  }, [datasetKey]);

  useEffect(() => {
    const rootEdge = edges.find(e => e.source === 'root' && e.sourceHandle === 'out');
    setAlgorithmTree(rootEdge ? toAlgoTree(rootEdge.target, nodes, edges) : { type: 'pending' });
  }, [nodes, edges, setAlgorithmTree]);

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

      setTriedIds(prev => {
        const next = new Map(prev);
        const set = new Set(next.get(nodeId) ?? []);
        set.add(questionId);
        next.set(nodeId, set);
        return next;
      });
    },
    [animateToNodes]
  );

  // ── Validate a node: locks it in, converts impure leaves back into fresh decision nodes ──
  const resolveChildren = useCallback(
    (nodeId: string, forceAuto: boolean): string[] => {
      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const depth = getAncestorDecisionCount(nodeId, currentEdges) + 1;
      const yesEdge = currentEdges.find(e => e.source === nodeId && e.sourceHandle === 'yes');
      const noEdge = currentEdges.find(e => e.source === nodeId && e.sourceHandle === 'no');

      let nextNodes = currentNodes.map(n => (n.id === nodeId ? { ...n, data: { ...n.data, validated: true } } : n));
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
          n.id === leafId
            ? { id: leafId, type: 'decision', position: n.position, data: { questionId: null, validated: false } }
            : n
        );
        if (forceAuto || depth + 1 >= 3) {
          toQueue.push(leafId);
        }
      }

      animateToNodes(layoutTree(nextNodes, currentEdges));
      return toQueue;
    },
    [animateToNodes]
  );

  const handleValidate = useCallback((nodeId: string) => {
    const currentNodes = nodesRef.current;
    const currentEdges = edgesRef.current;
    const node = currentNodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'decision' || !node.data.questionId) {
      return;
    }
    const entries = computeEntriesForNode(nodeId, currentNodes, currentEdges, datasetRef.current);
    const usedIds = getAncestorQuestionIds(nodeId, currentNodes, currentEdges);
    const candidates = QUESTIONS.filter(q => !usedIds.includes(q.id));
    const currentError = errorCountForQuestion(entries, node.data.questionId as string);
    const minError =
      candidates.length > 0 ? Math.min(...candidates.map(q => errorCountForQuestion(entries, q.id))) : currentError;

    if (currentError > minError) {
      setValidateModal({ nodeId, status: 'reject' });
      return;
    }
    const depth = getAncestorDecisionCount(nodeId, currentEdges) + 1;
    setValidateModal({ nodeId, status: depth >= 2 ? 'complete' : 'success' });
  }, []);

  // Applied once the user dismisses the success/complete modal — actually locks the question
  // in and converts impure branches into fresh (or auto-queued) decision nodes.
  const handleConfirmValidate = useCallback(() => {
    const current = validateModalRef.current;
    setValidateModal(null);
    if (current && current.status !== 'reject') {
      const toQueue = resolveChildren(current.nodeId, false);
      if (toQueue.length > 0) {
        setAutoBuildQueue(q => [...q, ...toQueue]);
      }
    }
  }, [resolveChildren]);

  const handleCloseValidateModal = useCallback(() => {
    setValidateModal(null);
  }, []);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      deleteNode(nodeId, removedIds => {
        setAutoBuildQueue(q => q.filter(id => !removedIds.has(id)));
        setTriedIds(prev => {
          const next = new Map(prev);
          for (const id of removedIds) {
            next.delete(id);
          }
          return next;
        });
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
              (a, b) => errorCountForQuestion(entries, a.id) - errorCountForQuestion(entries, b.id)
            )[0];
            applyQuestionToNode(nodeId, best.id);
            timers.push(
              setTimeout(() => {
                if (cancelled) {
                  return;
                }
                const toQueue = resolveChildren(nodeId, true);
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
  const { enrichedNodes, pendingValidations } = useMemo(() => {
    const isAutoQueued = (id: string) => autoBuildQueue.includes(id);

    const result: Node[] = nodes.map(node => {
      if (node.type === 'root') {
        const d: RootNodeData = {
          colorId: '',
          robotLabel: '',
          isMulti: true,
          hasChild: edges.some(e => e.source === 'root'),
          onAddFirstChild: addFirstChild,
          testing: false,
          editable: true,
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
        const validated = node.data.validated === true;
        const auto = isAutoQueued(node.id);
        const editable = !validated && !auto && depth <= 2;
        const questionId = node.data.questionId as string | null;
        // Only shown for the node currently being chosen — hidden once locked in.
        const errorBadge =
          !validated && questionId
            ? errorCountForQuestion(computeEntriesForNode(node.id, nodes, edges, dataset), questionId)
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
          onChangeQuestion: (id, qId) => applyQuestionToNode(id, qId),
          onSetActiveHandle: noop,
          onDelete: handleDeleteNode,
          testing: false,
          editable,
          activeHandle: null,
          isOnActivePath: false,
          errorBadge,
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

    // Pending "Valider" targets next to every in-progress decision node — only once every
    // candidate question available at that node has been tried at least once.
    const validations: PendingValidation[] = [];
    for (const node of nodes) {
      if (node.type !== 'decision' || node.data.validated || isAutoQueued(node.id) || !node.data.questionId) {
        continue;
      }
      const depth = getAncestorDecisionCount(node.id, edges) + 1;
      if (depth > 2) {
        continue;
      }
      const usedIds = getAncestorQuestionIds(node.id, nodes, edges);
      const candidates = QUESTIONS.filter(q => !usedIds.includes(q.id));
      const tried = triedIds.get(node.id) ?? new Set<string>();
      if (!candidates.every(q => tried.has(q.id))) {
        continue;
      }
      validations.push({
        nodeId: node.id,
        x: node.position.x + getNodeWidth('decision') / 2 - VALIDATE_WIDTH / 2,
        y: node.position.y + 105,
        onValidate: () => handleValidate(node.id),
      });
    }

    return { enrichedNodes: result, pendingValidations: validations };
  }, [
    nodes,
    edges,
    dataset,
    autoBuildQueue,
    triedIds,
    applyQuestionToNode,
    addFirstChild,
    handleDeleteNode,
    onPlacementClick,
    handleValidate,
    noop,
  ]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={enrichedNodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        nodesDraggable={false}
        nodesConnectable={false}
        defaultEdgeOptions={{ selectable: false, style: { stroke: '#808080', strokeWidth: 1.5 } }}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      >
        <Controls />
      </ReactFlow>
      <ValidateOverlay targets={pendingValidations} />
      <AlgorithmValidateModal
        status={validateModal?.status ?? null}
        onClose={handleCloseValidateModal}
        onConfirm={handleConfirmValidate}
      />
      <EditRobotModal
        uuid={viewingRobot?.uuid ?? null}
        label={viewingRobot?.label ?? ''}
        entryOverride={viewingRobot?.entryOverride}
        onClose={() => setViewingRobot(null)}
      />
    </div>
  );
}

function AlgorithmTreeCanvas() {
  const { robotConfigs, physicalRobotData, externalDataset } = useScenario();

  const dataset: DatasetEntry[] = [
    ...robotConfigs.flatMap((r): DatasetEntry[] => {
      const entry = physicalRobotData[r.uuid];
      if (!entry?.observation || !ALL_CRITERIA.every(c => entry.testResults[c] !== undefined)) {
        return [];
      }
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      return [
        {
          id: r.uuid,
          label: colorDef?.label ?? r.color,
          color: colorDef?.hex ?? '#a1a1a1',
          testResults: entry.testResults,
          category: entry.observation.category,
        },
      ];
    }),
    ...externalDataset.flatMap((e): DatasetEntry[] =>
      e.observation
        ? [{ id: e.id, label: e.label, color: '#94a3b8', testResults: e.testResults, category: e.observation.category }]
        : []
    ),
  ];

  if (dataset.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <p className="text-gray-300 text-sm">Aucune donnée disponible pour construire l'algorithme.</p>
      </div>
    );
  }

  return <AlgorithmCanvas dataset={dataset} />;
}

// ════════════════════════════════════════════════════════════════════════
// Public component
// ════════════════════════════════════════════════════════════════════════

export type DecisionTreeProps = {
  /** 'manual' (default): free-form editing + robot testing (steps 2/4/5).
   *  'algorithm': guided question → auto-categorize → validate flow (step 6). */
  mode?: 'manual' | 'algorithm';
} & Partial<ManualTreeProps>;

export const DecisionTree = forwardRef<DecisionTreeHandle, DecisionTreeProps>(function DecisionTree(
  { mode = 'manual', ...manualProps },
  ref
) {
  return (
    <ReactFlowProvider key={mode}>
      {mode === 'algorithm' ? <AlgorithmTreeCanvas /> : <ManualTreeCanvas ref={ref} testing={false} {...manualProps} />}
    </ReactFlowProvider>
  );
});

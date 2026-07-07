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
import { DecisionNode, type DecisionNodeData, NODE_WIDTH as DECISION_WIDTH } from './DecisionNode';
import { LeafNode, type LeafNodeData, NODE_WIDTH as LEAF_WIDTH } from './LeafNode';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';

export type ValidationError = { nodeId: string; message: string };
export type DecisionTreeHandle = {
  focusAndHighlight: (nodeId: string) => void;
  answerFrontier: (handle: 'yes' | 'no') => void;
};

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

// ── Layout constants ────────────────────────────────────────
const ROOT_WIDTH = 100;
const DECISION_HEIGHT = 90;
const DECISION_HEIGHT_EDIT = 170; // card + 20px gap + 2 add buttons
const ROOT_LEVEL_GAP = 180;
const LEVEL_HEIGHT = 200;
const X_GAP = 330;

// ── Viewport animation constants ────────────────────────────
const ANIM_DURATION = 300;
const PAN_DURATION = 280;
const PAN_BUFFER = 20;
const FOCUS_ZOOM = 1.0;

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getNodeWidth(type: string | undefined) {
  if (type === 'root') {
    return ROOT_WIDTH;
  }
  if (type === 'leaf') {
    return LEAF_WIDTH;
  }
  return DECISION_WIDTH;
}

function getNodeHeight(type: string | undefined, editing = false) {
  if (type === 'root') {
    return 100;
  }
  if (type === 'leaf') {
    return 120;
  }
  return editing ? DECISION_HEIGHT_EDIT : DECISION_HEIGHT;
}

// ── Layout algorithm ────────────────────────────────────────
function layoutTree(nodes: Node[], edges: Edge[]): Node[] {
  const childrenByParent = new Map<string, { childId: string; handle: string }[]>();
  for (const edge of edges) {
    if (!childrenByParent.has(edge.source)) {
      childrenByParent.set(edge.source, []);
    }
    childrenByParent.get(edge.source)!.push({ childId: edge.target, handle: edge.sourceHandle ?? '' });
  }

  const widthCache = new Map<string, number>();
  function getSubtreeWidth(nodeId: string): number {
    if (widthCache.has(nodeId)) {
      return widthCache.get(nodeId)!;
    }
    const node = nodes.find(n => n.id === nodeId);
    const children = childrenByParent.get(nodeId) ?? [];
    if (nodeId === 'root') {
      const child = children.find(c => c.handle === 'out');
      const w = child ? getSubtreeWidth(child.childId) : X_GAP;
      widthCache.set(nodeId, w);
      return w;
    }
    if (node?.type === 'leaf' || children.length === 0) {
      widthCache.set(nodeId, X_GAP);
      return X_GAP;
    }
    const yesChild = children.find(c => c.handle === 'yes');
    const noChild = children.find(c => c.handle === 'no');
    const w =
      (yesChild ? getSubtreeWidth(yesChild.childId) : X_GAP) + (noChild ? getSubtreeWidth(noChild.childId) : X_GAP);
    widthCache.set(nodeId, w);
    return w;
  }

  const positions = new Map<string, { x: number; y: number }>();
  function visit(nodeId: string, centerX: number, y: number) {
    positions.set(nodeId, { x: centerX, y });
    const children = childrenByParent.get(nodeId) ?? [];
    if (nodeId === 'root') {
      const child = children.find(c => c.handle === 'out');
      if (child) {
        visit(child.childId, centerX, y + ROOT_LEVEL_GAP);
      }
      return;
    }
    const yesChild = children.find(c => c.handle === 'yes');
    const noChild = children.find(c => c.handle === 'no');
    const yesW = yesChild ? getSubtreeWidth(yesChild.childId) : X_GAP;
    const noW = noChild ? getSubtreeWidth(noChild.childId) : X_GAP;
    const left = centerX - (yesW + noW) / 2;
    if (yesChild) {
      visit(yesChild.childId, left + yesW / 2, y + LEVEL_HEIGHT);
    }
    if (noChild) {
      visit(noChild.childId, left + yesW + noW / 2, y + LEVEL_HEIGHT);
    }
  }
  visit('root', 0, 0);

  return nodes.map(node => {
    const pos = positions.get(node.id);
    if (!pos) {
      return node;
    }
    return {
      ...node,
      position: {
        x: Math.round(pos.x - getNodeWidth(node.type) / 2),
        y: Math.round(pos.y),
      },
    };
  });
}

// ── Tree helpers ────────────────────────────────────────────
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

function getAncestorQuestionIds(nodeId: string, nodes: Node[], edges: Edge[]): string[] {
  const ids: string[] = [];
  let current = nodeId;
  while (true) {
    const parentEdge = edges.find(e => e.target === current);
    if (!parentEdge) {
      break;
    }
    current = parentEdge.source;
    if (current === 'root') {
      break;
    }
    const qId = nodes.find(n => n.id === current)?.data?.questionId as string | undefined;
    if (qId) {
      ids.push(qId);
    }
  }
  return ids;
}

function getDescendantQuestionIds(nodeId: string, nodes: Node[], edges: Edge[]): string[] {
  const descendants = getDescendants(nodeId, edges);
  return nodes
    .filter(n => descendants.has(n.id) && n.type === 'decision' && n.data.questionId)
    .map(n => n.data.questionId as string);
}

function getAncestorDecisionCount(nodeId: string, edges: Edge[]): number {
  let count = 0;
  let current = nodeId;
  while (true) {
    const parentEdge = edges.find(e => e.target === current);
    if (!parentEdge) {
      break;
    }
    current = parentEdge.source;
    if (current === 'root') {
      break;
    }
    count++;
  }
  return count;
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

function getDescendants(parentId: string, edges: Edge[]): Set<string> {
  const out = new Set<string>();
  const queue = [parentId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of edges) {
      if (e.source === cur) {
        out.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return out;
}

const STORAGE_KEY = 'savannia-decision-tree';

export function clearSavedTree() {
  localStorage.removeItem(STORAGE_KEY);
}

// ── Initial tree ─────────────────────────────────────────────
// Shown on first access (no saved tree in localStorage).
// Edit nodes/edges below to change the pre-built starting tree.
// Use fixed string IDs (not random UUIDs) so the structure is predictable.
// Available questionId values: 'light_working' | 'ir_working' | 'motor_noise'
//                              | 'battery_low' | 'battery_mid' | 'battery_full'
// Leaf `decision` values: true (robot OK) | false (robot KO)
const INITIAL_TREE: { nodes: Node[]; edges: Edge[] } = (() => {
  const edges: Edge[] = [
    { id: 'root-out-d1', source: 'root', sourceHandle: 'out', target: 'd1' },
    { id: 'd1-yes-l1',   source: 'd1',   sourceHandle: 'yes', target: 'l1' }, // battery low → KO
    { id: 'd1-no-d2',    source: 'd1',   sourceHandle: 'no',  target: 'd2' },
    { id: 'd2-yes-l2',   source: 'd2',   sourceHandle: 'yes', target: 'l2' },
    { id: 'd2-no-l3',    source: 'd2',   sourceHandle: 'no',  target: 'l3' },
  ];
  const nodes: Node[] = [
    { id: 'root', type: 'root',     position: { x: 0, y: 0 }, data: {} },
    { id: 'd1',   type: 'decision', position: { x: 0, y: 0 }, data: { questionId: 'battery_low' } },
    { id: 'd2',   type: 'decision', position: { x: 0, y: 0 }, data: { questionId: 'ir_working' } },
    { id: 'l1',   type: 'leaf',     position: { x: 0, y: 0 }, data: { decision: false } },
    { id: 'l2',   type: 'leaf',     position: { x: 0, y: 0 }, data: { decision: true  } },
    { id: 'l3',   type: 'leaf',     position: { x: 0, y: 0 }, data: { decision: false } },
  ];
  return { nodes: layoutTree(nodes, edges), edges };
})();


function loadTree(): { nodes: Node[]; edges: Edge[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { nodes: Node[]; edges: Edge[] };
      if (
        Array.isArray(parsed.nodes) &&
        Array.isArray(parsed.edges) &&
        parsed.nodes.some(n => n.id === 'root')
      ) {
        // Re-run layout so positions are always consistent regardless of what was saved.
        return { nodes: layoutTree(parsed.nodes, parsed.edges), edges: parsed.edges };
      }
    }
  } catch {
    // ignore parse/quota errors
  }
  return INITIAL_TREE;
}

// ── Component ───────────────────────────────────────────────
type DecisionTreeProps = {
  testing: boolean;
  onValidationChange?: (errors: ValidationError[]) => void;
  onActiveQuestionChange?: (questionId: string | null) => void;
  /** Fired once when the active test path reaches a leaf node. */
  onLeafReached?: (nodeId: string) => void;
};

export const DecisionTree = forwardRef<DecisionTreeHandle, DecisionTreeProps>(function DecisionTree(
  { testing, onValidationChange, onActiveQuestionChange, onLeafReached },
  ref
) {
  const { controledRobot, robotConfigs } = useScenario();
  const [nodes, setNodes] = useState<Node[]>(() => loadTree().nodes);
  const [edges, setEdges] = useState<Edge[]>(() => loadTree().edges);
  const [activeHandles, setActiveHandles] = useState<Map<string, 'yes' | 'no'>>(new Map());
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);
  const { setCenter } = useReactFlow();

  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);
  const activeHandlesRef = useRef<Map<string, 'yes' | 'no'>>(new Map());
  const animRafRef = useRef<number | null>(null);
  const panTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    if (!testing) {
      setActiveHandles(new Map());
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

  // ── rAF animation ─────────────────────────────────────────
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
    []
  );

  // ── Viewport focus → then layout animation ────────────────
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
    [setCenter, animateToNodes]
  );

  // ── Robot info ────────────────────────────────────────────
  const robotInfo = useMemo(() => {
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
  }, [controledRobot, robotConfigs]);

  // ── Mutations ─────────────────────────────────────────────
  const addFirstChild = useCallback(() => {
    const newId = crypto.randomUUID();
    const nextEdges = [
      ...edgesRef.current,
      { id: `root-out-${newId}`, source: 'root', sourceHandle: 'out', target: newId },
    ];
    const nextNodes = [
      ...nodesRef.current,
      { id: newId, type: 'decision', position: { x: 0, y: 0 }, data: { questionId: null } },
    ];
    const laid = layoutTree(nextNodes, nextEdges);

    // New node slides in from the root's current position
    const root = nodesRef.current.find(n => n.id === 'root');
    focusThenAnimate(laid, nextEdges, newId, root ? { [newId]: root.position } : undefined);
  }, [focusThenAnimate]);

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

  const deleteNode = useCallback(
    (nodeId: string) => {
      const deletedNode = nodesRef.current.find(n => n.id === nodeId);

      const toRemove = new Set([nodeId, ...getDescendants(nodeId, edgesRef.current)]);
      const nextEdges = edgesRef.current.filter(e => !toRemove.has(e.source) && !toRemove.has(e.target));
      const nextNodes = nodesRef.current.filter(n => !toRemove.has(n.id));
      const laid = layoutTree(nextNodes, nextEdges);

      if (deletedNode) {
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
    [setCenter, animateToNodes]
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
        setActiveHandles(prev => new Map(prev).set(current, handle));
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
    if (!frontierNodeId) {
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
  }, [frontierNodeId, setCenter]);

  // ── Active path ───────────────────────────────────────────
  const activePath = useMemo(() => computeActivePath(edges, activeHandles), [edges, activeHandles]);

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
            hasChild: edges.some(e => e.source === 'root'),
            onAddFirstChild: addFirstChild,
            testing,
            highlighted: highlightedNodeId === node.id,
          };
          return { ...node, data: d as Record<string, unknown> };
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
            activeHandle: activeHandles.get(node.id) ?? null,
            isOnActivePath: activePath.has(node.id),
          };
          const hasAddButtons = !testing && (!d.usedHandles.yes || !d.usedHandles.no);
          return { ...node, data: d as Record<string, unknown>, height: getNodeHeight('decision', hasAddButtons) };
        }
        if (node.type === 'leaf') {
          const d: LeafNodeData = {
            decision: node.data.decision as boolean | null,
            isOnActivePath: activePath.has(node.id),
            highlighted: highlightedNodeId === node.id,
            testing,
            onChangeDecision,
            onDelete: deleteNode,
          };
          return { ...node, data: d as Record<string, unknown> };
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
      testing,
      activeHandles,
      activePath,
      highlightedNodeId,
    ]
  );

  const nodeTypes: NodeTypes = useMemo(() => ({ root: RootNode, decision: DecisionNode, leaf: LeafNode }), []);

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
        nodeTypes={nodeTypes}
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
    </div>
  );
});

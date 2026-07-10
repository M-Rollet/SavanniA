import type { Node, Edge } from '@xyflow/react';
import { NODE_WIDTH as DECISION_WIDTH } from './DecisionNode';
import { NODE_WIDTH as LEAF_WIDTH } from './LeafNode';

// ── Layout constants ────────────────────────────────────────
export const ROOT_WIDTH = 100;
export const DECISION_HEIGHT = 90;
export const DECISION_HEIGHT_EDIT = 170; // card + 20px gap + 2 add buttons
export const ROOT_LEVEL_GAP = 180;
export const LEVEL_HEIGHT = 200;
export const X_GAP = 330;

// ── Viewport animation constants ────────────────────────────
export const ANIM_DURATION = 300;
export const PAN_DURATION = 280;
export const PAN_BUFFER = 20;
export const FOCUS_ZOOM = 1.0;

export function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function getNodeWidth(type: string | undefined) {
  if (type === 'root') {
    return ROOT_WIDTH;
  }
  if (type === 'leaf') {
    return LEAF_WIDTH;
  }
  return DECISION_WIDTH;
}

export function getNodeHeight(type: string | undefined, editing = false) {
  if (type === 'root') {
    return 100;
  }
  if (type === 'leaf') {
    return 120;
  }
  return editing ? DECISION_HEIGHT_EDIT : DECISION_HEIGHT;
}

// ── Layout algorithm ────────────────────────────────────────
export function layoutTree(nodes: Node[], edges: Edge[]): Node[] {
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
export function getAncestorQuestionIds(nodeId: string, nodes: Node[], edges: Edge[]): string[] {
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

export function getDescendants(parentId: string, edges: Edge[]): Set<string> {
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

export function getDescendantQuestionIds(nodeId: string, nodes: Node[], edges: Edge[]): string[] {
  const descendants = getDescendants(nodeId, edges);
  return nodes
    .filter(n => descendants.has(n.id) && n.type === 'decision' && n.data.questionId)
    .map(n => n.data.questionId as string);
}

export function getAncestorDecisionCount(nodeId: string, edges: Edge[]): number {
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

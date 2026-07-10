import { CheckShape } from '@gravity-ui/icons';
import './TreeNodes.css';

export const VALIDATE_WIDTH = 220;

/**
 * Plain (non-ReactFlow-node) button rendered by AlgorithmBuilder's ValidateOverlay,
 * positioned via useViewport() outside the pane so xyflow's pan/drag gesture recognizer
 * never sees the click — a node-based version of this was unreliable to click.
 */
export function ValidateCard({ onValidate }: { onValidate: () => void }) {
  return (
    <div
      className="node-card rounded-xl bg-white shadow-sm border p-3 flex flex-col gap-2 items-center"
      style={{ width: VALIDATE_WIDTH }}
    >
      <p className="text-xs text-gray-500 text-center">Est-ce la meilleure question ?</p>
      <button
        onClick={onValidate}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
      >
        <CheckShape width={12} height={12} />
        Valider cette question
      </button>
    </div>
  );
}

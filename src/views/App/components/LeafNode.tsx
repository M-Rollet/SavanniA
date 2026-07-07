import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Xmark, CheckShape, Ban } from '@gravity-ui/icons';
import './TreeNodes.css';

export type LeafNodeData = {
  decision: boolean | null;
  isOnActivePath: boolean;
  testing: boolean;
  editable: boolean;
  highlighted: boolean;
  onChangeDecision: (nodeId: string, decision: boolean) => void;
  onDelete: (nodeId: string) => void;
};

export const NODE_WIDTH = 200;

const OPTIONS = {
  true: { label: 'Prêt à partir', icon: CheckShape },
  false: { label: 'À réparer', icon: Ban },
} as const;

export function LeafNode({ id, data }: NodeProps) {
  const { decision, isOnActivePath, testing, editable, highlighted, onChangeDecision, onDelete } = data as LeafNodeData;
  const canEdit = editable && !testing;
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="node"
      data-testing={testing || undefined}
      data-on-path={isOnActivePath || undefined}
      data-highlighted={highlighted || undefined}
      data-decision={decision !== null ? String(decision) : undefined}
      style={{ width: NODE_WIDTH, overflow: 'visible', position: 'relative' }}
    >
      <Handle type="target" position={Position.Top} />

      {canEdit && (
        <button
          onClick={() => onDelete(id)}
          onMouseDown={stopProp}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-gray-200 hover:bg-red-50 hover:border-red-300 flex items-center justify-center z-20 transition-colors shadow-sm text-gray-400 hover:text-red-500"
        >
          <Xmark />
        </button>
      )}

      <div className="node-card rounded-xl border shadow-sm transition-all">
        <div className="px-3 pt-2.5 pb-0.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Décision</div>

        <div className="flex flex-col gap-1.5 p-2.5 pt-1.5">
          {([true, false] as const).map(value => {
            const key = String(value) as 'true' | 'false';
            const { label, icon: Icon } = OPTIONS[key];
            const isSelected = decision === value;

            return (
              <button
                key={key}
                data-value={key}
                data-selected={isSelected || undefined}
                onClick={() => canEdit && onChangeDecision(id, value)}
                onMouseDown={stopProp}
                disabled={!canEdit}
                className="decision-btn w-full text-base px-3 py-2 rounded-lg border transition-all flex items-center gap-2"
              >
                <Icon width={14} height={14} className="shrink-0" />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

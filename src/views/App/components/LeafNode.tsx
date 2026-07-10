import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Xmark, CheckShape, Ban, Check } from '@gravity-ui/icons';
import './TreeNodes.css';

export type RobotPlacement = {
  uuid: string;
  color: string;
  label: string;
  /** true = matches the recorded terrain observation, false = mismatch, null = no observation yet. */
  matches: boolean | null;
};

export type LeafNodeData = {
  decision: boolean | null;
  isOnActivePath: boolean;
  testing: boolean;
  editable: boolean;
  highlighted: boolean;
  placements: RobotPlacement[];
  onChangeDecision: (nodeId: string, decision: boolean) => void;
  onDelete: (nodeId: string) => void;
  /** Fired when a robot placement dot is clicked, so the caller can show that robot's data. */
  onPlacementClick?: (uuid: string) => void;
};

export const NODE_WIDTH = 200;

const OPTIONS = {
  true: { label: 'Prêt à partir', icon: CheckShape },
  false: { label: 'À réparer', icon: Ban },
} as const;

export function LeafNode({ id, data }: NodeProps) {
  const {
    decision,
    isOnActivePath,
    testing,
    editable,
    highlighted,
    placements,
    onChangeDecision,
    onDelete,
    onPlacementClick,
  } = data as LeafNodeData;
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

        {placements.length > 0 &&
          (decision === null ? (
            <div className="px-2.5 pb-2.5 pt-1.5 border-t border-gray-100 flex flex-wrap gap-1 justify-center">
              {placements.map(p => (
                <button
                  key={p.uuid}
                  title={p.label}
                  onClick={() => onPlacementClick?.(p.uuid)}
                  onMouseDown={stopProp}
                  className="w-3.5 h-3.5 rounded-full shrink-0 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-shadow"
                  style={{ backgroundColor: p.color }}
                />
              ))}
            </div>
          ) : (
            (() => {
              const correct = placements.filter(p => p.matches === true);
              const incorrect = placements.filter(p => p.matches === false);
              const unclassified = placements.filter(p => p.matches === null);
              return (
                <div className="px-2.5 pb-2.5 pt-1.5 border-t border-gray-100">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-wrap gap-1 justify-start">
                      {correct.map(p => (
                        <button
                          key={p.uuid}
                          title={p.label}
                          onClick={() => onPlacementClick?.(p.uuid)}
                          onMouseDown={stopProp}
                          className="relative w-3.5 h-3.5 shrink-0 cursor-pointer hover:scale-110 transition-transform"
                        >
                          <span className="absolute inset-0 rounded-full" style={{ backgroundColor: p.color }} />
                          <Check
                            width={9}
                            height={9}
                            className="absolute -top-1 -right-1 rounded-full bg-white text-green-600 ring-1 ring-white"
                          />
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {incorrect.map(p => (
                        <button
                          key={p.uuid}
                          title={p.label}
                          onClick={() => onPlacementClick?.(p.uuid)}
                          onMouseDown={stopProp}
                          className="relative w-3.5 h-3.5 shrink-0 cursor-pointer hover:scale-110 transition-transform"
                        >
                          <span className="absolute inset-0 rounded-full" style={{ backgroundColor: p.color }} />
                          <Xmark
                            width={9}
                            height={9}
                            className="absolute -top-1 -right-1 rounded-full bg-white text-red-600 ring-1 ring-white"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between text-[10px] font-medium mt-1">
                    <span className="text-green-600">
                      {correct.length} correct{correct.length > 1 ? 's' : ''}
                    </span>
                    <span className="text-red-500">
                      {incorrect.length} incorrect{incorrect.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  {unclassified.length > 0 && (
                    <div className="flex flex-wrap gap-1 justify-center mt-1.5 pt-1.5 border-t border-gray-100">
                      {unclassified.map(p => (
                        <button
                          key={p.uuid}
                          title={p.label}
                          onClick={() => onPlacementClick?.(p.uuid)}
                          onMouseDown={stopProp}
                          className="w-3.5 h-3.5 rounded-full shrink-0 opacity-40 cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-shadow"
                          style={{ backgroundColor: p.color }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })()
          ))}
      </div>
    </div>
  );
}

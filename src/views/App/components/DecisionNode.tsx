import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus, Xmark } from '@gravity-ui/icons';
import { Dropdown } from '@heroui/react';
import './TreeNodes.css';
import { QUESTIONS } from './questions';

export type DecisionNodeData = {
  questionId: string | null;
  usedHandles: { yes: boolean; no: boolean };
  ancestorQuestionIds: string[];
  descendantQuestionIds: string[];
  ancestorCount: number;
  highlighted: boolean;
  onAddChild: (parentId: string, handle: 'yes' | 'no', type: 'decision' | 'leaf') => void;
  onChangeQuestion: (nodeId: string, questionId: string) => void;
  onSetActiveHandle: (nodeId: string, handle: 'yes' | 'no') => void;
  onDelete: (nodeId: string) => void;
  testing: boolean;
  activeHandle: 'yes' | 'no' | null;
  isOnActivePath: boolean;
};

export const NODE_WIDTH = 310;

export function DecisionNode({ id, data }: NodeProps) {
  const {
    questionId,
    usedHandles,
    ancestorQuestionIds,
    descendantQuestionIds,
    ancestorCount,
    highlighted,
    onAddChild,
    onChangeQuestion,
    onSetActiveHandle,
    onDelete,
    testing,
    activeHandle,
    isOnActivePath,
  } = data as DecisionNodeData;

  const usedElsewhere = new Set([...ancestorQuestionIds, ...descendantQuestionIds]);
  const availableQuestions = QUESTIONS.filter(q => q.id === questionId || !usedElsewhere.has(q.id));
  const selectedQuestion = QUESTIONS.find(q => q.id === questionId);
  const canAddDecisionChild = ancestorCount + 1 < QUESTIONS.length;
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="node"
      data-testing={testing || undefined}
      data-on-path={isOnActivePath || undefined}
      data-highlighted={highlighted || undefined}
      data-active-handle={activeHandle ?? undefined}
      style={{ width: NODE_WIDTH, overflow: 'visible', position: 'relative' }}
    >
      <Handle type="target" position={Position.Top} />

      {!testing && (
        <button
          onClick={() => onDelete(id)}
          onMouseDown={stopProp}
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-gray-200 hover:bg-red-50 hover:border-red-300 flex items-center justify-center z-20 transition-colors shadow-sm text-gray-400 hover:text-red-500"
        >
          <Xmark/>
        </button>
      )}

      {/* Card */}
      <div className="node-card rounded-xl bg-white shadow-sm border transition-all">
        {/* Question dropdown */}
        <div className="px-3 pt-3 pb-2 border-b border-gray-100">
          <Dropdown>
            <Dropdown.Trigger
              isDisabled={testing}
              onMouseDown={stopProp}
              className="w-full flex items-center justify-between gap-1 bg-transparent border-0 shadow-none ring-0 outline-none p-0 h-auto min-h-0 cursor-pointer disabled:cursor-default"
            >
              <span className={`text-base truncate ${questionId ? 'text-gray-950' : 'text-gray-400'}`}>
                {selectedQuestion?.label ?? 'Choisir une question…'}
              </span>
              {!testing && (
                <svg width="10" height="10" viewBox="0 0 10 10" className="shrink-0 text-gray-400" fill="currentColor">
                  <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
              )}
            </Dropdown.Trigger>
            <Dropdown.Popover>
              <Dropdown.Menu onAction={key => onChangeQuestion(id, String(key))}>
                {availableQuestions.map(q => (
                  <Dropdown.Item key={q.id} id={q.id}>
                    {q.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>

        {/* Oui / Non tabs */}
        <div className="flex">
          <button
            onClick={() => onSetActiveHandle(id, 'yes')}
            onMouseDown={stopProp}
            disabled
            className="node-tab node-tab-yes flex-1 py-2 text-base font-medium rounded-bl-xl transition-colors"
          >
            Oui
          </button>
          <div className="w-px bg-gray-100" />
          <button
            onClick={() => onSetActiveHandle(id, 'no')}
            onMouseDown={stopProp}
            disabled
            className="node-tab node-tab-no flex-1 py-2 text-base font-medium rounded-br-xl transition-colors"
          >
            Non
          </button>
        </div>
      </div>

      {/* Source handles */}
      <Handle id="yes" type="source" position={Position.Bottom} style={{ left: '25%' }} />
      <Handle id="no" type="source" position={Position.Bottom} style={{ left: '75%' }} />

      {/* Add buttons */}
      {!testing && (
        <div className="absolute w-full flex justify-between" style={{ top: 'calc(100% + 20px)', left: 0 }}>
          <div className="flex flex-col gap-1" style={{ width: '45%', marginLeft: '2.5%' }}>
            {!usedHandles.yes && (
              <>
                {canAddDecisionChild && (
                  <button onClick={() => onAddChild(id, 'yes', 'decision')} onMouseDown={stopProp} className="add-btn">
                    <Plus/> Question
                  </button>
                )}
                <button onClick={() => onAddChild(id, 'yes', 'leaf')} onMouseDown={stopProp} className="add-btn">
                  <Plus/> Décision
                </button>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1" style={{ width: '45%', marginRight: '2.5%' }}>
            {!usedHandles.no && (
              <>
                {canAddDecisionChild && (
                  <button onClick={() => onAddChild(id, 'no', 'decision')} onMouseDown={stopProp} className="add-btn">
                    <Plus/> Question
                  </button>
                )}
                <button onClick={() => onAddChild(id, 'no', 'leaf')} onMouseDown={stopProp} className="add-btn">
                  <Plus/> Décision
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

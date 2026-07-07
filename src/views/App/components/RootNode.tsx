import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus } from '@gravity-ui/icons';
import './TreeNodes.css';
import thymioDefault from '../../../assets/thymio_icon.svg';
import thymioRed from '../../../assets/thymio_icon_red.svg';
import thymioBlue from '../../../assets/thymio_icon_blue.svg';
import thymioGreen from '../../../assets/thymio_icon_green.svg';
import thymioYellow from '../../../assets/thymio_icon_yellow.svg';
import thymioPink from '../../../assets/thymio_icon_pink.svg';
import thymioCyan from '../../../assets/thymio_icon_cyan.svg';

const ICONS: Record<string, string> = {
  red: thymioRed,
  blue: thymioBlue,
  green: thymioGreen,
  yellow: thymioYellow,
  pink: thymioPink,
  cyan: thymioCyan,
};

export type RootNodeData = {
  colorId: string;
  robotLabel: string;
  hasChild: boolean;
  onAddFirstChild: () => void;
  testing: boolean;
  editable: boolean;
  highlighted: boolean;
};

// Must match ROOT_WIDTH in DecisionTree.tsx
const NODE_SIZE = 100;

export function RootNode({ data }: NodeProps) {
  const { colorId, robotLabel, hasChild, onAddFirstChild, testing, editable, highlighted } = data as RootNodeData;
  const icon = ICONS[colorId] ?? thymioDefault;
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="root-node"
      data-highlighted={highlighted || undefined}
      style={{ width: NODE_SIZE, overflow: 'visible', position: 'relative' }}
    >
      <div
        className="node-card rounded-xl bg-white shadow-sm border-2 flex flex-col items-center justify-center gap-1.5 p-2 transition-shadow"
        style={{ width: NODE_SIZE, height: NODE_SIZE, boxSizing: 'border-box' }}
      >
        <img src={icon} alt={robotLabel} style={{ width: 56, height: 56, objectFit: 'contain' }} />
        <span className="robot-label text-xs font-semibold truncate w-full text-center">{robotLabel}</span>
      </div>

      <Handle type="source" position={Position.Bottom} id="out" />

      {!hasChild && editable && !testing && (
        <div
          className="absolute left-1/2 flex flex-col items-center gap-1"
          style={{ top: 'calc(100% + 24px)', transform: 'translateX(-50%)' }}
        >
          <button onClick={onAddFirstChild} onMouseDown={stopProp} className="add-btn">
            <Plus width={12} height={12} />
            Ajouter une question
          </button>
        </div>
      )}
    </div>
  );
}

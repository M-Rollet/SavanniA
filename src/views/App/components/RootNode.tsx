import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus } from '@gravity-ui/icons';
import './TreeNodes.css';
import thymioDefault from '../../../assets/thymio_icon.svg';
import thymioMulti from '../../../assets/thymio_icon_multi.png';
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
  /** True for aggregate views (multiple robots at once, e.g. steps 4-6) — shows a dedicated icon. */
  isMulti?: boolean;
  hasChild: boolean;
  onAddFirstChild: () => void;
  testing: boolean;
  editable: boolean;
  highlighted: boolean;
};

// Must match ROOT_WIDTH / ROOT_WIDTH_MULTI in treeLayout.ts
const NODE_SIZE = 100;
const NODE_SIZE_MULTI = 124;

export function RootNode({ data }: NodeProps) {
  const { colorId, robotLabel, isMulti, hasChild, onAddFirstChild, testing, editable, highlighted } =
    data as RootNodeData;
  const icon = isMulti ? thymioMulti : ICONS[colorId] ?? thymioDefault;
  const size = isMulti ? NODE_SIZE_MULTI : NODE_SIZE;
  const imgSize = isMulti ? 72 : 56;
  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      className="root-node"
      data-highlighted={highlighted || undefined}
      style={{ width: size, overflow: 'visible', position: 'relative' }}
    >
      <div
        className="node-card rounded-xl bg-white shadow-sm border-2 flex flex-col items-center justify-center gap-1.5 p-2 transition-shadow"
        style={{ width: size, height: size, boxSizing: 'border-box' }}
      >
        <img src={icon} alt={robotLabel || 'Robot'} style={{ width: imgSize, height: imgSize, objectFit: 'contain' }} />
        {robotLabel && (
          <span className="robot-label text-xs font-semibold truncate w-full text-center">{robotLabel}</span>
        )}
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

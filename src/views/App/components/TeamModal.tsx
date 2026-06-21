import { useState, useEffect } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { ArrowRightArrowLeft } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS, type RobotTeam } from '../ScenarioContext';

const colorMeta = Object.fromEntries(ROBOT_COLORS.map(c => [c.id, c]));

type RobotConfig = ReturnType<typeof useScenario>['robotConfigs'][number];

function RobotCircle({
  r,
  draggingUuid,
  onDragStart,
}: {
  r: RobotConfig;
  draggingUuid: string | null;
  onDragStart: (uuid: string, x: number, y: number) => void;
}) {
  const meta = colorMeta[r.color];
  return (
    <span
      onPointerDown={e => {
        e.preventDefault();
        onDragStart(r.uuid, e.clientX, e.clientY);
      }}
      title={meta?.label}
      className={`inline-block w-10 h-10 rounded-full border-2 border-white shadow select-none transition-opacity ${
        draggingUuid === r.uuid ? 'opacity-30 cursor-grabbing' : 'cursor-grab'
      }`}
      style={{ backgroundColor: meta?.hex, touchAction: 'none' }}
    />
  );
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TeamModal({ isOpen, onClose }: Props) {
  const { robotConfigs, robotTeams, setRobotTeams } = useScenario();

  const [localTeams, setLocalTeams] = useState<Record<string, RobotTeam>>({});
  const [draggingUuid, setDraggingUuid] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dragOver, setDragOver] = useState<RobotTeam | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const init: Record<string, RobotTeam> = {};
    for (const r of robotConfigs) {
      init[r.uuid] = robotTeams[r.uuid] ?? 'terrain';
    }
    setLocalTeams(init);
    setDraggingUuid(null);
    setDragPos(null);
    setDragOver(null);
  }, [isOpen]);

  const state = useOverlayState({
    isOpen,
    onOpenChange: open => {
      if (!open) {
        onClose();
      }
    },
  });

  // Pointer-event based drag — avoids Safari's HTML5 DnD bug where click
  // events are suppressed after dragstart, making buttons unresponsive.
  useEffect(() => {
    if (!draggingUuid) {
      return;
    }

    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      // Skip the ghost element (pointer-events:none, but still in elementsFromPoint).
      const zone = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(el => el.hasAttribute('data-zone'))
        ?.getAttribute('data-zone') as RobotTeam | null;
      setDragOver(zone ?? null);
    };

    const onUp = (e: PointerEvent) => {
      const zone = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(el => el.hasAttribute('data-zone'))
        ?.getAttribute('data-zone') as RobotTeam | null;

      if (zone) {
        setLocalTeams(prev => ({ ...prev, [draggingUuid]: zone }));
      }
      setDraggingUuid(null);
      setDragPos(null);
      setDragOver(null);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [draggingUuid]);

  const swapAll = () => {
    setLocalTeams(prev => {
      const next: Record<string, RobotTeam> = {};
      for (const [uuid, team] of Object.entries(prev)) {
        next[uuid] = team === 'terrain' ? 'bureau' : 'terrain';
      }
      return next;
    });
  };

  const handleSave = () => {
    setRobotTeams(localTeams);
    onClose();
  };

  const terrainRobots = robotConfigs.filter(r => (localTeams[r.uuid] ?? 'terrain') === 'terrain');
  const bureauRobots = robotConfigs.filter(r => (localTeams[r.uuid] ?? 'terrain') === 'bureau');
  const draggingColor = draggingUuid ? colorMeta[robotConfigs.find(r => r.uuid === draggingUuid)?.color ?? ''] : null;

  const handleDragStart = (uuid: string, x: number, y: number) => {
    setDraggingUuid(uuid);
    setDragPos({ x, y });
  };

  return (
    <>
      {/* Ghost circle follows the pointer while dragging */}
      {draggingColor && dragPos && (
        <div
          data-drag-ghost
          className="fixed pointer-events-none z-[9999] w-10 h-10 rounded-full border-2 border-white shadow-lg opacity-75 -translate-x-1/2 -translate-y-1/2"
          style={{ backgroundColor: draggingColor.hex, left: dragPos.x, top: dragPos.y }}
        />
      )}

      <Modal state={state}>
        <Modal.Backdrop isDismissable>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>Répartition des robots</Modal.Heading>
                <Modal.CloseTrigger />
              </Modal.Header>

              <Modal.Body className="flex flex-col gap-4">
                <p className="text-sm text-gray-500">
                  Glisse les robots entre les deux équipes pour modifier la répartition.
                </p>

                <div className="flex flex-col gap-2">
                  {/* Labels row — spacer keeps the label widths aligned with their zones */}
                  <div className="flex gap-3 justify-center items-center">
                    <p className="w-44 text-sm font-semibold text-center">Équipe de terrain</p>
                    <span className="w-9 shrink-0" />
                    <p className="w-44 text-sm font-semibold text-center">Équipe de bureau</p>
                  </div>

                  {/* Zones + button row — items-center aligns button to zone midpoint */}
                  <div className="flex gap-3 items-center justify-center">
                    <div
                      data-zone="terrain"
                      className={`min-h-[172px] w-44 rounded-xl p-3 grid grid-cols-3 gap-3 items-start content-start transition-all duration-150 ${
                        dragOver === 'terrain'
                          ? 'bg-sky-50 border-2 border-sky-300 border-dashed'
                          : 'bg-gray-50 border-2 border-gray-100'
                      }`}
                    >
                      {terrainRobots.map(r => (
                        <RobotCircle key={r.uuid} r={r} draggingUuid={draggingUuid} onDragStart={handleDragStart} />
                      ))}
                      {terrainRobots.length === 0 && (
                        <span className="col-span-3 text-gray-300 text-xs italic text-center">Déposer ici</span>
                      )}
                    </div>

                    <button
                      onClick={swapAll}
                      title="Échanger touts les robots"
                      className="shrink-0 p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors"
                    >
                      <ArrowRightArrowLeft width={20} height={20} />
                    </button>

                    <div
                      data-zone="bureau"
                      className={`min-h-[172px] w-44 rounded-xl p-3 grid grid-cols-3 gap-3 items-start content-start transition-all duration-150 ${
                        dragOver === 'bureau'
                          ? 'bg-sky-50 border-2 border-sky-300 border-dashed'
                          : 'bg-gray-50 border-2 border-gray-100'
                      }`}
                    >
                      {bureauRobots.map(r => (
                        <RobotCircle key={r.uuid} r={r} draggingUuid={draggingUuid} onDragStart={handleDragStart} />
                      ))}
                      {bureauRobots.length === 0 && (
                        <span className="col-span-3 text-gray-300 text-xs italic text-center">Déposer ici</span>
                      )}
                    </div>
                  </div>
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button variant="ghost" onClick={onClose}>
                  Annuler
                </Button>
                <Button variant="primary" onClick={handleSave}>
                  Valider
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}

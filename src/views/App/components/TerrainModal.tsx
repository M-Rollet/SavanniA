import { useState } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { CheckShape, Ban } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import { EMPTY_ROBOT_ENTRY } from '../steps/stepDefinitions';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TerrainModal({ isOpen, onClose }: Props) {
  const { robotConfigs, physicalRobotData, setPhysicalRobotData } = useScenario();
  const [panel, setPanel] = useState<'brief' | 'observations'>('brief');

  const state = useOverlayState({
    isOpen,
    onOpenChange: open => {
      if (!open) {
        onClose();
      }
    },
  });

  const setCategory = (uuid: string, category: 'ready' | 'repair') => {
    const entry = physicalRobotData[uuid] ?? EMPTY_ROBOT_ENTRY;
    setPhysicalRobotData({
      ...physicalRobotData,
      [uuid]: { ...entry, observation: { category, notes: entry.observation?.notes ?? '' } },
    });
  };

  const setNotes = (uuid: string, notes: string) => {
    const entry = physicalRobotData[uuid] ?? EMPTY_ROBOT_ENTRY;
    setPhysicalRobotData({
      ...physicalRobotData,
      [uuid]: { ...entry, observation: { category: entry.observation?.category ?? 'ready', notes } },
    });
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Terrain & observations</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <div className="flex gap-2 border-b pb-3">
                <Button variant={panel === 'brief' ? 'primary' : 'ghost'} size="sm" onPress={() => setPanel('brief')}>
                  Brief terrain
                </Button>
                <Button
                  variant={panel === 'observations' ? 'primary' : 'ghost'}
                  size="sm"
                  onPress={() => setPanel('observations')}
                >
                  Observations
                </Button>
              </div>

              {panel === 'brief' ? (
                <div className="flex flex-col gap-3">
                  <p className="text-gray-600 text-sm">
                    Direction le circuit ! Fais rouler chaque robot sur le parcours et observe attentivement son
                    comportement : est-ce qu'il suit bien la ligne, réagit-il aux obstacles, son moteur semble-t-il
                    fonctionner normalement ?
                  </p>
                  <p className="text-gray-600 text-sm">
                    Pour chaque robot, décide s'il est prêt à partir en mission ou s'il a besoin d'une réparation, et
                    note ce que tu as remarqué dans l'onglet « Observations ».
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {robotConfigs.length === 0 && <p className="text-gray-400 text-sm italic">Aucun robot configuré</p>}
                  {robotConfigs.map(r => {
                    const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
                    const entry = physicalRobotData[r.uuid];
                    const category = entry?.observation?.category ?? null;
                    return (
                      <div key={r.uuid} className="flex flex-col gap-2 border rounded-xl p-3">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorDef?.hex }} />
                          <span className="text-sm font-medium">{colorDef?.label}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCategory(r.uuid, 'ready')}
                            className={`flex-1 flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
                              category === 'ready'
                                ? 'border-green-400 bg-green-50 text-green-700'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            <CheckShape width={14} height={14} />
                            Prêt à partir
                          </button>
                          <button
                            onClick={() => setCategory(r.uuid, 'repair')}
                            className={`flex-1 flex items-center justify-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors ${
                              category === 'repair'
                                ? 'border-red-400 bg-red-50 text-red-700'
                                : 'border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                          >
                            <Ban width={14} height={14} />À réparer
                          </button>
                        </div>
                        <textarea
                          value={entry?.observation?.notes ?? ''}
                          onChange={e => setNotes(r.uuid, e.target.value)}
                          placeholder="Notes d'observation…"
                          rows={2}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onClick={onClose}>
                Fermer
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

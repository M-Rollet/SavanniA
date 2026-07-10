import { useMemo } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { CheckShape, Ban } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import { EMPTY_ROBOT_ENTRY, getStepDef } from '../steps/stepDefinitions';
import { getWrongObservations, hasWrongObservations } from '../robotProfiles';
import { CheckFailedModal } from './CheckFailedModal';
import './TreeNodes.css';
import thymioRed from '../../../assets/thymio_icon_red.svg';
import thymioBlue from '../../../assets/thymio_icon_blue.svg';
import thymioGreen from '../../../assets/thymio_icon_green.svg';
import thymioYellow from '../../../assets/thymio_icon_yellow.svg';
import thymioCyan from '../../../assets/thymio_icon_cyan.svg';
import thymioPink from '../../../assets/thymio_icon_pink.svg';

const THYMIO_ICONS: Record<string, string> = {
  red: thymioRed,
  blue: thymioBlue,
  green: thymioGreen,
  yellow: thymioYellow,
  cyan: thymioCyan,
  pink: thymioPink,
};

const STEP_3 = getStepDef(3);

export function TerrainModal() {
  const {
    stepIndex,
    advanceStep,
    robotConfigs,
    physicalRobotData,
    setPhysicalRobotData,
    algorithmTree,
    treeAccuracy,
    observationCheckFailed,
    setObservationCheckFailed,
  } = useScenario();

  const stepDef = getStepDef(stepIndex);
  const isOpen = stepDef.features.observationEntry;
  const canContinue = STEP_3.canAdvance({ physicalRobotData, robotConfigs, algorithmTree, treeAccuracy });
  const wrongUuids = useMemo(
    () => (observationCheckFailed ? getWrongObservations(robotConfigs, physicalRobotData) : null),
    [observationCheckFailed, robotConfigs, physicalRobotData]
  );

  // Only advanceStep() (via the "Continuer" button below) can leave this step — no backdrop/Escape dismissal.
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  // The completeness gate (canContinue) doesn't check correctness — do that here, right before
  // actually moving on, so a full-but-wrong set of observations blocks advancement with an
  // explanation instead of silently letting the user through.
  const handleContinue = () => {
    if (hasWrongObservations(robotConfigs, physicalRobotData)) {
      setObservationCheckFailed(true);
      return;
    }
    advanceStep();
  };

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
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="cover">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Tests sur le terrain</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex gap-8">
              {/* Left — explanations */}
              <div className="flex-1 flex flex-col gap-3">
                <p className="text-gray-600 text-sm">
                  Direction le circuit ! Lance chaque robot sur le parcours et observe attentivement son
                  comportement. Utilise le bouton central pour lancer le test d'un robot.
                </p>
                <p className="text-gray-600 text-sm">
                  Pour chaque robot, observe s'il revient à la base et note tes observations (comportement, bruit, etc). Indique si son statut devrait être « Prêt à partir » ou « À réparer » selon le résultat du test.
                </p>
              </div>

              {/* Right — robots, 2 wide × 3 tall grid */}
              <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-3 content-start">
                {robotConfigs.length === 0 && <p className="text-gray-400 text-sm italic">Aucun robot configuré</p>}
                {robotConfigs.map(r => {
                  const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
                  const entry = physicalRobotData[r.uuid];
                  const category = entry?.observation?.category ?? null;
                  const isWrong = wrongUuids?.has(r.uuid) ?? false;
                  return (
                    <div
                      key={r.uuid}
                      className={`flex flex-col gap-1.5 border rounded-xl p-2.5 h-full ${
                        isWrong ? 'bg-yellow-50 border-yellow-300' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <img src={THYMIO_ICONS[r.color]} alt="" className="w-7 h-7 shrink-0" />
                        <span className="text-sm font-medium">{colorDef?.label}</span>
                      </div>
                      <div className="node flex gap-1.5">
                        <button
                          data-value="true"
                          data-selected={category === 'ready' || undefined}
                          onClick={() => setCategory(r.uuid, 'ready')}
                          className="decision-btn flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border transition-all"
                        >
                          <CheckShape width={12} height={12} />
                          Prêt à partir
                        </button>
                        <button
                          data-value="false"
                          data-selected={category === 'repair' || undefined}
                          onClick={() => setCategory(r.uuid, 'repair')}
                          className="decision-btn flex-1 flex items-center justify-center gap-1.5 text-xs px-2 py-1.5 rounded-lg border transition-all"
                        >
                          <Ban width={12} height={12} />À réparer
                        </button>
                      </div>
                      <textarea
                        value={entry?.observation?.notes ?? ''}
                        onChange={e => setNotes(r.uuid, e.target.value)}
                        placeholder="Notes…"
                        className="w-full flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                      />
                    </div>
                  );
                })}
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" isDisabled={!canContinue} onPress={handleContinue}>
                Continuer
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      <CheckFailedModal
        failed={observationCheckFailed}
        title="Certaines observations semblent incorrectes"
        messages={[
          "Certains robots sont marqués « Prêt à partir » ou « À réparer » alors que ce n'est pas ce qui a été observé sur le terrain.",
          'Vérifie les cartes surlignées en jaune ci-dessus et corrige leur statut.',
        ]}
      />
    </Modal>
  );
}

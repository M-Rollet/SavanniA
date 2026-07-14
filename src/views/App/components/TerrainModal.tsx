import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { CheckShape, Ban } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import { EMPTY_ROBOT_ENTRY, getStepDef } from '../steps/stepDefinitions';
import { getWrongObservations, hasWrongObservations, getFailureReasons, CORE_PROFILES } from '../robotProfiles';
import { CheckFailedModal } from './CheckFailedModal';
import './TreeNodes.css';
import thymioRed from '../../../assets/thymio_icon_red.svg';
import thymioBlue from '../../../assets/thymio_icon_blue.svg';
import thymioGreen from '../../../assets/thymio_icon_green.svg';
import thymioYellow from '../../../assets/thymio_icon_yellow.svg';
import thymioCyan from '../../../assets/thymio_icon_cyan.svg';
import thymioPink from '../../../assets/thymio_icon_pink.svg';
import buttonImage from '../../../assets/thymio_button.png';
import circuitImage from '../../../assets/circuit.png';

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
    activeRobotConfigs: robotConfigs,
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

  // Turns each mismatch into a sensor-specific explanation (not just "this is wrong") — the
  // ground-truth config already tells us exactly which sensor caused the discrepancy.
  const wrongMessages = useMemo(() => {
    if (!wrongUuids || wrongUuids.size === 0) {
      return [];
    }
    const lines: string[] = [];
    robotConfigs.forEach((r, index) => {
      if (!wrongUuids.has(r.uuid)) {
        return;
      }
      const profile = CORE_PROFILES[index];
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      if (!profile || !colorDef) {
        return;
      }
      if (profile.expectedCategory === 'repair') {
        const reasons = getFailureReasons(profile.config);
        lines.push(`Robot ${colorDef.label} : ${reasons.join(' ')}`);
      } else {
        lines.push(`Robot ${colorDef.label} : tous ses capteurs sont bons — il peut vraiment partir.`);
      }
    });
    return lines;
  }, [wrongUuids, robotConfigs]);

  // Robots only appear once the user has read the explanation and pressed "C'est parti".
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (stepIndex !== 3) {
      setStarted(false);
    }
  }, [stepIndex]);

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
          <Modal.Dialog className="max-w-[1280px]">
            <Modal.Header>
              <Modal.Heading>Tests sur le terrain</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex gap-8">
              {/* Left — explanations */}
              <div className="flex-1 flex flex-col gap-3">
                <p className="text-gray-600 text-sm">
                  Après avoir analysé les robots au labo, il est temps d'aller les tester sur le terrain. Tu pourras ensuite comparer ce que tu auras observé avec les prédictions que l'arbre de décision a faites.
                </p>
                <p className="text-gray-600 text-sm">
                  Sur ce circuit tu croises un tunnel, des animaux et une colline. Avant de lancer un robot,
                  rappele-toi des observations que tu as faites en laboratoire.
                </p>
                <img src={circuitImage} alt="" className="w-100 max-w-full mx-auto my-4" />
                <p className="text-gray-600 text-sm">
                  Pour lancer un robot sur le parcours, pose le sur la place de départ et appuie sur le bouton central. Regarde ensuite ce qu'il se passe.
                </p>
                <img src={buttonImage} alt="" className="w-100 max-w-full rounded-xl mx-auto my-4" />
                <p className="text-gray-600 text-sm">
                  Pour chaque robot, observe s'il revient à la base et note tes observations (comportement, bruit, etc).
                  Indique si son statut devrait être « Prêt à partir » ou « À réparer » selon le résultat du test.
                </p>
              </div>

              <div className="w-px bg-gray-200" />

              {/* Right — robots, 2 wide × 3 tall grid */}
              <div className="flex-1 flex flex-col gap-3">
                {started && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <h3 className="text-sm font-semibold text-gray-700">Statut de chaque robot</h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                      Indique si chaque robot est prêt à partir ou doit être réparé, et note ce que tu observes.
                    </p>
                  </motion.div>
                )}
                <div className="flex-1 grid grid-cols-2 grid-rows-3 gap-3 content-start">
                  {started && robotConfigs.length === 0 && (
                    <p className="text-gray-400 text-sm italic">Aucun robot configuré</p>
                  )}
                  <AnimatePresence>
                    {started &&
                      robotConfigs.map((r, i) => {
                        const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
                        const entry = physicalRobotData[r.uuid];
                        const category = entry?.observation?.category ?? null;
                        const isWrong = wrongUuids?.has(r.uuid) ?? false;
                        return (
                          <motion.div
                            key={r.uuid}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: i * 0.08 }}
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
                          </motion.div>
                        );
                      })}
                  </AnimatePresence>
                </div>
              </div>
            </Modal.Body>

            <Modal.Footer className="w-full">
              <div className="flex-1 flex justify-end">
                {!started && (
                  <Button variant="primary" onPress={() => setStarted(true)}>
                    C'est parti
                  </Button>
                )}
              </div>
              <div className="flex-1 flex justify-end">
                {started && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                    <Button variant="primary" isDisabled={!canContinue} onPress={handleContinue}>
                      Continuer
                    </Button>
                  </motion.div>
                )}
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
      <CheckFailedModal
        failed={observationCheckFailed}
        title="Les observations semblent incorrectes"
        messages={[
          "Certains robots sont marqués « Prêt à partir » ou « À réparer » alors que ce n'est pas ce qui a été observé sur le terrain.",
          "Si besoin, relance un robot sur le terrain et observe ce qu'il se passe.",
        ]}
      />
    </Modal>
  );
}

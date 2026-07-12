import { useState, useEffect, Fragment } from 'react';
import { Button, Modal, useOverlayState } from '@heroui/react';
import { Xmark, Gear, Bulb } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS, type RobotColor, type RobotConfig } from '../ScenarioContext';
import { MIN_ROBOTS } from '../robotProfiles';

const PASSWORD = 'mobots';

export function SettingsOverlay() {
  const { user, robotConfigs, setRobotConfigs, resetApp, isSettingsOpen, closeSettings, stepIndex } = useScenario();

  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [passwordError, setPasswordError] = useState(false);
  const [discovered, setDiscovered] = useState<string[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [identifying, setIdentifying] = useState<string | null>(null);

  const handleIdentify = async (uuid: string) => {
    setIdentifying(uuid);
    try {
      await user.identify(uuid);
    } finally {
      setIdentifying(null);
    }
  };

  const handleClose = () => {
    setPassword('');
    setUnlocked(false);
    setPasswordError(false);
    setConfirmReset(false);
    closeSettings();
  };

  const state = useOverlayState({
    isOpen: isSettingsOpen,
    onOpenChange: open => {
      if (!open) {
        handleClose();
      }
    },
  });

  const handleUnlock = () => {
    if (password === PASSWORD) {
      setUnlocked(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  // Auto-scan and poll every 3 s while the panel is open and unlocked
  useEffect(() => {
    if (!isSettingsOpen || !unlocked) {
      return;
    }

    const refresh = async () => {
      const list = await user.getRobotsUuids();
      setDiscovered(list);
    };

    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [isSettingsOpen, unlocked, user]);

  const assignColor = (uuid: string, color: RobotColor) => {
    const next: RobotConfig[] = [...robotConfigs.filter(r => r.uuid !== uuid && r.color !== color), { uuid, color }];
    setRobotConfigs(next);
  };

  const removeRobot = (uuid: string) => {
    setRobotConfigs(robotConfigs.filter(r => r.uuid !== uuid));
  };

  const usedColors = new Set(robotConfigs.map(r => r.color));

  return (
    <Modal state={state}>
      {/* Settings must stay reachable even when another modal or the guided tour's dimming
          overlay (z-[99999]) is blocking the rest of the app — see SettingsButton. An inline
          style is used (rather than a z-\[100000\] class) since HeroUI's className merging is a
          plain concat, not a specificity-aware override, so a class here could lose to the
          library's own z-50 depending on stylesheet order. */}
      <Modal.Backdrop isDismissable style={{ zIndex: 100000 }}>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>
                <span className="flex items-center gap-1 mb-2">
                  <Gear style={{ width: '1em', height: '1em' }} />
                  Paramètres
                </span>
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-6">
              {!unlocked ? (
                /* ── Password gate ────────────────────────── */
                <div className="flex flex-col gap-4">
                  <p className="text-gray-500 text-sm">
                    Cette section est protégée. Entrez le mot de passe pour continuer.
                  </p>
                  <input
                    type="password"
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      setPasswordError(false);
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                    placeholder="Mot de passe"
                    autoFocus
                    className={`w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                      passwordError ? 'border-red-400 bg-red-50' : 'border-gray-300'
                    }`}
                  />
                  {passwordError && <p className="text-red-500 text-xs">Mot de passe incorrect.</p>}
                </div>
              ) : (
                /* ── Robot configurator ───────────────────── */
                <div className="flex flex-col gap-6">
                  {/* Discovered robots – assign color */}
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium text-gray-700">Robots détectés</p>
                    {discovered.length === 0 ? (
                      <p className="text-sm text-gray-400 italic">Aucun robot détecté</p>
                    ) : (
                      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2">
                        {/* Column headers */}
                        <span />
                        <span className="text-xs text-gray-400">Identifiant unique</span>
                        <span className="text-xs text-gray-400">Couleur assignée</span>

                        {/* Robot rows */}
                        {discovered.map(uuid => {
                          const assigned = robotConfigs.find(r => r.uuid === uuid);
                          const isIdentifying = identifying === uuid;
                          return (
                            <Fragment key={uuid}>
                              <button
                                onClick={() => handleIdentify(uuid)}
                                disabled={isIdentifying}
                                title="Identifier le robot (flash LED)"
                                className={`flex items-center justify-center w-7 h-7 rounded-full border transition-all
                                  ${
                                    isIdentifying
                                      ? 'border-yellow-400 text-yellow-500 animate-pulse cursor-wait'
                                      : 'border-gray-200 text-gray-400 hover:border-yellow-400 hover:text-yellow-500'
                                  }`}
                              >
                                <Bulb width={14} height={14} />
                              </button>
                              <span className="text-xs text-gray-400 font-mono truncate" title={uuid}>
                                {uuid}
                              </span>
                              <div className="flex gap-2 flex-wrap">
                                {ROBOT_COLORS.map(c => {
                                  const isAssignedHere = assigned?.color === c.id;
                                  const takenByOther = usedColors.has(c.id) && !isAssignedHere;
                                  return (
                                    <button
                                      key={c.id}
                                      title={c.label}
                                      onClick={() => !takenByOther && assignColor(uuid, c.id)}
                                      style={{ backgroundColor: c.hex }}
                                      className={`w-7 h-7 rounded-full border-2 transition-all ${
                                        isAssignedHere
                                          ? 'border-gray-800 scale-115'
                                          : takenByOther
                                          ? 'opacity-25 cursor-not-allowed border-transparent'
                                          : 'border-transparent hover:border-gray-400 hover:scale-105'
                                      }`}
                                    />
                                  );
                                })}
                              </div>
                            </Fragment>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Configured robots summary */}
                  {robotConfigs.length > 0 && (
                    <div className="flex flex-col gap-2 border-t pt-4">
                      <p className="text-sm font-medium text-gray-700">Robots configurés</p>
                      {stepIndex >= 1 && robotConfigs.length <= MIN_ROBOTS && (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          Attention : moins de {MIN_ROBOTS} robots réduit la richesse de l'activité.
                        </p>
                      )}
                      <div className="grid grid-cols-[16px_4rem_1fr_auto] items-center gap-x-3 gap-y-2">
                        {robotConfigs.map(({ uuid, color }) => {
                          const colorObj = ROBOT_COLORS.find(c => c.id === color)!;
                          return (
                            <Fragment key={uuid}>
                              <span className="w-4 h-4 rounded-full" style={{ backgroundColor: colorObj.hex }} />
                              <span className="text-sm font-medium">{colorObj.label}</span>
                              <span className="text-xs text-gray-400 font-mono truncate">{uuid}</span>
                              <button
                                onClick={() => removeRobot(uuid)}
                                className="text-gray-300 hover:text-red-400"
                                aria-label="Retirer"
                              >
                                <Xmark width={16} height={16} />
                              </button>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button variant="primary" onClick={handleClose} isDisabled={robotConfigs.length === 0}>
                      Terminer
                    </Button>
                  </div>

                  {/* Reset section */}
                  <div className="border-t pt-4 flex flex-col items-end gap-3">
                    <div className="w-full flex flex-col gap-1">
                      <p className="text-sm font-medium text-gray-700">Réinitialisation</p>
                      <p className="text-xs text-gray-500">
                        Supprime toutes les données enregistrées (étape, robot, configurations) et ramène l'application
                        à l'état initial.
                      </p>
                    </div>
                    {!confirmReset ? (
                      <Button variant="outline" onClick={() => setConfirmReset(true)}>
                        Réinitialiser l'application
                      </Button>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-4 w-full">
                          <p className="text-xs text-red-600 font-medium">
                            Confirmer la réinitialisation ?<br />
                            Cette action est irréversible.
                          </p>
                          <div className="flex gap-2 shrink-0">
                            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                              Annuler
                            </Button>
                            <Button
                              variant="primary"
                              onClick={() => {
                                resetApp();
                                handleClose();
                              }}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Confirmer
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Modal.Body>
            {!unlocked && (
              <Modal.Footer>
                <>
                  <Button variant="ghost" onClick={handleClose}>
                    Annuler
                  </Button>
                  <Button variant="primary" onClick={handleUnlock}>
                    Déverrouiller
                  </Button>
                </>
              </Modal.Footer>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { Button } from '@heroui/react';
import { Toast } from '@heroui/react/toast';
import { Sliders, ArrowRightArrowLeft } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import { TeamModal } from '../components/TeamModal';
import { DecisionTree, type DecisionTreeHandle, type ValidationError } from '../components/DecisionTree';
import {
  COLOR_CONFIGS,
  QUESTION_SEQ_TYPE,
  SEQ_DURATION_MS,
  NO_SEQ_DELAY_MS,
  getAnswerForQuestion,
} from '../robotColorConfigs';
import logo from '../../../assets/logo.svg';
import thymioDefault from '../../../assets/thymio_icon.svg';
import thymioRed from '../../../assets/thymio_icon_red.svg';
import thymioBlue from '../../../assets/thymio_icon_blue.svg';
import thymioGreen from '../../../assets/thymio_icon_green.svg';
import thymioYellow from '../../../assets/thymio_icon_yellow.svg';
import thymioOrange from '../../../assets/thymio_icon_orange.svg';
import thymioPurple from '../../../assets/thymio_icon_purple.svg';
import thymioPink from '../../../assets/thymio_icon_pink.svg';
import thymioCyan from '../../../assets/thymio_icon_cyan.svg';

const THYMIO_ICONS: Record<string, string> = {
  red: thymioRed,
  blue: thymioBlue,
  green: thymioGreen,
  yellow: thymioYellow,
  orange: thymioOrange,
  purple: thymioPurple,
  pink: thymioPink,
  cyan: thymioCyan,
};
import type { ThymioStatus } from '../../../Entities/ThymioManager/Model/thymio.model';

type LocalStatus = ThymioStatus | 'connecting';

function displayState(s: LocalStatus | undefined): 'ready' | 'connecting' | 'unavailable' {
  if (s === 'ready') {
    return 'ready';
  }
  if (s === 'connecting' || s === 'available') {
    return 'connecting';
  }
  return 'unavailable';
}

export function SoftwareMain() {
  const { go, user, robotConfigs, robotTeams, controledRobot, selectRobot, initializeRobot } = useScenario();

  const bureauRobots = useMemo(
    () => robotConfigs.filter(r => robotTeams[r.uuid] === 'bureau'),
    [robotConfigs, robotTeams]
  );
  const activeColor = robotConfigs.find(r => r.uuid === controledRobot)?.color;
  const thymioIcon = (activeColor && THYMIO_ICONS[activeColor]) ?? thymioDefault;
  const [testing, setTesting] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, LocalStatus>>({});
  const [validationErrors, setErrors] = useState<ValidationError[]>([]);
  const connectingRef = useRef(new Set<string>());
  const decisionTreeRef = useRef<DecisionTreeHandle>(null);
  const toastKeyRef = useRef<string | null>(null);
  const autoAnswerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAnswerRef = useRef<'yes' | 'no'>('yes');
  const testingRef = useRef(testing);
  const robotTeamsRef = useRef(robotTeams);
  const controledRobotRef = useRef(controledRobot);
  useLayoutEffect(() => {
    testingRef.current = testing;
  }, [testing]);
  useLayoutEffect(() => {
    robotTeamsRef.current = robotTeams;
  }, [robotTeams]);
  useLayoutEffect(() => {
    controledRobotRef.current = controledRobot;
  }, [controledRobot]);

  // Called when the robot emits SeqDone — answers the frontier immediately
  // instead of waiting for the fallback timeout.
  const handleSeqDone = useCallback(() => {
    if (!testingRef.current) {
      return;
    }
    if (autoAnswerTimerRef.current) {
      clearTimeout(autoAnswerTimerRef.current);
      autoAnswerTimerRef.current = null;
      decisionTreeRef.current?.answerFrontier(pendingAnswerRef.current);
    }
  }, []);

  const tryConnect = useCallback(
    (uuid: string) => {
      if (connectingRef.current.has(uuid)) {
        return;
      }
      connectingRef.current.add(uuid);
      setStatuses(prev => ({ ...prev, [uuid]: 'connecting' }));
      initializeRobot(uuid, (_u, vars) => {
        if (vars.seq_done !== undefined && uuid === controledRobotRef.current) {
          handleSeqDone();
        }
      })
        .then(() => {
          connectingRef.current.delete(uuid);
          setStatuses(prev => ({ ...prev, [uuid]: 'ready' }));
          const isField = robotTeamsRef.current[uuid] === 'terrain';
          user.setVariables(uuid, new Map([['field_mode', [isField ? 1 : 0]]]));
        })
        .catch((err: unknown) => {
          connectingRef.current.delete(uuid);
          console.error('[SoftwareMain] initializeRobot failed:', err);
        });
    },
    [initializeRobot, user, handleSeqDone]
  );

  // Poll TDM every 2 s; auto-connect any robot that becomes 'available'.
  useEffect(() => {
    const poll = () => {
      bureauRobots.forEach(({ uuid }) => {
        if (connectingRef.current.has(uuid)) {
          return;
        }
        const tdm = user.getRobotStatus(uuid);
        setStatuses(prev => ({ ...prev, [uuid]: tdm ?? 'disconnected' }));
        if (tdm === 'available') {
          tryConnect(uuid);
        }
      });
    };
    poll();
    const id = setInterval(poll, 2000);
    return () => clearInterval(id);
  }, [bureauRobots, user, tryConnect]);

  // Deselect if the selected robot is no longer ready.
  useEffect(() => {
    if (controledRobot && displayState(statuses[controledRobot]) !== 'ready') {
      selectRobot('');
    }
  }, [statuses, controledRobot, selectRobot]);

  // Deselect if the selected robot is reassigned to the field team.
  useEffect(() => {
    if (controledRobot && !bureauRobots.some(r => r.uuid === controledRobot)) {
      selectRobot('');
    }
  }, [bureauRobots, controledRobot, selectRobot]);

  // Propagate team changes to already-initialised robots.
  useEffect(() => {
    robotConfigs.forEach(({ uuid }) => {
      if (statuses[uuid] !== 'ready') {
        return;
      }
      const isField = robotTeams[uuid] === 'terrain';
      user.setVariables(uuid, new Map([['field_mode', [isField ? 1 : 0]]]));
    });
  }, [robotTeams]);

  const robotReady = !!controledRobot && statuses[controledRobot] === 'ready';
  const treeValid = validationErrors.length === 0;

  // Clear any pending auto-answer when testing stops.
  useEffect(() => {
    if (!testing) {
      if (autoAnswerTimerRef.current) {
        clearTimeout(autoAnswerTimerRef.current);
        autoAnswerTimerRef.current = null;
      }
      setActiveQuestion(null);
    }
  }, [testing]);

  // Fired by DecisionTree whenever the frontier question changes.
  // Sends SetConfig + SeqStart to the robot, then schedules an automatic
  // Oui/Non answer derived from the robot's colour config.
  const handleActiveQuestion = useCallback(
    (questionId: string | null) => {
      setActiveQuestion(questionId);
      if (autoAnswerTimerRef.current) {
        clearTimeout(autoAnswerTimerRef.current);
        autoAnswerTimerRef.current = null;
      }
      console.log('[SoftwareMain] handleActiveQuestion', questionId, 'robot:', controledRobot);
      if (!questionId || !controledRobot) {
        return;
      }
      const color = robotConfigs.find(r => r.uuid === controledRobot)?.color;
      if (!color) {
        return;
      }
      const cfg = COLOR_CONFIGS[color];

      const seqType = QUESTION_SEQ_TYPE[questionId];

      // Write config and optional sequence trigger in one call.
      const vars = new Map<string, number[]>([
        ['light_working', [cfg.light_working]],
        ['ir_working', [cfg.ir_working]],
        ['motor_noise', [cfg.motor_noise]],
        ['battery_level', [cfg.battery_level]],
        ['line_follow', [0]],
      ]);
      if (seqType !== undefined) {
        vars.set('seq_type', [seqType]);
        vars.set('seq_trigger', [1]);
      }
      user.setVariables(controledRobot, vars);

      const answer = getAnswerForQuestion(questionId, cfg);
      pendingAnswerRef.current = answer;

      const delay = seqType !== undefined ? SEQ_DURATION_MS[seqType] ?? 2000 : NO_SEQ_DELAY_MS;

      // Fallback timer: fires if SeqDone never arrives (no sequence, or lost event).
      autoAnswerTimerRef.current = setTimeout(() => {
        autoAnswerTimerRef.current = null;
        if (!testingRef.current) {
          return;
        }
        decisionTreeRef.current?.answerFrontier(pendingAnswerRef.current);
      }, delay);
    },
    [controledRobot, robotConfigs, user]
  );

  const handleLaunchTest = useCallback(() => {
    if (testing) {
      setTesting(false);
      return;
    }
    if (!treeValid) {
      if (toastKeyRef.current) {
        Toast.toast.close(toastKeyRef.current);
      }
      const first = validationErrors[0];
      const key = Toast.toast.warning('Arbre incomplet', {
        description: first.message,
        timeout: 6000,
        actionProps: {
          children: 'Voir',
          variant: 'secondary',
          onPress: () => {
            decisionTreeRef.current?.focusAndHighlight(first.nodeId);
            if (toastKeyRef.current) {
              Toast.toast.close(toastKeyRef.current);
              toastKeyRef.current = null;
            }
          },
        },
      });
      toastKeyRef.current = key;
      return;
    }
    setTesting(true);
  }, [testing, treeValid, validationErrors]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: 'var(--color-beige-light)' }}>
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center gap-4 px-6 py-3 border-b shrink-0">
        <img src={logo} alt="SavannIA" className="h-8 mt-1" />
      </header>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — Programme (2/3) */}
        <div className="flex flex-col gap-4 p-6 border-r overflow-hidden" style={{ flex: '2 1 0' }}>
          <h2 className="text-xl font-bold shrink-0">Programme</h2>

          <div className="flex flex-col flex-1 min-h-0">
            {/* Action row */}
            <div className="shrink-0 flex items-center gap-3">
              {/* Tab pill */}
              <div className="flex items-center gap-2 bg-gray-50 border border-b-0 border-gray-100 rounded-t-xl px-3 py-2">
                <img src={thymioIcon} alt="Robot :" className="h-10 mr-1 transition-all duration-300" />

                <div className="flex gap-1.5 items-center">
                  {bureauRobots.map(({ uuid, color }) => {
                    const c = ROBOT_COLORS.find(x => x.id === color)!;
                    const ds = displayState(statuses[uuid]);
                    const isSelected = controledRobot === uuid && ds === 'ready';
                    const locked = testing && activeQuestion !== null;

                    return (
                      <RobotDot
                        key={uuid}
                        hex={c.hex}
                        label={c.label}
                        displayState={ds}
                        selected={isSelected}
                        locked={locked}
                        onClick={() => {
                          if (ds !== 'ready' || locked) {
                            return;
                          }
                          if (testing && !isSelected) {
                            // At decision node: switch robot and exit test mode.
                            setTesting(false);
                            selectRobot(uuid);
                          } else if (!testing) {
                            selectRobot(uuid);
                          }
                        }}
                      />
                    );
                  })}
                  {bureauRobots.length === 0 && <span className="text-xs text-gray-400">—</span>}
                </div>

                <div className="w-px h-4 bg-gray-200 mx-1" />

                <Button
                  variant={!testing && !treeValid && robotReady ? 'secondary' : 'primary'}
                  size="sm"
                  isDisabled={!testing && !robotReady}
                  onPress={handleLaunchTest}
                  className={testing ? '!bg-red-500' : ''}
                >
                  {testing ? '■ Arrêter' : '▶ Lancer le test'}
                </Button>
              </div>

              <div className="flex-1" />

              <Button variant="outline" size="sm" onPress={() => setTeamModalOpen(true)}>
                <ArrowRightArrowLeft />
                Échanges robots
              </Button>

              <Button variant="primary" size="sm" onPress={() => go('manual-control')} className="!bg-gray-700">
                <Sliders />
                Opération manuelle
              </Button>
            </div>

            {/* Tree */}
            <div className="flex-1 min-h-0 rounded-xl rounded-tl-none overflow-hidden border border-gray-100 bg-white">
              <ReactFlowProvider>
                <DecisionTree
                  ref={decisionTreeRef}
                  testing={testing}
                  onValidationChange={setErrors}
                  onActiveQuestionChange={handleActiveQuestion}
                />
              </ReactFlowProvider>
            </div>
          </div>
        </div>

        {/* Right — Guide + Data (1/3) */}
        <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 0' }}>
          <div className="flex flex-col gap-3 p-6 border-b overflow-y-auto" style={{ flex: '1 1 0' }}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 shrink-0">Guide</h3>
            <TodoList
              hasReadyRobot={Object.values(statuses).some(s => s === 'ready')}
              hasSelectedRobot={!!controledRobot}
              testing={testing}
            />
          </div>

          <div className="flex flex-col gap-3 p-6 overflow-y-auto" style={{ flex: '1 1 0' }}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 shrink-0">Données</h3>
            <div className="flex-1 min-h-0 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
              <p className="text-gray-300 text-sm">À définir</p>
            </div>
          </div>
        </div>
      </div>

      <TeamModal isOpen={teamModalOpen} onClose={() => setTeamModalOpen(false)} />
    </div>
  );
}

/* ── RobotDot ─────────────────────────────────────────────── */

function RobotDot({
  hex,
  label,
  displayState: ds,
  selected,
  locked = false,
  onClick,
}: {
  hex: string;
  label: string;
  displayState: 'ready' | 'connecting' | 'unavailable';
  selected: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  const clickable = ds === 'ready' && !locked;

  return (
    <div className="relative w-7 h-7" title={`${label} — ${ds}`}>
      {/* Spinning ring while connecting */}
      {ds === 'connecting' && (
        <span
          className="absolute inset-0 rounded-full border-2 border-gray-600 animate-spin pointer-events-none"
          style={{ borderTopColor: 'transparent' }}
        />
      )}

      <button
        onClick={onClick}
        disabled={!clickable}
        style={{
          backgroundColor: hex,
          opacity: ds === 'ready' ? (locked && !selected ? 0.35 : 1) : 0.35,
        }}
        className={`absolute inset-0 rounded-full border-2 flex items-center justify-center
          text-white text-xs font-bold leading-none transition-all
          ${
            clickable
              ? selected
                ? 'border-gray-800 scale-110 shadow cursor-pointer'
                : 'border-transparent hover:border-gray-400 hover:scale-105 cursor-pointer'
              : 'border-transparent cursor-default'
          }`}
      >
        {selected && '✓'}
      </button>
    </div>
  );
}

/* ── TodoList ─────────────────────────────────────────────── */

function TodoItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-start gap-3 text-sm ${done ? 'text-gray-400' : 'text-gray-700'}`}>
      <span
        className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 text-xs ${
          done ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'
        }`}
      >
        {done && '✓'}
      </span>
      <span className={done ? 'line-through' : ''}>{label}</span>
    </div>
  );
}

function TodoList({
  hasReadyRobot,
  hasSelectedRobot,
  testing,
}: {
  hasReadyRobot: boolean;
  hasSelectedRobot: boolean;
  testing: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <TodoItem done={hasReadyRobot} label="Robot connecté et prêt" />
      <TodoItem done={hasSelectedRobot} label="Sélectionner un robot" />
      <TodoItem done={false} label="Construire l'arbre de décision" />
      <TodoItem done={testing} label="Lancer le test" />
      <TodoItem done={false} label="Valider le comportement" />
    </div>
  );
}

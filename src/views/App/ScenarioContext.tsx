import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from 'react';
import { Toast } from '@heroui/react/toast';
import { thymioManagerFactory } from '../../Entities/ThymioManager';
import { tdmConnectionEvents } from '../../Entities/ThymioManager/tdmConnectionEvents';
import type { Users } from '../../Entities/ThymioManager/Model/users.model';
import { useLocalStorage } from '../../helpers/useLocalStorage';
import { clearSavedTree } from './components/DecisionTree';

export type Step = 'welcome' | 'team-split' | 'software-main' | 'data-management' | 'final-main';

export const ROBOT_COLORS = [
  { id: 'red', label: 'Rouge', hex: '#ef4444' },
  { id: 'blue', label: 'Bleu', hex: '#3b82f6' },
  { id: 'green', label: 'Vert', hex: '#22c55e' },
  { id: 'yellow', label: 'Jaune', hex: '#d2e903' },
  { id: 'cyan', label: 'Cyan', hex: '#06b6d4' },
  { id: 'pink', label: 'Rose', hex: '#ec4899' },
] as const;

export type RobotColor = (typeof ROBOT_COLORS)[number]['id'];

export type RobotConfig = {
  uuid: string;
  color: RobotColor;
};

export type RobotTeam = 'terrain' | 'bureau';

type ScenarioState = {
  user: Users;
  step: Step;
  go: (step: Step) => void;
  controledRobot: string;
  /** Switch the active robot without re-initializing. */
  selectRobot: (uuid: string) => void;
  /** Lock + program a robot for a session. Optional callback receives variable-change events. */
  initializeRobot: (
    uuid: string,
    onEvent?: (uuid: string, events: { [name: string]: number }) => void
  ) => Promise<void>;
  robotConfigs: RobotConfig[];
  setRobotConfigs: (configs: RobotConfig[]) => void;
  /** Map of robot UUID → team assignment. Empty until assignTeams() is called. */
  robotTeams: Record<string, RobotTeam>;
  setRobotTeams: (teams: Record<string, RobotTeam>) => void;
  /** Assign first half of robotConfigs to 'terrain', second half to 'bureau'. */
  assignTeams: () => void;
  resetApp: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
};

const user = thymioManagerFactory({ user: 'AllUser', activity: 'ThymioIA', hosts: ['localhost'] });

const ScenarioContext = createContext<ScenarioState | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useLocalStorage<Step>('scenario:step', 'welcome');
  const [controledRobot, setControledRobot] = useLocalStorage<string>('scenario:robot', '');
  const [robotConfigs, setRobotConfigs] = useLocalStorage<RobotConfig[]>('scenario:robots', []);
  const [robotTeams, setRobotTeams] = useLocalStorage<Record<string, RobotTeam>>('scenario:teams', {});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    let errorToastKey: string | null = null;
    const unsub = tdmConnectionEvents.subscribe((connected) => {
      if (connected) {
        if (errorToastKey) {
          Toast.toast.close(errorToastKey);
          errorToastKey = null;
        }
        Toast.toast.success('Connecté à ThymioSuite');
      } else if (!errorToastKey) {
        errorToastKey = Toast.toast.warning('Impossible de se connecter à ThymioSuite', {
          description: "Vérifier que l'application est ouverte",
          timeout: 0,
          isLoading: true,
        });
      }
    });
    return () => { unsub(); };
  }, []);

  const initializeRobot = useCallback(
    (uuid: string, onEvent?: (uuid: string, events: { [name: string]: number }) => void) =>
      user.takeControl(uuid, onEvent),
    []
  );

  const selectRobot = useCallback(
    (uuid: string) => {
      setControledRobot(uuid);
    },
    [setControledRobot]
  );

  const assignTeams = useCallback(() => {
    const half = Math.ceil(robotConfigs.length / 2);
    const teams: Record<string, RobotTeam> = {};
    robotConfigs.forEach((r, i) => {
      teams[r.uuid] = i < half ? 'terrain' : 'bureau';
    });
    setRobotTeams(teams);
  }, [robotConfigs, setRobotTeams]);

  // Keep a ref so the auto-assign effect always reads latest teams without re-triggering.
  const robotTeamsRef = useRef(robotTeams);
  robotTeamsRef.current = robotTeams;

  // Auto-assign robots added after team-split (when teams have already been initialized).
  useEffect(() => {
    const currentTeams = robotTeamsRef.current;
    if (Object.keys(currentTeams).length === 0) {
      return;
    } // teams not initialized yet
    const unassigned = robotConfigs.filter(r => !(r.uuid in currentTeams));
    if (unassigned.length === 0) {
      return;
    }

    let tc = Object.values(currentTeams).filter(t => t === 'terrain').length;
    let bc = Object.values(currentTeams).filter(t => t === 'bureau').length;
    const updated = { ...currentTeams };
    for (const r of unassigned) {
      const t: RobotTeam = tc <= bc ? 'terrain' : 'bureau';
      updated[r.uuid] = t;
      if (t === 'terrain') {
        tc++;
      } else {
        bc++;
      }
    }
    setRobotTeams(updated);
  }, [robotConfigs]);

  const resetApp = () => {
    clearSavedTree();
    setStep('welcome');
    setControledRobot('');
    setRobotConfigs([]);
    setRobotTeams({});
  };

  return (
    <ScenarioContext.Provider
      value={{
        user,
        step,
        go: setStep,
        controledRobot,
        selectRobot,
        initializeRobot,
        robotConfigs,
        setRobotConfigs,
        robotTeams,
        setRobotTeams,
        assignTeams,
        resetApp,
        isSettingsOpen,
        openSettings: () => setIsSettingsOpen(true),
        closeSettings: () => setIsSettingsOpen(false),
      }}
    >
      {children}
    </ScenarioContext.Provider>
  );
}

export function useScenario(): ScenarioState {
  const ctx = useContext(ScenarioContext);
  if (!ctx) {
    throw new Error('useScenario must be used within ScenarioProvider');
  }
  return ctx;
}

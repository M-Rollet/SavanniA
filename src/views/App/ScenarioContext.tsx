import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from 'react';
import { Toast } from '@heroui/react/toast';
import { thymioManagerFactory } from '../../Entities/ThymioManager';
import { tdmConnectionEvents } from '../../Entities/ThymioManager/tdmConnectionEvents';
import type { Users } from '../../Entities/ThymioManager/Model/users.model';
import { useLocalStorage } from '../../helpers/useLocalStorage';
import { clearSavedTree } from './components/DecisionTree';
import { getStepDef, STEP_DEFS, type RobotEntry, type ExternalRobotEntry } from './steps/stepDefinitions';

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
  /** 0 = welcome screen, 1-7 = main activity steps (see stepDefinitions.ts). */
  stepIndex: number;
  /** Advance to the next step, if the current step's canAdvance condition is met. */
  advanceStep: () => void;
  /** Jump directly to a given step (used to leave the welcome screen, or to go back). */
  goToStep: (index: number) => void;
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
  /** Map of robot UUID → team assignment. Empty until set via the team-switch modal (step 4+). */
  robotTeams: Record<string, RobotTeam>;
  setRobotTeams: (teams: Record<string, RobotTeam>) => void;
  /** Test results & terrain observations for real robots, keyed by Thymio UUID. */
  physicalRobotData: Record<string, RobotEntry>;
  setPhysicalRobotData: (data: Record<string, RobotEntry>) => void;
  /** Injected non-physical robot dataset (step 5+), kept separate to avoid UUID collisions. */
  externalDataset: ExternalRobotEntry[];
  setExternalDataset: (data: ExternalRobotEntry[]) => void;
  resetApp: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
};

const user = thymioManagerFactory({ user: 'AllUser', activity: 'ThymioIA', hosts: ['localhost'] });

const ScenarioContext = createContext<ScenarioState | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [stepIndex, setStepIndex] = useLocalStorage<number>('scenario:stepIndex', 0);
  const [controledRobot, setControledRobot] = useLocalStorage<string>('scenario:robot', '');
  const [robotConfigs, setRobotConfigs] = useLocalStorage<RobotConfig[]>('scenario:robots', []);
  const [robotTeams, setRobotTeams] = useLocalStorage<Record<string, RobotTeam>>('scenario:teams', {});
  const [physicalRobotData, setPhysicalRobotData] = useLocalStorage<Record<string, RobotEntry>>(
    'scenario:physicalRobotData',
    {}
  );
  const [externalDataset, setExternalDataset] = useLocalStorage<ExternalRobotEntry[]>('scenario:externalDataset', []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    let errorToastKey: string | null = null;
    const unsub = tdmConnectionEvents.subscribe(connected => {
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
    return () => {
      unsub();
    };
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

  const goToStep = useCallback(
    (index: number) => {
      setStepIndex(index);
    },
    [setStepIndex]
  );

  const advanceStep = useCallback(() => {
    const current = getStepDef(stepIndex);
    if (stepIndex >= STEP_DEFS.length) {
      return;
    }
    if (!current.canAdvance({ physicalRobotData, robotConfigs })) {
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [stepIndex, physicalRobotData, robotConfigs, setStepIndex]);

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
    setStepIndex(0);
    setControledRobot('');
    setRobotConfigs([]);
    setRobotTeams({});
    setPhysicalRobotData({});
    setExternalDataset([]);
  };

  return (
    <ScenarioContext.Provider
      value={{
        user,
        stepIndex,
        advanceStep,
        goToStep,
        controledRobot,
        selectRobot,
        initializeRobot,
        robotConfigs,
        setRobotConfigs,
        robotTeams,
        setRobotTeams,
        physicalRobotData,
        setPhysicalRobotData,
        externalDataset,
        setExternalDataset,
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

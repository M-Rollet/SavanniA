import './App.css';
import { ReactFlowProvider } from '@xyflow/react';
import { Toast } from '@heroui/react/toast';
import { ScenarioProvider, useScenario } from './ScenarioContext';
import { Welcome } from './steps/Welcome';
import { TeamSplit } from './steps/TeamSplit';
import { SoftwareMain } from './steps/SoftwareMain';
import { ManualControl } from './steps/ManualControl';
import { DataManagement } from './steps/DataManagement';
import { FinalMain } from './steps/FinalMain';
import { SettingsOverlay } from './components/SettingsOverlay';
import { SettingsButton } from './components/SettingsButton';

function ScenarioRouter() {
  const { step } = useScenario();
  return (
    <div className="scenario">
      {step === 'welcome' && <Welcome />}
      {step === 'team-split' && <TeamSplit />}
      {step === 'software-main' && <SoftwareMain />}
      {step === 'manual-control' && <ManualControl />}
      {step === 'data-management' && <DataManagement />}
      {step === 'final-main' && (
        <ReactFlowProvider>
          <FinalMain />
        </ReactFlowProvider>
      )}
    </div>
  );
}

function App() {
  return (
    <ScenarioProvider>
      <ScenarioRouter />
      <SettingsButton />
      <SettingsOverlay />
      <Toast.Provider placement="bottom" />
    </ScenarioProvider>
  );
}

export default App;

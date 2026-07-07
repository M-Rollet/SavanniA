import './App.css';
import { Toast } from '@heroui/react/toast';
import { ScenarioProvider, useScenario } from './ScenarioContext';
import { Welcome } from './steps/Welcome';
import { SoftwareMain } from './steps/SoftwareMain';
import { SettingsOverlay } from './components/SettingsOverlay';
import { SettingsButton } from './components/SettingsButton';

function ScenarioRouter() {
  const { stepIndex } = useScenario();
  return <div className="scenario">{stepIndex === 0 ? <Welcome /> : <SoftwareMain />}</div>;
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

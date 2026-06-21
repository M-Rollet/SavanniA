import { Gear } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';

export function SettingsButton() {
  const { openSettings } = useScenario();
  return (
    <button
      onClick={openSettings}
      aria-label="Paramètres robots"
      className="fixed top-3 right-3 z-40 w-10 h-10 rounded-full bg-white/80 backdrop-blur flex items-center justify-center shadow-md hover:bg-white transition-colors"
    >
      <Gear className="w-5 h-5 text-gray-600" />
    </button>
  );
}

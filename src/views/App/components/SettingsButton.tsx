import { Gear } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { Button } from '@heroui/react';

export function SettingsButton() {
  const { openSettings } = useScenario();
  return (
    <Button
      isIconOnly
      variant="ghost"
      size="sm"
      aria-label="Paramètres robots"
      className="fixed top-3 right-3 z-40"
      onPress={openSettings}
    >
      <Gear />
    </Button>
  );
}

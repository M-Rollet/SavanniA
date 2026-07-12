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
      // Stays reachable above every modal and the guided tour's dimming overlay (z-[99999] in
      // TourOverlay) — see the matching z-index on SettingsOverlay's Modal.Backdrop.
      className="fixed top-3 right-3 z-[100000]"
      onPress={openSettings}
    >
      <Gear />
    </Button>
  );
}

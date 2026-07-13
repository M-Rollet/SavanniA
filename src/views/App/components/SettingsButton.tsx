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
      // TourOverlay) — see the matching z-index on SettingsOverlay's Modal.Backdrop. The
      // data-react-aria-top-layer attribute is the other half of that: any open React Aria Modal
      // (e.g. TerrainModal, which stays open for all of step 3) calls ariaHideOutside with
      // shouldUseInert, which sets `inert` on every element outside the modal — a z-index can't
      // out-rank that, only this attribute (the same one useToastRegion uses) opts an element out.
      className="fixed top-3 right-3 z-[100000]"
      data-react-aria-top-layer="true"
      onPress={openSettings}
    >
      <Gear />
    </Button>
  );
}

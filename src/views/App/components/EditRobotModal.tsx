import { Modal, useOverlayState, Button } from '@heroui/react';
import { Pencil, Eye, Lock } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { EMPTY_ROBOT_ENTRY, getStepDef, type Criterion, type RobotEntry } from '../steps/stepDefinitions';
import { TOUR_ADVANCE_DELAY_MS, TOUR_INTERLUDE_1 } from './TourOverlay';

interface Props {
  uuid: string | null;
  label: string;
  onClose: () => void;
  /** Pre-resolved entry to display (e.g. external/dataset robots not tracked in physicalRobotData). Always read-only. */
  entryOverride?: RobotEntry;
}

export const BOOL_OPTIONS = [
  { value: 1, label: 'OK' },
  { value: 0, label: 'Cassé' },
];

export const NOISE_OPTIONS = [
  { value: 0, label: 'Faible' },
  { value: 1, label: 'Fort' },
];

export const BATTERY_OPTIONS = [
  { value: 0, label: 'Faible' },
  { value: 1, label: 'Moyenne' },
  { value: 2, label: 'Pleine' },
];

function ToggleRow({
  label,
  value,
  onChange,
  options,
  locked,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  options: { value: number; label: string }[];
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
        {label}
        {locked && <Lock width={11} height={11} className="text-gray-300" />}
      </span>
      <div className="flex gap-1.5">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => !locked && onChange(o.value)}
            disabled={locked}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
              value === o.value
                ? locked
                  ? 'border-gray-300 bg-gray-100 text-gray-500'
                  : 'border-blue-400 bg-blue-50 text-blue-700'
                : locked
                ? 'border-gray-100 text-gray-300 cursor-not-allowed'
                : 'border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EditRobotModal({ uuid, label, onClose, entryOverride }: Props) {
  const { stepIndex, physicalRobotData, setPhysicalRobotData, tourStep, setTourStep } = useScenario();
  const isOpen = uuid !== null;
  const editableStep = !entryOverride && getStepDef(stepIndex).features.dataEditable;

  const state = useOverlayState({
    isOpen,
    onOpenChange: open => {
      if (!open) {
        onClose();
      }
    },
  });

  const entry = entryOverride ?? ((uuid && physicalRobotData[uuid]) || EMPTY_ROBOT_ENTRY);
  // While the tour is walking the student through this modal (asking them to set the light, then
  // to click Terminé), lock everything else: no backdrop/Escape/close-trigger dismissal, and the
  // other criteria stay non-interactive so the light row is the only thing they can act on.
  const tourLockingModal = tourStep === 6 || tourStep === 7;

  const setCriterion = (criterion: Criterion, value: number) => {
    if (!uuid || !editableStep || entry.lockedCriteria[criterion]) {
      return;
    }
    setPhysicalRobotData({
      ...physicalRobotData,
      [uuid]: { ...entry, testResults: { ...entry.testResults, [criterion]: value } },
    });
    if (tourStep === 6 && criterion === 'light_working') {
      setTimeout(() => setTourStep(7), TOUR_ADVANCE_DELAY_MS);
    }
  };

  const handleTerminate = () => {
    onClose();
    if (tourStep === 7) {
      setTimeout(() => setTourStep(TOUR_INTERLUDE_1), TOUR_ADVANCE_DELAY_MS);
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={!tourLockingModal} isKeyboardDismissDisabled={tourLockingModal}>
        <Modal.Container size="md">
          <Modal.Dialog data-tour="edit-modal">
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2">
                {editableStep ? <Pencil width={16} height={16} /> : <Eye width={16} height={16} />}
                {editableStep ? 'Modifier' : 'Détails'} — {label}
              </Modal.Heading>
              {!tourLockingModal && <Modal.CloseTrigger />}
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <ToggleRow
                label="Lumière"
                value={entry.testResults.light_working}
                onChange={v => setCriterion('light_working', v)}
                options={BOOL_OPTIONS}
                locked={!editableStep || entry.lockedCriteria.light_working}
              />
              <ToggleRow
                label="Capteurs distance"
                value={entry.testResults.ir_working}
                onChange={v => setCriterion('ir_working', v)}
                options={BOOL_OPTIONS}
                locked={!editableStep || entry.lockedCriteria.ir_working || tourStep === 6}
              />
              <ToggleRow
                label="Bruit moteur"
                value={entry.testResults.motor_noise}
                onChange={v => setCriterion('motor_noise', v)}
                options={NOISE_OPTIONS}
                locked={!editableStep || entry.lockedCriteria.motor_noise || tourStep === 6}
              />
              <ToggleRow
                label="Batterie"
                value={entry.testResults.battery_level}
                onChange={v => setCriterion('battery_level', v)}
                options={BATTERY_OPTIONS}
                locked={!editableStep || entry.lockedCriteria.battery_level || tourStep === 6}
              />
              {entry.observation?.notes && (
                <div className="flex flex-col gap-1 pt-1 border-t border-gray-100">
                  <span className="text-sm font-medium text-gray-700">Notes du terrain</span>
                  <p className="text-sm text-gray-500 whitespace-pre-wrap">{entry.observation.notes}</p>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <div data-tour="terminate-button">
                <Button variant="primary" onClick={handleTerminate} isDisabled={tourStep === 6}>
                  Terminé
                </Button>
              </div>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

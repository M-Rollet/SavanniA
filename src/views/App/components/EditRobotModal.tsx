import { Modal, useOverlayState, Button } from '@heroui/react';
import { Pencil, Eye, Lock } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { EMPTY_ROBOT_ENTRY, type Criterion, type RobotEntry } from '../steps/stepDefinitions';

interface Props {
  uuid: string | null;
  label: string;
  onClose: () => void;
  /** Pre-resolved entry to display (e.g. external/dataset robots not tracked in physicalRobotData). Always read-only. */
  entryOverride?: RobotEntry;
}

const BOOL_OPTIONS = [
  { value: 1, label: 'Oui' },
  { value: 0, label: 'Non' },
];

const BATTERY_OPTIONS = [
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
  const { stepIndex, physicalRobotData, setPhysicalRobotData } = useScenario();
  const isOpen = uuid !== null;
  const editableStep = !entryOverride && stepIndex === 2;

  const state = useOverlayState({
    isOpen,
    onOpenChange: open => {
      if (!open) {
        onClose();
      }
    },
  });

  const entry = entryOverride ?? ((uuid && physicalRobotData[uuid]) || EMPTY_ROBOT_ENTRY);

  const setCriterion = (criterion: Criterion, value: number) => {
    if (!uuid || !editableStep || entry.lockedCriteria[criterion]) {
      return;
    }
    setPhysicalRobotData({
      ...physicalRobotData,
      [uuid]: { ...entry, testResults: { ...entry.testResults, [criterion]: value } },
    });
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading className="flex items-center gap-2">
                {editableStep ? <Pencil width={16} height={16} /> : <Eye width={16} height={16} />}
                {editableStep ? 'Modifier' : 'Détails'} — {label}
              </Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <ToggleRow
                label="Phares"
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
                locked={!editableStep || entry.lockedCriteria.ir_working}
              />
              <ToggleRow
                label="Bruit moteur"
                value={entry.testResults.motor_noise}
                onChange={v => setCriterion('motor_noise', v)}
                options={BOOL_OPTIONS}
                locked={!editableStep || entry.lockedCriteria.motor_noise}
              />
              <ToggleRow
                label="Batterie"
                value={entry.testResults.battery_level}
                onChange={v => setCriterion('battery_level', v)}
                options={BATTERY_OPTIONS}
                locked={!editableStep || entry.lockedCriteria.battery_level}
              />
            </Modal.Body>

            <Modal.Footer>
              <Button variant="primary" onClick={onClose}>
                Terminé
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

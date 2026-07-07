import { ROBOT_COLORS, useScenario } from '../ScenarioContext';
import type { Criterion, RobotEntry } from '../steps/stepDefinitions';

const CRITERIA: Criterion[] = ['light_working', 'ir_working', 'motor_noise', 'battery_level'];

const CRITERIA_LABELS: Record<Criterion, string> = {
  light_working: 'Phares',
  ir_working: 'Capteurs IR',
  motor_noise: 'Moteur',
  battery_level: 'Batterie',
};

function formatValue(criterion: Criterion, value: number | undefined): string {
  if (value === undefined) {
    return '–';
  }
  if (criterion === 'battery_level') {
    return ['Faible', 'Moyenne', 'Pleine'][value] ?? '–';
  }
  return value === 1 ? 'Oui' : 'Non';
}

type Row = { key: string; label: string; color?: string; entry: RobotEntry | undefined };

export function DataTable() {
  const { robotConfigs, physicalRobotData, externalDataset } = useScenario();

  const rows: Row[] = [
    ...robotConfigs.map(r => {
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      return { key: r.uuid, label: colorDef?.label ?? r.color, color: colorDef?.hex, entry: physicalRobotData[r.uuid] };
    }),
    ...externalDataset.map(e => ({ key: e.id, label: e.label, color: undefined, entry: e as RobotEntry })),
  ];

  if (rows.length === 0) {
    return <p className="text-gray-300 text-sm">Aucun robot configuré</p>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="text-left font-medium text-gray-400 pb-2">Robot</th>
            {CRITERIA.map(c => (
              <th key={c} className="text-left font-medium text-gray-400 pb-2 px-2">
                {CRITERIA_LABELS[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className="border-t border-gray-100">
              <td className="py-1.5 pr-2">
                <span className="flex items-center gap-2">
                  {row.color ? (
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                  ) : (
                    <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-gray-300" />
                  )}
                  {row.label}
                </span>
              </td>
              {CRITERIA.map(c => (
                <td key={c} className="py-1.5 px-2 text-gray-600">
                  {formatValue(c, row.entry?.testResults[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

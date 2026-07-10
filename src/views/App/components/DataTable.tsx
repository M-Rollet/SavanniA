import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil } from '@gravity-ui/icons';
import { ROBOT_COLORS, useScenario } from '../ScenarioContext';
import { classifyWithAlgoTree, getStepDef, type Criterion, type RobotEntry } from '../steps/stepDefinitions';
import { getWrongCriteria } from '../robotProfiles';
import { EditRobotModal, BOOL_OPTIONS, NOISE_OPTIONS, BATTERY_OPTIONS } from './EditRobotModal';

const CRITERIA: Criterion[] = ['light_working', 'ir_working', 'motor_noise', 'battery_level'];

const CRITERIA_LABELS: Record<Criterion, string[]> = {
  light_working: ['Lumière'],
  ir_working: ['Capteurs', 'distance'],
  motor_noise: ['Bruit', 'moteur'],
  battery_level: ['Batterie'],
};

const CRITERIA_OPTIONS: Record<Criterion, { value: number; label: string }[]> = {
  light_working: BOOL_OPTIONS,
  ir_working: BOOL_OPTIONS,
  motor_noise: NOISE_OPTIONS,
  battery_level: BATTERY_OPTIONS,
};

function formatValue(criterion: Criterion, value: number | undefined): string {
  if (value === undefined) {
    return '–';
  }
  return CRITERIA_OPTIONS[criterion].find(o => o.value === value)?.label ?? '–';
}

function formatResult(category: 'ready' | 'repair' | undefined): string {
  if (!category) {
    return '–';
  }
  return category === 'ready' ? 'Partir' : 'Réparer';
}

type Row = {
  key: string;
  label: string;
  color?: string;
  uuid?: string;
  entry: RobotEntry | undefined;
  isExternal: boolean;
  arrivalIndex?: number;
};

export function DataTable() {
  const { stepIndex, robotConfigs, physicalRobotData, externalDataset, dataCheckFailed, algorithmTree, manualTree } =
    useScenario();
  const [editingUuid, setEditingUuid] = useState<string | null>(null);

  const stepDef = getStepDef(stepIndex);
  const activeTree = stepDef.features.algorithmMode ? algorithmTree : manualTree;
  const showResult = stepIndex !== 2;
  const wrongCells = useMemo(
    () => (dataCheckFailed ? getWrongCriteria(robotConfigs, physicalRobotData) : null),
    [dataCheckFailed, robotConfigs, physicalRobotData]
  );

  const rows: Row[] = [
    ...robotConfigs.map(r => {
      const colorDef = ROBOT_COLORS.find(c => c.id === r.color);
      return {
        key: r.uuid,
        label: colorDef?.label ?? r.color,
        color: colorDef?.hex,
        uuid: r.uuid,
        entry: physicalRobotData[r.uuid],
        isExternal: false,
      };
    }),
    ...externalDataset.map((e, i) => ({
      key: e.id,
      label: e.label,
      color: '#94a3b8',
      uuid: undefined,
      entry: e as RobotEntry,
      isExternal: true,
      arrivalIndex: i,
    })),
  ];

  const editingLabel = rows.find(r => r.uuid === editingUuid)?.label ?? '';

  if (rows.length === 0) {
    return <p className="text-gray-300 text-sm">Aucun robot configuré</p>;
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left align-top font-medium text-gray-400 px-3 py-2 border border-gray-200">Robot</th>
            {CRITERIA.map(c => (
              <th
                key={c}
                className="text-left align-top font-medium text-gray-400 px-2 py-2 leading-tight border border-gray-200"
              >
                {CRITERIA_LABELS[c].map(word => (
                  <span key={word} className="block">
                    {word}
                  </span>
                ))}
              </th>
            ))}
            <th className="text-left align-top font-medium text-gray-400 px-2 py-2 border border-gray-200">
              Prédiction
            </th>
            {showResult && (
              <th className="text-left align-top font-medium text-gray-400 px-2 py-2 border border-gray-200">
                Résultat attendu
              </th>
            )}
            <th className="w-8 border border-gray-200" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            // Steps 1-3: the prediction only appears once a robot has actually been run through
            // the tree (same "tested" condition step 2 requires to advance) — it doesn't silently
            // update from data typed straight into the table. From step 4 on it tracks live.
            const canPredict = stepIndex > 3 || row.entry?.tested === true;
            const predicted =
              activeTree && canPredict ? classifyWithAlgoTree(activeTree, row.entry?.testResults ?? {}) : null;
            const observed = row.entry?.observation?.category;
            const mismatch = showResult && !!predicted && !!observed && predicted !== observed;
            return (
              <motion.tr
                key={row.key}
                initial={row.isExternal ? { opacity: 0, x: 24 } : false}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, delay: (row.arrivalIndex ?? 0) * 0.12 }}
                onClick={() => row.uuid && setEditingUuid(row.uuid)}
                className={`hover:bg-gray-50/60 transition-colors ${row.uuid ? 'cursor-pointer' : ''}`}
              >
                <td className="px-3 py-2 border border-gray-100">
                  <span className="flex items-center gap-2">
                    {row.color ? (
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                    ) : (
                      <span className="w-3 h-3 rounded-full shrink-0 border border-dashed border-gray-300" />
                    )}
                    {row.label}
                  </span>
                </td>
                {CRITERIA.map(c => {
                  const value = row.entry?.testResults[c];
                  const isWrong = !!row.uuid && wrongCells?.has(`${row.uuid}-${c}`);
                  return (
                    <td
                      key={c}
                      data-cell={row.uuid ? `${row.uuid}-${c}` : undefined}
                      className={`px-2 py-2 text-gray-600 border overflow-hidden ${
                        isWrong ? 'bg-yellow-100 border-yellow-300' : 'border-gray-100'
                      }`}
                    >
                      <motion.span
                        key={value ?? 'empty'}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.3 }}
                        className="inline-block"
                      >
                        {formatValue(c, value)}
                      </motion.span>
                    </td>
                  );
                })}
                <td
                  data-cell={row.uuid ? `${row.uuid}-prediction` : undefined}
                  className={`px-2 py-2 text-gray-600 border overflow-hidden ${
                    mismatch ? 'bg-red-100 border-red-300' : 'border-gray-100'
                  }`}
                >
                  <motion.span
                    key={predicted ?? 'empty'}
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3 }}
                    className="inline-block"
                  >
                    {formatResult(predicted ?? undefined)}
                  </motion.span>
                </td>
                {showResult && (
                  <td
                    className={`px-2 py-2 text-gray-600 border ${
                      mismatch ? 'bg-red-100 border-red-300' : 'border-gray-100'
                    }`}
                  >
                    {formatResult(observed)}
                  </td>
                )}
                <td className="px-2 py-2 border border-gray-100">
                  {row.uuid && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setEditingUuid(row.uuid!);
                      }}
                      className="text-gray-300 hover:text-gray-600 transition-colors"
                      aria-label="Modifier"
                    >
                      <Pencil width={14} height={14} />
                    </button>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>

      <EditRobotModal uuid={editingUuid} label={editingLabel} onClose={() => setEditingUuid(null)} />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Pencil, CheckShape, Ban } from '@gravity-ui/icons';
import { ROBOT_COLORS, useScenario } from '../ScenarioContext';
import { EMPTY_ROBOT_ENTRY, type Criterion, type RobotEntry } from '../steps/stepDefinitions';
import { getWrongCriteria } from '../robotProfiles';
import { EditRobotModal } from './EditRobotModal';
import './TreeNodes.css';

const CRITERIA: Criterion[] = ['light_working', 'ir_working', 'motor_noise', 'battery_level'];

const CRITERIA_LABELS: Record<Criterion, string[]> = {
  light_working: ['Phares'],
  ir_working: ['Capteurs', 'distance'],
  motor_noise: ['Bruit', 'moteur'],
  battery_level: ['Batterie'],
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
  const {
    stepIndex,
    robotConfigs,
    physicalRobotData,
    setPhysicalRobotData,
    externalDataset,
    dataCheckFailed,
    correctedCriteria,
  } = useScenario();
  const [editingUuid, setEditingUuid] = useState<string | null>(null);

  // Terrain result column only appears once terrain observations exist (step 3 onward).
  const showResult = stepIndex >= 3;
  // The student's own GO/STAY commitment (PRIMM Predict): filled inline here in step 1 (their guess
  // from observation), then shown read-only in step 2 beside the tree's verdict so agreement or
  // disagreement is visible the moment a robot lands on a leaf.
  const showPrediction = stepIndex === 1 || stepIndex === 2;
  const canEditPrediction = stepIndex === 1;
  // In the bilan phase (step 4) the frozen lab verdict stays visible next to the terrain result,
  // so the student can see which robots the tree misjudged while they fix it.
  const showLabVerdict = stepIndex === 4;
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

  const setPrediction = (uuid: string, prediction: 'ready' | 'repair') => {
    const entry = physicalRobotData[uuid] ?? EMPTY_ROBOT_ENTRY;
    setPhysicalRobotData({ ...physicalRobotData, [uuid]: { ...entry, prediction } });
  };

  if (rows.length === 0) {
    return <p className="text-gray-300 text-sm">Aucun robot configuré</p>;
  }

  return (
    <div className="overflow-auto rounded-xl border border-gray-200">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left font-medium text-gray-400 px-3 py-2 border border-gray-200">Robot</th>
            {CRITERIA.map(c => (
              <th
                key={c}
                className="text-left font-medium text-gray-400 px-2 py-2 leading-tight border border-gray-200"
              >
                {CRITERIA_LABELS[c].map(word => (
                  <span key={word} className="block">
                    {word}
                  </span>
                ))}
              </th>
            ))}
            {showPrediction && (
              <th className="text-left font-medium text-gray-400 px-2 py-2 border border-gray-200">Pronostic</th>
            )}
            {showLabVerdict && (
              <th className="text-left font-medium text-gray-400 px-2 py-2 border border-gray-200">Labo</th>
            )}
            {showResult && (
              <th className="text-left font-medium text-gray-400 px-2 py-2 border border-gray-200">
                {showLabVerdict ? 'Terrain' : 'Résultat attendu'}
              </th>
            )}
            <th className="w-8 border border-gray-200" />
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
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
                const priorManualValue = row.uuid ? correctedCriteria[`${row.uuid}-${c}`] : undefined;
                const isCorrected = priorManualValue !== undefined;
                return (
                  <td
                    key={c}
                    data-cell={row.uuid ? `${row.uuid}-${c}` : undefined}
                    title={
                      isCorrected
                        ? `Tu avais noté « ${formatValue(c, priorManualValue)} », le test mesure « ${formatValue(
                            c,
                            value
                          )} ».`
                        : undefined
                    }
                    className={`relative px-2 py-2 text-gray-600 border overflow-hidden ${
                      isWrong ? 'bg-yellow-100 border-yellow-300' : isCorrected ? 'border-amber-300' : 'border-gray-100'
                    }`}
                  >
                    {isCorrected && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
                    )}
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
              {showPrediction && (
                <td className="px-1 py-1.5 border border-gray-100">
                  {row.uuid && canEditPrediction ? (
                    <div className="node flex gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        data-value="true"
                        data-selected={row.entry?.prediction === 'ready' || undefined}
                        onClick={() => setPrediction(row.uuid!, 'ready')}
                        title="Prêt à partir"
                        className="decision-btn flex items-center justify-center px-1.5 py-1 rounded-md border transition-all"
                      >
                        <CheckShape width={12} height={12} />
                      </button>
                      <button
                        data-value="false"
                        data-selected={row.entry?.prediction === 'repair' || undefined}
                        onClick={() => setPrediction(row.uuid!, 'repair')}
                        title="À réparer"
                        className="decision-btn flex items-center justify-center px-1.5 py-1 rounded-md border transition-all"
                      >
                        <Ban width={12} height={12} />
                      </button>
                    </div>
                  ) : (
                    <span className="px-1 text-gray-600">{formatResult(row.entry?.prediction ?? undefined)}</span>
                  )}
                </td>
              )}
              {(() => {
                const lab = row.entry?.labVerdict ?? null;
                const terrain = row.entry?.observation?.category ?? null;
                const labWrong = showLabVerdict && lab != null && terrain != null && lab !== terrain;
                return (
                  <>
                    {showLabVerdict && (
                      <td
                        className={`px-2 py-2 border border-gray-100 ${
                          labWrong ? 'bg-red-50 text-red-600 font-medium' : 'text-gray-600'
                        }`}
                      >
                        {formatResult(lab ?? undefined)}
                      </td>
                    )}
                    {showResult && (
                      <td className="px-2 py-2 text-gray-600 border border-gray-100">
                        {formatResult(row.entry?.observation?.category)}
                      </td>
                    )}
                  </>
                );
              })()}
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
          ))}
        </tbody>
      </table>

      <EditRobotModal uuid={editingUuid} label={editingLabel} onClose={() => setEditingUuid(null)} />
    </div>
  );
}

import { Modal, useOverlayState, Button } from '@heroui/react';
import { Person, Flask, Globe, CheckShape, Ban, Xmark } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import { useLocalStorage } from '../../../helpers/useLocalStorage';
import thymioRed from '../../../assets/thymio_icon_red.svg';
import thymioBlue from '../../../assets/thymio_icon_blue.svg';
import thymioGreen from '../../../assets/thymio_icon_green.svg';
import thymioYellow from '../../../assets/thymio_icon_yellow.svg';
import thymioCyan from '../../../assets/thymio_icon_cyan.svg';
import thymioPink from '../../../assets/thymio_icon_pink.svg';

const THYMIO_ICONS: Record<string, string> = {
  red: thymioRed,
  blue: thymioBlue,
  green: thymioGreen,
  yellow: thymioYellow,
  cyan: thymioCyan,
  pink: thymioPink,
};

/** Small ready/repair badge used in each of the three verdict columns. */
function VerdictBadge({ verdict }: { verdict: 'ready' | 'repair' | null | undefined }) {
  if (!verdict) {
    return <span className="text-gray-300">–</span>;
  }
  const ready = verdict === 'ready';
  const Icon = ready ? CheckShape : Ban;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
        ready ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
      }`}
    >
      <Icon width={11} height={11} />
      {ready ? 'Prêt' : 'Réparer'}
    </span>
  );
}

/**
 * PRIMM's Investigate moment: the one-time reunion shown on arriving at step 4. It lays the three
 * signals side by side per robot — the student's prediction, the lab's (initial tree) verdict, and
 * the terrain's reality — and highlights the robots where the lab disagreed with the terrain. Those
 * mismatches are the tree's failures, and the reason the next step exists.
 */
export function ReunionModal() {
  const { stepIndex, activeRobotConfigs: robotConfigs, physicalRobotData, tour3Seen, setTourStep } = useScenario();
  const [seen, setSeen] = useLocalStorage<boolean>('scenario:reunionSeen', false);

  const rows = robotConfigs.map(r => {
    const entry = physicalRobotData[r.uuid];
    const lab = entry?.labVerdict ?? null;
    const terrain = entry?.observation?.category ?? null;
    return {
      uuid: r.uuid,
      color: r.color,
      label: ROBOT_COLORS.find(c => c.id === r.color)?.label ?? r.color,
      prediction: entry?.prediction ?? null,
      lab,
      terrain,
      labWrong: lab != null && terrain != null && lab !== terrain,
    };
  });

  const labMistakes = rows.filter(row => row.labWrong).length;

  const isOpen = stepIndex === 4 && !seen && rows.length > 0;
  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable={false} isKeyboardDismissDisabled>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Ton pronostic, le labo & le terrain</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <p className="text-gray-600 text-sm">
                Trois avis, une seule réalité. Voici, pour chaque robot, ce que tu avais pensé, ce que l'arbre du labo a prédit, et ce que le terrain a vraiment montré.
              </p>

              <div className="overflow-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500">
                      <th className="text-left font-medium px-3 py-2 border border-gray-200">Robot</th>
                      <th className="text-left font-medium px-3 py-2 border border-gray-200">
                        <span className="inline-flex items-center gap-3">
                          <Person width={13} height={13} />
                          Ton pronostic
                        </span>
                      </th>
                      <th className="text-left font-medium px-3 py-2 border border-gray-200">
                        <span className="inline-flex items-center gap-3">
                          <Flask width={13} height={13} />
                          Prédiction du labo
                        </span>
                      </th>
                      <th className="text-left font-medium px-3 py-2 border border-gray-200">
                        <span className="inline-flex items-center gap-3">
                          <Globe width={13} height={13} />
                          Résultat terrain
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.uuid}>
                        <td className="px-3 py-2 border border-gray-100">
                          <span className="flex items-center gap-2">
                            <img src={THYMIO_ICONS[row.color]} alt="" className="w-7 h-7 shrink-0" />
                          </span>
                        </td>
                        <td className="text-left px-3 py-2 border border-gray-100">
                          <VerdictBadge verdict={row.prediction} />
                        </td>
                        <td
                          className={`text-left px-3 py-2 border border-gray-100 ${row.labWrong ? 'bg-red-300' : ''}`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            <VerdictBadge verdict={row.lab} />
                          </span>
                        </td>
                        <td className={`text-left px-3 py-2 border border-gray-100 ${row.labWrong ? 'bg-red-300' : ''}`}>
                          <VerdictBadge verdict={row.terrain} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-gray-600 text-sm">
                {labMistakes === 0 ? (
                  "L'arbre a vu juste partout cette fois — mais rien ne garantit qu'il tiendra face à de nouveaux robots."
                ) : (
                  <>
                    L'arbre du labo a mal classé{' '}
                    <span className="font-semibold text-red-600">
                      {labMistakes} robot{labMistakes > 1 ? 's' : ''}
                    </span>{' '}
                    (en rouge) : sur le terrain, le robot a réagi différement qu'attendu. Ses questions ne
                    sont pas encore les bonnes. À toi de modifier l'arbre, ses questions et ses décisions pour améliorer sa précision — à chaque
                    changement, son score de robots bien classés évolue.
                  </>
                )}
              </p>
            </Modal.Body>

            <Modal.Footer>
              <Button
                variant="primary"
                onPress={() => {
                  setSeen(true);
                  // Picks up right where this modal leaves off, the first time — walks the
                  // student through editing the tree (see TourOverlay's step-4 tour).
                  if (!tour3Seen) {
                    setTourStep(40);
                  }
                }}
              >
                Améliorer l'arbre
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

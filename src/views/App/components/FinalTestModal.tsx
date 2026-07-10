import { useState } from 'react';
import { Modal, useOverlayState, Button } from '@heroui/react';
import { CheckShape, Ban } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { getStepDef, FINAL_TEST_SET, classifyWithAlgoTree } from '../steps/stepDefinitions';

export function FinalTestModal() {
  const { stepIndex, algorithmTree } = useScenario();
  const [ran, setRan] = useState(false);

  const stepDef = getStepDef(stepIndex);
  const isOpen = stepDef.index === 7;

  const state = useOverlayState({ isOpen, onOpenChange: () => {} });

  const results = algorithmTree
    ? FINAL_TEST_SET.map(entry => ({
        entry,
        predicted: classifyWithAlgoTree(algorithmTree, entry.testResults),
        actual: entry.observation?.category ?? null,
      }))
    : [];
  const correct = results.filter(r => r.predicted !== null && r.predicted === r.actual).length;

  const categoryLabel = (c: 'ready' | 'repair' | null) => (c === 'ready' ? 'Prêt' : c === 'repair' ? 'À réparer' : '—');

  return (
    <Modal state={state}>
      <Modal.Backdrop isDismissable>
        <Modal.Container size="cover">
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>Test final</Modal.Heading>
              <Modal.CloseTrigger />
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              {!ran ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <p className="text-gray-600 text-sm max-w-md text-center">
                    De nouveaux robots arrivent pour la mission. Utilise l'algorithme que tu as construit pour décider
                    lesquels sont prêts à partir.
                  </p>
                  <Button variant="primary" isDisabled={!algorithmTree} onPress={() => setRan(true)}>
                    Lancer le test final
                  </Button>
                  {!algorithmTree && (
                    <p className="text-xs text-amber-600">Termine d'abord de construire ton algorithme.</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-3 max-w-2xl">
                  <p className="text-sm font-medium text-gray-700">
                    Score : {correct}/{results.length} robots correctement classés
                  </p>
                  {results.map(r => (
                    <div key={r.entry.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                      <span className="text-sm font-medium">{r.entry.label}</span>
                      <span className="flex items-center gap-3 text-xs text-gray-500">
                        <span>Prédiction : {categoryLabel(r.predicted)}</span>
                        <span>Réel : {categoryLabel(r.actual)}</span>
                        {r.predicted !== null && r.predicted === r.actual ? (
                          <CheckShape width={16} height={16} className="text-green-600" />
                        ) : (
                          <Ban width={16} height={16} className="text-red-600" />
                        )}
                      </span>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="self-start" onPress={() => setRan(false)}>
                    Recommencer
                  </Button>
                </div>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

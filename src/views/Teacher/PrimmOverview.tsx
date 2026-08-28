import { PHASES } from '../App/steps/stepDefinitions';

/**
 * PRIMM (Predict-Run-Investigate-Modify-Make): Sentance & Waite (2017), "PRIMM: Exploring
 * pedagogical approaches for teaching text-based programming in school", WiPSCE '17, 113-114.
 * Empirically evaluated in Sentance, Waite & Kallia (2019), Computer Science Education, 29(2-3),
 * 136-176 -- 13 schools, 493 students, largest gains among lower-ability students.
 *
 * Mechanism: comprehension is scaffolded before production. A learner predicts and observes
 * before ever touching the artefact, which keeps the task inside Vygotsky's zone of proximal
 * development instead of demanding an original construction from the first step.
 */
const PRIMM_STAGES = [
  {
    letter: 'P',
    name: 'Predict',
    fr: 'Prédire',
    desc: 'Examiner le robot et prédire son état, avant tout test.',
    phaseId: 'labo' as const,
  },
  {
    letter: 'R',
    name: 'Run',
    fr: 'Exécuter',
    desc: "Faire tourner l'arbre de décision, observer ce qu'il décide vraiment.",
    phaseId: 'labo' as const,
  },
  {
    letter: 'I',
    name: 'Investigate',
    fr: 'Investiguer',
    desc: 'Comparer prédiction, arbre et réalité du circuit, avant de rien modifier.',
    phaseId: 'terrain' as const,
  },
  {
    letter: 'M',
    name: 'Modify',
    fr: 'Modifier',
    desc: "Corriger l'arbre pour qu'il classe correctement la flotte connue, puis des cas nouveaux.",
    phaseId: 'bilan' as const,
  },
  {
    letter: 'M ',
    name: 'Make',
    fr: 'Créer',
    desc: 'Construire, de bout en bout, une méthode automatique de construction du modèle.',
    phaseId: 'bilan' as const,
  },
];

const phaseById = Object.fromEntries(PHASES.map(p => [p.id, p]));

export function PrimmOverview() {
  return (
    <div className="flex flex-col gap-4">
      <p>
        L'activité suit <strong>PRIMM</strong> (Predict–Run–Investigate–Modify–Make), une progression pédagogique
        développée par Sentance&nbsp;&amp;&nbsp;Waite (2017) pour l'apprentissage de la programmation. Son
        principe&nbsp;: la compréhension précède toujours la production — un·e élève prédit et observe avant de modifier
        ou construire quoi que ce soit, ce qui le maintient dans sa zone proximale de développement plutôt que de lui
        demander une création originale d'emblée.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {PRIMM_STAGES.map((s, i) => {
          const phase = phaseById[s.phaseId];
          return (
            <div key={i} className={`rounded-xl p-3 flex flex-col gap-1.5 ${phase.accentBgSoft}`}>
              <span className={`font-heading text-2xl font-semibold leading-none ${phase.accentText}`}>{s.letter}</span>
              <span className="text-xs font-semibold text-gray-800">
                {s.name} <span className="font-normal text-gray-500">· {s.fr}</span>
              </span>
              <span className="text-xs text-gray-600 leading-snug">{s.desc}</span>
            </div>
          );
        })}
      </div>
      <p className="text-sm text-gray-500">
        Évalué sur 13 écoles et 493 élèves&nbsp;: gains significatifs par rapport à un groupe témoin, plus marqués chez
        les élèves les plus en difficulté (Sentance, Waite &amp; Kallia, 2019). Les couleurs ci-dessus annoncent les
        trois phases de l'activité détaillées plus bas.
      </p>
    </div>
  );
}

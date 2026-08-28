/**
 * Educational Robotics System (ERS) model: Giang, Piatti & Mondada (2019), "Heuristics for the
 * Development and Evaluation of Educational Robotics Systems", IEEE Transactions on Education,
 * 62(4), 278-287.
 *
 * Mechanism: the model treats a classroom robotics activity as one system in which the robot,
 * the interaction interface, and the task jointly shape the learning experience -- evaluating,
 * or designing, any one of the three in isolation misses how they interact. Concretely on this
 * page: a harder task with the same interface changes what the interface needs to surface; the
 * same task through a different interface changes what a learner notices about the robot.
 */
const NODES = [
  {
    id: 'tache',
    label: 'Tâche',
    left: '50%',
    top: '6%',
    detail: 'Décider si un robot est prêt à partir en mission, à partir de ses capteurs.',
  },
  {
    id: 'robot',
    label: 'Robot',
    left: '12%',
    top: '92%',
    detail: 'Un Thymio réel, dont les capteurs et le comportement sur le circuit sont authentiques.',
  },
  {
    id: 'interface',
    label: 'Interface',
    left: '88%',
    top: '92%',
    detail: "L'application web : tableau de données, arbre de décision, journal de mission.",
  },
] as const;

export function ErsDiagram() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-sm aspect-[4/3]">
        <svg viewBox="0 0 400 300" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
          <line x1="200" y1="24" x2="52" y2="270" stroke="var(--color-green-light)" strokeWidth="2" />
          <line x1="200" y1="24" x2="348" y2="270" stroke="var(--color-green-light)" strokeWidth="2" />
          <line x1="52" y1="270" x2="348" y2="270" stroke="var(--color-green-light)" strokeWidth="2" />
        </svg>
        {NODES.map(n => (
          <div
            key={n.id}
            className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2 w-32"
            style={{ left: n.left, top: n.top }}
          >
            <span className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--color-green-dark)] text-white text-sm font-semibold shadow">
              {n.label}
            </span>
          </div>
        ))}
      </div>
      <div className="grid sm:grid-cols-3 gap-3 w-full">
        {NODES.map(n => (
          <div key={n.id} className="text-center sm:text-left">
            <p className="text-xs font-semibold text-[var(--color-green-dark)] uppercase tracking-wide">{n.label}</p>
            <p className="text-xs text-gray-600">{n.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

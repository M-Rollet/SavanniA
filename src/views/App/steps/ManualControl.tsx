import { useScenario } from '../ScenarioContext';

export function ManualControl() {
  const { go } = useScenario();
  return (
    <div className="step step--centered">
      <h2>Manual Control</h2>

      {/* TODO: add motor control UI and training data recording */}

      <div className="step__actions" style={{ marginTop: '2rem' }}>
        <button className="btn" onClick={() => go('software-main')}>
          Back to Main
        </button>
      </div>
    </div>
  );
}

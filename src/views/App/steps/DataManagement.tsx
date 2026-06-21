import { useScenario } from '../ScenarioContext';

export function DataManagement() {
  const { go } = useScenario();
  return (
    <div className="step step--centered">
      <h2>Data Management</h2>

      {/* TODO: add training data review, model training, and mode display */}

      <div className="step__actions" style={{ marginTop: '2rem' }}>
        <button className="btn" onClick={() => go('software-main')}>
          Back to Main
        </button>
      </div>
    </div>
  );
}

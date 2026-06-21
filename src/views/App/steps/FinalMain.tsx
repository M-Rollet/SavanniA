import { useScenario } from '../ScenarioContext';
import { DecisionTree } from '../components/DecisionTree';

export function FinalMain() {
  const { go } = useScenario();
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <DecisionTree testing={false} />
      <div className="overlay-header">
        <button className="btn" onClick={() => go('software-main')}>
          ← Back
        </button>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Decision Tree Editor</h2>
      </div>
    </div>
  );
}

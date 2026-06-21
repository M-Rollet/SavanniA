import { useScenario } from '../ScenarioContext';

export function TeamSplit() {
  const { go } = useScenario();
  return (
    <div className="step step--centered">
      <h2>Split into two teams</h2>
      <p className="step__subtitle">Decide who is on each team. The Robotics Team will leave this screen.</p>
      <div className="team-grid">
        <div className="team-card">
          <h3>Software Team</h3>
          <p>Stays on this platform. Controls the robot remotely, collects training data, and trains the model.</p>
          <button className="btn btn--primary" onClick={() => go('software-main')}>
            I'm on the Software Team
          </button>
        </div>
        <div className="team-card team-card--secondary">
          <h3>Robotics Team</h3>
          <p>
            Leaves this screen. Places the robot in the arena, handles physical setup, and observes the robot's
            behaviour.
          </p>
          <span className="team-card__badge">Goes offline</span>
        </div>
      </div>
      <div className="step__actions" style={{ marginTop: '2rem' }}>
        <button className="btn" onClick={() => go('welcome')}>
          Back
        </button>
      </div>
    </div>
  );
}

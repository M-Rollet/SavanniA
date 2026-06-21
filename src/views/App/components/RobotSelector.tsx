import { useState } from 'react';
import { useScenario } from '../ScenarioContext';

export function RobotSelector() {
  const { user, controledRobot, selectRobot } = useScenario();
  const [robots, setRobots] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRobots = async () => {
    setLoading(true);
    const list = await user.getRobotsUuids();
    setRobots(list);
    setLoading(false);
  };

  if (controledRobot) {
    return (
      <div className="robot-status robot-status--connected">
        Robot connected: <code>{controledRobot.slice(0, 8)}…</code>
      </div>
    );
  }

  return (
    <div className="robot-selector">
      <button className="btn" onClick={fetchRobots} disabled={loading}>
        {loading ? 'Searching…' : 'Find robots'}
      </button>
      {robots.length > 0 && (
        <ul className="robot-list">
          {robots.map(uuid => (
            <li key={uuid}>
              <button className="btn btn--ghost" onClick={() => selectRobot(uuid)}>
                {uuid}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

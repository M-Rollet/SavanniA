import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button } from '@heroui/react';
import { ArrowRight, Gear } from '@gravity-ui/icons';
import { useScenario, ROBOT_COLORS } from '../ScenarioContext';
import { MIN_ROBOTS } from '../robotProfiles';

import background from '../../../assets/welcome_back.jpg';
import logo from '../../../assets/logo.svg';
import thymioLoop from '../../../assets/thymio_loop.png';

const colorHex = Object.fromEntries(ROBOT_COLORS.map(c => [c.id, c.hex]));

function ColorDots({ robots }: { robots: { uuid: string; color: string }[] }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {robots.map(r => (
        <span
          key={r.uuid}
          className="inline-block w-9 h-9 rounded-full border-2 border-white shadow-md"
          style={{ backgroundColor: colorHex[r.color as keyof typeof colorHex] }}
        />
      ))}
    </div>
  );
}

const slide = { duration: 0.4, ease: 'easeInOut' as const };

export function Welcome() {
  const { go, robotConfigs, robotTeams, assignTeams } = useScenario();
  const isConfigured = robotConfigs.length >= MIN_ROBOTS;
  const [phase, setPhase] = useState<'main' | 'intro' | 'team-split'>('main');

  const half = Math.ceil(robotConfigs.length / 2);
  const teamsReady = Object.keys(robotTeams).length > 0;
  const terrainRobots = teamsReady
    ? robotConfigs.filter(r => robotTeams[r.uuid] === 'terrain')
    : robotConfigs.slice(0, half);
  const bureauRobots = teamsReady
    ? robotConfigs.filter(r => robotTeams[r.uuid] === 'bureau')
    : robotConfigs.slice(half);

  return (
    <div className="relative w-screen h-screen overflow-hidden">
      {/* Background */}
      <img src={background} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />

      {/* Rotating decorator A */}
      <motion.img
        src={thymioLoop}
        alt=""
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{ duration: 95, repeat: Infinity, ease: 'linear' }}
        className="absolute pointer-events-none"
        style={{ top: '60%', left: '-30%', width: '100%' }}
      />

      {/* Rotating decorator B */}
      <motion.img
        src={thymioLoop}
        alt=""
        aria-hidden="true"
        animate={{ rotate: 360 }}
        transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}
        className="absolute pointer-events-none"
        style={{ bottom: '50%', left: '30%', width: '100%' }}
      />

      {/* Animated content layer */}
      <div className="relative z-10 flex items-center justify-center h-full w-full">
        <AnimatePresence mode="wait">
          {phase === 'main' && (
            <motion.div
              key="main"
              className="flex flex-col items-center"
              initial={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -120 }}
              transition={slide}
            >
              <img src={logo} alt="SAVANNai" className="w-150 h-auto mb-4" />
              <p className="text-black/80 text-xl drop-shadow text-center mb-8">
                Crée une intelligence artificielle capable de choisir <br />
                les meilleurs robots pour partir en mission.
              </p>
              <Button variant="primary" size="lg" onClick={() => setPhase('intro')} isDisabled={!isConfigured}>
                Commencer la mission
                <ArrowRight />
              </Button>
              {!isConfigured && (
                <p className="text-black/50 text-sm mt-3 drop-shadow">
                  Configurez au moins {MIN_ROBOTS} robots via <Gear className="inline align-middle" /> avant de commencer.
                </p>
              )}
            </motion.div>
          )}

          {phase === 'intro' && (
            <motion.div
              key="intro"
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -120 }}
              transition={slide}
            >
              <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 flex flex-col gap-6">
                <h3 className="text-xl font-semibold">Votre mission</h3>
                <p className="text-gray-600">
                  Integer ac rhoncus purus. Suspendisse at augue arcu. Donec dignissim fringilla suscipit. Ut ligula
                  massa, volutpat ut nisl a, faucibus luctus felis. Ut non hendrerit nisl. Etiam tempus nunc et odio
                  consectetur interdum. Aenean lacinia tellus laoreet sapien aliquet pharetra.
                </p>
                <p className="text-gray-600">
                  Suspendisse sit amet orci ut nisl lacinia elementum. Phasellus lectus nunc, condimentum eget nisi eu,
                  gravida sollicitudin neque. Integer tellus tellus, aliquam at semper ut, dictum et sem.
                </p>
                <p className="text-gray-600">
                  Proin sapien lectus, ultricies ut sodales et, ultrices ut nisi. In pharetra pellentesque lacus, a
                  luctus odio dignissim at. Phasellus eleifend tortor a dolor vehicula, a auctor nulla sagittis. Donec
                  mollis elementum nisi, sed interdum velit venenatis at. Suspendisse eu bibendum orci. Pellentesque
                  finibus quam ut lacus accumsan placerat. Pellentesque est dolor, accumsan id molestie eu, venenatis et
                  felis. Maecenas malesuada purus ac ullamcorper porttitor. In eget ultrices neque.
                </p>
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    onClick={() => {
                      assignTeams();
                      setPhase('team-split');
                    }}
                  >
                    Suivant
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {phase === 'team-split' && (
            <motion.div
              key="team-split"
              className="flex flex-col items-center gap-8 w-full px-12"
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              transition={slide}
            >
              <p className="text-black/80 text-xl font-medium text-center drop-shadow max-w-3xl">
                Pour commencer, formez deux équipes.
                <br />
                Vous vous rejoindrez plus tard pour partager vos découvertes.
              </p>

              <div className="flex gap-6 w-full max-w-4xl">
                {/* Card 1 — Équipe de terrain */}
                <Card className="flex-1 shadow-lg">
                  <Card.Content className="flex flex-col gap-4 p-6">
                    <h3 className="text-xl font-semibold">Équipe de terrain</h3>
                    <p className="text-gray-600 flex-1">
                      Teste les robots sur le circuit et observe leur comportement. Tes découvertes seront utiles pour
                      créer une IA de tri des robots !
                    </p>
                    <div className="flex flex-col gap-2">
                      <p className="text-gray-700 font-medium text-sm">Prends ces robots avec toi :</p>
                      <ColorDots robots={terrainRobots} />
                    </div>
                  </Card.Content>
                  <Card.Footer className="px-6 pb-6 pt-0">
                    <Button variant="outline" isDisabled className="w-full">
                      Rendez-vous au circuit
                    </Button>
                  </Card.Footer>
                </Card>

                {/* Card 2 — Équipe de bureau */}
                <Card className="flex-1 shadow-lg">
                  <Card.Content className="flex flex-col gap-4 p-6">
                    <h3 className="text-xl font-semibold">Équipe de bureau</h3>
                    <p className="text-gray-600 flex-1">
                      Découvre les spécificités des robots et les arbres de décision. Utilise-les pour créer une IA de
                      tri de robots.
                    </p>
                    <div className="flex flex-col gap-2">
                      <p className="text-gray-700 font-medium text-sm">Garde ces robots :</p>
                      <ColorDots robots={bureauRobots} />
                    </div>
                  </Card.Content>
                  <Card.Footer className="px-6 pb-6 pt-0">
                    <Button variant="primary" onClick={() => go('software-main')} className="w-full">
                      C'est parti
                      <ArrowRight />
                    </Button>
                  </Card.Footer>
                </Card>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

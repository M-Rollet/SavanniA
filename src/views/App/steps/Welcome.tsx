import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { ArrowRight, Gear } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { MIN_ROBOTS } from '../robotProfiles';

import background from '../../../assets/welcome_back.jpg';
import logo from '../../../assets/logo.svg';
import thymioLoop from '../../../assets/thymio_loop.png';

const slide = { duration: 0.4, ease: 'easeInOut' as const };

export function Welcome() {
  const { goToStep, robotConfigs } = useScenario();
  const isConfigured = robotConfigs.length >= MIN_ROBOTS;
  const [phase, setPhase] = useState<'main' | 'intro'>('main');

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
                  Configurez au moins {MIN_ROBOTS} robots via <Gear className="inline align-middle" /> avant de
                  commencer.
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
                  <Button variant="primary" onClick={() => goToStep(1)}>
                    C'est parti
                    <ArrowRight />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

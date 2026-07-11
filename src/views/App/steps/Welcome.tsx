import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { ArrowRight, ArrowLeft, Gear, CheckShape } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { MIN_ROBOTS } from '../robotProfiles';
import { PHASES } from './stepDefinitions';

import background from '../../../assets/welcome_back.jpg';
import logo from '../../../assets/logo.svg';
import thymioLoop from '../../../assets/thymio_loop.png';

const slide = { duration: 0.4, ease: 'easeInOut' as const };

type BriefPage = { heading: string; body: string[]; list?: boolean; phases?: boolean };

/** Mission-briefing pages shown between the title screen and step 1 — role, mission (foreshadowing
 * the 3-phase structure named later in TimelinePanel), then explicit learning objectives. */
const BRIEF_PAGES: BriefPage[] = [
  {
    heading: 'Ton rôle',
    body: [
      'Bienvenue au laboratoire de SavannIA. Tu es scientifique : ton équipe envoie des robots explorer la savane pour observer la faune, sans jamais la déranger ni perdre de matériel sur le terrain.',
      'Mais certains robots ne sont pas prêts — batterie faible, capteurs cassés, moteur qui peine. Les envoyer en mission serait risqué, pour eux comme pour les animaux.',
    ],
  },
  {
    heading: 'Ta mission',
    body: [
      'Construis un programme capable de décider, tout seul, si un robot est « Prêt à partir » ou « À réparer ».',
      'Le parcours se déroule en trois phases :',
    ],
    phases: true,
  },
  {
    heading: 'Ce que tu vas apprendre',
    body: [
      "Ce qu'est vraiment une intelligence artificielle : des règles, pas de la magie.",
      "Comment fonctionne un arbre de décision : des questions posées dans le bon ordre, jusqu'au verdict.",
      'Pourquoi il faut parfois se méfier de ses propres observations face à une mesure précise.',
    ],
    list: true,
  },
];

export function Welcome() {
  const { goToStep, robotConfigs } = useScenario();
  const isConfigured = robotConfigs.length >= MIN_ROBOTS;
  const [phase, setPhase] = useState<'main' | number>('main');

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
              <Button variant="primary" size="lg" onClick={() => setPhase(0)} isDisabled={!isConfigured}>
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

          {typeof phase === 'number' && (
            <motion.div
              key={`brief-${phase}`}
              initial={{ opacity: 0, x: 120 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -120 }}
              transition={slide}
            >
              <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-8 flex flex-col gap-6">
                <div className="flex items-center gap-2">
                  {BRIEF_PAGES.map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        i === phase ? 'bg-gray-800' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                <h3 className="text-xl font-semibold">{BRIEF_PAGES[phase].heading}</h3>

                {BRIEF_PAGES[phase].list ? (
                  <ul className="flex flex-col gap-2.5">
                    {BRIEF_PAGES[phase].body.map((line, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-gray-600">
                        <CheckShape className="shrink-0 mt-0.5 text-green-600" width={16} height={16} />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  BRIEF_PAGES[phase].body.map((line, i) => (
                    <p key={i} className="text-gray-600">
                      {line}
                    </p>
                  ))
                )}

                {BRIEF_PAGES[phase].phases && (
                  <div className="flex flex-col gap-2">
                    {PHASES.map(p => (
                      <div key={p.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${p.accentBgSoft}`}>
                        <span className="text-2xl leading-none">{p.icon}</span>
                        <div className="flex flex-col">
                          <span className={`text-sm font-semibold ${p.accentText}`}>{p.label}</span>
                          <span className="text-xs text-gray-500">{p.blurb}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center">
                  <Button variant="ghost" onClick={() => setPhase(phase === 0 ? 'main' : phase - 1)}>
                    <ArrowLeft />
                    Retour
                  </Button>
                  {phase < BRIEF_PAGES.length - 1 ? (
                    <Button variant="primary" onClick={() => setPhase(phase + 1)}>
                      Suivant
                      <ArrowRight />
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => goToStep(1)}>
                      C'est parti
                      <ArrowRight />
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@heroui/react';
import { ArrowRight, ArrowLeft, Gear, CheckShape, Ban } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { MIN_ROBOTS } from '../robotProfiles';
import { PHASES } from './stepDefinitions';

import background from '../../../assets/welcome_back.jpg';
import logo from '../../../assets/logo.svg';
import thymioLoop from '../../../assets/thymio_loop.png';
import thymioCases from '../../../assets/thymio_cases.png';
import thymioIa from '../../../assets/thymio_ia.png';

const slide = { duration: 0.4, ease: 'easeInOut' as const };

// Direction-aware slide: which side content enters from / exits to depends on whether we're
// moving forward (Suivant) or backward (Retour) — a plain enter-from-right always would make
// "going back" look identical to "going forward".
const slideVariants = {
  enter: (direction: number) => ({ opacity: 0, x: direction > 0 ? 120 : -120 }),
  center: { opacity: 1, x: 0 },
  exit: (direction: number) => ({ opacity: 0, x: direction > 0 ? -120 : 120 }),
};

type BriefPage = { heading: string; body: ReactNode[]; list?: boolean; phases?: boolean; image?: string };

/** Mission-briefing pages shown between the title screen and step 1 — role, mission (foreshadowing
 * the 3-phase structure named later in TimelinePanel), then explicit learning objectives. */
const BRIEF_PAGES: BriefPage[] = [
  {
    heading: 'Ton rôle',
    body: [
      'Bienvenue au laboratoire de SavannIA. Tu es scientifique\u00A0: ton équipe envoie des robots explorer la savane pour observer la faune, sans jamais la déranger ni perdre de matériel sur le terrain.',
      'Mais certains robots ne sont pas prêts\u00A0: batterie faible, capteurs cassés, moteur qui peine. Les envoyer en mission serait risqué, pour eux comme pour les animaux.',
    ],
    image: thymioCases,
  },
  {
    heading: 'Ta mission',
    body: [
      <>
        Construis un programme capable de décider, tout seul, si un robot est
        <br />
        <span className="mt-2 flex items-center justify-center gap-3 font-medium text-gray-800">
          <span className="flex items-center gap-1.5">
            <CheckShape width={16} height={16} />
            Prêt à partir
          </span>
          <span className="text-gray-600 font-normal">ou</span>
          <span className="flex items-center gap-1.5">
            <Ban width={16} height={16} />
            À réparer
          </span>
        </span>
      </>,
      'La mission se déroule en trois phases\u00A0:',
    ],
    phases: true,
  },
  {
    heading: 'Ce que tu vas apprendre',
    body: [
      "Ce qu'est vraiment une intelligence artificielle\u00A0: des règles, pas de la magie.",
      "Comment fonctionne un arbre de décision\u00A0: des questions posées dans le bon ordre, jusqu'au verdict.",
      "Pourquoi il faut parfois faire confiance à un capteur plus qu'à tes propres yeux.",
    ],
    list: true,
    image: thymioIa,
  },
];

export function Welcome() {
  const { goToStep, robotConfigs } = useScenario();
  const isConfigured = robotConfigs.length >= MIN_ROBOTS;
  const [phase, setPhase] = useState<'main' | number>('main');
  const [direction, setDirection] = useState<1 | -1>(1);

  const goTo = (next: 'main' | number, dir: 1 | -1) => {
    setDirection(dir);
    setPhase(next);
  };

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
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          {phase === 'main' && (
            <motion.div
              key="main"
              className="flex flex-col items-center"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slide}
            >
              <img src={logo} alt="SAVANNai" className="w-150 h-auto mb-4" />
              <p className="text-black/80 text-xl drop-shadow text-center mb-8">
                Crée une intelligence artificielle capable de choisir <br />
                les meilleurs robots pour partir en mission.
              </p>
              <Button variant="primary" size="lg" onClick={() => goTo(0, 1)} isDisabled={!isConfigured}>
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
              key="brief"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slide}
              className="w-full max-w-2xl"
            >
              <div className="bg-white rounded-2xl shadow-xl min-h-[570px] p-8 flex flex-col gap-6 overflow-hidden">
                {/* Persists across phase changes — only the active dot moves, via layoutId, instead
                    of the whole indicator resetting or sliding away with the card content below. */}
                <div className="flex items-center gap-2">
                  {BRIEF_PAGES.map((_, i) => (
                    <span key={i} className="relative w-2 h-2 rounded-full bg-gray-200">
                      {i === phase && (
                        <motion.span
                          layoutId="brief-dot"
                          className="absolute inset-0 rounded-full bg-gray-800"
                          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        />
                      )}
                    </span>
                  ))}
                </div>

                <AnimatePresence mode="wait" initial={false} custom={direction}>
                  <motion.div
                    key={phase}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={slide}
                    className="flex-1 flex flex-col gap-6"
                  >
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

                    {BRIEF_PAGES[phase].image && (
                      <img src={BRIEF_PAGES[phase].image} alt="" className="mx-auto max-h-48 w-auto rounded-xl" />
                    )}

                    {BRIEF_PAGES[phase].phases && (
                      <div className="flex flex-col gap-2">
                        {PHASES.map(p => (
                          <div key={p.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${p.accentBgSoft}`}>
                            <img src={p.icon} alt="" className="w-12 h-12 shrink-0 object-contain" />
                            <div className="flex flex-col">
                              <span className={`text-sm font-semibold ${p.accentText}`}>{p.label}</span>
                              <span className="text-xs text-gray-500">{p.blurb}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Persists across phase changes, like the dots — only its contents (label, disabled
                    state) update, instead of the whole row sliding away with the card content above. */}
                <div className="flex justify-between items-center">
                  <Button variant="ghost" onClick={() => goTo(phase === 0 ? 'main' : phase - 1, -1)}>
                    <ArrowLeft />
                    Retour
                  </Button>
                  {phase < BRIEF_PAGES.length - 1 ? (
                    <Button variant="primary" onClick={() => goTo(phase + 1, 1)}>
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

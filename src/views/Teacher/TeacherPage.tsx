import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@gravity-ui/icons';
import { PHASES } from '../App/steps/stepDefinitions';
import { PrimmOverview } from './PrimmOverview';
import { ErsDiagram } from './ErsDiagram';
import { StepCarousel } from './StepCarousel';
import logo from '../../assets/logo.svg';
import missionMap from '../../assets/step_8.png';
import circuitPhoto from '../../assets/teacher/circuit-photo.jpg';
import thymioPhoto from '../../assets/teacher/thymio-photo.jpg';
import computerPhoto from '../../assets/teacher/computer-photo.jpg';

// Uncomment once the video file has been added under src/assets/teacher/:
// import guideVideo from '../../assets/teacher/guide-video.mp4';

/**
 * Facilitator tips per step, drawn from the pilot study reported in the thesis (§6.2-§6.5),
 * not from the app's own on-screen text (STEP_DEFS.objective / .action cover that; imported
 * inside StepCarousel so this page can never drift out of sync with what students actually see).
 */
const FACILITATOR_TIPS: Record<number, string> = {
  1: "Étape la plus longue (5–12 min) : laisser le temps du raisonnement, ne pas accélérer. Les élèves manipulent le robot Thymio réel — couvrir le capteur de lumière, passer la main devant les capteurs de distance, écouter le bruit du moteur, lire le niveau de batterie. Le schéma affiché à l'écran indique quoi tester sur le robot, il ne remplace pas le test lui-même.",
  2: "Le rejet unanime et rapide de l'arbre est attendu — c'est un signe positif, pas un problème.",
  3: "Les robots roulent réellement sur le circuit physique ; l'application enregistre ce qui se passe, elle ne le simule pas. L'écran de bilan (prédiction / arbre / résultat côte à côte) est le moment clé : laisser le temps de repérer les désaccords.",
  4: 'Si un·e élève teste toutes les questions au hasard plutôt que de raisonner à partir du terrain, une courte relance suffit généralement à recentrer.',
  5: "Certain·e·s élèves font confiance au tableau de données, d'autres veulent tester sur le circuit pour y croire — les deux chemins sont valables. Si un·e élève semble perdu·e, le rediriger vers le tableau.",
  6: "Important : laisser la difficulté s'installer plusieurs minutes avant d'intervenir. C'est ce blocage qui donne du sens à la construction automatique introduite ensuite.",
  7: 'Le format des quiz de comparaison n\'est pas intuitif au premier abord pour une partie des élèves — prévoir un temps de flottement avant que cela ne devienne clair. Rappeler au besoin que "plus petit = meilleur".',
  8: 'Certain·e·s élèves (souvent les plus jeunes) peuvent croire que le logiciel a construit l\'arbre "tout seul" — c\'est précisément ce que la discussion de clôture doit corriger explicitement.',
};

type NavItem = { id: string; label: string };
const NAV_ITEMS: NavItem[] = [
  { id: 'presentation', label: 'Présentation' },
  { id: 'cadre', label: 'Cadre pédagogique' },
  { id: 'materiel', label: 'Matériel' },
  { id: 'introduction', label: 'Introduction' },
  { id: 'deroulement', label: 'Déroulement' },
  { id: 'cloture', label: 'Clôture' },
  { id: 'vigilance', label: 'Vigilance' },
  { id: 'plus-loin', label: 'Aller plus loin' },
];

/** Centered bold red heading + centered grey subtitle, matching raspberrypi.org's "Coding for
 * kids" / "Resources for teachers & schools" section pattern — used for every section on this
 * page rather than the left-aligned numbered-badge treatment tried earlier. */
function CenteredHeading({ id, title, subtitle }: { id: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="scroll-mt-24 flex flex-col items-center text-center gap-2 mb-8">
      <h2 className="font-heading text-3xl font-bold text-[var(--color-rpi-red)]">{title}</h2>
      {subtitle && <p className="text-gray-500 max-w-[52ch]">{subtitle}</p>}
    </div>
  );
}

function Section({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`max-w-5xl mx-auto px-6 py-14 ${className}`}>{children}</section>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--color-green)] shrink-0" />
      <span>{children}</span>
    </li>
  );
}

/** Solid navy pill button — the Foundation's actual CTA style (never red; red is reserved for
 * the hero band and section headings). */
function NavyButton({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) {
  const cls =
    'inline-flex items-center gap-1.5 rounded-full bg-[var(--color-rpi-navy)] hover:bg-[var(--color-rpi-navy-dark)] text-white font-bold text-sm px-5 py-2.5 transition-colors whitespace-nowrap shrink-0';
  if (href) {
    return (
      <Link to={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** Small white card with a colourful top block (an icon on a tinted background) — the
 * illustration-header card pattern used throughout raspberrypi.org's grids ("Coding for kids",
 * "Resources for teachers & schools"). */
function Card({
  accentBg,
  icon,
  photo,
  title,
  children,
}: {
  accentBg?: string;
  icon?: string;
  photo?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-black/5 shadow-sm flex flex-col">
      {photo ? (
        <img src={photo} alt="" className="h-54 w-full object-cover" />
      ) : (
        <div className={`h-54 flex items-center justify-center ${accentBg}`}>
          {icon && <img src={icon} alt="" className="w-12 h-12 object-contain" />}
        </div>
      )}
      <div className="p-4 flex flex-col gap-1.5">
        <p className="font-heading font-bold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{children}</p>
      </div>
    </div>
  );
}

/** Soft blurred organic shape, purely decorative — echoes the pastel background blobs behind
 * raspberrypi.org's card grids. Pure CSS, no image asset. */
function Blob({ className, color }: { className: string; color: string }) {
  return (
    <div
      aria-hidden="true"
      className={`absolute rounded-full blur-3xl opacity-40 pointer-events-none ${className}`}
      style={{ backgroundColor: color }}
    />
  );
}

export function TeacherPage() {
  const [activeId, setActiveId] = useState<string>(NAV_ITEMS[0].id);
  const [heroScrolledPast, setHeroScrolledPast] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = "Guide de l'enseignant·e — SavannIA";
    return () => {
      document.title = 'SavannIA';
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );
    NAV_ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) {
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, []);

  // Show the header's CTA only once the hero (which has its own) has scrolled out of view —
  // avoids showing "Lancer l'activité" twice on screen at once.
  useEffect(() => {
    const el = heroRef.current;
    if (!el) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setHeroScrolledPast(!entry.isIntersecting), {
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen w-full bg-white">
      {/* Two-tier header: thin dark utility strip + white nav row — raspberrypi.org's own header
          shape, adapted with SavannIA's logo instead of the Foundation's. */}
      <div className="print:hidden h-2 bg-[var(--color-rpi-navy-dark)]" />
      <header className="print:hidden sticky top-0 z-20 bg-white border-b border-black/10">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <img src={logo} alt="SAVANNiA" className="h-7 w-auto shrink-0" />
          <nav className="hidden md:flex items-center gap-5 overflow-x-auto">
            {NAV_ITEMS.map(item => (
              <button
                key={item.id}
                onClick={() => scrollTo(item.id)}
                className={`whitespace-nowrap text-sm font-medium transition-colors ${
                  activeId === item.id ? 'text-[var(--color-rpi-red)]' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div
            className={`transition-all duration-200 ${
              heroScrolledPast ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none'
            }`}
          >
            <NavyButton href="/activite">Lancer l'activité</NavyButton>
          </div>
        </div>
      </header>

      {/* Hero: solid red band, centered logo + centered bold heading only — no meta pills here,
          matching raspberrypi.org's hero which carries a single clean statement, nothing else. */}
      <div ref={heroRef} className="bg-[var(--color-rpi-red)] px-6 pt-16 pb-20 flex flex-col items-center text-center">
        <img src={logo} alt="SAVANNiA" className="h-9 w-auto mb-6 brightness-0 invert" />
        <h1 className="font-heading text-3xl md:text-4xl font-bold text-white leading-tight max-w-[42ch]">
          Construire un arbre de décision avec un robot Thymio
        </h1>
        <Link
          to="/activite"
          className="mt-7 inline-flex items-center gap-2 rounded-full bg-white hover:bg-white/90 text-[var(--color-rpi-red)] font-bold text-sm px-6 py-3 transition-colors"
        >
          Lancer l'activité
          <ArrowRight width={14} height={14} />
        </Link>
      </div>

      {/* Feature block: tilted image + text + navy CTA, on a light rose tint — mirrors
          raspberrypi.org's "Why kids still need to learn to code" block right under its hero. */}
      <div style={{ backgroundColor: 'var(--color-rpi-rose-tint)' }}>
        <Section className="grid md:grid-cols-2 gap-10 items-center !py-16">
          <div className="flex justify-center">
            <img
              src={missionMap}
              alt="Carte de la mission SavannIA"
              className="w-full max-w-sm rounded-2xl shadow-xl -rotate-2 border border-black/5"
            />
          </div>
          <div id="presentation" className="scroll-mt-24 flex flex-col gap-4">
            <h2 className="font-heading text-2xl font-bold text-gray-900">Présentation de l'activité</h2>
            <p className="text-gray-600">
              Cette activité fait construire aux élèves, de bout en bout, le fonctionnement d'un système d'intelligence
              artificielle&nbsp;: à partir de mesures brutes prises sur un robot Thymio, ils construisent eux-mêmes un
              arbre de décision, le testent sur un circuit physique, le corrigent lorsqu'il échoue, puis découvrent une
              méthode automatique pour le construire — sans qu'aucune étape ne reste une boîte noire.
            </p>
            <p className="text-sm text-gray-500">
              Cycle 3 · 12–15 ans &nbsp;·&nbsp; ≈ 1h + intro &amp; clôture &nbsp;·&nbsp; Robot Thymio + circuit physique
            </p>
            <div>
              <NavyButton onClick={() => scrollTo('deroulement')}>
                Voir le déroulement
                <ArrowRight width={14} height={14} />
              </NavyButton>
            </div>
          </div>
        </Section>
      </div>

      {/* Cadre pédagogique */}
      <div className="relative overflow-hidden">
        <Blob className="w-72 h-72 -top-10 -left-20" color="var(--color-green-light)" />
        <Blob className="w-64 h-64 bottom-0 -right-16" color="var(--color-rpi-rose-tint)" />
        <Section className="relative">
          <CenteredHeading
            id="cadre"
            title="Cadre pédagogique"
            subtitle="Deux cadres théoriques structurent la conception de l'activité : PRIMM pour la progression pédagogique, ERS pour l'articulation robot / interface / tâche."
          />
          <div className="flex flex-col gap-10">
            <div>
              <h3 className="font-heading font-bold text-gray-900 mb-3 text-center">
                PRIMM&nbsp;: comprendre avant de créer
              </h3>
              <PrimmOverview />
            </div>
            <div>
              <h3 className="font-heading font-bold text-gray-900 mb-3 text-center">
                Robot, interface, tâche&nbsp;: un système, pas trois pièces isolées
              </h3>
              <p className="text-gray-600 max-w-[62ch] mx-auto text-center mb-4">
                Le modèle ERS (Educational Robotics System) de Giang, Piatti&nbsp;&amp;&nbsp;Mondada (2019) part d'un
                constat&nbsp;: évaluer un robot pédagogique indépendamment de son interface et de la tâche proposée
                passe à côté de ce qui façonne réellement l'expérience d'apprentissage.
              </p>
              <ErsDiagram />
            </div>
          </div>
        </Section>
      </div>

      {/* Matériel & installation */}
      <div className="bg-gray-50">
        <Section>
          <CenteredHeading
            id="materiel"
            title="Matériel et installation"
            subtitle="Ce qu'il faut préparer avant la séance, par groupe d'élèves."
          />
          <div className="grid sm:grid-cols-3 gap-5">
            <Card photo={computerPhoto} title="Ordinateur">
              1 par groupe, navigateur web + ThymioSuite installé localement.
            </Card>
            <Card photo={thymioPhoto} title="Robots Thymio">
              4 à 6 par groupe, chacun avec sa clé USB Bluetooth.
            </Card>
            <Card photo={circuitPhoto} title="Circuit">
              Carton (tunnel, pente), figurines/images d'animaux, surface blanche, ruban adhésif noir.
            </Card>
          </div>
          <div className="mt-8 max-w-[62ch] mx-auto flex flex-col gap-4 text-gray-700">
            <div>
              <h3 className="font-semibold text-gray-800 mb-1.5">Installation avant la séance</h3>
              <ol className="flex flex-col gap-1.5 list-decimal list-inside">
                <li>Allumer les robots</li>
                <li>Identifier chaque robot dans les réglages de l'application</li>
                <li>Assigner à chaque robot la couleur utilisée pour l'identifier durant l'activité</li>
              </ol>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800 mb-1.5">Taille des groupes</h3>
              <p>
                L'activité a été testée avec un ou deux élèves par poste. Pour une classe complète&nbsp;: des ateliers
                parallèles (plusieurs postes en même temps) ou une rotation (groupes plus grands sur un nombre réduit de
                postes).
              </p>
            </div>
          </div>
        </Section>
      </div>

      {/* Introduction en classe */}
      <Section>
        <CenteredHeading
          id="introduction"
          title="Introduction à mener en classe"
          subtitle="Questions effectivement posées aux participant·e·s du pilote, avant l'activité — réutilisables telles quelles."
        />
        <ul className="flex flex-col gap-1.5 max-w-[52ch] mx-auto text-gray-700">
          <Bullet>« Sais-tu ce qu'est l'IA&nbsp;? »</Bullet>
          <Bullet>« Comment perçois-tu l'IA&nbsp;? »</Bullet>
          <Bullet>« Comment penses-tu qu'une IA devient intelligente&nbsp;? »</Bullet>
        </ul>
      </Section>

      {/* Déroulement pas à pas */}
      <div className="relative overflow-hidden bg-gray-50">
        <Blob className="w-80 h-80 top-10 -right-24" color="var(--color-rpi-mint)" />
        <Section className="relative">
          <CenteredHeading
            id="deroulement"
            title="Déroulement pas à pas"
            subtitle="Huit étapes guidées, réparties en trois phases, chacune associée aux stades PRIMM vus plus haut."
          />
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            {PHASES.map(phase => (
              <div key={phase.id} className={`flex items-center gap-3 rounded-xl px-4 py-3 ${phase.accentBgSoft}`}>
                <img src={phase.icon} alt="" className="w-9 h-9 shrink-0 object-contain" />
                <div className="flex flex-col">
                  <span className={`text-sm font-semibold ${phase.accentText}`}>{phase.label}</span>
                  <span className="text-xs text-gray-500">{phase.blurb}</span>
                </div>
              </div>
            ))}
          </div>

          <StepCarousel facilitatorTips={FACILITATOR_TIPS} />

          <p className="text-sm text-gray-500 italic max-w-[62ch] mx-auto mt-6 text-center">
            Répartition du temps observée en pilote&nbsp;: les étapes 1, 3 et 6 sont les plus longues (jusqu'à 10–13
            min)&nbsp;; les étapes 2 et 4 sont les plus rapides (1–5 min).
          </p>
        </Section>
      </div>

      {/* Discussion de clôture */}
      <Section>
        <CenteredHeading
          id="cloture"
          title="Discussion de clôture"
          subtitle="Ce moment rend explicite ce que les élèves viennent de faire — essentiel pour celles et ceux qui pourraient croire que « le logiciel a tout fait »."
        />
        <div className="max-w-[62ch] mx-auto flex flex-col gap-4 text-gray-700">
          <blockquote className="border-l-4 border-[var(--color-rpi-red)] pl-4 italic text-gray-600">
            « Ce que tu viens de construire n'est pas une boîte noire magique&nbsp;: c'est une suite de questions
            oui/non que toi, puis l'algorithme, avez choisies — dans l'ordre qui trie le mieux tes robots. C'est ça, une
            intelligence artificielle&nbsp;: des règles, pas de la magie. »
          </blockquote>
          <p className="text-sm text-gray-500">
            Questions effectivement posées aux participant·e·s du pilote, ici dans la version après activité&nbsp;:
          </p>
          <ul className="flex flex-col gap-1.5">
            <Bullet>« À quel point une IA est-elle intelligente&nbsp;? »</Bullet>
            <Bullet>« Qu'as-tu appris sur la façon dont une machine apprend&nbsp;? »</Bullet>
            <Bullet>« Qu'est-ce qui compte lorsqu'on construit une IA&nbsp;? »</Bullet>
            <Bullet>« Une IA est-elle indépendante&nbsp;? »</Bullet>
            <Bullet>« Qu'as-tu aimé ou moins aimé dans l'activité&nbsp;? »</Bullet>
          </ul>
        </div>
      </Section>

      {/* Points de vigilance */}
      <div className="bg-gray-50">
        <Section>
          <CenteredHeading id="vigilance" title="Points de vigilance" />
          <ul className="flex flex-col gap-1.5 max-w-[62ch] mx-auto text-gray-700">
            <Bullet>
              Densité de texte&nbsp;: pour les lecteurs plus jeunes ou hésitants, lire les consignes clés à voix haute
              plutôt que de laisser l'élève les découvrir seul·e.
            </Bullet>
            <Bullet>
              Guidage&nbsp;: certain·e·s élèves peuvent hésiter sur où cliquer — prévoir de circuler activement, en
              particulier aux étapes 3 et 5.
            </Bullet>
            <Bullet>
              Étape 6&nbsp;: ne pas intervenir trop tôt. Le blocage face au grand jeu de données est volontaire et
              pédagogiquement productif.
            </Bullet>
            <Bullet>
              Étape 8&nbsp;: vérifier explicitement, en fin d'activité, que chaque élève comprend avoir construit le
              modèle lui-même/elle-même.
            </Bullet>
          </ul>
        </Section>
      </div>

      {/* Pour aller plus loin */}
      <Section>
        <CenteredHeading id="plus-loin" title="Pour aller plus loin" subtitle="Optionnel." />
        <ul className="flex flex-col gap-1.5 max-w-[62ch] mx-auto text-gray-700">
          <Bullet>
            Pour les groupes qui terminent en avance&nbsp;: proposer un critère de classification supplémentaire ou un
            second jeu de données à explorer librement.
          </Bullet>
          <Bullet>
            Pour prolonger la discussion de clôture&nbsp;: relier l'activité à un exemple d'IA que la classe connaît
            déjà (recommandation de contenu, correction orthographique, etc.) et identifier ensemble quelles données
            elle a dû utiliser.
          </Bullet>
        </ul>
      </Section>

      <footer className="print:hidden bg-gray-50 border-t border-black/10 py-14 flex flex-col items-center text-center gap-4">
        <p className="text-gray-500 text-sm">Prêt·e à lancer la mission avec la classe&nbsp;?</p>
        <NavyButton href="/activite">
          Lancer l'activité
          <ArrowRight width={14} height={14} />
        </NavyButton>
      </footer>
    </div>
  );
}

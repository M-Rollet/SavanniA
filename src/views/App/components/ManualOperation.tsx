import { useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Bulb, ArrowRotateLeft, ArrowRotateRight } from '@gravity-ui/icons';
import { useScenario } from '../ScenarioContext';
import { TOUR_ADVANCE_DELAY_MS } from './TourOverlay';
import schematics from '../../../assets/schematics.png';

// ── Pin ───────────────────────────────────────────────────────
type PinProps = { cx: number; cy: number; w: number; h: number; children: React.ReactNode };

function Pin({ cx, cy, w, h, children }: PinProps) {
  return (
    <div
      className="absolute"
      style={{
        left: `${(cx / w) * 100}%`,
        top: `${(cy / h) * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {children}
    </div>
  );
}

// ── LevelBar ──────────────────────────────────────────────────
const BAR_WIDTH = 35; // bar width in PNG pixel coordinates

type LevelBarProps = { cx: number; y1: number; y2: number; w: number; h: number; value: number };

function LevelBar({ cx, y1, y2, w, h, value }: LevelBarProps) {
  return (
    <div
      className="absolute overflow-hidden rounded-full bg-gray-200"
      style={{
        left: `${(cx / w) * 100}%`,
        top: `${(y1 / h) * 100}%`,
        height: `${((y2 - y1) / h) * 100}%`,
        width: `${(BAR_WIDTH / w) * 100}%`,
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full transition-all duration-300"
        style={{ height: `${value * 100}%`, backgroundColor: 'var(--color-green-light)' }}
      />
    </div>
  );
}

// ── ArcGauge ──────────────────────────────────────────────────
// Angles in standard SVG math convention (x-right, y-down, clockwise = increasing).
// START_ANGLE 135° = lower-left (~7 o'clock); sweeps 310° clockwise to lower-right (~5 o'clock).
const ARC_START = 25;
const ARC_SWEEP = 310;
const STROKE = 15;

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

type ArcGaugeProps = { cx: number; cy: number; diameter: number; w: number; h: number; value: number };

function ArcGauge({ cx, cy, diameter, w, h, value }: ArcGaugeProps) {
  const r = diameter / 2;
  const pad = STROKE / 2 + 2;
  const size = diameter + pad * 2;
  const c = size / 2;

  return (
    <div
      className="absolute"
      style={{
        left: `${(cx / w) * 100}%`,
        top: `${(cy / h) * 100}%`,
        width: `${(size / w) * 100}%`,
        height: `${(size / h) * 100}%`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
      }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full" overflow="visible">
        {/* Track */}
        <path
          d={arcPath(c, c, r, ARC_START, ARC_START + ARC_SWEEP)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {/* Fill */}
        {value > 0 && (
          <path
            d={arcPath(c, c, r, ARC_START, ARC_START + value * ARC_SWEEP)}
            fill="none"
            stroke="var(--color-green-light)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            style={{ transition: 'all 300ms' }}
          />
        )}
      </svg>
    </div>
  );
}

// ── RadarGauge ────────────────────────────────────────────────
// 5 slices × 3 rings within [RADAR_START, RADAR_START + RADAR_SWEEP].
// Each ring-slice is a thick arc stroke with rounded caps → natural rounded corners.
// value ∈ {0,1,2,3}: 0=none, 1=all 3 rings, 2=outer 2, 3=outermost only.
const RADAR_HUB = 240; // inner radius (PNG px)
const RADAR_OUTER = 330; // outer radius (PNG px)
const RADAR_SLICES = 5;
const RADAR_RINGS = 3;
const SLICE_GAP = 8; // angular gap between slices (degrees)
const DEPTH_GAP = 10; // radial gap between rings (PNG px)
const RADAR_START = -45; // start angle (degrees, SVG math)
const RADAR_SWEEP = 90; // total angular span (degrees)

type RadarGaugeProps = { cx: number; cy: number; w: number; h: number; values: number[] };

function RadarGauge({ cx, cy, w, h, values }: RadarGaugeProps) {
  const pad = 4;
  const size = (RADAR_OUTER + pad) * 2;
  const c = size / 2;
  const ringWidth = (RADAR_OUTER - RADAR_HUB) / RADAR_RINGS;
  const slotAngle = RADAR_SWEEP / RADAR_SLICES;
  const sliceSpan = slotAngle - SLICE_GAP;

  return (
    <div
      className="absolute"
      style={{
        left: `${(cx / w) * 100}%`,
        top: `${(cy / h) * 100}%`,
        width: `${(size / w) * 100}%`,
        height: `${(size / h) * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        {values.map((value, i) => {
          const start = RADAR_START + i * slotAngle + SLICE_GAP / 2;
          const end = start + sliceSpan;
          return Array.from({ length: RADAR_RINGS }, (_, ri) => {
            const ring = ri + 1; // 1=innermost, 3=outermost
            const rMid = RADAR_HUB + (ri + 0.5) * ringWidth;
            const sw = ringWidth - DEPTH_GAP;
            const filled = value > 0 && ring >= value;
            return (
              <path
                key={`${i}-${ring}`}
                d={arcPath(c, c, rMid, start, end)}
                fill="none"
                stroke={filled ? 'var(--color-green-light)' : '#e5e7eb'}
                strokeWidth={sw}
                strokeLinecap="round"
                opacity={filled ? 1 : 0.35}
                style={{ transition: 'stroke 300ms, opacity 300ms' }}
              />
            );
          });
        })}
      </svg>
    </div>
  );
}

// ── ManualOperation ───────────────────────────────────────────
// Mirrors the firmware's move duration (aesl.resource.ts: SHORT_DIST_TICKS=40 × timer.period[0]=50ms)
// so the button's active feedback lasts as long as the robot is actually moving.
const MOVE_FEEDBACK_MS = 2000;

type Props = {
  robotId?: string;
  level?: number;
  arc?: number;
  radar?: number[];
  onEmitEvent?: (event: string) => void;
  disabled?: boolean;
};

export function ManualOperation({
  robotId,
  level = 0.0,
  arc = 0.0,
  radar = [0, 0, 0, 0, 0],
  onEmitEvent,
  disabled,
}: Props) {
  const { tourStep, setTourStep } = useScenario();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [lightActive, setLightActive] = useState(false);
  // Tour step 3 wants an on-then-off cycle, not just any single click — set once the student
  // turns the light on, consumed (and cleared) the moment they turn it back off.
  const litOnceRef = useRef(false);

  // Which move button (if any) should still show as active — cleared automatically once the
  // robot has had time to finish its move, giving the student visual feedback that it moved.
  const [activeMove, setActiveMove] = useState<'forward' | 'backward' | null>(null);
  const moveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the local light toggle when the selected robot changes — without remounting the whole
  // component (which used to reload the schematic image and blank the gauges for a frame).
  useEffect(() => {
    setLightActive(false);
    litOnceRef.current = false;
    setActiveMove(null);
    if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
  }, [robotId]);

  // Clear the pending timeout on unmount so it doesn't fire against a stale component instance.
  useEffect(() => {
    return () => {
      if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    };
  }, []);

  const handleLight = () => {
    const next = !lightActive;
    setLightActive(next);
    onEmitEvent?.(next ? 'light_on' : 'light_off');
    if (tourStep === 3) {
      if (next) {
        litOnceRef.current = true;
      } else if (litOnceRef.current) {
        litOnceRef.current = false;
        setTimeout(() => setTourStep(4), TOUR_ADVANCE_DELAY_MS);
      }
    }
  };

  const handleMove = (direction: 'forward' | 'backward') => {
    onEmitEvent?.(direction === 'forward' ? 'go_forward' : 'go_backward');
    setActiveMove(direction);
    if (moveTimeoutRef.current) clearTimeout(moveTimeoutRef.current);
    moveTimeoutRef.current = setTimeout(() => setActiveMove(null), MOVE_FEEDBACK_MS);
  };

  return (
    <div className="w-full h-full p-20 flex items-center justify-center">
      <div
        className="relative"
        style={{
          aspectRatio: size ? `${size.w}/${size.h}` : undefined,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
      >
        <img
          src={schematics}
          className="w-full h-full"
          draggable={false}
          onLoad={e => {
            const img = e.currentTarget;
            setSize({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />

        {size && (
          <>
            <LevelBar cx={1082} y1={75} y2={420} {...size} value={level} />

            <ArcGauge cx={316.5} cy={639} diameter={240} {...size} value={arc} />

            <RadarGauge cx={625} cy={639} {...size} values={radar} />

            <Pin cx={375} cy={360} {...size}>
              <div data-tour="light-button" className="flex flex-col items-center gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant={lightActive ? 'primary' : 'tertiary'}
                  isDisabled={disabled}
                  onPress={handleLight}
                >
                  <Bulb />
                </Button>
              </div>
            </Pin>
            <Pin cx={686} cy={360} {...size}>
              <div className="flex flex-col items-center gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant={activeMove === 'backward' ? 'primary' : 'tertiary'}
                  isDisabled={disabled}
                  onPress={() => handleMove('backward')}
                >
                  <ArrowRotateLeft />
                </Button>
              </div>
            </Pin>
            <Pin cx={789} cy={360} {...size}>
              <div className="flex flex-col items-center gap-1">
                <Button
                  isIconOnly
                  size="sm"
                  variant={activeMove === 'forward' ? 'primary' : 'tertiary'}
                  isDisabled={disabled}
                  onPress={() => handleMove('forward')}
                >
                  <ArrowRotateRight />
                </Button>
              </div>
            </Pin>
          </>
        )}
      </div>
    </div>
  );
}

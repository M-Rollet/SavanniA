import { EventDescription } from '@mobsya-association/thymio-api';

// Outgoing events (robot → app).
// Config and sequence triggering use setVariables() (host → robot) to avoid
// the race condition that custom incoming events caused with setEventsDescriptions.
export const eventsDefinition: EventDescription[] = [
  { name: 'ready', fixed_size: 1, index: 0 },
  // pn[0..6] horiz prox (0-100), pn[7..8] ground (0-100),
  // pn[9..10] motor speeds (-100-100), pn[11] mic (0-100)
  { name: 'Prox', fixed_size: 12, index: 1 },
  { name: 'B_center', fixed_size: 1, index: 2 },
  { name: 'B_forward', fixed_size: 1, index: 3 },
  { name: 'B_backward', fixed_size: 1, index: 4 },
  { name: 'B_left', fixed_size: 1, index: 5 },
  { name: 'B_right', fixed_size: 1, index: 6 },
  { name: 'SeqDone', fixed_size: 1, index: 7 },
];

export const asebaScript = `
# ─── Variables ───────────────────────────────────────────────
var light_working
var ir_working
var motor_noise
var battery_level
var line_follow

var seq_type
var seq_step
var seq_trigger
var motor_sound_on
var identify
var identify_tick
var field_mode
var field_seq

var pn[12]

var lf_mini
var lf_maxi
var lf_mean
var lf_vari
var lf_p
var lf_ndev
var lf_ireg
var lf_preg

# ─── Startup ─────────────────────────────────────────────────
lf_mini = 1024
lf_maxi = 0
lf_mean = 512
lf_vari = 512
identify      = 0
identify_tick = 0
field_mode    = 0
field_seq     = 0
timer.period[0] = 50
emit ready [1]

# ─── Sequence trigger poll (50 ms) ───────────────────────────
# Host sets seq_type then seq_trigger > 0 via setVariables to start a sequence.
onevent timer0
    if seq_trigger > 0 then
        seq_step        = 0
        timer.period[1] = 400
        seq_trigger     = 0
        identify        = 0
        identify_tick   = 0
    end

    # ── Identify flash: host sets identify=1, Aseba drives the sequence ──
    # 3 white flashes of 400 ms on / 400 ms off (41 ticks × 50 ms ≈ 2050 ms).
    # Suppressed while a test sequence is running (timer.period[1] > 0).
    if timer.period[1] == 0 then
        if identify == 1 then
            identify_tick += 1
            if identify_tick == 1  then call leds.top(32, 32, 32) end
            if identify_tick == 9  then call leds.top(0,  0,  0)  end
            if identify_tick == 17 then call leds.top(32, 32, 32) end
            if identify_tick == 25 then call leds.top(0,  0,  0)  end
            if identify_tick == 33 then call leds.top(32, 32, 32) end
            if identify_tick >= 41 then
                call leds.top(0, 0, 0)
                identify      = 0
                identify_tick = 0
            end
        else
            if field_mode == 0 then
                call leds.top(0, 0, 0)
            end
        end
    end

    # ── Field sequence ─────────────────────────────────────────
    # Triggered by center button (field mode) or by host via setVariables
    # (non-field mode, TBD). Phases: line-follow → crash / success (TBD).

# ─── Prox / motor / mic (~100 ms) ────────────────────────────
onevent prox
    # Normalise: horiz prox 0-4500 to 0-100, ground 0-1000 to 0-100,
    #            motor -500..500 to -100..100, mic 0-255 to 0-100
    call math.muldiv(pn[0],  100, prox.horizontal[0],   4500)
    call math.muldiv(pn[1],  100, prox.horizontal[1],   4500)
    call math.muldiv(pn[2],  100, prox.horizontal[2],   4500)
    call math.muldiv(pn[3],  100, prox.horizontal[3],   4500)
    call math.muldiv(pn[4],  100, prox.horizontal[4],   4500)
    call math.muldiv(pn[5],  100, prox.horizontal[5],   4500)
    call math.muldiv(pn[6],  100, prox.horizontal[6],   4500)
    call math.muldiv(pn[7],  100, prox.ground.delta[0], 1000)
    call math.muldiv(pn[8],  100, prox.ground.delta[1], 1000)
    call math.muldiv(pn[9],  100, motor.left.speed,      500)
    call math.muldiv(pn[10], 100, motor.right.speed,     500)
    call math.muldiv(pn[11], 100, mic.intensity,         255)

    emit Prox [pn[0], pn[1], pn[2], pn[3], pn[4], pn[5], pn[6],
               pn[7], pn[8], pn[9], pn[10], pn[11]]

    # Motor sound: play while wheels spin, stop when idle
    if motor_noise == 1 then
        if motor.left.target != 0 or motor.right.target != 0 then
            if motor_sound_on == 0 then
                call sound.freq(400, -1)
                motor_sound_on = 1
            end
        else
            if motor_sound_on == 1 then
                call sound.freq(0, 0)
                motor_sound_on = 0
            end
        end
    end

    # Line-follow PI controller (edge tracking on ground sensor 1)
    if line_follow == 1 then
        lf_p = prox.ground.delta[1]
        callsub lf_stats
        call math.muldiv(lf_ndev, 100, lf_p - lf_mean, lf_vari)
        if abs(lf_ndev) < 200 then
            lf_preg            = (60 * lf_ndev) / 100
            lf_ireg           += (33 * lf_preg)  / 100
            motor.left.target  = 150 + lf_preg + lf_ireg
            motor.right.target = 150 - lf_preg - lf_ireg
        else
            lf_ireg            = 0
            motor.left.target  = lf_ndev
            motor.right.target = -lf_ndev
        end
    end

# ─── Sequence step machine (timer1, 400 ms / step) ───────────
onevent timer1
    # Light test: red -> green -> blue -> off (only when light_working)
    if seq_type == 0 then
        if light_working == 1 then
            if seq_step == 0 then call leds.top(32, 0,  0)  end
            if seq_step == 1 then call leds.top(0,  32, 0)  end
            if seq_step == 2 then call leds.top(0,  0,  32) end
        end
        if seq_step == 3 then
            call leds.top(0, 0, 0)
            emit SeqDone [seq_type]
            timer.period[1] = 0
        end
    end

    # IR test: accumulative sweep of prox LEDs (only when ir_working)
    if seq_type == 1 then
        if ir_working == 1 then
            if seq_step == 0 then call leds.prox.h(32, 0,  0,  0,  0,  0,  0, 0) end
            if seq_step == 1 then call leds.prox.h(32, 32, 0,  0,  0,  0,  0, 0) end
            if seq_step == 2 then call leds.prox.h(32, 32, 32, 0,  0,  0,  0, 0) end
            if seq_step == 3 then call leds.prox.h(32, 32, 32, 32, 0,  0,  0, 0) end
            if seq_step == 4 then call leds.prox.h(32, 32, 32, 32, 32, 0,  0, 0) end
            if seq_step == 5 then call leds.prox.h(32, 32, 32, 32, 32, 32, 0, 0) end
            if seq_step == 6 then call leds.prox.h(0,  0,  0,  0,  0,  0,  0, 0) end
            if seq_step == 7 then call leds.prox.h(32, 32, 32, 32, 32, 32, 0, 0) end
        end
        if seq_step == 9 then
            call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
            emit SeqDone [seq_type]
            timer.period[1] = 0
        end
    end

    # Motor test: forward (800 ms) -> stop -> backward (800 ms) -> stop
    if seq_type == 2 then
        if seq_step == 0 then
            motor.left.target  = 200
            motor.right.target = 200
            if motor_noise == 1 then
                call sound.freq(400, -1)
                motor_sound_on = 1
            end
        end
        if seq_step == 2 then
            motor.left.target  = 0
            motor.right.target = 0
            if motor_noise == 1 then
                call sound.freq(0, 0)
                motor_sound_on = 0
            end
        end
        if seq_step == 3 then
            motor.left.target  = -200
            motor.right.target = -200
            if motor_noise == 1 then
                call sound.freq(400, -1)
                motor_sound_on = 1
            end
        end
        if seq_step == 5 then
            motor.left.target  = 0
            motor.right.target = 0
            if motor_noise == 1 then
                call sound.freq(0, 0)
                motor_sound_on = 0
            end
            emit SeqDone [seq_type]
            timer.period[1] = 0
        end
    end

    seq_step += 1

# ─── Buttons ─────────────────────────────────────────────────
onevent button.center
    if field_mode == 1 then
        if button.center == 1 then
            field_seq = 1
        end
    else
        emit B_center [button.center]
    end

onevent button.forward
    emit B_forward [button.forward]

onevent button.backward
    emit B_backward [button.backward]

onevent button.left
    emit B_left [button.left]

onevent button.right
    emit B_right [button.right]

# ─── Subroutines ─────────────────────────────────────────────
sub lf_stats
    call math.max(lf_maxi, lf_maxi, lf_p)
    call math.min(lf_mini, lf_mini, lf_p)
    if lf_maxi - lf_mini > 400 then
        call math.muldiv(lf_vari, 45, lf_maxi - lf_mini, 100)
        lf_mean = (lf_mini + lf_maxi) / 2
    end
`;

import { EventDescription } from '@mobsya-association/thymio-api';

// All custom events (both directions) must be registered with setEventsDescriptions.
// robot → app: ready, seq_done
// app → robot: light_off, light_on, test_battery, test_ir, test_light, test_sound
export const eventsDefinition: EventDescription[] = [
  { name: 'ready', fixed_size: 0, index: 0 },
  { name: 'seq_done', fixed_size: 1, index: 1 },
  { name: 'light_off', fixed_size: 0, index: 2 },
  { name: 'light_on', fixed_size: 0, index: 3 },
  { name: 'test_battery', fixed_size: 0, index: 4 },
  { name: 'test_ir', fixed_size: 0, index: 5 },
  { name: 'test_light', fixed_size: 0, index: 6 },
  { name: 'test_sound', fixed_size: 0, index: 7 },
  { name: 'set_battery', fixed_size: 0, index: 8 },
  { name: 'go_forward', fixed_size: 0, index: 9 },
  { name: 'go_backward', fixed_size: 0, index: 10 },
  { name: 'status', fixed_size: 10, index: 11 },
  { name: 'identify', fixed_size: 0, index: 12 },
  { name: 'set_mode_on', fixed_size: 0, index: 13 },
  { name: 'set_mode_off', fixed_size: 0, index: 14 },
];

const ASEBA_CONSTANTS = {
    // sequences
    SEQ_NULL: 0,
    SEQ_TEST_NOISE: 1,
    SEQ_TEST_LIGHT_WORKING: 2,
    SEQ_TEST_LIGHT_FAILING: 3,
    SEQ_TEST_IR: 4,
    SEQ_TEST_BATTERY: 5,
    SEQ_MOVE: 7,
    SEQ_IDENTIFY: 8,
    SHORT_DIST_TICKS: 40,
    SHORT_WAIT_TICKS: 5,
    TICKS_BATTERY_FLASH: 5,
    TICKS_FLICKER: 2,
    TICKS_CHASE: 12,

    // motion / line following
    SPEED_NORMAL: 100,
    MAX_SPEED: 160,
    PCOEFF: 60,
    ICOEFF: 33,
    BLACK_TH: 300,

    // obstacle avoidance
    OBST_ON: 1600,   // prox value that triggers avoidance (lower = react earlier)
    OBST_BIAS: 30,   // pull toward obstacle side (higher = tighter orbit)
    OBST_SHIFT: 7,   // repulsion = dot(prox, w) >> SHIFT (7 = twice as strong)
    W0: -15,          // signed sensor weights, left → right;
    W1: -20,          //   negative = steer right, positive = steer left
    W2: 30,           //   center magnitude only — sign set at runtime by `side`
    W3: 20,
    W4: 15,
    OBST_SEEN: 15,    // |r| above this = obstacle still in view
    CLEAR_TICKS: 12,  // prox events (10Hz) of straight travel after losing sight (~1.2s ≈ 4cm at speed 80)

    // blind-mode collision: ir_working==0 still reads the real sensor, it just doesn't react to
    // it for avoidance — a genuine impact drives the reading far above CRASH_ON, which is what
    // triggers the crash (the accelerometer "tap" event was tried first but proved unreliable)
    CRASH_ON: 4000,    // prox value that counts as "actually touching" the obstacle
    CRASH_TICKS: 10,   // 10 × 50ms = 0.5s push after impact, then stop

    BATT_STEP: 2,  // battery ramp, units per 50ms tick (192 units ≈ 4.8s; 4 → ~2.4s)

    BEEP_FAIL_HZ: 250,  // flat low fail beeps
    BEEP_OK_HZ: 400,    // first success note
    BEEP_OK_STEP: 200,  // Hz added per note → 400, 600, 800
    BEEP_LEN: 15,       // note length, 1/60s units (15 = 250ms)
    BEEP_GAP: 7,        // timer0 ticks between notes (7 = 350ms)
} as const satisfies Record<string, number>;

const inlineConstants = (src: string): string =>
  src.replace(/\b[A-Z][A-Z0-9_]*\b/g, (m) =>
    m in ASEBA_CONSTANTS ? String(ASEBA_CONSTANTS[m]) : m
  );

// upload inlineConstants(asebaSource) to the Thymio

const rawAsebaScript = `
var battery_value   # displayed value, ramps toward battery_target
var battery_target
var seq_countdown
var current_speed
var left
var right
var mini
var maxi
var mean
var vari
var p1
var ndev
var ireg
var preg
var i
var r
var l[8]
var prox_led[5]
var prox_led_step[5]
var mic_val
var black_counter
var black_state
var previous_black_state
# zero vars: no "= 0" initializers — the VM zeroes memory at load (saves init bytecode)
var field_mode
var field_step
var to_repair  # 1 = app's algorithm classified this robot "à réparer": refuse to launch, beep_fail instead
var seq_step
var seq_type
var motor_noise
var light_working = 1
var ir_working    = 1
var battery_level = 2
var led_top
var avoid       # 0 follow, 1 orbit obstacle until off line, 2 orbit until line found
var touch_wait
var side  # +1 = pass on left (obstacle kept right), -1 = pass on right
var beep       # remaining notes to play
var beep_wait  # ticks until next note
var beep_freq
var beep_step  # Hz added after each note (0 = flat fail beeps)
var hold  # ticks to keep going straight after obstacle leaves sensor view
var w[5] = [W0, W1, W2, W3, W4]  # signed avoidance weights per front sensor
 
timer.period[0] = 50
 
# ─── Robot initialisation ───
callsub light_off
callsub circle_off
call leds.buttons(0, 0, 0, 0)
callsub prox_leds_off
call leds.prox.v(0, 0)
call leds.rc(0)
call leds.sound(0)
call leds.temperature(0, 0)
 
call sound.system(-1)
 
callsub set_battery
callsub apply_battery
callsub follow_reset
 
emit ready
 
# ─── Shared subs (factored to save bytecode) ───
 
sub stop_motors
    motor.left.target = 0
    motor.right.target = 0
 
sub prox_leds_off
    for i in 0:4 do
        prox_led[i] = 0
    end
    call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
 
sub circle_off
    call leds.circle(0, 0, 0, 0, 0, 0, 0, 0)
 
sub end_run
    field_step = 2
    callsub stop_motors
    callsub follow_reset
 
sub beep_fail
    beep_freq = BEEP_FAIL_HZ
    beep_step = 0
    callsub beep_go
 
sub beep_ok
    beep_freq = BEEP_OK_HZ
    beep_step = BEEP_OK_STEP
    callsub beep_go
 
sub beep_go
    beep = 3
    beep_wait = 1
 
sub show_fail
    callsub led_fail_value
    call leds.top(l[0], l[1], l[2])
    call leds.bottom.left(l[0], l[1], l[2])
    call leds.bottom.right(l[0], l[1], l[2])
 
sub fail_light_seq
    callsub show_fail
    seq_type = SEQ_TEST_LIGHT_FAILING
    seq_step = SEQ_NULL
    seq_countdown = 1
 
onevent button.center
    if field_mode == 1 then
        if button.center != 0 then
            call leds.buttons(32, 32, 32, 32)
            if field_step == 0 then
                if to_repair == 1 then
                    callsub beep_fail
                else
                    field_step = 1
                end
            else
                field_step = 0
                callsub stop_motors
                callsub follow_reset
                callsub set_battery
            end
        else
            call leds.buttons(0, 0, 0, 0)
        end
    end
 
onevent set_mode_on
    field_mode = 1

onevent set_mode_off
    # Same reset as the button.center "abort run" branch above — a robot pulled back to the lab
    # mid-run (or with a drained battery, field_step == 2) must come back to a clean idle state,
    # not whatever it was doing in the field.
    field_mode = 0
    field_step = 0
    callsub stop_motors
    callsub follow_reset
    callsub set_battery

onevent motor
    if motor_noise == 1 then
        current_speed = 0
        if motor.left.speed > 0 then
            current_speed += motor.left.speed
        else
            current_speed -= motor.left.speed
        end
        if motor.right.speed > 0 then
            current_speed += motor.right.speed
        else
            current_speed -= motor.right.speed
        end
        if current_speed > 10 then
            call math.rand(r)
            if r < 0 then
                r = -r
            end
            if r % 2 != 0 then
                call sound.freq(60 + (r % 60), 4)
            end
        end
    end
 
onevent test_sound
    motor.left.target = SPEED_NORMAL
    motor.right.target = SPEED_NORMAL
    seq_type = SEQ_TEST_NOISE
    seq_step = SEQ_NULL
    seq_countdown = SHORT_DIST_TICKS
 
onevent test_light
    if light_working == 1 then
        callsub light_on
        seq_type = SEQ_TEST_LIGHT_WORKING
        seq_step = SEQ_NULL
        seq_countdown = SHORT_DIST_TICKS
    else
        callsub fail_light_seq
    end
 
onevent test_ir
    callsub led_ir
    callsub prox_leds_off
    seq_type = SEQ_TEST_IR
    seq_step = SEQ_NULL
    seq_countdown = TICKS_CHASE
 
onevent test_battery
    callsub circle_off
    seq_type = SEQ_TEST_BATTERY
    seq_step = SEQ_NULL
    seq_countdown = TICKS_BATTERY_FLASH
 
onevent set_battery
    callsub set_battery
    callsub apply_battery
 
sub set_battery
    if battery_level == 2 then
        battery_target = 224
    elseif battery_level == 1 then
        battery_target = 150
    else
        battery_target = 64
    end
 
onevent light_on
    if light_working == 1 then
        callsub light_on
    else
        callsub fail_light_seq
    end
 
onevent light_off
    callsub light_off
 
onevent identify
    callsub light_on
    seq_type = SEQ_IDENTIFY
    seq_step = SEQ_NULL
    seq_countdown = TICKS_BATTERY_FLASH
 
sub light_on
    led_top = 1
    call leds.top(32, 32, 32)
    call leds.bottom.left(32, 32, 32)
    call leds.bottom.right(32, 32, 32)
 
sub light_off
    led_top = 0
    call leds.top(0, 0, 0)
    call leds.bottom.left(0, 0, 0)
    call leds.bottom.right(0, 0, 0)
 
sub led_fail_value
    call math.rand(l)
    for i in 0:2 do
        if l[i] < 0 then
            l[i] = 0
        else
            l[i] = l[i]/4000
        end
    end
 
sub led_ir
    if ir_working == 1 then
        for i in 0:4 do
            prox_led[i] = 32
        end
    else
        call math.rand(prox_led)
        for i in 0:4 do
            if prox_led[i] < 22000 then
                prox_led[i] = 0
            else
                prox_led[i] -= 22000
                prox_led[i] /= 800
            end
        end
    end
 
sub apply_battery
    l[0] = battery_value
    for i in 0:6 do
        if l[0] > 32 then
            l[i+1] = 32
            l[0] -= 32
        else
            l[i+1] = l[0]
            l[0] = 0
        end
    end
    call leds.circle(0, l[1], l[2], l[3], l[4], l[5], l[6], l[7])
 
onevent go_forward
    motor.left.target = SPEED_NORMAL
    motor.right.target = SPEED_NORMAL
    seq_type = SEQ_MOVE
    seq_step = SEQ_NULL
    seq_countdown = SHORT_DIST_TICKS
 
onevent go_backward
    motor.left.target = -SPEED_NORMAL
    motor.right.target = -SPEED_NORMAL
    seq_type = SEQ_MOVE
    seq_step = SEQ_NULL
    seq_countdown = SHORT_DIST_TICKS
 
onevent timer0
    # battery display: up = instant, down = BATT_STEP units per tick
    if battery_value < battery_target then
        battery_value = battery_target
    elseif battery_value > battery_target then
        battery_value -= BATT_STEP
        call math.max(battery_value, battery_value, battery_target)
        if battery_value <= 0 then
            battery_value = 0
            battery_target = 0
            callsub beep_fail
            callsub end_run
        end
    end
    if touch_wait > 0 then
        touch_wait -= 1
        if touch_wait == 0 then
            callsub beep_fail
            callsub end_run
        end
    end
    # beep sequencer: one note every BEEP_GAP ticks
    if beep > 0 then
        beep_wait -= 1
        if beep_wait == 0 then
            call sound.freq(beep_freq, BEEP_LEN)
            beep_freq += beep_step
            beep -= 1
            beep_wait = BEEP_GAP
        end
    end
    if seq_countdown > 0 then
        seq_countdown -= 1
        if seq_countdown == 0 then
 
            if seq_type == SEQ_TEST_NOISE then
                if seq_step == 0 then
                    seq_countdown = SHORT_WAIT_TICKS
                    callsub stop_motors
                elseif seq_step == 1 then
                    seq_countdown = SHORT_DIST_TICKS
                    motor.left.target = -SPEED_NORMAL
                    motor.right.target = -SPEED_NORMAL
                elseif seq_step == 2 then
                    callsub stop_motors
                    emit seq_done [motor_noise]
                    seq_type = SEQ_NULL
                end
                seq_step += 1
            end
 
            if seq_type == SEQ_TEST_LIGHT_WORKING then
                if seq_step == 0 then
                    callsub light_off
                    emit seq_done [1]
                    seq_type = SEQ_NULL
                end
            end
 
            if seq_type == SEQ_TEST_LIGHT_FAILING then
                if seq_step < 21 then
                    if seq_step%4 == 0 then
                        callsub show_fail
                    else
                        callsub light_off
                    end
                    seq_countdown = 1
                else
                    callsub light_off
                    emit seq_done [light_working]
                    seq_type = SEQ_NULL
                end
                seq_step += 1
            end
 
            if seq_type == SEQ_TEST_IR then
                if seq_step < 14 then
                    if seq_step%2 != 0 then
                        if ir_working == 0 then
                            callsub prox_leds_off
                        end
                        seq_countdown = TICKS_CHASE
                    else
                        if seq_step == 10 then
                            for i in 0:4 do
                                prox_led_step[i] = 0
                            end
                        else
                            for i in 0:4 do
                                if i <= seq_step/2 then
                                    prox_led_step[i] = prox_led[i]
                                else
                                    prox_led_step[i] = 0
                                end
                            end
                        end
                        call leds.prox.h(prox_led_step[0], prox_led_step[1], prox_led_step[2], prox_led_step[2], prox_led_step[3], prox_led_step[4], 0, 0)
                        seq_countdown = TICKS_FLICKER
                    end
                else
                    callsub prox_leds_off
                    emit seq_done [ir_working]
                    seq_type = SEQ_NULL
                end
                seq_step += 1
            end
 
            if seq_type == SEQ_TEST_BATTERY then
                if seq_step < 4 then
                    if seq_step % 2 == 0 then
                        callsub apply_battery
                    else
                        callsub circle_off
                    end
                    seq_countdown = TICKS_BATTERY_FLASH
                else
                    callsub apply_battery
                    emit seq_done [battery_level]
                    seq_type = SEQ_NULL
                end
                seq_step += 1
            end
 
            if seq_type == SEQ_MOVE then
                callsub stop_motors
            end
 
            if seq_type == SEQ_IDENTIFY then
                if seq_step < 5 then
                    if seq_step % 2 == 0 then
                        callsub light_off
                    else
                        callsub light_on
                    end
                    seq_countdown = TICKS_BATTERY_FLASH
                else
                    seq_type = SEQ_NULL
                end
                seq_step += 1
            end
        end
    end
 
onevent prox
    if motor_noise == 1 then
        if current_speed > 10 then
            mic_val = 127 + mic.intensity/2
        else
            mic_val = mic.intensity
        end
    else
        mic_val = mic.intensity/2
    end
    emit status[battery_value, mic_val, prox_led[0], prox_led[1], prox_led[2], prox_led[3], prox_led[4], seq_type, led_top, field_mode]
    if ir_working == 1 and seq_type != SEQ_TEST_IR then
        for i in 0:4 do
            prox_led[i] = prox.horizontal[i] / 156
        end
        call leds.prox.h(prox_led[0], prox_led[1], prox_led[2], prox_led[2], prox_led[3], prox_led[4], 0, 0)
    elseif seq_type != SEQ_TEST_IR then
        callsub prox_leds_off
    end
 
    if seq_type != SEQ_TEST_BATTERY then
        # keep battery_target in sync with battery_level while idle — a finished run
        # (field_step == 2) keeps its drained/dead level until the button resets it
        if field_step == 0 then
            callsub set_battery
        end
        callsub apply_battery
    end
 
    if field_step == 1 and avoid == 0 then
        callsub check_black_zone
        # obstacle detection: only when IR "works"; if not, robot stays blind
        if ir_working == 1 and (prox.horizontal[1] > OBST_ON or prox.horizontal[2] > OBST_ON or prox.horizontal[3] > OBST_ON) then
            # pick avoidance side: pass on the side where the obstacle is smaller
            if prox.horizontal[0] + prox.horizontal[1] > prox.horizontal[3] + prox.horizontal[4] then
                side = -1
            else
                side = 1
            end
            w[2] = W2*side  # center sensor pushes toward the chosen side
            hold = CLEAR_TICKS
            avoid = 1
        elseif ir_working == 0 and touch_wait == 0 and (prox.horizontal[0] > CRASH_ON or prox.horizontal[1] > CRASH_ON or prox.horizontal[2] > CRASH_ON or prox.horizontal[3] > CRASH_ON or prox.horizontal[4] > CRASH_ON) then
            # blind robot doesn't react to the sensor, but a real impact still drives the
            # reading far above CRASH_ON — that's the actual crash trigger
            touch_wait = CRASH_TICKS
        end
    end
    # re-test field_step: check_black_zone may have ended the run (end_run)
    if field_step == 1 then
        if avoid >= 1 then
            # phase A: obstacle visible -> pure repulsion steering
            # phase B: just cleared view -> straight for CLEAR_TICKS (body passes obstacle)
            # phase C: bias curves back to the line
            call math.dot(r, prox.horizontal[0:4], w, OBST_SHIFT)
            if r > OBST_SEEN or -r > OBST_SEEN then
                hold = CLEAR_TICKS
            end
            preg = OBST_BIAS*side  # reuse preg as bias term (unused during avoid)
            if hold > 0 then
                hold -= 1
                preg = 0
            end
            left = SPEED_NORMAL + preg - r
            right = SPEED_NORMAL - preg + r
            if avoid == 1 then
                # first leave the line
                if prox.ground.delta[1] > mean then
                    avoid = 2
                end
            elseif prox.ground.delta[1] < mean then
                # line found again -> resume following
                avoid = 0
                ireg = 0
            end
        else
            p1 = prox.ground.delta[1]
            callsub statistics
            call math.muldiv(ndev, 100, p1-mean, vari)
            if ndev < 200 and -ndev < 200 then
                preg = (PCOEFF*ndev)/100
                ireg += (ICOEFF*preg)/100
                left = SPEED_NORMAL+(preg+ireg)
                right = SPEED_NORMAL-(preg+ireg)
            else
                ireg = 0
                left = ndev
                right = -ndev
            end
        end
        callsub limit_speed
        callsub set_motor
    end
 
sub statistics
    call math.max(maxi, maxi, p1)
    call math.min(mini, mini, p1)
    if maxi-mini>400 then
        call math.muldiv(vari, 45, maxi-mini, 100)
        mean=(mini+maxi)/2
    end
 
sub limit_speed
    if left > MAX_SPEED then
        left = MAX_SPEED
    end
    if right > MAX_SPEED then
        right = MAX_SPEED
    end
    if left < -MAX_SPEED then
        left = -MAX_SPEED
    end
    if right < -MAX_SPEED then
        right = -MAX_SPEED
    end
 
sub set_motor
    motor.left.target=left
    motor.right.target=right
 
sub follow_reset
    mini = 1024
    maxi = 0
    mean = 512
    vari = 512
    ireg = 0
    black_counter = 0
    black_state = 0
    previous_black_state = 1  # ignore black under sensor at start; count only after seeing white
    avoid = 0
    callsub light_off
    touch_wait = 0
 
sub check_black_zone
    if prox.ground.delta[0] < BLACK_TH then
        black_state = 1
    else
        black_state = 0
    end
    if black_state == 1 and previous_black_state == 0 then
        black_counter += 1
        if black_counter == 1 then
            if light_working == 1 then
                callsub light_on
            else
                callsub fail_light_seq
            end
        elseif black_counter == 2 then
            if light_working == 0 then
                callsub beep_fail
                callsub end_run
            end
        elseif black_counter == 3 then
            callsub light_off
        elseif black_counter == 4 then
            battery_target = battery_target - 96 - 96*motor_noise
            # death now happens in timer0 when the ramp reaches 0
        elseif black_counter == 5 then
            callsub beep_ok
            callsub end_run
        end
    end
    previous_black_state = black_state
`;

export const asebaScript = inlineConstants(rawAsebaScript);

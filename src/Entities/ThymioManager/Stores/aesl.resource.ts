import { EventDescription } from '@mobsya-association/thymio-api';

// All custom events (both directions) must be registered with setEventsDescriptions.
// robot → app: ready, seq_done
// app → robot: light_off, light_on, test_battery, test_ir, test_light, test_sound
export const eventsDefinition: EventDescription[] = [
  { name: 'ready',        fixed_size: 0, index: 0 },
  { name: 'seq_done',     fixed_size: 1, index: 1 },
  { name: 'light_off',    fixed_size: 0, index: 2 },
  { name: 'light_on',     fixed_size: 0, index: 3 },
  { name: 'test_battery', fixed_size: 0, index: 4 },
  { name: 'test_ir',      fixed_size: 0, index: 5 },
  { name: 'test_light',   fixed_size: 0, index: 6 },
  { name: 'test_sound',   fixed_size: 0, index: 7 },
  { name: 'set_battery',  fixed_size: 0, index: 8 },
  { name: 'go_forward',   fixed_size: 0, index: 9 },
  { name: 'go_backward',  fixed_size: 0, index: 10 },
  { name: 'status',       fixed_size: 9, index: 11 },
  { name: 'identify',     fixed_size: 0, index: 12 },
];

export const asebaScript = `
var battery_value
var line_follow # {0, 1}
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
var pcoeff
var icoeff
var i
var r
var l[3]
var prox_led[5]
var prox_led_step[5]
var mic_val
var SEQ_NULL                = 0
var SEQ_TEST_NOISE          = 1
var SEQ_TEST_LIGHT_WORKING  = 2
var SEQ_TEST_LIGHT_FAILING  = 3
var SEQ_TEST_IR             = 4
var SEQ_TEST_BATTERY        = 5
var SEQ_MOVE                = 7
var SEQ_IDENTIFY            = 8
var SHORT_DIST_TICKS        = 40
var SHORT_WAIT_TICKS        = 5
var SPEED_NORMAL            = 80
var TICKS_BATTERY_FLASH     = 5
var TICKS_FLICKER           = 2
var TICKS_CHASE             = 12
var field_mode    = 0
var field_step    = 0
var seq_step      = SEQ_NULL
var seq_type      = SEQ_NULL
var motor_noise   = 0
var light_working = 1
var ir_working    = 1
var battery_level = 2
var led_top = 0

timer.period[0] = 50

mini=1024
maxi=0
mean=512
vari=512
pcoeff=60
icoeff=33
ireg=0

# ─── Robot initialisation ───
call leds.bottom.left(0, 0, 0)
call leds.bottom.right(0, 0, 0)
call leds.circle(0, 0, 0, 0, 0, 0, 0, 0)
call leds.top(0, 0, 0)
call leds.buttons(0, 0, 0, 0)
call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
call leds.prox.v(0, 0)
call leds.rc(0)
call leds.sound(0)
call leds.temperature(0, 0)

call sound.system(-1)

callsub apply_battery

emit ready

onevent button.center
    if field_mode == 1 then
        call leds.buttons(32, 32, 32, 32)
        if button.center == 0 then
            call leds.buttons(0, 0, 0, 0)
            if field_step == 0 then
                field_step = 1
            else
                field_step = 0
            end
        end
    end

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
        callsub led_fail_value
        call leds.top(l[0], l[1], l[2])
        call leds.bottom.left(l[0], l[1], l[2])
        call leds.bottom.right(l[0], l[1], l[2])
        seq_type = SEQ_TEST_LIGHT_FAILING
        seq_step = SEQ_NULL
        seq_countdown = 1
    end

onevent test_ir
    callsub led_ir
    call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
    seq_type = SEQ_TEST_IR
    seq_step = SEQ_NULL
    seq_countdown = TICKS_CHASE

onevent test_battery
    call leds.circle(0, 0, 0, 0, 0, 0, 0, 0)
    seq_type = SEQ_TEST_BATTERY
    seq_step = SEQ_NULL
    seq_countdown = TICKS_BATTERY_FLASH

onevent set_battery
    callsub apply_battery

onevent light_on
    if light_working == 1 then
        callsub light_on
    else
        callsub led_fail_value
        call leds.top(l[0], l[1], l[2])
        call leds.bottom.left(l[0], l[1], l[2])
        call leds.bottom.right(l[0], l[1], l[2])
        seq_type = SEQ_TEST_LIGHT_FAILING
        seq_step = SEQ_NULL
        seq_countdown = 1
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
    if battery_level == 2 then
        battery_value = 224
        call leds.circle(0, 32, 32, 32, 32, 32, 32, 32)
    elseif battery_level == 1 then
        battery_value = 150
        call leds.circle(0, 32, 32, 32, 32, 22, 0, 0)
    else
        battery_value = 64
        call leds.circle(0, 32, 32, 0, 0, 0, 0, 0)
    end

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
    if seq_countdown > 0 then
        seq_countdown -= 1
        if seq_countdown == 0 then

            if seq_type == SEQ_TEST_NOISE then
                if seq_step == 0 then
                    seq_countdown = SHORT_WAIT_TICKS
                    motor.left.target = 0
                    motor.right.target = 0
                elseif seq_step == 1 then
                    seq_countdown = SHORT_DIST_TICKS
                    motor.left.target = -SPEED_NORMAL
                    motor.right.target = -SPEED_NORMAL
                elseif seq_step == 2 then
                    motor.left.target = 0
                    motor.right.target = 0
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
                        callsub led_fail_value
                        call leds.top(l[0], l[1], l[2])
                        call leds.bottom.left(l[0], l[1], l[2])
                        call leds.bottom.right(l[0], l[1], l[2])
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
                            call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
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
                    call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
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
                        call leds.circle(0, 0, 0, 0, 0, 0, 0, 0)
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
                if seq_step == 0 then
                    motor.left.target = 0
                    motor.right.target = 0
                end
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
    emit status[battery_value, mic_val, prox_led[0], prox_led[1], prox_led[2], prox_led[3], prox_led[4], seq_type, led_top]
    if ir_working == 1 and seq_type != SEQ_TEST_IR then
        for i in 0:4 do
            prox_led[i] = prox.horizontal[i] / 156
        end
        call leds.prox.h(prox_led[0], prox_led[1], prox_led[2], prox_led[2], prox_led[3], prox_led[4], 0, 0)
    elseif seq_type != SEQ_TEST_IR then
        call leds.prox.h(0, 0, 0, 0, 0, 0, 0, 0)
    end

    if seq_type != SEQ_TEST_BATTERY then
        callsub apply_battery
    end

    if field_step == 1 then
        p1=prox.ground.delta[1]
        callsub statistics
        call math.muldiv(ndev, 100, p1-mean, vari)
        if ndev < 200 and -ndev < 200 then
            preg=(pcoeff*ndev)/100
            ireg+=(icoeff*preg)/100
            left=SPEED_NORMAL+(preg+ireg)
            right=SPEED_NORMAL-(preg+ireg)
        else
            ireg=0
            left=ndev
            right=-ndev
        end
        callsub set_motor
    end

sub statistics
    call math.max(maxi, maxi, p1)
    call math.min(mini, mini, p1)
    if maxi-mini>400 then
        call math.muldiv(vari, 45, maxi-mini, 100)
        mean=(mini+maxi)/2
    end

sub set_motor
    motor.left.target=left
    motor.right.target=right
`;

export const W = 12;
export const D = 16;
export const H0 = 8;
export const OMEGA = 0.5;
export const ITER = 8;
export const STEP = 3;
export const LIFT_STEP = 9;
export const HOLD_GAIN = 0.2;
export const HOLD_STEP_MAX = 12;
export const DMAX = 4;
export const VMAX = 2.5;
export const DAMP = 0.9;
export const VREST = 0.8;
export const VCUT = 0.3;
export const PEG_R = 17;
export const POST_R = 25;
export const POST_H = 38;
export const POST_REACH = 200;
export const LIFT = 45;
export const CLEARANCE = 38;
export const HOLD_RADIUS = 30;
export const LAND_WAIT = 40;
export const BLOCKER_H = 400;
export const CELL = 32;
export const SELF_GAP = 4;
export const WARM_EVERY = 2;
export const MARGIN = 3;

export const ENGINE_CONSTANTS: Record<string, number> = {
  W, D, H0, OMEGA, ITER, STEP, LIFT_STEP, HOLD_GAIN, HOLD_STEP_MAX, DMAX, VMAX, DAMP, VREST, VCUT, PEG_R, POST_R, POST_H, POST_REACH,
  LIFT, CLEARANCE, HOLD_RADIUS, LAND_WAIT, BLOCKER_H, CELL, SELF_GAP, WARM_EVERY, MARGIN,
};

import {
  ISLAND_HEIGHT,
  ISLAND_WIDTH,
  rubberOffset,
} from "../../src/desktop/island-motion";

// Coordinates are in "origin space": x = 0 is the wall the island leaves and x
// grows inward. The transformed island button draws the rounded body; these
// shapes add the sticky material that joins it to a wall or trails behind it.

const CENTER = ISLAND_HEIGHT / 2;
// Idle notch geometry; keep in sync with the island clip-paths in styles.css.
/** Vertical inset of the body inside the strip; the shoulders fill it. */
const INSET = 8;
const RADIUS = 10;
const SHOULDER = 8;
const KAPPA = 0.5522847498;
const THREAD = 2.5;
/** Fraction of the flight or return spent travelling before touching a wall. */
const FLIGHT_IMPACT = 0.6;
const RETURN_IMPACT = 0.5;
/** Horizontal stretch at the moment the flying body meets the far wall. */
const ARRIVAL_STRETCH = 1.2;

export type GooBody = { x: number; sx: number; sy: number };
type Bridge = {
  /** Half-height where the material meets the wall. */
  foot: number;
  /** Half-thickness at the narrowest point. */
  neck: number;
  /** Neck position as a fraction of the distance to the body contact. */
  reach: number;
  /** 0 joins the body's top edge, 1 its near corner, up to 2 its near side. */
  contact: number;
};
type Stub = { length: number; foot: number; tip: number };
type Tail = { length: number; tip: number; contact: number };
export type GooPose = {
  body: GooBody;
  origin?: Bridge;
  target?: Bridge;
  stub?: Stub;
  tail?: Tail;
};
type Outline = ReturnType<typeof outline>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const mix = (from: number, to: number, amount: number) =>
  from + (to - from) * amount;
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
const easeOut = (value: number) => 1 - Math.pow(1 - clamp01(value), 3);
const fmt = (value: number) => Math.round(value * 100) / 100;
const mirror = (y: number) => 2 * CENTER - y;

/** Eased segments through [time, value] keys, settling at each key. */
function keyed(time: number, keys: readonly (readonly [number, number])[]) {
  let [t0, v0] = keys[0]!;
  if (time <= t0) return v0;
  for (const [t1, v1] of keys.slice(1)) {
    if (time <= t1) return mix(v0, v1, smooth((time - t0) / (t1 - t0)));
    t0 = t1;
    v0 = v1;
  }
  return v0;
}

/** Matches the button's `inset(8px 0 round 10px)` clip under scale(sx, sy). */
function outline(body: GooBody) {
  const halfWidth = (ISLAND_WIDTH / 2) * body.sx;
  const halfHeight = (CENTER - INSET) * body.sy;
  return {
    left: body.x - halfWidth,
    right: body.x + halfWidth,
    top: CENTER - halfHeight,
    halfHeight,
    rx: RADIUS * body.sx,
    ry: RADIUS * body.sy,
  };
}

/**
 * Point where material joins the body's upper near side, with the direction
 * the body outline continues in. `near` is the wall-to-body distance.
 */
function contactPoint(near: number, shape: Outline, contact: number, neck: number) {
  if (contact <= 1) {
    const angle = (contact * Math.PI) / 2;
    const dx = shape.rx * Math.cos(angle);
    const dy = shape.ry * Math.sin(angle);
    const length = Math.hypot(dx, dy) || 1;
    return {
      x: near + shape.rx * (1 - Math.sin(angle)),
      y: shape.top + shape.ry * (1 - Math.cos(angle)),
      dx: dx / length,
      dy: -dy / length,
    };
  }
  const start = shape.top + shape.ry;
  const end = Math.max(start, CENTER - neck - 1.5);
  return { x: near, y: mix(start, end, Math.min(1, contact - 1)), dx: 0, dy: -1 };
}

function bridgePath(
  wall: number,
  direction: 1 | -1,
  near: number,
  shape: Outline,
  bridge: Bridge,
) {
  const X = (x: number) => fmt(wall + direction * x);
  const contact = contactPoint(near, shape, bridge.contact, bridge.neck);
  const neckX = bridge.reach * contact.x;
  const neckY = CENTER - bridge.neck;
  const footY = CENTER - bridge.foot;
  // Quarter-ellipse handles reproduce the idle notch shoulders exactly at rest.
  const wallHandle = footY + KAPPA * (bridge.foot - bridge.neck);
  const neckHandle = neckX * (1 - KAPPA);
  const run = contact.x - neckX;
  const rise = neckY - contact.y;
  const leave = neckX + 0.5 * run;
  const arrive =
    0.7 * (run * Math.abs(contact.dx) + rise * Math.abs(contact.dy));
  const joinX = contact.x - contact.dx * arrive;
  const joinY = contact.y - contact.dy * arrive;
  // Close through the body's middle: an edge that merely touches the body
  // outline would leave a faint anti-aliasing seam between the two layers.
  const core = near + (shape.right - shape.left) / 2;
  return (
    `M${X(0)} ${fmt(footY)}` +
    `C${X(0)} ${fmt(wallHandle)} ${X(neckHandle)} ${fmt(neckY)} ${X(neckX)} ${fmt(neckY)}` +
    `C${X(leave)} ${fmt(neckY)} ${X(joinX)} ${fmt(joinY)} ${X(contact.x)} ${fmt(contact.y)}` +
    `H${X(core)}V${fmt(mirror(contact.y))}H${X(contact.x)}` +
    `C${X(joinX)} ${fmt(mirror(joinY))} ${X(leave)} ${fmt(mirror(neckY))} ${X(neckX)} ${fmt(mirror(neckY))}` +
    `C${X(neckHandle)} ${fmt(mirror(neckY))} ${X(0)} ${fmt(mirror(wallHandle))} ${X(0)} ${fmt(mirror(footY))}Z`
  );
}

/** Snapped remnant still attached to the origin wall, ending in a bead. */
function stubPath({ length, foot, tip }: Stub) {
  const footY = CENTER - foot;
  const tipY = CENTER - tip;
  const wallHandle = footY + KAPPA * (foot - tip);
  const tipHandle = length * 0.4;
  return (
    `M0 ${fmt(footY)}` +
    `C0 ${fmt(wallHandle)} ${fmt(tipHandle)} ${fmt(tipY)} ${fmt(length)} ${fmt(tipY)}` +
    `A${fmt(tip)} ${fmt(tip)} 0 0 1 ${fmt(length)} ${fmt(mirror(tipY))}` +
    `C${fmt(tipHandle)} ${fmt(mirror(tipY))} 0 ${fmt(mirror(wallHandle))} 0 ${fmt(mirror(footY))}Z`
  );
}

/** Snapped thread trailing the body, retracting into its near side. */
function tailPath(shape: Outline, { length, tip, contact }: Tail) {
  const point = contactPoint(shape.left, shape, contact, tip);
  const tipX = shape.left - length;
  const tipY = CENTER - tip;
  const run = point.x - tipX;
  const rise = tipY - point.y;
  const leave = tipX + 0.55 * run;
  const arrive = 0.55 * (run * Math.abs(point.dx) + rise * Math.abs(point.dy));
  const joinX = point.x - point.dx * arrive;
  const joinY = point.y - point.dy * arrive;
  return (
    `M${fmt(tipX)} ${fmt(tipY)}` +
    `C${fmt(leave)} ${fmt(tipY)} ${fmt(joinX)} ${fmt(joinY)} ${fmt(point.x)} ${fmt(point.y)}` +
    `H${fmt((shape.left + shape.right) / 2)}V${fmt(mirror(point.y))}H${fmt(point.x)}` +
    `C${fmt(joinX)} ${fmt(mirror(joinY))} ${fmt(leave)} ${fmt(mirror(tipY))} ${fmt(tipX)} ${fmt(mirror(tipY))}` +
    `A${fmt(tip)} ${fmt(tip)} 0 0 1 ${fmt(tipX)} ${fmt(tipY)}Z`
  );
}

/** One nonzero-filled path; `width` locates the destination wall. */
export function gooPath(pose: GooPose, width: number) {
  const shape = outline(pose.body);
  let path = "";
  if (pose.origin) path += bridgePath(0, 1, shape.left, shape, pose.origin);
  if (pose.target)
    path += bridgePath(width, -1, width - shape.right, shape, pose.target);
  if (pose.stub && pose.stub.foot > 0.2) path += stubPath(pose.stub);
  if (pose.tail && pose.tail.length > 0.2) path += tailPath(shape, pose.tail);
  return path;
}

/** Island transform relative to its idle slot at the origin wall. */
export function travelerTransform(body: GooBody, from: "left" | "right") {
  const shift = (body.x - ISLAND_WIDTH / 2) * (from === "left" ? 1 : -1);
  return `translate3d(${fmt(shift)}px, 0, 0) scale(${body.sx.toFixed(4)}, ${body.sy.toFixed(4)})`;
}

/** A held pull: an hourglass waist that thins to a thread at the release point. */
export function pullPose(pull: number): GooPose {
  const p = clamp01(pull);
  const body = {
    x: ISLAND_WIDTH / 2 + rubberOffset(p),
    sx: 1 + 0.22 * p,
    sy: 1 - 0.07 * p,
  };
  const halfHeight = outline(body).halfHeight;
  return {
    body,
    origin: {
      foot: mix(CENTER, 17, Math.pow(p, 0.9)),
      neck: mix(halfHeight, THREAD, Math.pow(p, 0.9)),
      reach: mix(SHOULDER / RADIUS, 0.45, smooth(p / 0.3)),
      contact: 1.35 * Math.pow(p, 0.75),
    },
  };
}

/** Pinned against a wall after impact: squash, rebound, then settle. */
function wobble(time: number, depth: number, arriving: number) {
  const sx =
    time < 0.2
      ? mix(arriving, 1 - depth, easeOut(time / 0.2))
      : keyed(time, [
          [0.2, 1 - depth],
          [0.45, 1 + depth * 0.35],
          [0.7, 1 - depth * 0.12],
          [1, 1],
        ]);
  return { sx, sy: 1 / Math.sqrt(sx) };
}

export function flightPose(time: number, width: number): GooPose {
  const t = clamp01(time);
  const launch = pullPose(1);
  const released = launch.origin!;
  const start = launch.body;
  const pose: GooPose = { body: start };
  if (t < FLIGHT_IMPACT) {
    const q = t / FLIGHT_IMPACT;
    const sx = keyed(q, [
      [0, start.sx],
      [0.2, 1.5],
      [0.75, 1.34],
      [1, ARRIVAL_STRETCH],
    ]);
    const sy = keyed(q, [
      [0, start.sy],
      [0.2, 0.78],
      [0.75, 0.82],
      [1, 1 / Math.sqrt(ARRIVAL_STRETCH)],
    ]);
    // Released tension launches fast; it is still moving when it hits the wall.
    const travel = 0.45 * q + 0.55 * (1 - (1 - q) * (1 - q));
    const end = width - (ISLAND_WIDTH / 2) * ARRIVAL_STRETCH;
    pose.body = { x: mix(start.x, end, travel), sx, sy };
  } else {
    const q = (t - FLIGHT_IMPACT) / (1 - FLIGHT_IMPACT);
    const { sx, sy } = wobble(q, 0.2, ARRIVAL_STRETCH);
    pose.body = { x: width - (ISLAND_WIDTH / 2) * sx, sx, sy };
    const halfHeight = outline(pose.body).halfHeight;
    const grow = smooth((q - 0.04) / 0.5);
    pose.target = {
      foot: Math.min(CENTER, mix(halfHeight, CENTER, grow)),
      neck: halfHeight,
      reach: (SHOULDER / RADIUS) * grow,
      contact: 0,
    };
  }
  const launchShape = outline(start);
  const contact = contactPoint(
    launchShape.left,
    launchShape,
    released.contact,
    released.neck,
  );
  const breakX = released.reach * contact.x;
  // The thread snaps at its neck: the wall half recoils and beads up, while the
  // body half is drawn back in behind the island.
  const recoil = t / 0.28;
  if (recoil < 1) {
    const foot = released.foot * (1 - smooth(recoil));
    pose.stub = {
      length: breakX * (1 - easeOut(recoil * 1.4)),
      foot,
      tip: Math.min(foot, mix(released.neck, 5, easeOut(recoil * 1.6))),
    };
  }
  const retract = t / 0.2;
  if (retract < 1)
    pose.tail = {
      length: (launchShape.left - breakX) * (1 - easeOut(retract)),
      tip: mix(released.neck, 4, easeOut(retract)),
      contact: mix(released.contact, 1.2, retract),
    };
  return pose;
}

export function returnPose(time: number, pull: number): GooPose {
  const t = clamp01(time);
  if (t < RETURN_IMPACT)
    return pullPose(pull * Math.cos(((t / RETURN_IMPACT) * Math.PI) / 2));
  const { sx, sy } = wobble(
    (t - RETURN_IMPACT) / (1 - RETURN_IMPACT),
    0.16 * Math.min(1, pull * 1.5),
    1,
  );
  const body = { x: (ISLAND_WIDTH / 2) * sx, sx, sy };
  return {
    body,
    origin: {
      foot: CENTER,
      neck: outline(body).halfHeight,
      reach: SHOULDER / RADIUS,
      contact: 0,
    },
  };
}

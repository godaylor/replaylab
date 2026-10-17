import { deriveBallPose, type ActionPath, type ActorId, type Pose, type ReplaySnapshot, type TacticalActionType } from './domain';
import type { PlaybackFrame } from './playback';

/** A product-owned presentation of the same canonical half-court. Geometry and
 * animation are derived at render time; this module owns no document state or scheduler. */
export type CourtScene3D = {
  snapshot: ReplaySnapshot;
  phaseIndex?: number;
  frame?: PlaybackFrame | null;
  selectedId?: ActorId | 'ball' | null;
  theme?: 'dark' | 'light';
  showActions?: boolean;
  motionReduced?: boolean;
  draft?: { entityId: ActorId | 'ball'; pose: Pose } | null;
  actionDraft?: { type: TacticalActionType; path: ActionPath } | null;
  selectedActionId?: string | null;
};

type Vec3 = { x: number; y: number; z: number };
type Projected = { x: number; y: number; scale: number; depth: number };
type Project = (point: Vec3) => Projected;
const stageCache = new WeakMap<CanvasRenderingContext2D, { key: string; canvas: HTMLCanvasElement }>();
const v = (x: number, y: number, z = 0): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const subtract = (a: Vec3, b: Vec3) => v(a.x - b.x, a.y - b.y, a.z - b.z);
const normalize = (a: Vec3) => { const length = Math.hypot(a.x, a.y, a.z); return v(a.x / length, a.y / length, a.z / length); };
const cross = (a: Vec3, b: Vec3) => v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const camera = v(140, 1120, 1000);
const forward = normalize(subtract(v(430, 230, 12), camera));
const right = normalize(cross(v(0, 0, 1), forward));
const up = cross(forward, right);
const rawProjection = (point: Vec3) => {
  const relative = subtract(point, camera);
  const depth = dot(relative, forward);
  return { x: dot(relative, right) / depth, y: -dot(relative, up) / depth, depth };
};
const sceneExtent = [
  v(-38, -34, -15), v(878, -34, -15), v(878, 494, -15), v(-38, 494, -15),
  v(805, 188, 148), v(863, 272, 148),
  v(20, 20, 90), v(20, 440, 90), v(820, 20, 90), v(820, 440, 90),
].map(rawProjection);
const extent = {
  minX: Math.min(...sceneExtent.map(point => point.x)),
  maxX: Math.max(...sceneExtent.map(point => point.x)),
  minY: Math.min(...sceneExtent.map(point => point.y)),
  maxY: Math.max(...sceneExtent.map(point => point.y)),
};

function projectionLayout(width: number, height: number) {
  const margin = Math.min(width, height) * .035;
  const scale = Math.min((width - margin * 2) / (extent.maxX - extent.minX), (height - margin * 2) / (extent.maxY - extent.minY));
  const centerX = (extent.minX + extent.maxX) / 2;
  const centerY = (extent.minY + extent.maxY) / 2;
  return { scale, centerX, centerY };
}

function projector(width: number, height: number): Project {
  const { scale, centerX, centerY } = projectionLayout(width, height);
  return point => {
    const raw = rawProjection(point);
    return { x: width / 2 + (raw.x - centerX) * scale, y: height / 2 + (raw.y - centerY) * scale, scale: scale / raw.depth, depth: raw.depth };
  };
}

/** Canvas-pixel coordinates, independent of CSS size/device-pixel ratio. */
export function projectCourtPoint3D(width: number, height: number, pose: Pose, z = 0) {
  return projector(width, height)(v(pose.x, pose.y, z));
}

/** Intersect the screen ray with the canonical floor. Deliberately do not clamp:
 * pointer capture needs continuous coordinates beyond the floor while the
 * command layer owns the legal court boundary. */
export function inverseCourtPoint3D(width: number, height: number, screen: Pose): Pose | null {
  if (![width, height, screen.x, screen.y].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const { scale, centerX, centerY } = projectionLayout(width, height);
  const rawX = (screen.x - width / 2) / scale + centerX;
  const rawY = (screen.y - height / 2) / scale + centerY;
  const direction = v(forward.x + right.x * rawX - up.x * rawY, forward.y + right.y * rawX - up.y * rawY, forward.z + right.z * rawX - up.z * rawY);
  if (Math.abs(direction.z) < 1e-9) return null;
  const distance = -camera.z / direction.z;
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const pose = { x: camera.x + distance * direction.x, y: camera.y + distance * direction.y };
  return Number.isFinite(pose.x) && Number.isFinite(pose.y) ? pose : null;
}

/** A single derived pose projection shared by drawing and hit testing. Neither
 * the drag preview nor its possession-derived ball can write into the snapshot. */
export function courtScenePoses3D(scene: CourtScene3D) {
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0]!;
  let poses = scene.frame?.poses ?? phase.poses;
  let ballPose = scene.frame?.ballPose ?? phase.ballPose;
  if (scene.draft?.entityId === 'ball') ballPose = scene.draft.pose;
  else if (scene.draft) {
    poses = { ...poses, [scene.draft.entityId]: scene.draft.pose };
    if (phase.possession.value === scene.draft.entityId) ballPose = deriveBallPose(poses, phase.possession.value, null);
  }
  return { poses, ballPose };
}

function polygon(ctx: CanvasRenderingContext2D, project: Project, points: Vec3[], fill: string, stroke?: string, lineWidth = 1) {
  ctx.beginPath();
  points.forEach((point, index) => { const screen = project(point); if (index === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y); });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function line(ctx: CanvasRenderingContext2D, project: Project, points: Vec3[], color: string, width = 2) {
  if (points.length < 2) return;
  ctx.beginPath();
  points.forEach((point, index) => { const screen = project(point); if (index === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y); });
  ctx.strokeStyle = color;
  ctx.lineWidth = width * project(points[0]!).scale;
  ctx.stroke();
}

function ringPoints(x: number, y: number, radiusX: number, radiusY = radiusX, z = .4, start = 0, end = Math.PI * 2) {
  return Array.from({ length: 65 }, (_, index) => { const angle = start + (end - start) * index / 64; return v(x + Math.cos(angle) * radiusX, y + Math.sin(angle) * radiusY, z); });
}

function prism(ctx: CanvasRenderingContext2D, project: Project, bottom: Vec3[], top: Vec3[], colors: string[]) {
  const faces = bottom.map((point, index) => {
    const next = (index + 1) % bottom.length;
    return { points: [point, bottom[next]!, top[next]!, top[index]!], color: colors[index % colors.length]! };
  });
  faces.push({ points: top, color: colors.at(-1)! });
  faces.sort((a, b) => b.points.reduce((sum, p) => sum + project(p).depth, 0) / b.points.length - a.points.reduce((sum, p) => sum + project(p).depth, 0) / a.points.length);
  for (const face of faces) polygon(ctx, project, face.points, face.color);
}

function rectangle(x: number, y: number, width: number, height: number, z = 0) {
  return [v(x, y, z), v(x + width, y, z), v(x + width, y + height, z), v(x, y + height, z)];
}

function drawFloor(ctx: CanvasRenderingContext2D, project: Project, light: boolean) {
  // The slab, apron, boards and every marking share the exact same perspective.
  prism(ctx, project, rectangle(-30, -28, 900, 516, -15), rectangle(-30, -28, 900, 516), ['#292820', '#191d1a', '#101613', '#39382a', '#34382d']);
  line(ctx, project, [v(-30, 488, -3), v(870, 488, -3), v(870, -28, -3)], '#d49a50', 1.5);
  polygon(ctx, project, rectangle(0, 0, 840, 460, .1), '#c99a61');
  const wood = light
    ? ['#c49b6b', '#c8a071', '#c29a69', '#cca576', '#c69e6d', '#c9a172', '#cba474']
    : ['#b38456', '#b78b5b', '#b08254', '#bc9060', '#b58859', '#b88c5d', '#bc9061'];
  for (let row = 0; row < 23; row++) {
    const offset = (row * 67) % 150;
    for (let column = -1; column < 6; column++) {
      const start = Math.max(0, column * 168 + offset);
      const end = Math.min(840, column * 168 + offset + 168);
      if (end <= start) continue;
      const color = wood[(row * 3 + column + 8) % wood.length]!;
      polygon(ctx, project, rectangle(start, row * 20, end - start, 20, .13), color, 'rgba(75,46,22,.16)', .4);
      for (let grain = 1; grain <= 4; grain++) line(ctx, project, [v(start + 4, row * 20 + grain * 3.7, .16), v((start + end) / 2, row * 20 + grain * 3.7 + .9, .16), v(end - 4, row * 20 + grain * 3.7 + .3, .16)], 'rgba(80,49,24,.08)', .5);
    }
  }
  // Painted lane and restrained single-half-court linework.
  polygon(ctx, project, rectangle(560, 154, 260, 152, .2), light ? 'rgba(78,61,42,.2)' : 'rgba(60,47,30,.24)');
  polygon(ctx, project, rectangle(796, 154, 24, 152, .25), 'rgba(51,40,25,.14)');
  const markings = '#fff0d2';
  line(ctx, project, [...rectangle(20, 20, 800, 420, .4), v(20, 20, .4)], markings, 2.2);
  line(ctx, project, [...rectangle(560, 154, 260, 152, .4), v(560, 154, .4)], markings, 2.2);
  line(ctx, project, ringPoints(560, 230, 58, 58, .4, Math.PI / 2, Math.PI * 1.5), markings, 2.2);
  ctx.setLineDash([4, 5]);
  line(ctx, project, ringPoints(560, 230, 58, 58, .4, -Math.PI / 2, Math.PI / 2), 'rgba(255,240,210,.5)', 1.6);
  ctx.setLineDash([]);
  line(ctx, project, ringPoints(20, 230, 58, 58, .4, -Math.PI / 2, Math.PI / 2), markings, 2.2);
  line(ctx, project, [v(820, 44, .4), v(774, 44, .4), ...ringPoints(774, 230, 370, 186, .4, -Math.PI / 2, -Math.PI * 1.5), v(820, 416, .4)], markings, 2.2);
  line(ctx, project, ringPoints(774, 230, 47, 47, .4, Math.PI / 2, Math.PI * 1.5), markings, 2);
  for (const x of [610, 655, 700, 744]) {
    line(ctx, project, [v(x, 147, .4), v(x, 154, .4)], markings, 2);
    line(ctx, project, [v(x, 306, .4), v(x, 313, .4)], markings, 2);
  }
  // Soft illumination, clipped to the real floor silhouette.
  ctx.save();
  ctx.beginPath();
  rectangle(0, 0, 840, 460).forEach((p, i) => { const screen = project(p); if (i === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y); });
  ctx.closePath(); ctx.clip();
  const center = project(v(410, 150));
  const glow = ctx.createRadialGradient(center.x, center.y, 10, center.x, center.y, 520 * center.scale);
  glow.addColorStop(0, light ? 'rgba(255,247,203,.2)' : 'rgba(255,230,169,.28)');
  glow.addColorStop(.6, 'rgba(25,34,32,.04)');
  glow.addColorStop(1, light ? 'rgba(36,29,22,.17)' : 'rgba(17,20,17,.31)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore();
}

function sphere(ctx: CanvasRenderingContext2D, project: Project, point: Vec3, radius: number, colors: [string, string, string]) {
  const p = project(point); const size = radius * p.scale;
  const gradient = ctx.createRadialGradient(p.x - size * .35, p.y - size * .45, size * .06, p.x + size * .18, p.y + size * .2, size * 1.15);
  colors.forEach((color, index) => gradient.addColorStop(index / 2, color));
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(p.x, p.y, size, 0, Math.PI * 2); ctx.fill();
}

function limb(ctx: CanvasRenderingContext2D, project: Project, start: Vec3, end: Vec3, radius: number, dark: string, color: string) {
  const a = project(start); const b = project(end); const width = radius * (a.scale + b.scale);
  ctx.lineCap = 'round';
  ctx.strokeStyle = dark; ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = width * .65;
  ctx.beginPath(); ctx.moveTo(a.x - width * .13, a.y - width * .1); ctx.lineTo(b.x - width * .13, b.y - width * .1); ctx.stroke();
}

function shadow(ctx: CanvasRenderingContext2D, project: Project, pose: Pose, radius: number, alpha: number) {
  if (radius > 20) {
    polygon(ctx, project, [v(pose.x - 8, pose.y + 2, .5), v(pose.x + 7, pose.y - 2, .5), v(pose.x + 33, pose.y + 34, .5), v(pose.x + 18, pose.y + 42, .5)], `rgba(6,21,27,${alpha * .7})`);
    polygon(ctx, project, ringPoints(pose.x + 28, pose.y + 41, 8, 6, .55), `rgba(6,21,27,${alpha * .7})`);
  }
  polygon(ctx, project, ringPoints(pose.x + 12, pose.y + 13, radius, radius * .72, .6), `rgba(7,20,25,${alpha})`);
  polygon(ctx, project, ringPoints(pose.x + 6, pose.y + 7, radius * .7, radius * .48, .7), `rgba(7,20,25,${alpha * .65})`);
}

function drawPlayer(ctx: CanvasRenderingContext2D, project: Project, scene: CourtScene3D, actor: ReplaySnapshot['actors'][number], pose: Pose) {
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0]!;
  const next = scene.frame?.nextPhaseIndex == null ? null : scene.snapshot.phases[scene.frame.nextPhaseIndex];
  const movement = next ? subtract(v(next.poses[actor.id].x, next.poses[actor.id].y), v(phase.poses[actor.id].x, phase.poses[actor.id].y)) : v(0, 0);
  const moving = Math.hypot(movement.x, movement.y) > 4 && (scene.frame?.transitionProgress ?? 0) > 0;
  const { ballPose } = courtScenePoses3D(scene);
  const direction = moving ? Math.atan2(movement.y, movement.x) : actor.team === 'offense' ? Math.atan2(230 - pose.y, 774 - pose.x) : Math.atan2(ballPose.y - pose.y, ballPose.x - pose.x);
  const f = { x: Math.cos(direction), y: Math.sin(direction) };
  const lateral = { x: -f.y, y: f.x };
  const step = moving && !scene.motionReduced ? Math.sin((scene.frame?.playheadMs ?? 0) / 105 + actor.number * .9) : 0;
  const lean = moving ? 3 : 0;
  const p = (side: number, ahead: number, z: number) => v(pose.x + lateral.x * side + f.x * (ahead + lean * z / 70), pose.y + lateral.y * side + f.y * (ahead + lean * z / 70), z);
  const offense = actor.team === 'offense';
  const skins: [string, string, string][] = [['#d6925c', '#a8663e', '#623a28'], ['#9d6244', '#70412e', '#412a24'], ['#e0b38a', '#b7825c', '#745139'], ['#bc7b50', '#8f5638', '#503425'], ['#80513d', '#54382c', '#332720']];
  const skin = skins[(actor.number - 1 + (offense ? 0 : 2)) % skins.length]!;
  const isHolder = phase.possession.value === actor.id && (!next || next.possession.value === actor.id || (scene.frame?.transitionProgress ?? 0) < .12);
  const action = scene.snapshot.actions.find(a => !a.archived && a.fromFrameId === phase.id && a.actorId === actor.id);
  const screening = action?.type === 'screen';
  const footSpread = offense ? screening ? 11 : 7 : 10;
  const torsoZ = offense ? 39 : 36;
  const headZ = offense ? 76 : 72;

  if (scene.selectedId === actor.id) {
    polygon(ctx, project, ringPoints(pose.x, pose.y, 29, 24, .9), 'rgba(255,225,128,.23)');
    line(ctx, project, ringPoints(pose.x, pose.y, 28, 23, 1), '#ffb365', 2.5);
  }
  // Actual joint positions give moving players a readable stride without idle motion.
  const legs = [-1, 1].map(side => ({ side, knee: p(side * footSpread, side * step * 8 + 2, 18), ankle: p(side * footSpread, side * step * 14, 5), hip: p(side * 6, 0, torsoZ) }));
  legs.sort((a, b) => project(b.ankle).depth - project(a.ankle).depth);
  for (const leg of legs) {
    limb(ctx, project, leg.hip, leg.knee, 4.6, skin[2], skin[1]);
    limb(ctx, project, leg.knee, leg.ankle, 3.5, skin[2], skin[1]);
    limb(ctx, project, p(leg.side * footSpread, leg.side * step * 14, 5), p(leg.side * footSpread, leg.side * step * 14, 10), 3.8, '#becbd0', '#f3f4e9');
    const shoeAhead = leg.side * step * 14;
    const shoe = [p(leg.side * footSpread - 4, shoeAhead - 4, 2), p(leg.side * footSpread + 4, shoeAhead - 4, 2), p(leg.side * footSpread + 4, shoeAhead + 10, 2), p(leg.side * footSpread - 4, shoeAhead + 10, 2)];
    prism(ctx, project, shoe, shoe.map(point => ({ ...point, z: 5 })), ['#183144', '#d8e6e7', '#eef3ea', '#718f9c', offense ? '#f9eed9' : '#a7d4e6']);
  }
  // Twelve rounded cloth faces avoid the square box silhouette. Light is fixed
  // in world space, so the shading remains coherent as athletes turn or move.
  const cloth = (bottomWidth: number, topWidth: number, depth: number, bottomZ: number, topZ: number, shorts: boolean) => {
    const count = 12;
    const bodyRing = (width: number, z: number) => Array.from({ length: count }, (_, index) => p(Math.cos(index / count * Math.PI * 2) * width, Math.sin(index / count * Math.PI * 2) * depth, z));
    const bottom = bodyRing(bottomWidth, bottomZ); const top = bodyRing(topWidth, topZ);
    const faces = bottom.map((point, index) => {
      const angle = (index + .5) / count * Math.PI * 2;
      const normal = { x: lateral.x * Math.cos(angle) + f.x * Math.sin(angle), y: lateral.y * Math.cos(angle) + f.y * Math.sin(angle) };
      const brightness = Math.max(0, -normal.x * .45 - normal.y * .8);
      const color = offense ? `hsl(19 84% ${shorts ? 34 + brightness * 13 : 40 + brightness * 18}%)` : `hsl(201 44% ${shorts ? 24 + brightness * 15 : 40 + brightness * 22}%)`;
      return { points: [point, bottom[(index + 1) % count]!, top[(index + 1) % count]!, top[index]!], color };
    });
    faces.sort((a, b) => b.points.reduce((sum, point) => sum + project(point).depth, 0) - a.points.reduce((sum, point) => sum + project(point).depth, 0));
    for (const face of faces) polygon(ctx, project, face.points, face.color);
    polygon(ctx, project, top, offense ? '#f67b3c' : '#83b3c6');
  };
  cloth(11, 10, 7, torsoZ - 10, torsoZ + 3, true);
  line(ctx, project, [p(0, 6.2, torsoZ - 8), p(0, 6.2, torsoZ + 1)], offense ? '#96330f' : '#061e31', 1.2);
  cloth(9, 13, 6.4, torsoZ + 2, headZ - 17, false);
  // Uniform piping is visible on both shoulders and down both sides.
  for (const side of [-1, 1]) line(ctx, project, [p(side * 11.5, -3, headZ - 17), p(side * 8, -3, torsoZ + 3)], offense ? '#ffb979' : '#c8dfe6', 1.5);

  const arms = [-1, 1].map(side => {
    const reach = screening ? -2 : isHolder && side === 1 ? 15 : offense ? -side * step * 9 : 8;
    const wristZ = screening ? torsoZ + 5 : isHolder && side === 1 ? 30 : offense ? torsoZ + 1 : torsoZ + 11;
    return { shoulder: p(side * 12, 0, headZ - 17), elbow: p(side * (offense ? 16 : 21), reach * .65, torsoZ + 9), wrist: p(side * (screening ? 11 : offense ? 12 : 26), reach, wristZ) };
  });
  arms.sort((a, b) => project(b.shoulder).depth - project(a.shoulder).depth);
  for (const arm of arms) {
    limb(ctx, project, arm.shoulder, arm.elbow, 3.8, skin[2], skin[1]);
    limb(ctx, project, arm.elbow, arm.wrist, 3.1, skin[2], skin[0]);
    sphere(ctx, project, arm.wrist, 3.4, skin);
  }
  limb(ctx, project, p(0, 0, headZ - 14), p(0, 0, headZ - 6), 3.5, skin[2], skin[1]);
  sphere(ctx, project, p(0, 0, headZ), 7.5, skin);
  const head = project(p(0, -.5, headZ + 2));
  ctx.fillStyle = actor.number % 3 === 0 ? '#251b17' : '#151b1b';
  ctx.beginPath(); ctx.ellipse(head.x, head.y - head.scale * 3.2, head.scale * 6.4, head.scale * 3.5, -.15, Math.PI, Math.PI * 2); ctx.fill();
  // Jersey numbers face the viewer; a small ground badge stays readable when
  // two models overlap. These are labels, never separate canonical entities.
  const chest = project(p(0, -6.5, headZ - 23));
  ctx.font = `800 ${Math.max(7, 12 * chest.scale)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = offense ? '#8e2f16' : '#244f66'; ctx.lineWidth = 1.1;
  ctx.strokeText(String(actor.number), chest.x, chest.y);
  ctx.fillStyle = '#fff7e1'; ctx.fillText(String(actor.number), chest.x, chest.y);
  const badge = project(v(pose.x, pose.y + 25, 2));
  const badgeRadius = 12 * badge.scale;
  ctx.fillStyle = offense ? '#ed6927' : '#e3f1f4';
  ctx.strokeStyle = offense ? '#ffbc77' : '#5396bc'; ctx.lineWidth = Math.max(.7, badge.scale);
  ctx.beginPath(); ctx.roundRect(badge.x - badgeRadius, badge.y - badgeRadius * .7, badgeRadius * 2, badgeRadius * 1.4, offense ? badgeRadius * .7 : badgeRadius * .2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = offense ? '#201b12' : '#16384e';
  ctx.font = `800 ${Math.max(7, badgeRadius * 1.15)}px system-ui, sans-serif`; ctx.fillText(String(actor.number), badge.x, badge.y + .3);
}

function drawBasket(ctx: CanvasRenderingContext2D, project: Project) {
  prism(ctx, project, rectangle(836, 209, 36, 42, 0), rectangle(836, 209, 36, 42, 10), ['#1b2f39', '#1d3945', '#152b35', '#314b53', '#35535b']);
  prism(ctx, project, rectangle(850, 224, 10, 12, 8), rectangle(850, 224, 10, 12, 126), ['#253a45', '#527079', '#1a303c', '#6e8585', '#7f999d']);
  limb(ctx, project, v(855, 230, 125), v(803, 230, 130), 4, '#203743', '#66828b');
  polygon(ctx, project, [v(803, 190, 102), v(803, 270, 102), v(803, 270, 148), v(803, 190, 148)], 'rgba(191,223,226,.36)', '#d6e8e6', 1.4);
  line(ctx, project, [v(802, 214, 107), v(802, 246, 107), v(802, 246, 127), v(802, 214, 127), v(802, 214, 107)], '#f4f8e9', 2);
  line(ctx, project, [v(803, 230, 109), v(788, 230, 109)], '#ed692c', 3);
  for (let index = 0; index < 12; index++) {
    const angle = index / 12 * Math.PI * 2;
    const next = angle + Math.PI / 6;
    line(ctx, project, [v(774 + Math.cos(angle) * 14, 230 + Math.sin(angle) * 14, 108), v(774 + Math.cos(next) * 8, 230 + Math.sin(next) * 8, 88)], 'rgba(240,246,237,.7)', .8);
  }
  line(ctx, project, ringPoints(774, 230, 8, 8, 88), 'rgba(240,246,237,.7)', .9);
  line(ctx, project, ringPoints(774, 230, 14, 14, 109), '#ff8e49', 3.1);
}

/** The ball's plan position is always the deterministic playback projection. */
export function courtBallHeight3D(scene: CourtScene3D) {
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0]!;
  const progress = scene.frame?.transitionProgress ?? 0;
  const next = scene.frame?.nextPhaseIndex == null ? null : scene.snapshot.phases[scene.frame.nextPhaseIndex];
  if (next && next.possession.value !== phase.possession.value && progress > 0) return 36 + Math.sin(progress * Math.PI) * 33;
  const dribbling = scene.snapshot.actions.some(action => !action.archived && action.adjacency === 'valid' && action.fromFrameId === phase.id && action.type === 'dribble' && action.actorId === phase.possession.value);
  if (dribbling && progress > 0 && !scene.motionReduced) return 8 + Math.abs(Math.cos((scene.frame?.playheadMs ?? 0) / 105)) * 26;
  return phase.possession.value === 'loose' ? 7 : 35;
}

function drawBall(ctx: CanvasRenderingContext2D, project: Project, pose: Pose, height: number) {
  const center = v(pose.x, pose.y, height);
  sphere(ctx, project, center, 7.1, ['#ffc171', '#f27d29', '#9b3f16']);
  const point = project(center); const r = 6.9 * point.scale;
  ctx.strokeStyle = '#7d401d'; ctx.lineWidth = Math.max(.6, .8 * point.scale);
  ctx.beginPath(); ctx.ellipse(point.x, point.y, r * .38, r, -.35, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(point.x - r * .9, point.y - r * .4); ctx.quadraticCurveTo(point.x, point.y + r * .3, point.x + r * .9, point.y + r * .35); ctx.stroke();
}

function ballObjectDepth(project: Project, scene: CourtScene3D, poses: Record<ActorId, Pose>, ballPose: Pose, height: number) {
  const depth = project(v(ballPose.x, ballPose.y, height)).depth - 1;
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0]!;
  if (phase.possession.value === 'loose') return depth;
  const holder = poses[phase.possession.value];
  // A held ball is drawn at the hand in front of its own jersey. Preserve normal
  // occlusion by other players and the physical depth of a pass in flight.
  return Math.hypot(ballPose.x - holder.x, ballPose.y - holder.y) <= 35
    ? Math.min(depth, project(v(holder.x, holder.y, 25)).depth - 2)
    : depth;
}

function drawAction(ctx: CanvasRenderingContext2D, project: Project, type: TacticalActionType, actionPath: ActionPath, selected: boolean, ghost: boolean, draft = false) {
    const color = ghost && !draft ? '#e6a8ee' : selected ? '#ffae58' : type === 'pass' ? '#d1edff' : type === 'dribble' ? '#ffdfa0' : '#fff9e7';
    const path = actionPath.points.map(point => v(point.x, point.y, 1.5));
    const first = path[0]; const last = path.at(-1); const beforeLast = path.at(-2);
    if (!first || !last || !beforeLast) return;
    ctx.save();
    ctx.globalAlpha = ghost && !draft ? .55 : .95;
    if (ghost || type === 'pass') ctx.setLineDash([6 * project(first).scale, 6 * project(first).scale]);
    line(ctx, project, path, 'rgba(26,31,25,.6)', selected ? 8 : 6);
    line(ctx, project, path, color, selected ? 4 : 2.7);
    ctx.setLineDash([]);
    const angle = Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x);
    if (type === 'screen') {
      line(ctx, project, [v(last.x - Math.sin(angle) * 13, last.y + Math.cos(angle) * 13, 2), v(last.x + Math.sin(angle) * 13, last.y - Math.cos(angle) * 13, 2)], color, selected ? 5 : 3.8);
    } else {
      polygon(ctx, project, [last, v(last.x - 13 * Math.cos(angle - .5), last.y - 13 * Math.sin(angle - .5), 2), v(last.x - 13 * Math.cos(angle + .5), last.y - 13 * Math.sin(angle + .5), 2)], color);
    }
    if (selected) {
      line(ctx, project, ringPoints(last.x, last.y, 9, 9, 2), color, 2);
      polygon(ctx, project, ringPoints(first.x, first.y, 5, 5, 2), color);
    }
    ctx.restore();
}

function drawActions(ctx: CanvasRenderingContext2D, project: Project, scene: CourtScene3D) {
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0]!;
  for (const action of scene.snapshot.actions) {
    if (action.archived || action.fromFrameId !== phase.id) continue;
    for (const candidate of action.path.candidates) {
      if (candidate.id !== action.path.winnerId) drawAction(ctx, project, action.type, candidate.value, false, true);
    }
    drawAction(ctx, project, action.type, action.path.value, scene.selectedActionId === action.id, action.adjacency !== 'valid');
  }
}

function drawStage(ctx: CanvasRenderingContext2D, width: number, height: number, project: Project, light: boolean) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const backdrop = ctx.createRadialGradient(width * .48, height * .35, 0, width * .48, height * .5, width * .7);
  backdrop.addColorStop(0, light ? '#ddd5bd' : '#34372b'); backdrop.addColorStop(.5, light ? '#c5c7b7' : '#151f1b'); backdrop.addColorStop(1, light ? '#a8b7ac' : '#061310');
  ctx.fillStyle = backdrop; ctx.fillRect(0, 0, width, height);
  // Original arena architecture, cached with the floor. Subdued seats and the
  // sideline establish scale without hiding the playable court or adding motion.
  polygon(ctx, project, rectangle(-300, -340, 1500, 1160, -18), light ? 'rgba(89,85,66,.25)' : 'rgba(3,10,8,.5)');
  for (let row = 2; row >= 0; row--) {
    const seatY = -72 - row * 37;
    const seatZ = row * 15;
    line(ctx, project, [v(-60, seatY - 14, seatZ), v(920, seatY - 14, seatZ)], light ? '#78877b' : '#28382e', 2);
    for (let column = 0; column < 23; column++) {
      const seatX = -40 + column * 42;
      polygon(ctx, project, rectangle(seatX, seatY, 28, 24, seatZ + 6), light ? '#73857c' : '#20382f', '#405246', .5);
      polygon(ctx, project, [v(seatX, seatY, seatZ + 6), v(seatX + 28, seatY, seatZ + 6), v(seatX + 28, seatY - 4, seatZ + 32), v(seatX, seatY - 4, seatZ + 32)], light ? '#7f9187' : '#2b4035', light ? '#a3afa0' : '#3b4c3d', .55);
    }
  }
  const center = project(v(420, 250, -30));
  const ambient = ctx.createRadialGradient(center.x, center.y, width * .17, center.x, center.y, width * .46);
  ambient.addColorStop(0, light ? 'rgba(35,35,24,.3)' : 'rgba(0,5,2,.72)'); ambient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save(); ctx.translate(center.x, center.y); ctx.scale(1, .45); ctx.translate(-center.x, -center.y);
  ctx.fillStyle = ambient; ctx.fillRect(0, -height, width, height * 3); ctx.restore();
  drawFloor(ctx, project, light);
}

export function drawCourtScene3D(ctx: CanvasRenderingContext2D, width: number, height: number, scene: CourtScene3D) {
  if (width <= 0 || height <= 0) return;
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0];
  if (!phase) return;
  const project = projector(width, height);
  const light = scene.theme === 'light';
  ctx.save(); ctx.clearRect(0, 0, width, height);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const stageKey = `${width}:${height}:${light}`;
  let stage = stageCache.get(ctx);
  if (stage?.key !== stageKey) {
    const canvas = stage?.canvas ?? ctx.canvas.ownerDocument.createElement('canvas');
    canvas.width = width; canvas.height = height;
    drawStage(canvas.getContext('2d')!, width, height, project, light);
    stage = { key: stageKey, canvas };
    stageCache.set(ctx, stage);
  }
  ctx.drawImage(stage.canvas, 0, 0);
  if (scene.showActions !== false) drawActions(ctx, project, scene);
  if (scene.actionDraft) drawAction(ctx, project, scene.actionDraft.type, scene.actionDraft.path, true, true, true);
  const { poses, ballPose } = courtScenePoses3D(scene);
  // Competing intentions remain visible in the same scene as the winning pose.
  // Ghosts are derived, never selectable entities or replacement document data.
  for (const actor of scene.snapshot.actors) {
    const register = phase.poseRegisters[actor.id];
    for (const candidate of register.candidates) {
      if (candidate.id === register.winnerId) continue;
      ctx.save(); ctx.globalAlpha = .3;
      drawPlayer(ctx, project, { ...scene, selectedId: null }, actor, candidate.value);
      ctx.globalAlpha = .8; ctx.setLineDash([4, 4]);
      line(ctx, project, ringPoints(candidate.value.x, candidate.value.y, 26, 22, 1), '#e6a8ee', 2.8);
      ctx.restore();
    }
  }
  const ballGhosts = phase.looseBallPose?.candidates.filter(candidate => candidate.id !== phase.looseBallPose!.winnerId).map(candidate => ({ pose: candidate.value, height: 7 })) ?? [];
  for (const candidate of phase.possession.candidates) {
    if (candidate.id === phase.possession.winnerId) continue;
    if (candidate.value === 'loose' && !phase.looseBallPose) continue;
    ballGhosts.push({ pose: deriveBallPose(poses, candidate.value, phase.looseBallPose?.value ?? null), height: candidate.value === 'loose' ? 7 : 35 });
  }
  for (const ghost of ballGhosts) {
    ctx.save(); ctx.globalAlpha = .4; drawBall(ctx, project, ghost.pose, ghost.height);
    ctx.globalAlpha = .8; ctx.setLineDash([4, 4]);
    line(ctx, project, ringPoints(ghost.pose.x, ghost.pose.y, 13, 13, ghost.height), '#e6a8ee', 2);
    ctx.restore();
  }
  for (const actor of scene.snapshot.actors) shadow(ctx, project, poses[actor.id], 24, .18);
  const ballHeight = courtBallHeight3D(scene);
  shadow(ctx, project, ballPose, 5 + ballHeight * .05, .15);
  if (scene.selectedId === 'ball') line(ctx, project, ringPoints(ballPose.x, ballPose.y, 14, 14, ballHeight), '#ffba68', 2.5);
  const objects = scene.snapshot.actors.map(actor => ({ depth: project(v(poses[actor.id].x, poses[actor.id].y, 25)).depth, draw: () => drawPlayer(ctx, project, scene, actor, poses[actor.id]) }));
  objects.push({ depth: project(v(810, 230, 72)).depth, draw: () => drawBasket(ctx, project) });
  objects.push({ depth: ballObjectDepth(project, scene, poses, ballPose, ballHeight), draw: () => drawBall(ctx, project, ballPose, ballHeight) });
  objects.sort((a, b) => b.depth - a.depth);
  objects.forEach(object => object.draw());
  ctx.restore();
}

function distanceToSegment(point: Pose, start: Pose, end: Pose) {
  const dx = end.x - start.x; const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(point.x - start.x - dx * t, point.y - start.y - dy * t);
}

/** Pick rendered bodies, shoulders, heads and number badges, not just their
 * floor origins. Front-to-back ordering matches the renderer when models overlap. */
export function hitTestCourtScene3D(width: number, height: number, scene: CourtScene3D, x: number, y: number): ActorId | 'ball' | null {
  if (![width, height, x, y].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const phase = scene.snapshot.phases[scene.frame?.phaseIndex ?? scene.phaseIndex ?? 0];
  if (!phase) return null;
  const project = projector(width, height);
  const { poses, ballPose } = courtScenePoses3D(scene);
  const ball = project(v(ballPose.x, ballPose.y, courtBallHeight3D(scene)));
  const hits: Array<{ id: ActorId | 'ball'; depth: number; distance: number }> = [];
  const ballDistance = Math.hypot(x - ball.x, y - ball.y) / Math.max(8, ball.scale * 10);
  if (ballDistance <= 1) hits.push({ id: 'ball', depth: ballObjectDepth(project, scene, poses, ballPose, courtBallHeight3D(scene)), distance: ballDistance });
  for (const actor of scene.snapshot.actors) {
    const pose = poses[actor.id];
    const ground = project(v(pose.x, pose.y, 5));
    const head = project(v(pose.x, pose.y, actor.team === 'offense' ? 76 : 72));
    const badge = project(v(pose.x, pose.y + 25, 2));
    const direction = actor.team === 'offense' ? Math.atan2(230 - pose.y, 774 - pose.x) : Math.atan2(ballPose.y - pose.y, ballPose.x - pose.x);
    const reach = actor.team === 'offense' ? 17 : 25;
    const side = { x: -Math.sin(direction) * reach, y: Math.cos(direction) * reach };
    const left = project(v(pose.x + side.x, pose.y + side.y, 49));
    const rightShoulder = project(v(pose.x - side.x, pose.y - side.y, 49));
    const pointer = { x, y };
    const distance = Math.min(distanceToSegment(pointer, ground, head) / Math.max(7, ground.scale * 13), distanceToSegment(pointer, left, rightShoulder) / Math.max(5, ground.scale * 8), Math.hypot(x - badge.x, y - badge.y) / Math.max(7, badge.scale * 12));
    if (distance <= 1) hits.push({ id: actor.id, depth: project(v(pose.x, pose.y, 25)).depth, distance });
  }
  hits.sort((a, b) => Math.abs(a.depth - b.depth) < .01 ? a.distance - b.distance : a.depth - b.depth);
  return hits[0]?.id ?? null;
}

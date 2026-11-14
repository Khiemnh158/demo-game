const playableScale = 1.8;
const playableGround = 17;
const playableTau = 2 * Math.PI;
const playableDirections = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const playableMotions = new WeakMap();

function loadPlayableSheet(src) {
    const image = new Image();
    const ready = new Promise(resolve => {
        if (!src) {
            resolve(false);
            return;
        }
        image.addEventListener('load', () => resolve(true), { once: true });
        image.addEventListener('error', () => resolve(false), { once: true });
        image.src = src;
    });
    return { image, ready };
}

const playableSprites = loadPlayableSheet(PLAYABLE_ATLAS.texture);
const playablePortraits = loadPlayableSheet(PLAYABLE_ATLAS.portraits);
const playableAnimationReady = Promise.all([playableSprites.ready, playablePortraits.ready])
    .then(([sprites, portraits]) => sprites && portraits);
const playableLabelHeight = PLAYABLE_ATLAS.actors.map(actor => {
    const frames = Object.values(actor.walk).flat().concat(actor.turn,
        Object.values(actor.attacks).flatMap(animation => animation.frames));
    return Math.max(46, ...frames.map(frame => frame.root[1] + (frame.lift || 0))) * playableScale;
});

function playableSkinIndex(ent) {
    const choice = Math.floor(Number(typeof ent === 'object' ? ent?.cosmeticSkin : ent));
    return choice >= 0 && choice < PLAYABLE_ATLAS.actors.length ? choice : 0;
}

function playableActor(ent) {
    return PLAYABLE_ATLAS.actors[playableSkinIndex(ent)];
}

function playableHeading(angle) {
    const octant = Math.round((Number.isFinite(angle) ? angle : 0) / (Math.PI / 4));
    return playableDirections[(octant % 8 + 8) % 8];
}

function playableAttackGroup(ent, angle) {
    const { attacks } = playableActor(ent);
    const heading = playableHeading(angle);
    if (heading === 'S' && attacks.down) return 'down';
    if (heading === 'N' && attacks.up) return 'up';
    if ((heading === 'NW' || heading === 'NE') && attacks.upDiagonal) return 'upDiagonal';
    if ((heading === 'SW' || heading === 'SE') && attacks.diagonal) return 'diagonal';
    if (attacks.atk) return 'atk';
    if (attacks.diagonal) return 'diagonal';
    return Object.keys(attacks)[0];
}

function playableAttackFlip(animation, angle) {
    const facing = animation.facing || 'E';
    if (facing === 'N' || facing === 'S') return false;
    return facing.endsWith('W') !== (Math.cos(angle) < 0);
}

function playablePhase(times, ms) {
    for (let i = 0; i < times.length - 1; i++) {
        if (ms < times[i]) return i;
        ms -= times[i];
    }
    return times.length - 1;
}

function playableAttackPose(ent, actor) {
    const action = ent.action;
    const aim = action.angle ?? ent.angle;
    const facing = action.artAngle ?? aim;
    const sequence = actor.attacks[action.group] || actor.attacks[playableAttackGroup(ent, facing)];
    const pre = sequence.times.slice(0, sequence.strike).reduce((sum, cost) => sum + cost, 0);
    const end = sequence.times.reduce((sum, cost) => sum + cost, 0);
    const duration = action.duration || end / 1000;
    const strike = action.strikeTime ?? pre / 1000;
    const time = Math.max(0, Math.min(duration, action.elapsed || 0));
    // Retain each pose's authored timing when charge and recovery each compress or extend.
    const progress = time < strike
        ? time / Math.max(.001, strike) * pre
        : pre + (time - strike) / Math.max(.001, duration - strike) * (end - pre);
    const index = playablePhase(sequence.times, progress);
    return { frame: sequence.frames[index], flip: playableAttackFlip(sequence, facing) };
}

function playableMotion(ent) {
    if (!playableMotions.has(ent)) {
        playableMotions.set(ent, { x: ent.x, y: ent.y, phase: 0, heading: playableHeading(ent.angle),
            moving: false, turnDistance: Infinity });
    }
    const motion = playableMotions.get(ent);
    const dx = ent.x - motion.x;
    const dy = ent.y - motion.y;
    const distance = Math.hypot(dx, dy);
    motion.x = ent.x;
    motion.y = ent.y;
    motion.moving = distance > .02 && distance < 85;
    if (distance >= 85) motion.phase = 0;
    if (!motion.moving) return motion;

    const angle = Math.atan2(dy, dx);
    const previousAngle = playableDirections.indexOf(motion.heading) * Math.PI / 4;
    const difference = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
    const heading = Math.abs(difference) > Math.PI / 7 ? playableHeading(angle) : motion.heading;
    if (heading !== motion.heading) {
        motion.heading = heading;
        motion.turnDistance = 0;
    }
    motion.turnDistance += distance;
    // Phase is measured from displacement, so walking into a wall cannot cycle in place.
    motion.phase += distance * 5.6;
    return motion;
}

function playableTurnPose(actor, heading, phase) {
    const north = heading.startsWith('N');
    const start = north ? 2 : 0;
    const index = Math.floor(phase / (north ? 145 : 130)) % 2;
    const frame = actor.turn[start + index];
    // Diagonal turn art leans right. Flip only for a leftward diagonal.
    return { frame, flip: heading.endsWith('W') };
}

function playableWalkPose(actor, motion) {
    const heading = motion.heading;
    const frames = actor.walk[heading];
    if (frames) {
        const rate = frames.length === actor.stride.length ? actor.stride : frames.map(() => 115);
        const index = playablePhase(rate, motion.phase % rate.reduce((sum, n) => sum + n, 0));
        return { frame: frames[index], flip: false };
    }
    if (heading === 'N' || heading === 'S' || motion.turnDistance < 27) {
        return playableTurnPose(actor, heading, motion.phase);
    }
    const direction = heading.endsWith('W') ? 'W' : 'E';
    const lateral = actor.walk[direction] || actor.walk.E;
    const index = playablePhase(actor.stride, motion.phase % actor.stride.reduce((sum, n) => sum + n, 0));
    return { frame: lateral[index % lateral.length], flip: !actor.walk[direction] && direction === 'W' };
}

function playableIdlePose(ent, actor) {
    const heading = playableHeading(ent.angle);
    if (actor.idle?.[heading]) return { frame: actor.idle[heading], flip: false };
    if ((heading.startsWith('N') || (heading === 'S' && !actor.attacks.down)) && actor.turn.length) {
        return playableTurnPose(actor, heading, 0);
    }
    const sequence = actor.attacks[playableAttackGroup(ent, ent.angle)];
    return { frame: sequence.frames[0], flip: playableAttackFlip(sequence, ent.angle) };
}

function playableDrawFrame(g, sheet, frame, x, y, scale, flip = false) {
    g.save();
    g.imageSmoothingEnabled = false;
    g.translate(Math.round(x), Math.round(y));
    if (flip) g.scale(-1, 1);
    const root = frame.root;
    const dx = Math.round(-root[0] * scale);
    const dy = Math.round(-(root[1] + (frame.lift || 0)) * scale);
    g.drawImage(sheet, frame.x, frame.y, frame.w, frame.h, dx, dy,
        Math.round(frame.w * scale), Math.round(frame.h * scale));
    g.restore();
}

function drawPlayablePortrait(g, index, x, y, scale = 1) {
    const image = playablePortraits.image;
    const portrait = playableActor(index).portrait;
    if (!image.complete || !image.naturalWidth || !portrait) return false;
    const h = 66 * scale;
    const w = h * portrait.w / portrait.h;
    g.save();
    g.imageSmoothingEnabled = true;
    g.drawImage(image, portrait.x, portrait.y, portrait.w, portrait.h,
        Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    g.restore();
    return true;
}

function playableWeaponOrigin(ent, group, angle) {
    const actor = playableActor(ent);
    const sequence = actor.attacks[group] || actor.attacks[playableAttackGroup(ent, angle)];
    const frame = sequence.frames[sequence.launchPose ?? sequence.strike];
    const base = { x: Math.round(ent.x), y: Math.round(ent.y + playableGround) };
    const flip = playableAttackFlip(sequence, ent.action?.artAngle ?? angle) ? -1 : 1;
    if (!frame.hand) {
        return { x: ent.x + Math.cos(angle) * 20, y: ent.y + Math.sin(angle) * 20 };
    }
    // Use exactly the same ground pivot, mirror and raster rounding as the drawn frame.
    const sx = Math.round(frame.w * playableScale) / frame.w;
    const sy = Math.round(frame.h * playableScale) / frame.h;
    return {
        x: base.x + flip * (Math.round(-frame.root[0] * playableScale) + frame.hand[0] * sx),
        y: base.y + Math.round(-(frame.root[1] + (frame.lift || 0)) * playableScale) + frame.hand[1] * sy
    };
}

function playableShadow(ent, accent, x, ground) {
    ctx.fillStyle = '#181020ba';
    ctx.fillRect(x - 17, ground - 4, 34, 9);
    ctx.fillRect(x - 22, ground - 2, 44, 5);
    if (ent.isPlayer || ent.spawnShield > 0 || ent.expAuraTimer > 0) {
        ctx.strokeStyle = ent.spawnShield > 0 ? '#98dbeaaf' : accent;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x - 21, ground - 5, 42, 11);
    }
}

function drawPlayableHero(ent) {
    const image = playableSprites.image;
    if (!image.complete || !image.naturalWidth) return false;
    if (!arrowVfxVisible(ent.x, ent.y, 140)) return true;
    const actor = playableActor(ent);
    const motion = playableMotion(ent);
    const pose = ent.action ? playableAttackPose(ent, actor)
        : motion.moving ? playableWalkPose(actor, motion) : playableIdlePose(ent, actor);
    const x = Math.round(ent.x);
    const ground = Math.round(ent.y + playableGround);
    const accent = actor.accent || '#efd0e2';

    ctx.save();
    playableShadow(ent, accent, x, ground);
    ctx.save();
    if (ent.stats.passWall) ctx.globalAlpha = .82;
    if (ent.hitFlash > 0) ctx.filter = 'brightness(1.55)';
    playableDrawFrame(ctx, image, pose.frame, x, ground, playableScale, pose.flip);
    ctx.restore();

    const orbits = [[ent.stats.orbitDarts, 56, accent], [ent.stats.orbitShields, 46, '#ade9ef']];
    for (const [count, radius, color] of orbits) {
        for (let i = 0; i < count; i++) {
            const angle = ent.orbitAngle + i * playableTau / count;
            const ox = Math.round(ent.x + Math.cos(angle) * radius);
            const oy = Math.round(ent.y + Math.sin(angle) * radius);
            pixDiamond(ctx, ox, oy, 5, '#4e376f');
            pixDiamond(ctx, ox, oy - 1, 3, color);
        }
    }
    const barY = Math.round(ground - playableLabelHeight[playableSkinIndex(ent)] - 5);
    drawSegmentedHpBar(x, barY, ent.hpBlocks, ent.maxHpBlocks, 42, 5);
    actorLabel(ent.name, x, barY - 6, ent.isPlayer ? '#ffe2aa' : '#f1e5f6');
    ctx.restore();
    return true;
}

const PLAY_DURATION = 180;
const PLAY_CLASS = {
    bow_moon: { windup: .58, recover: .23, speed: 222, aura: 'celestial' },
    shuriken: { windup: .18, recover: .26, speed: 250 },
    laser_sword: { windup: .26, recover: .28, speed: 231, reach: 63, arc: .88 },
    vampire_blade: { windup: .32, recover: .25, speed: 240, reach: 68, arc: 1.02 },
    repeater: { windup: .22, recover: .29, speed: 231, aura: 'jade' },
    hammer: { windup: .40, recover: .34, speed: 203, reach: 78, arc: 1.12 },
    staff: { windup: .31, recover: .29, speed: 225, aura: 'eclipse' },
    shield: { windup: .23, recover: .31, speed: 213, reach: 57, arc: .68 },
    bow_rose: { windup: .43, recover: .22, speed: 246, aura: 'rose' },
    bow_jade: { windup: .72, recover: .25, speed: 219, aura: 'jade' }
};
let playMode = 'arena';
let matchRemaining = PLAY_DURATION;
let gameFrameQueued = false;
let gameSlow = false;
let gameZoom = false;

function playableProfile(ent) {
    return PLAY_CLASS[playableActor(ent)?.key] || PLAY_CLASS.bow_moon;
}

function playableBow(ent) {
    return (playableActor(ent)?.key || '').startsWith('bow_');
}

function initializePlayableFighter(ent, skin, aura) {
    ent.cosmeticSkin = skin;
    ent.cosmeticBow = aura || PLAY_CLASS[PLAYABLE_ATLAS.actors[skin].key].aura || 'celestial';
    ent.baseWeapon = ent.stats.weapon;
    ent.stats.moveSpeed = playableProfile(ent).speed;
    ent.action = null;
    ent.aimTarget = null;
}

function resetPlayableInput() {
    input.keys = {};
    input.mouseDown = false;
    input.pressAttack = false;
    input.cancelAttack = false;
    input.releaseStick = null;
    input.leftId = input.rightId = null;
    input.leftVec = {x:0,y:0};
    input.rightVec = {x:0,y:0};
}

function beginPlayableAction(ent, manual = false) {
    if (!ent.alive || ent.practiceTarget || ent.action || ent.cooldown > 0) return false;
    const profile = playableProfile(ent);
    const reduced = !manual && !playableBow(ent) ? Math.min(1, Math.max(.72, 2.25 / ent.stats.fireRate)) : 1;
    const strikeTime = profile.windup * reduced;
    ent.action = {
        group: playableAttackGroup(ent, ent.angle),
        elapsed: 0,
        strikeTime,
        duration: strikeTime + profile.recover,
        angle: ent.angle,
        target: ent.aimTarget,
        manual,
        released: !manual,
        fired: false,
        charge: 1,
        burstCount: 0
    };
    return true;
}

function updatePlayablePlayer(ent) {
    let mx = Number(Boolean(input.keys.KeyD || input.keys.ArrowRight)) - Number(Boolean(input.keys.KeyA || input.keys.ArrowLeft));
    let my = Number(Boolean(input.keys.KeyS || input.keys.ArrowDown)) - Number(Boolean(input.keys.KeyW || input.keys.ArrowUp));
    if (input.leftId !== null) ({x:mx,y:my} = input.leftVec);
    const len = Math.hypot(mx,my);
    const factor = ent.stats.moveSpeed / Math.max(1,len);
    ent.vx = mx*factor;
    ent.vy = my*factor;
    const rightStick = input.rightId !== null;
    const stickAiming = rightStick && Math.hypot(input.rightVec.x,input.rightVec.y) > .12;
    const releaseStick = input.releaseStick;
    input.releaseStick = null;
    let target = null;
    if (stickAiming || releaseStick) {
        const aim=stickAiming?input.rightVec:releaseStick;
        target = {x:ent.x+aim.x*260,y:ent.y+aim.y*260};
    } else if (autoAim) {
        target = findClosestTarget(ent, (playableProfile(ent).reach || ent.stats.arrowRange) + 60);
    } else if (!input.isTouch) {
        target = {x:Math.floor(input.mouseX + camera.x - width/2),
                  y:Math.floor(input.mouseY + camera.y - height/2)};
    }
    if (target && Math.hypot(target.x-ent.x,target.y-ent.y)>5) {
        ent.angle = Math.atan2(target.y-ent.y,target.x-ent.x);
        ent.aimTarget = {x:target.x,y:target.y};
    } else if (len>.05 && !rightStick && !ent.action?.manual) {
        ent.angle = Math.atan2(my,mx);
        ent.aimTarget = null;
    }

    const held = input.mouseDown || input.keys.Space || stickAiming;
    const tapped = Boolean(input.pressAttack);
    input.pressAttack = false;
    const bow = playableBow(ent);
    if (input.cancelAttack) {
        if (ent.action?.manual && !ent.action.fired) ent.action = null;
        input.cancelAttack = false;
    }
    if ((held || tapped) && !ent.action) beginPlayableAction(ent,bow);
    const action = ent.action;
    if (action && !action.fired && action.manual && !action.released && !held) {
        action.target = ent.aimTarget;
        action.angle = ent.angle;
        action.group = playableAttackGroup(ent,action.angle);
        action.released = true;
    }
    if (autoAim && target && !held && !tapped && !ent.action && Math.hypot(ent.x-target.x,ent.y-target.y) <= (playableProfile(ent).reach || ent.stats.arrowRange)+9) {
        beginPlayableAction(ent);
    }
}

function updatePlayableBot(ent,dt) {
    if (ent.practiceTarget) return;
    ent.ai.decisionTimer -= dt;
    if (ent.ai.decisionTimer <= 0) {
        ent.ai.decisionTimer = .65+Math.random()*.55;
        ent.ai.strafeDir = Math.random()<.5?-1:1;
        ent.ai.wanderAngle += (Math.random()-.5)*1.9;
    }
    const foe = findClosestTarget(ent,610);
    const profile = playableProfile(ent);
    let moveAngle = ent.ai.wanderAngle;
    let stride = .80;
    ent.aimTarget = null;
    if (foe) {
        const dx=foe.x-ent.x,dy=foe.y-ent.y;
        const dist=Math.hypot(dx,dy);
        const face=Math.atan2(dy,dx);
        ent.angle=face;
        ent.aimTarget={x:foe.x,y:foe.y};
        if (profile.reach) {
            moveAngle=face+ent.ai.strafeDir*.12;
            stride=dist<profile.reach*.70?.10:.87;
        } else {
            moveAngle=dist<175?face+Math.PI+ent.ai.strafeDir*.40:
                dist>345?face+ent.ai.strafeDir*.30:face+ent.ai.strafeDir*Math.PI/2;
        }
        if (dist<(profile.reach || ent.stats.arrowRange)+8) beginPlayableAction(ent);
    } else {
        let closest=345;
        for (const item of pickups) {
            const dist=Math.hypot(item.x-ent.x,item.y-ent.y);
            if (dist < closest) {
                closest=dist;
                moveAngle=Math.atan2(item.y-ent.y,item.x-ent.x);
            }
        }
        ent.angle=moveAngle;
    }
    // If the forward path is blocked, try around its left and right edges.
    let safe = false;
    for (const turn of [0,ent.ai.strafeDir*.85,-ent.ai.strafeDir*.85,Math.PI/2,-Math.PI/2,Math.PI]) {
        const angle=moveAngle+turn;
        const x=ent.x+Math.cos(angle)*36, y=ent.y+Math.sin(angle)*36;
        if (x<32 || x>ARENA_SIZE-32 || y<32 || y>ARENA_SIZE-32) continue;
        if (!ent.stats.passWall && walls.some(w=>circleHitsRect(x,y,ent.radius,w))) continue;
        safe=true;
        moveAngle=angle;
        break;
    }
    ent.vx=safe?Math.cos(moveAngle)*ent.stats.moveSpeed*stride:0;
    ent.vy=safe?Math.sin(moveAngle)*ent.stats.moveSpeed*stride:0;
}

function advancePlayableAction(ent,dt) {
    const action=ent.action;
    if (!action) return;
    if (!action.fired) {
        if (!action.manual || !action.released) {
            action.angle=ent.angle;
            action.target=ent.aimTarget;
            action.group=playableAttackGroup(ent,action.angle);
        }
        if (action.manual) {
            action.elapsed=Math.min(action.strikeTime-.0001,action.elapsed+dt);
            const minimum=Math.min(.17,action.strikeTime*.48);
            if (action.released && action.elapsed>=minimum) {
                action.charge=action.elapsed/action.strikeTime;
                action.elapsed=action.strikeTime;
            }
        } else {
            action.elapsed += dt;
        }
        if (action.elapsed>=action.strikeTime) {
            action.fired=true;
            ent.cooldown=Math.max(action.duration-action.strikeTime+.04, 1/ent.stats.fireRate-action.strikeTime);
            releasePlayableAttack(ent,action);
        }
    } else {
        action.elapsed += dt;
    }
    if (action.fired && playableActor(ent)?.key==='repeater') {
        while (action.burstCount<3 && action.elapsed>=action.strikeTime+action.burstCount*.065) {
            releasePlayableBolt(ent,action,action.burstCount);
            action.burstCount++;
        }
    }
    if (action.fired && action.elapsed>=action.duration) ent.action=null;
}

function playableMuzzle(ent,action) {
    const origin=playableWeaponOrigin(ent,action.group,action.angle) || {x:ent.x,y:ent.y};
    const aim=action.target && Math.hypot(action.target.x-origin.x,action.target.y-origin.y)>12?
        Math.atan2(action.target.y-origin.y,action.target.x-origin.x):action.angle;
    // A weapon can reach over a wall, but the projectile still starts inside the walkable space.
    const blocked=walls.some(w=>circleHitsRect(origin.x,origin.y,3,w) ||
        circleHitsRect((origin.x+ent.x)/2,(origin.y+ent.y)/2,3,w));
    return {...(blocked?{x:ent.x,y:ent.y}:origin),aim};
}

function releasePlayableBolt(ent,action,index) {
    const origin=playableMuzzle(ent,action);
    const offset=index===1 ? -.042 : index===2 ? .042 : 0;
    const spread=ent.stats.frontArrows;
    for (let i=0;i<spread;i++) {
        const angle=origin.aim+offset+(i-(spread-1)/2)*.055;
        ent.spawnShot(origin.x,origin.y,angle,{damageScale:.62,weapon:'bolt'});
    }
}

function releasePlayableAttack(ent,action) {
    const actor=playableActor(ent);
    const profile=playableProfile(ent);
    const origin=playableMuzzle(ent,action);
    ent.attackAuraTimer=.24;
    if (ent.isPlayer) sound.playWeapon(ent.stats.weapon);
    if (ent.stats.dropSpikes && spikes.length<70) {
        spikes.push({ownerId:ent.id,x:ent.x,y:ent.y,radius:16,damage:.8,life:6.5});
    }
    if (profile.reach) {
        playableMelee(ent,profile,action,actor);
        for (let i=1;i<ent.stats.frontArrows;i++) {
            const side=i%2 ? 1 : -1;
            ent.spawnShot(origin.x,origin.y,origin.aim+side*Math.ceil(i/2)*.065,{damageScale:.65,weapon:'arrow'});
        }
    } else if (actor?.key!=='repeater') {
        const damageScale=playableBow(ent)? .66+action.charge*.43:1;
        const spread=ent.stats.frontArrows;
        for (let i=0;i<spread;i++) {
            const gap=(i-(spread-1)/2)*.065;
            ent.spawnShot(origin.x,origin.y,origin.aim+gap,{damageScale,weapon:ent.baseWeapon});
        }
    }

    // Skills add to the class attack, so the weapon shown in the character's hands stays accurate.
    if (ent.stats.weapon!==ent.baseWeapon) {
        ent.spawnShot(origin.x,origin.y,origin.aim,{damageScale:.75,weapon:ent.stats.weapon});
    }
    const weapon=profile.reach?'arrow':ent.baseWeapon;
    for (let i=0;i<ent.stats.diagonalArrows;i++) {
        const diff=.55+i*.22;
        ent.spawnShot(origin.x,origin.y,origin.aim-diff,{weapon,damageScale:.72});
        ent.spawnShot(origin.x,origin.y,origin.aim+diff,{weapon,damageScale:.72});
    }
    for (let i=0;i<ent.stats.sideArrows;i++) {
        ent.spawnShot(ent.x,ent.y,action.angle-Math.PI/2-.08*i,{weapon,damageScale:.72});
        ent.spawnShot(ent.x,ent.y,action.angle+Math.PI/2+.08*i,{weapon,damageScale:.72});
    }
    for (let i=0;i<ent.stats.rearArrows;i++) {
        ent.spawnShot(ent.x,ent.y,action.angle+Math.PI+(i-(ent.stats.rearArrows-1)/2)*.08,{weapon,damageScale:.72});
    }
}

function playableMelee(ent,profile,action,actor) {
    const reach=profile.reach * (1+(ent.stats.arrowScale-1)*.35);
    const dx=Math.cos(action.angle),dy=Math.sin(action.angle);
    const axe=actor.key==='hammer';
    const shield=actor.key==='shield';
    const contact={x:ent.x+dx*reach*.66,y:ent.y+dy*reach*.66};
    arrowVfxRing(contact.x,contact.y,actor.accent,axe?38:22,.24);
    for (const target of [...entities,...dragons]) {
        if (!target.alive || target.id===ent.id) continue;
        const tx=target.x-ent.x,ty=target.y-ent.y;
        const dist=Math.hypot(tx,ty);
        if (dist > reach+target.radius || (tx*dx+ty*dy) < Math.max(0,dist-target.radius*.65)*Math.cos(profile.arc)) continue;
        if (!ent.stats.passWall && walls.some(w=>circleHitsRect((target.x+ent.x)/2,(target.y+ent.y)/2,4,w))) continue;
        const crit=Math.random()<ent.stats.critChance;
        const amount=ent.stats.damage*(crit?1.75:1) * (axe?1.15:shield?1.1:1.2);
        target.takeDamage(amount,ent,crit);
        spawnHitParticles(target.x,target.y,actor.accent,9);
        if (shield && !target.practiceTarget && target.alive) {
            const tx=target.x+dx*22,ty=target.y+dy*22;
            if (tx>26 && tx<ARENA_SIZE-26 && ty>26 && ty<ARENA_SIZE-26 &&
                !walls.some(w=>circleHitsRect(tx,ty,target.radius,w))) {
                target.x=tx; target.y=ty;
            }
        }
    }
}

function configureTraining() {
    walls=[];
    player.x=ARENA_SIZE/2;
    player.y=ARENA_SIZE/2;
    player.spawnShield=0;
    const radius=playableProfile(player).reach?74:172;
    for (let i=0;i<8;i++) {
        const a=i*Math.PI/4;
        const target = new VoxelFighter('Bia tập',HEROES[7]);
        initializePlayableFighter(target,7);
        target.x=player.x+Math.cos(a)*radius;
        target.y=player.y+Math.sin(a)*radius;
        target.practiceTarget=true;
        target.spawnShield=0;
        target.stats.orbitShields=0;
        target.hpBlocks=target.maxHpBlocks=4;
        target.angle=a+Math.PI;
        entities.push(target);
    }
    pickups.push({type:'chalice',value:36,x:player.x-90,y:player.y-105,radius:12,bob:0});
}

function seedPlayablePickups() {
    const pattern=[[72,'exp',10],[104,'exp',10],[134,'chalice',21]];
    for (let i=0;i<3;i++) {
        const angle=(i*2+1)*Math.PI/3;
        for (const [dist,type,value] of pattern) {
            const x=player.x+Math.cos(angle)*dist,y=player.y+Math.sin(angle)*dist;
            if (x<36 || y<36 || x>ARENA_SIZE-36 || y>ARENA_SIZE-36 || walls.some(w=>circleHitsRect(x,y,13,w))) continue;
            pickups.push({type,value,x,y,radius:type==='chalice'?13:8,bob:i});
        }
    }
}

function drawPracticeTarget(ent) {
    if (!arrowVfxVisible(ent.x,ent.y,63)) return;
    const x=pxSnap(ent.x),y=pxSnap(ent.y);
    ctx.fillStyle='#1b1428';
    ctx.fillRect(x-16,y+13,32,5);
    ctx.fillStyle='#684f76';
    ctx.fillRect(x-2,y+3,4,12);
    pixDiamond(ctx,x,y-5,14,'#463053');
    pixDiamond(ctx,x,y-5,11,ent.hitFlash>0?'#fff2e5':'#896ca2');
    pixDiamond(ctx,x-2,y-8,5,'#dcc7ef');
    drawSegmentedHpBar(x,y-27,ent.hpBlocks,ent.maxHpBlocks,37,4);
}

function restartPracticeTarget(ent,killer) {
    ent.alive=false;
    ent.practiceReturn=.8;
    if (killer===player) {
        player.kills++;
        player.gainExp(12);
    }
}

function resetRound() {
    matchRemaining=PLAY_DURATION;
    gameSlow=false;
    gameZoom=playMode==='training' && width>=850;
    resetPlayableInput();
    syncPlayableControls();
}

function stepPlayableMatch(dt) {
    if (playMode==='training') {
        for (const t of entities) {
            if (!t.practiceTarget || t.alive) continue;
            t.practiceReturn-=dt;
            if (t.practiceReturn>0) continue;
            t.alive=true;
            t.hpBlocks=t.maxHpBlocks;
            t.hitFlash=0;
        }
        return;
    }
    let bots=0;
    entities=entities.filter(e=>{
        if (e.alive || e.isPlayer) return true;
        if (!Number.isFinite(e.respawnIn)) return false;
        e.respawnIn-=dt;
        if (e.respawnIn>0) return true;
        bots++;
        return false;
    });
    for (let i=0;i<bots;i++) spawnBot();
    const pending=[];
    dragons=dragons.filter(d=>{
        if (d.alive) return true;
        if (!Number.isFinite(d.respawnIn)) return false;
        d.respawnIn-=dt;
        if (d.respawnIn>0) return true;
        pending.push(d.variant);
        return false;
    });
    for (const variant of pending) dragons.push(new VoxelDragonBoss(variant));
    matchRemaining=Math.max(0,matchRemaining-dt);
    if (matchRemaining===0 && player.alive) {
        const rank=1+entities.filter(e=>e.alive && e!==player && e.score>player.score).length;
        handlePlayerDeath('',rank);
    }
}

function updatePlayableHUD() {
    if (!player) return;
    const actor=playableActor(player);
    const stat=document.getElementById('hudBow');
    stat.textContent=actor.weapon;
    stat.style.color=actor.accent;
    const seconds=Math.ceil(matchRemaining);
    document.getElementById('hudClock').textContent=playMode==='training'?'Phòng tập':
        `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    const action=player.action;
    const gauge=document.getElementById('attackCharge');
    gauge.hidden=!action;
    if (action) {
        gauge.querySelector('i').style.width=`${Math.min(1,action.elapsed/action.strikeTime)*100}%`;
        document.getElementById('attackStage').textContent=action.fired?
            (action.elapsed-action.strikeTime<.11 ? (playableBow(player)?'Thả tên':'Ra đòn'):'Thu thế'):playableBow(player)?
            (action.elapsed>=action.strikeTime-.012?'Căng dây · thả để bắn':'Kéo dây'):'Lấy đà';
    }
}

function drawPlayableZoom() {
    if (!gameZoom || !player?.alive || gameState!=='PLAYING') return;
    const zoom=document.getElementById('animZoom');
    const g=zoom.getContext('2d');
    const w=128,h=94;
    const cx=player.x+Math.floor(width/2-camera.x);
    const cy=player.y+Math.floor(height/2-camera.y)-24;
    const sx=Math.max(0,Math.min(width-w,Math.round(cx-w/2)));
    const sy=Math.max(0,Math.min(height-h,Math.round(cy-h/2)));
    g.imageSmoothingEnabled=false;
    g.fillStyle='#201529';
    g.fillRect(0,0,zoom.width,zoom.height);
    g.drawImage(canvas,sx,sy,w,h,0,0,zoom.width,zoom.height);
}

function syncPlayableControls() {
    document.getElementById('zoomPanel').hidden=!gameZoom;
    document.getElementById('btnZoom').setAttribute('aria-pressed',String(gameZoom));
    document.getElementById('btnSlow').setAttribute('aria-pressed',String(gameSlow));
    document.getElementById('btnSlow').textContent=gameSlow?'Tốc độ ×0,5':'Xem chậm';
    document.getElementById('btnSlow').hidden=playMode!=='training';
    document.getElementById('btnDiceTest').hidden=playMode!=='training';
    document.getElementById('hudLayer').classList.toggle('training',playMode==='training');
}

function queuePlayableFrame() {
    if (gameFrameQueued) return;
    gameFrameQueued = true;
    requestAnimationFrame(timestamp=>{
        gameFrameQueued=false;
        if (gameState==='PLAYING') mainLoop(timestamp);
    });
}

function pausePlayable() {
    const dialog=document.getElementById('pauseScreen');
    if (gameState==='PLAYING') {
        gameState='PAUSED';
        resetPlayableInput();
        if (player?.action?.manual && !player.action.fired) player.action=null;
        dialog.classList.remove('hidden');
        document.getElementById('btnResume').focus();
    } else if (gameState==='PAUSED') {
        dialog.classList.add('hidden');
        resetPlayableInput();
        gameState='PLAYING';
        lastTime=performance.now();
        canvas.focus({preventScroll:true});
        queuePlayableFrame();
    }
}

function closeToLobby() {
    document.getElementById('pauseScreen').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('hudLayer').classList.add('hidden');
    canvas.classList.remove('in-match');
    gameState='HOME';
    resetPlayableInput();
    document.getElementById('startScreen').classList.remove('hidden');
    renderHeroGrid();
    renderBowGrid();
}

function initPlayableControls() {
    document.getElementById('btnTraining').addEventListener('click',()=>startMatch('training'));
    document.getElementById('btnPause').addEventListener('click',pausePlayable);
    document.getElementById('btnResume').addEventListener('click',pausePlayable);
    document.getElementById('btnExitMatch').addEventListener('click',closeToLobby);
    document.getElementById('btnRestartMatch').addEventListener('click',()=>startMatch(playMode));
    document.getElementById('btnSlow').addEventListener('click',()=>{
        if (playMode!=='training') return;
        gameSlow=!gameSlow;
        syncPlayableControls();
        canvas.focus({preventScroll:true});
    });
    document.getElementById('btnZoom').addEventListener('click',()=>{
        gameZoom=!gameZoom;
        syncPlayableControls();
        canvas.focus({preventScroll:true});
    });
}

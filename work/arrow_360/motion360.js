const aimDirectionNames={N:'Lên',NE:'Chéo lên phải',E:'Phải',SE:'Chéo xuống phải',
    S:'Xuống',SW:'Chéo xuống trái',W:'Trái',NW:'Chéo lên trái'};
let practiceAim='';

function playableAttackGroup(ent,angle) {
    return playableHeading(angle);
}

function playablePhase(times,ms) {
    for (let i=0; i<times.length-1; i++) {
        if (ms<times[i]) return i;
        ms-=times[i];
    }
    return times.length-1;
}

function motionState(ent) {
    if (!playableMotions.has(ent)) {
        playableMotions.set(ent,{phase:0,heading:playableHeading(ent.angle),moving:false,angle:ent.angle});
    }
    return playableMotions.get(ent);
}

function updateDirectionalMotion(ent,oldX,oldY) {
    const m=motionState(ent);
    const dx=ent.x-oldX,dy=ent.y-oldY;
    const stride=Math.hypot(dx,dy);
    m.moving=stride>.02;
    if (!m.moving) return;
    m.angle=Math.atan2(dy,dx);
    m.heading=playableHeading(m.angle);
    m.phase+=stride*5.9;
}

function stepIndex(actor,frames,phase) {
    const rates=frames.length===actor.stride.length ? actor.stride : frames.map(()=>110);
    return playablePhase(rates,phase % rates.reduce((a,b)=>a+b,0));
}

function attackLook(ent,actor,launch=false) {
    const action=ent.action;
    const angle=action?.angle ?? ent.angle;
    const key=action?.group ?? playableAttackGroup(ent,angle);
    const seq=actor.attacks[key];
    const pre=seq.times.slice(0,seq.strike).reduce((a,b)=>a+b,0);
    const total=seq.times.reduce((a,b)=>a+b,0);
    const progress=action ? action.elapsed<action.strikeTime ?
        action.elapsed/action.strikeTime*pre : pre+(action.elapsed-action.strikeTime)/
        Math.max(.001,action.duration-action.strikeTime)*(total-pre) : 0;
    const index=launch ? seq.launchPose : playablePhase(seq.times,progress);
    const m=motionState(ent);
    let frame=seq.frames[index];
    if (action && m.moving) {
        let gait=stepIndex(actor,seq.moving[index],m.phase);
        const difference=Math.cos(m.angle-angle);
        if (difference<-.22) gait=seq.moving[index].length-1-gait;
        frame=seq.moving[index][gait];
    }
    return {frame,index,key,seq,flip:false};
}

function playableAttackPose(ent,actor) {
    return attackLook(ent,actor);
}

function playableMotion(ent) {
    return motionState(ent);
}

function playableWalkPose(actor,motion) {
    const frames=actor.walk[motion.heading];
    return {frame:frames[stepIndex(actor,frames,motion.phase)],flip:false};
}

function playableIdlePose(ent,actor) {
    return {frame:actor.attacks[playableHeading(ent.angle)].frames[0],flip:false};
}

function playableWeaponOrigin(ent,group,angle) {
    const frame=attackLook(ent,playableActor(ent),true).frame;
    if (!frame.hand) return {x:ent.x+Math.cos(angle)*20,y:ent.y+Math.sin(angle)*20};
    const sx=Math.round(frame.w*playableScale)/frame.w;
    const sy=Math.round(frame.h*playableScale)/frame.h;
    return {
        x:Math.round(ent.x)+Math.round(-frame.root[0]*playableScale)+frame.hand[0]*sx,
        y:Math.round(ent.y+playableGround)+Math.round(-(frame.root[1]+(frame.lift||0))*playableScale)+frame.hand[1]*sy
    };
}

function directionalAttackLabel(ent) {
    const actor=playableActor(ent);
    const m=motionState(ent);
    if (!ent.action) {
        const heading=m.moving?m.heading:playableHeading(ent.angle);
        return `${m.moving?'Chạy':'Đứng'} · ${aimDirectionNames[heading]}`;
    }
    const pose=attackLook(ent,actor);
    const verbs=pose.seq.labels;
    const stage=ent.action.fired && ent.action.elapsed-ent.action.strikeTime<.095 ? verbs[pose.seq.strike] : verbs[pose.index];
    return `${stage} · ${aimDirectionNames[pose.key]}${m.moving?' · Đang chạy':''}`;
}

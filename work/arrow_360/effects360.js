const kitPalettes={
    bow_moon:['#79d5ff','#ecfaff','#5271ea'],shuriken:['#adcaff','#f4efff','#7463cc'],
    laser_sword:['#72dfff','#fdf3c5','#407fc9'],vampire_blade:['#ff547e','#ffd3db','#85194b'],
    repeater:['#86e0af','#e6ffce','#286e58'],hammer:['#ffab52','#fff0bb','#bd5038'],
    staff:['#bf8dff','#fae6ff','#6141bf'],shield:['#6be2ef','#e4fbff','#378093'],
    bow_rose:['#fa91bf','#ffe8ee','#a74277'],bow_jade:['#8cf1df','#eaffff','#408bc6']
};
let weaponBursts=[];

function clearWeaponBursts() { weaponBursts=[]; }

function newWeaponBurst(x,y,angle,key,kind) {
    const duration=kind==='hit'?.36:kind==='melee'?.26:.18;
    weaponBursts.push({x,y,angle,key,kind,age:0,duration});
    if (weaponBursts.length>140) weaponBursts.shift();
}

function stepWeaponBursts(dt) {
    for (const p of weaponBursts) p.age+=dt;
    weaponBursts=weaponBursts.filter(p=>p.age<p.duration);
}

function markDirectionalAttack(ent,action,origin,arc) {
    const key=playableActor(ent).key;
    if (arc) {
        const low=key==='hammer' ? 8 : -6;
        newWeaponBurst(ent.x,ent.y+low,action.angle,key,'melee');
        newWeaponBurst(origin.x,origin.y,action.angle,key,'contact');
    } else {
        newWeaponBurst(origin.x,origin.y,origin.aim,key,'release');
    }
}

function markDirectionalImpact(shot) {
    if (shot.owner?.cosmeticSkin===undefined) return;
    newWeaponBurst(shot.x,shot.y,shot.angle,playableActor(shot.owner).key,'hit');
}

function pixelLine(g,x,y,angle,a,b,size,color,offset=0) {
    const u=Math.cos(angle),v=Math.sin(angle);
    pixelSegment(g,x+u*a-v*offset,y+v*a+u*offset,x+u*b-v*offset,y+v*b+u*offset,size,color);
}

function fxPoint(x,y,r,color) {
    pixDiamond(ctx,pxSnap(x),pxSnap(y),Math.max(1,Math.round(r)),color);
}

function fxArc(x,y,angle,r,start,end,color,thickness) {
    let px=x+Math.cos(angle+start)*r,py=y+Math.sin(angle+start)*r;
    const count=Math.max(2,Math.ceil(Math.abs(end-start)*6));
    for(let i=1;i<=count;i++) {
        const a=angle+start+(end-start)*i/count;
        const nx=x+Math.cos(a)*r,ny=y+Math.sin(a)*r;
        pixelSegment(ctx,px,py,nx,ny,thickness,color);
        px=nx; py=ny;
    }
}

function drawDirectionalEffects() {
    ctx.save();
    for (const p of weaponBursts) {
        if (!arrowVfxVisible(p.x,p.y,120)) continue;
        const f=p.age/p.duration;
        const [main,core,shade]=kitPalettes[p.key];
        ctx.globalAlpha=Math.min(1,1.35*(1-f));
        const dx=Math.cos(p.angle),dy=Math.sin(p.angle);
        if (p.kind==='melee') {
            if (p.key==='laser_sword') {
                fxArc(p.x,p.y,p.angle,36+8*f,-1.17,1.13,shade,7);
                fxArc(p.x,p.y,p.angle,38+8*f,-.96,.99,core,3);
                fxPoint(p.x+dx*44,p.y+dy*44,4,main);
            } else if (p.key==='vampire_blade') {
                fxArc(p.x,p.y,p.angle,40+9*f,-1.48,1.42,shade,9);
                fxArc(p.x,p.y,p.angle,45+9*f,-1.19,1.02,main,4);
                fxArc(p.x,p.y,p.angle,51+9*f,-.73,.66,core,1);
            } else if (p.key==='hammer') {
                const x=p.x+dx*55,y=p.y+dy*50;
                fxArc(x,y,p.angle,9+28*f,0,Math.PI*2,shade,2);
                fxArc(x,y,p.angle,5+20*f,0,Math.PI*2,main,2);
                for (let j=0;j<6;j++) {
                    const a=j*Math.PI/3;
                    pixelLine(ctx,x,y,a,5+f*10,13+f*17,2,core);
                }
            } else if (p.key==='shield') {
                const x=p.x+dx*(28+15*f),y=p.y+dy*(28+15*f);
                pixelLine(ctx,x,y,p.angle+Math.PI/2,-16,16,4,shade);
                pixelLine(ctx,x,y,p.angle+Math.PI/2,-12,12,2,core);
                for (const sign of [-1,1]) pixelLine(ctx,x,y,p.angle,-4,11,2,main,sign*13);
            }
        } else if (p.kind==='contact') {
            const radius=(p.key==='hammer'?6:3)+6*f;
            fxPoint(p.x,p.y,4*(1-f),core);
            for (const s of [-1,1]) pixelLine(ctx,p.x,p.y,p.angle+s*.64,radius-2,radius+3,2,main);
        } else if (p.kind==='release') {
            const r=4+8*f;
            if (p.key==='repeater') {
                for (const s of [-1,0,1]) pixelLine(ctx,p.x,p.y,p.angle+s*.31,1,r+4,2,core);
            } else if (p.key==='staff') {
                fxArc(p.x,p.y,p.angle,r,-2.1,2.4,main,1);
                for (let k=0;k<4;k++) fxPoint(p.x+Math.cos(k*Math.PI/2)*r,p.y+Math.sin(k*Math.PI/2)*r,2,core);
            } else {
                fxPoint(p.x,p.y,Math.max(1,4-f*3),core);
                pixelLine(ctx,p.x,p.y,p.angle,-4,r,1,main);
            }
        } else {
            const radius=4+15*f;
            fxPoint(p.x,p.y,3.7*(1-f),core);
            for (let i=0;i<(p.key==='bow_rose'?5:6);i++) {
                const a=p.angle+i*(p.key==='bow_rose'?Math.PI*2/5:Math.PI/3);
                const x=p.x+Math.cos(a)*radius,y=p.y+Math.sin(a)*radius;
                if (p.key==='bow_jade') pixelLine(ctx,x,y,a,-3,3,2,i%2?main:core);
                else fxPoint(x,y,i%2?1:2,i%2?main:core);
            }
            if (p.key==='staff') fxArc(p.x,p.y,p.angle,radius,0,Math.PI*2,shade,2);
        }
    }
    ctx.restore();
}

function drawDirectionalProjectile(shot) {
    if (shot.owner?.cosmeticSkin===undefined) return false;
    const key=playableActor(shot.owner).key;
    if (shot.weapon!==shot.owner.baseWeapon && shot.weapon!=='bolt') return false;
    const [main,core,shade]=kitPalettes[key];
    const x=pxSnap(shot.x),y=pxSnap(shot.y),a=Math.atan2(shot.vy,shot.vx);
    const dx=Math.cos(a),dy=Math.sin(a),size=Math.max(.8,shot.scale);
    ctx.save();
    if (key==='shuriken') {
        for(let i=0;i<4;i++) {
            const angle=shot.spin+i*Math.PI/2;
            pixelLine(ctx,x,y,angle,-2,5*size,2,main);
            fxPoint(x+Math.cos(angle)*5,y+Math.sin(angle)*5,1,core);
        }
        fxPoint(x,y,2,shade);
        fxPoint(x-7*dx,y-7*dy,1,main);
    } else if (key==='staff') {
        for(let i=4;i>0;i--) {
            ctx.globalAlpha=1-i*.13;
            fxPoint(x-dx*i*7,y-dy*i*7,5-i*.7,shade);
        }
        ctx.globalAlpha=1;
        fxPoint(x,y,8*size,shade); fxPoint(x,y,6*size,main);
        fxPoint(x-dx*2,y-dy*2,3*size,core);
        fxArc(x,y,shot.spin,10*size,-1.2,.7,core,1);
    } else if (key==='repeater') {
        pixelLine(ctx,x,y,a,-14,5,3,shade);
        pixelLine(ctx,x,y,a,-6,7,2,core);
        fxPoint(x+dx*8,y+dy*8,2,main);
    } else if (key.startsWith('bow_')) {
        pixelLine(ctx,x,y,a,-16,8,3,shade); pixelLine(ctx,x,y,a,-10,9,1,core);
        fxPoint(x+dx*10,y+dy*10,3,main);
        for (let i=1;i<=3;i++) {
            const spot=key==='bow_moon'?0:Math.sin(shot.spin+i*1.8)*i*1.7;
            fxPoint(x-dx*i*8-dy*spot,y-dy*i*8+dx*spot,key==='bow_rose'?2:1,main);
        }
    } else {
        ctx.restore();
        return false;
    }
    ctx.restore();
    return true;
}

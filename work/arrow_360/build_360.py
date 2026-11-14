from base64 import b64encode
import json
from pathlib import Path
import sys


HERE=Path(__file__).resolve().parent
WORK=HERE.parent
OUT=WORK.parent/'outputs'
sys.path.insert(0,str(WORK/'arrow_playable'))
from build import rep, between


def png_uri(file):
    return 'data:image/png;base64,'+b64encode(file.read_bytes()).decode('ascii')


def read(name):
    return (HERE/name).read_text(encoding='utf8')


def main():
    source=(OUT/'ArrowIO_DienSao_BanChoiThu.html').read_text(encoding='utf8')
    atlas=json.loads(read('atlas360.json'))
    atlas['texture']=png_uri(HERE/'sprites360.png')
    atlas['portraits']=png_uri(WORK/'arrow_playable'/'atlas_portraits.png')
    source=between(source,'const PLAYABLE_ATLAS = ','const playableScale',
                   'const PLAYABLE_ATLAS = '+json.dumps(atlas,ensure_ascii=False,separators=(',',':'))+';\n')
    source=between(source,'function playableAttackGroup(','function playableDrawFrame(',read('motion360.js')+'\n')
    source=between(source,'function playableWeaponOrigin(ent, group, angle) {','function playableShadow(', '')
    source=rep(source,'const PLAY_DURATION = 180;',read('effects360.js')+'\nconst PLAY_DURATION = 180;')
    source=rep(source,'<title>Arrow.io — Điện Sao · Bản chơi thử</title>','<title>Arrow.io — Điện Sao · Bản 360°</title>')
    source=rep(source,'So điểm với bot trong ba phút, nhặt ngọc lên cấp và săn rồng. Vào phòng tập để soi chạy, kéo cung và ra đòn.',
               'Mười tướng với tám hướng chạy và ra đòn. Vào phòng tập để vừa di chuyển vừa đánh và soi cận cảnh từng vũ khí.')
    source=rep(source,'<canvas id="animZoom" width="256" height="188"></canvas>',
               '<canvas id="animZoom" width="256" height="188"></canvas><span id="inspectPose"></span>')
    source=rep(source,'<button type="button" id="btnSlow" class="hud-utility" aria-pressed="false" hidden>Xem chậm</button>',
               '''<button type="button" id="btnSlow" class="hud-utility" aria-pressed="false" hidden>Xem chậm</button>
                    <label id="aimTrainingControl" class="hud-utility aim-control" hidden>Hướng ngắm
                        <select id="trainingAim" aria-label="Chọn hướng ngắm phòng tập">
                            <option value="">Theo chuột / cần</option><option value="N">↑ Lên</option>
                            <option value="NE">↗ Chéo lên phải</option><option value="E">→ Phải</option>
                            <option value="SE">↘ Chéo xuống phải</option><option value="S">↓ Xuống</option>
                            <option value="SW">↙ Chéo xuống trái</option><option value="W">← Trái</option>
                            <option value="NW">↖ Chéo lên trái</option>
                        </select>
                    </label>''')
    source=rep(source,'</style>', '''
.aim-control{display:flex;gap:6px;align-items:center}
.aim-control select{color:#f8dcef;background:#30213a;max-width:135px;border:1px solid #91688b;border-radius:3px;padding:3px 2px;appearance:auto}
.aim-control select:focus-visible{outline:2px solid #f2b7db}
#inspectPose{display:block;color:#edc3e0;max-width:256px;padding:3px 0}
@media(max-width:760px){#inspectPose{max-width:155px;font-size:10px}.aim-control{padding-inline:6px}}
</style>''')
    source=rep(source,'        const action=this.action;\n        const effort=action ? (playableProfile(this).reach ? (action.fired ? .54 : .43) : .72) : 1;',
               '        const action=this.action;\n        const oldX=this.x,oldY=this.y;\n'
               '        const effort=action ? (playableProfile(this).reach ? (action.fired ? .66 : .61) : .86) : 1;')
    source=rep(source,'        advancePlayableAction(this,dt);','        updateDirectionalMotion(this,oldX,oldY);\n        advancePlayableAction(this,dt);')
    source=rep(source,'    if (stickAiming || releaseStick) {','''    if (playMode==='training' && practiceAim) {
        const angle=playableDirections.indexOf(practiceAim)*Math.PI/4;
        target={x:ent.x+Math.cos(angle)*220,y:ent.y+Math.sin(angle)*220};
    } else if (stickAiming || releaseStick) {''')
    source=rep(source,'    resetPlayableInput();\n    syncPlayableControls();',
               "    resetPlayableInput();\n    clearWeaponBursts();\n    practiceAim='';\n    document.getElementById('trainingAim').value='';\n    syncPlayableControls();")
    source=rep(source,"    document.getElementById('btnSlow').hidden=playMode!=='training';",
               "    document.getElementById('btnSlow').hidden=playMode!=='training';\n    document.getElementById('aimTrainingControl').hidden=playMode!=='training';")
    source=rep(source,"function initPlayableControls() {\n    document.getElementById('btnTraining')",'''function initPlayableControls() {
    document.getElementById('trainingAim').addEventListener('change',event=>{
        practiceAim=event.target.value;
        canvas.focus({preventScroll:true});
    });
    document.getElementById('btnTraining')''')
    source=rep(source,"    const action=player.action;\n    const gauge=", "    const action=player.action;\n    document.getElementById('inspectPose').textContent=directionalAttackLabel(player);\n    const gauge=")
    source=between(source,"        document.getElementById('attackStage').textContent=action.fired?",'\n    }\n}\n\nfunction drawPlayableZoom',
                   "        document.getElementById('attackStage').textContent=directionalAttackLabel(player);")
    source=rep(source,"    const offset=index===1 ? -.042 : index===2 ? .042 : 0;",
               "    markDirectionalAttack(ent,action,origin,false);\n    const offset=index===1 ? -.042 : index===2 ? .042 : 0;")
    source=rep(source,'    const origin=playableMuzzle(ent,action);\n    ent.attackAuraTimer=.24;',
               "    const origin=playableMuzzle(ent,action);\n    if (actor.key!=='repeater') markDirectionalAttack(ent,action,origin,Boolean(profile.reach));\n    ent.attackAuraTimer=.24;")
    source=rep(source,'                spawnArrowContactEffect(p, t);','                spawnArrowContactEffect(p, t);\n                markDirectionalImpact(p);')
    source=rep(source,'        if(!arrowVfxVisible(shot.x,shot.y,100))continue;',
               '        if(!arrowVfxVisible(shot.x,shot.y,100))continue;\n        if(drawDirectionalProjectile(shot))continue;')
    source=rep(source,'    drawParticlesAndPopups();\n\n    ctx.restore();','    drawDirectionalEffects();\n    drawParticlesAndPopups();\n\n    ctx.restore();')
    source=rep(source,'        updateParticlesAndPopups(dt);','        updateParticlesAndPopups(dt);\n        stepWeaponBursts(dt);')
    output=OUT/'ArrowIO_DienSao_360.html'
    output.write_text(source,encoding='utf8')
    print(output,output.stat().st_size)


if __name__=='__main__':
    main()

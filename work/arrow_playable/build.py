from base64 import b64encode
import json
from pathlib import Path


HERE=Path(__file__).resolve().parent
OUT=HERE.parents[1]/'outputs'


def rep(source,old,new):
    count=source.count(old)
    if count!=1:
        raise ValueError(f'Expected one occurrence of {old[:110]!r}, found {count}')
    return source.replace(old,new,1)


def between(source,left,right,new):
    start=source.index(left)
    end=source.index(right,start+len(left))
    return source[:start]+new+source[end:]


def read(name):
    return (HERE/name).read_text(encoding='utf-8')


def url(name):
    return 'data:image/png;base64,'+b64encode((HERE/name).read_bytes()).decode('ascii')


def main():
    text=(OUT/'ArrowIO_DienSao_Pixel.html').read_text(encoding='utf8')
    atlas=json.loads(read('atlas.json'))
    atlas.update(texture=url('atlas_sprites.png'),portraits=url('atlas_portraits.png'))
    roles=(0,1,2,3,4,5,6,7,0,0)
    skins=[dict(name=a['name'],style=a['weapon'],role=role,cost=0) for a,role in zip(atlas['actors'],roles)]
    modules=('const PLAYABLE_ATLAS = '+json.dumps(atlas,ensure_ascii=False,separators=(',',':'))+';\n'+
             read('actors.js')+'\n'+read('match.js')+'\n')
    text=rep(text,'<title>Arrow.io — Điện Sao Pixel</title>','<title>Arrow.io — Điện Sao · Bản chơi thử</title>')
    text=rep(text,'</style>',read('playable.css')+'\n</style>')
    text=rep(text,'    <canvas id="gameCanvas"></canvas>','    <canvas id="gameCanvas" tabindex="-1" aria-label="Đấu trường Arrow.io"></canvas>')
    text=rep(text,'<div class="meter-top"><strong id="hudLevelText">LV 1</strong><strong id="hudHealth"></strong></div>',
             '<div class="meter-top"><strong id="hudLevelText">Cấp 1</strong><strong class="clock-display" id="hudClock"></strong><strong id="hudHealth"></strong></div>')
    text=rep(text,'<div class="meter-track"><div id="expBarFill" style="width: 0%"></div></div>',
             '<div class="meter-track"><div id="expBarFill" style="width: 0%"></div></div>\n'
             '                    <div id="attackCharge" class="attack-charge" hidden><span id="attackStage"></span><b><i></i></b></div>')
    text=rep(text,'<div class="flex flex-wrap items-center gap-1.5">','<div class="flex flex-wrap items-center gap-1.5 hud-actions">')
    text=rep(text,'<span id="soundIcon">🔊</span>','<span id="soundIcon">🔇</span>')
    text=rep(text,'                <!-- Kill Feed', '''                <div class="flex flex-wrap gap-1.5 hud-actions">
                    <button type="button" id="btnPause" class="hud-utility">Tạm dừng</button>
                    <button type="button" id="btnZoom" class="hud-utility" aria-pressed="false">Cận cảnh</button>
                    <button type="button" id="btnSlow" class="hud-utility" aria-pressed="false" hidden>Xem chậm</button>
                </div>
                <!-- Kill Feed''')
    text=rep(text,'<div class="bg-neutral-950/75 backdrop-blur-[2px] border border-neutral-700/80 rounded-lg p-2 sm:p-2.5 w-56 sm:w-72 shadow-2xl text-[11px] sm:text-xs font-bold">',
             '<div class="arena-rank bg-neutral-950/75 backdrop-blur-[2px] border border-neutral-700/80 rounded-lg p-2 sm:p-2.5 w-56 sm:w-72 shadow-2xl text-[11px] sm:text-xs font-bold">')
    text=rep(text,'\n<div id="startScreen"', '''
    <div id="pauseScreen" class="playable-pause hidden" role="dialog" aria-modal="true" aria-labelledby="pauseTitle">
        <section class="playable-pause-card">
            <h2 id="pauseTitle">Tạm dừng</h2>
            <div><button id="btnResume" type="button" class="hud-utility resume">Tiếp tục</button>
            <button id="btnRestartMatch" type="button" class="hud-utility">Chơi lại</button>
            <button id="btnExitMatch" type="button" class="hud-utility">Về sảnh đổi nhân vật</button></div>
        </section>
    </div>
<div id="startScreen"''')
    text=rep(text,'    </div>\n\n    <div id="pauseScreen"',
             '        <div id="zoomPanel" class="zoom-panel" hidden>Cận cảnh hoạt ảnh<canvas id="animZoom" width="256" height="188"></canvas></div>\n    </div>\n\n    <div id="pauseScreen"')
    text=rep(text,'                <button id="btnUnlockAll" type="button" class="quiet-button">Mở tất cả skin</button>',
             '                <button id="btnUnlockAll" type="button" class="quiet-button" hidden>Mở tất cả skin</button>')
    text=rep(text,'Đấu cung thủ, nhặt ngọc lên cấp và săn rồng trong đấu trường pixel.',
             'So điểm với bot trong ba phút, nhặt ngọc lên cấp và săn rồng. Vào phòng tập để soi chạy, kéo cung và ra đòn.')
    text=rep(text,'                <button id="btnStartMatch" type="button" class="play-button"><span aria-hidden="true">➶</span> Vào trận</button>',
             '''                <div class="mode-buttons">
                    <button id="btnStartMatch" type="button" class="play-button">Vào đấu trường</button>
                    <button id="btnTraining" type="button" class="training-button">Phòng tập</button>
                </div>''')
    text=rep(text,'<span><kbd>Chuột</kbd> Ngắm &amp; bắn</span><span><kbd>1–3</kbd> Chọn kỹ năng</span>',
             '<span><kbd>Chuột/Space</kbd> Giữ kéo cung, thả tên</span><span><kbd>1–3</kbd> Kỹ năng</span><span><kbd>Esc</kbd> Tạm dừng</span>')
    text=rep(text,'Kéo bên phải để ngắm và bắn','Kéo bên phải để ngắm, thả để bắn cung')
    text=rep(text,'<span class="section-caption">TỦ TRANG PHỤC</span><h2 id="loadoutTitle">Chọn skin</h2>',
             '<h2 id="loadoutTitle">Chọn nhân vật</h2>')
    text=rep(text,'<div><span class="section-caption">KHO VŨ KHÍ</span><h2 id="bowTitle">Skin cung</h2></div>',
             '<div><h2 id="bowTitle">Màu hiệu ứng đạn</h2></div>')
    text=rep(text,'aria-label="Các mẫu cung"','aria-label="Màu hiệu ứng đạn"')
    text=rep(text,'<h2 class="text-2xl font-black text-white">KẾT THÚC TRẬN ĐẤU</h2>',
             '<h2 id="matchResult" class="text-2xl font-black text-white">KẾT THÚC TRẬN ĐẤU</h2>')

    text=rep(text,'    constructor() {\n        this.ctx = null;\n        this.muted = false;',
             '    constructor() {\n        this.ctx = null;\n        this.muted = true;')
    text=rep(text,"window.addEventListener('keydown', (e) => {\n    input.keys[e.code] = true;",'''window.addEventListener('keydown', (e) => {
    if (e.code==='Escape' && (gameState==='PLAYING' || gameState==='PAUSED') && !e.repeat) {
        e.preventDefault();
        pausePlayable();
        return;
    }
    if (gameState!=='PLAYING' || e.target?.tagName==='INPUT') return;
    if (e.code==='Space' && e.target?.tagName==='BUTTON') return;
    if (e.code==='Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.code==='Space' && !input.keys.Space) input.pressAttack=true;
    input.keys[e.code] = true;''')
    text=rep(text,"        sound.init();\n        input.mouseDown = true;",
             "        if (gameState!=='PLAYING') return;\n        sound.init();\n        input.isTouch=false;\n        input.mouseX=e.clientX; input.mouseY=e.clientY;\n        input.mouseDown = true;\n        input.pressAttack = true;")
    text=rep(text,"canvas.addEventListener('mousemove', (e) => {\n    input.mouseX", "canvas.addEventListener('mousemove', (e) => {\n    input.isTouch=false;\n    input.mouseX")
    text=rep(text,"canvas.addEventListener('touchstart', (e) => {\n    e.preventDefault();", "canvas.addEventListener('touchstart', (e) => {\n    if (gameState!=='PLAYING') return;\n    e.preventDefault();")
    text=rep(text,"            if (d > 8) input.rightVec = { x: dx / d, y: dy / d };", "            if (d > 8) {\n                if (Math.hypot(input.rightVec.x,input.rightVec.y)<.12) input.pressAttack=true;\n                input.rightVec = { x: dx / d, y: dy / d };\n            }")
    text=rep(text,"            if (e.type === 'touchend' && player && player.alive && gameState === 'PLAYING') player.tryAttack(true);",
             "            if (e.type === 'touchcancel') { input.cancelAttack=true; input.pressAttack=false; }\n"
             "            else if (Math.hypot(input.rightVec.x,input.rightVec.y)>.12) input.releaseStick={...input.rightVec};")
    text=between(text,'    tryAttack(force = false) {','    spawnShot(x, y, angle) {','')
    text=between(text,'    spawnShot(x, y, angle) {','    takeDamage(blockAmount',
                 text[text.index('    spawnShot(x, y, angle) {'):text.index('    takeDamage(blockAmount')]
                 .replace('spawnShot(x, y, angle) {','spawnShot(x, y, angle, options = {}) {\n        const weapon=options.weapon || this.stats.weapon;')
                 .replace('const dmg = this.stats.damage *','const dmg = this.stats.damage * (options.damageScale ?? 1) *')
                 .replace('this.stats.weapon ===','weapon ===')
                 .replace('weapon: this.stats.weapon,','weapon,')
                 .replace("this.stats.arrowSpeed * 0.72 : this.stats.arrowSpeed)","this.stats.arrowSpeed * 0.72 : weapon==='bolt' ? this.stats.arrowSpeed*1.15 : this.stats.arrowSpeed)")
                 .replace("weapon === 'scythe' ? 18 : 9","weapon === 'scythe' ? 18 : weapon==='bolt' ? 6 : 9"))
    text=rep(text,'    die(killer) {\n        if (!this.alive) return;\n        this.alive = false;\n\n        // Rớt ngọc',
             '    die(killer) {\n        if (!this.alive) return;\n        if (this.practiceTarget) { restartPracticeTarget(this,killer); return; }\n        this.alive = false;\n\n        // Rớt ngọc')
    text=rep(text,"        } else {\n            const matchEntities = entities;\n            setTimeout(() => {\n                if (entities === matchEntities && gameState === 'PLAYING') spawnBot();\n            }, 2200);\n        }", "        } else {\n            this.respawnIn=2.2;\n        }")
    text=between(text,'        // Hồi sinh Rồng mới sau 14 giây','\n    update(dt) {\n        if (!this.alive) return;\n        this.wingPhase',
                 '        this.respawnIn=14;\n    }\n')
    text=rep(text,'''        if (this.isPlayer) {
            this.updatePlayerInput();
        } else {
            this.updateBotBehavior(dt);
        }

        // Di chuyển''','''        if (this.practiceTarget) return;
        if (this.isPlayer) updatePlayablePlayer(this);
        else updatePlayableBot(this,dt);

        const action=this.action;
        const effort=action ? (playableProfile(this).reach ? (action.fired ? .54 : .43) : .72) : 1;
        this.vx*=effort;
        this.vy*=effort;

        // Di chuyển''')
    text=rep(text,'        if (okY) this.y = ny;\n\n        // Hiệu ứng',
             '        if (okY) this.y = ny;\n        advancePlayableAction(this,dt);\n\n        // Hiệu ứng')
    text=between(text,'    updatePlayerInput() {','\nclass VoxelDragonBoss', '}'+'\n')
    text=rep(text,'    while (pickups.length < 135) {','    while (pickups.length < (playMode===\'training\' ? 0 : 135)) {')
    text=rep(text,'        for (const ent of entities) {\n            if (!ent.alive) continue;\n            const d = Math.hypot(ent.x - item.x, ent.y - item.y);',
             '        for (const ent of entities) {\n            if (!ent.alive || ent.practiceTarget) continue;\n            const d = Math.hypot(ent.x - item.x, ent.y - item.y);')
    text=rep(text,'        if(shot.weapon==="arrow"){','        if(shot.weapon==="bolt"){\n            pixelSegment(ctx,x-dx*8,y-dy*8,x+dx*6,y+dy*6,2,palette.core);\n            pixDiamond(ctx,pxSnap(x+dx*7),pxSnap(y+dy*7),2,palette.tint);\n        }else if(shot.weapon==="arrow"){')
    text=rep(text,"        if (item.kind === 'fighter') drawVoxelHero(item.obj);\n        else drawVoxelDragon(item.obj);",
             "        if (item.kind === 'fighter') {\n            if (item.obj.practiceTarget) drawPracticeTarget(item.obj);\n            else if (!drawPlayableHero(item.obj)) drawVoxelHero(item.obj);\n        } else drawVoxelDragon(item.obj);")
    text=rep(text,'    if (theme.midnight && player && player.alive && gameState === \'PLAYING\') {',
             "    if (theme.midnight && playMode==='arena' && player && player.alive && gameState === 'PLAYING') {")
    text=rep(text,'    drawMinimap();\n}', '    drawMinimap();\n    drawPlayableZoom();\n}')
    text=rep(text,"    document.getElementById('hudBow').textContent = starBowSkin(player.cosmeticBow).name;\n    document.getElementById('hudBow').style.color = starBowSkin(player.cosmeticBow).color;", "    updatePlayableHUD();")
    text=rep(text,"    bot.cosmeticSkin = cosmeticSkin;\n    bot.cosmeticBow = STAR_BOW_SKINS[bot.cosmeticSkin % STAR_BOW_SKINS.length].id;",
             "    initializePlayableFighter(bot,cosmeticSkin);")
    text=rep(text,"function startMatch() {\n    sound.init();", "function startMatch(mode='arena') {\n    playMode=mode==='training'?'training':'arena';\n    sound.init();")
    text=rep(text,"    player.cosmeticSkin = selectedCosmeticSkin;\n    player.cosmeticBow = selectedCosmeticBow;", "    initializePlayableFighter(player,selectedCosmeticSkin,selectedCosmeticBow);")
    text=rep(text,"    document.getElementById('hudLayer').classList.remove('hidden');\n    document.getElementById('killFeed').innerHTML = '';",
             "    document.getElementById('hudLayer').classList.remove('hidden');\n    canvas.focus({preventScroll:true});\n    document.getElementById('killFeed').innerHTML = '';")
    text=between(text,'    for (let i = 0; i < BOT_COUNT; i++) spawnBot();','    camera.x = player.x;','''    if (playMode==='training') {
        configureTraining();
    } else {
        for (let i=0;i<BOT_COUNT;i++) spawnBot();
        dragons.push(new VoxelDragonBoss('purple'),new VoxelDragonBoss('crimson'));
        seedPlayablePickups();
    }
    resetRound();
    document.getElementById('pauseScreen').classList.add('hidden');

''')
    text=rep(text,'function handlePlayerDeath(killerName) {','function handlePlayerDeath(killerName, rank = null) {')
    text=rep(text,"    document.getElementById('killedByText').textContent = `Bị hạ gục bởi ${killerName}`;",
             "    document.getElementById('matchResult').textContent = rank===1?'THẮNG TRẬN':rank?'HẾT GIỜ':'KẾT THÚC TRẬN ĐẤU';\n"
             "    document.getElementById('killedByText').textContent = rank?`Hạng ${rank} theo điểm`:`Bị hạ gục bởi ${killerName}`;")
    text=rep(text,'    const dt = Math.max(0, Math.min(0.05, (timestamp - lastTime) / 1000));',
             '    const dt = Math.max(0, Math.min(0.05, (timestamp - lastTime) / 1000)) * (gameSlow ? .5 : 1);')
    text=rep(text,'        updateMatchHUD(dt);\n    }',
             "        if (gameState==='PLAYING') stepPlayableMatch(dt);\n        updateMatchHUD(dt);\n    }")
    if text.count('requestAnimationFrame(mainLoop);')!=2:
        raise ValueError('unexpected frame schedule')
    text=text.replace('requestAnimationFrame(mainLoop);','queuePlayableFrame();')
    text=between(text,'const STAR_HERO_SKINS = [','const loadoutStorageKey',
                 'const STAR_HERO_SKINS = '+json.dumps(skins,ensure_ascii=False)+';\n\n')
    text=rep(text,"const loadoutStorageKey = 'arrowio-thien-cung-loadout-v1';\nconst unlockedStarSkins = new Set([0, 1]);",
             "const loadoutStorageKey = 'arrowio-dien-sao-playable-v2';\nconst unlockedStarSkins = new Set(STAR_HERO_SKINS.map((_,i)=>i));")
    text=rep(text,'        drawArcherSkin(portrait.getContext(\'2d\'),index,32,34,.88);',
             "        if (!drawPlayablePortrait(portrait.getContext('2d'),index,32,34,.92)) drawArcherSkin(portrait.getContext('2d'),index,32,34,.88);")
    text=rep(text,"        card.title = `${skin.style} · ${HEROES[skin.role].desc}`;",
             "        card.title = `${skin.style} · ${HEROES[skin.role].hpBlocks} HP · ${PLAYABLE_ATLAS.actors[index].description}`;")
    text=rep(text,"        cost.textContent = chosen ? 'Đang chọn' : unlocked ? 'Đã mở' : `◈ ${skin.cost.toLocaleString('vi-VN')}`;",
             "        cost.textContent = chosen ? 'Đang chọn' : skin.style;")
    text=rep(text,"            selectedHero = HEROES[skin.role];\n            feedback.textContent = '';\n            saveStarLoadout();\n            renderHeroGrid();",
             "            selectedHero = HEROES[skin.role];\n            selectedCosmeticBow=PLAY_CLASS[PLAYABLE_ATLAS.actors[index].key].aura || 'celestial';\n            feedback.textContent = '';\n            saveStarLoadout();\n            renderHeroGrid();\n            renderBowGrid();")
    text=rep(text,"    drawArcherSkin(g, selectedCosmeticSkin, 105, 101, 2.1, 0);\n    drawStarBow(g, selectedCosmeticBow, 137, 116, .87, -.35, .14);",
             "    if (!drawPlayablePortrait(g,selectedCosmeticSkin,112,98,2.22)) drawArcherSkin(g,selectedCosmeticSkin,112,98,2.1);")
    text=rep(text,"    document.getElementById('btnStartMatch').addEventListener('click', startMatch);\n    document.getElementById('btnPlayAgain').addEventListener('click', startMatch);",
             "    initPlayableControls();\n    document.getElementById('btnStartMatch').addEventListener('click',()=>startMatch('arena'));\n    document.getElementById('btnPlayAgain').addEventListener('click',()=>startMatch(playMode));")
    text=between(text,"    document.getElementById('btnBackHome').addEventListener('click', () => {", "    document.getElementById('btnSound').addEventListener", "    document.getElementById('btnBackHome').addEventListener('click',closeToLobby);\n\n")
    text=between(text,"window.addEventListener('blur', () => {","window.addEventListener('resize'",'''window.addEventListener('blur', () => {
    resetPlayableInput();
    if (player?.action?.manual && !player.action.fired) player.action=null;
});
''')
    text=between(text,'window.onload = initApp;','</script>',modules+'''window.onload = initApp;
playableAnimationReady.then(ready=>{
    if (ready && document.readyState==='complete' && gameState==='HOME') renderHeroGrid();
});
''')
    (OUT/'ArrowIO_DienSao_BanChoiThu.html').write_text(text,encoding='utf8')


if __name__=='__main__':
    main()

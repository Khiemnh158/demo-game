const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const safeHtml = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

class EventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, listener, options) {
        const listeners = this.listeners.get(type) ?? [];
        listeners.push({ fn: listener, once: options?.once });
        this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item => item.fn !== listener));
    }

    trigger(type, properties) {
        const event = {
            type, target: this, currentTarget: this, button: 0, defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() {},
            ...properties
        };
        const listeners = [...(this.listeners.get(type) ?? [])];
        for (const callback of listeners) {
            callback.fn.call(this, event);
            if (callback.once) this.removeEventListener(type, callback.fn);
        }
        const domHandler = this['on' + type];
        if (typeof domHandler === 'function') domHandler.call(this, event);
        return event;
    }
}

function canvasContext(can, stats) {
    const names = [
        'arc', 'arcTo', 'beginPath', 'bezierCurveTo', 'clearRect', 'clip', 'closePath', 'ellipse',
        'fill', 'fillRect', 'fillText', 'lineTo', 'moveTo', 'quadraticCurveTo', 'rect', 'resetTransform',
        'restore', 'rotate', 'roundRect', 'save', 'scale', 'setLineDash', 'setTransform',
        'stroke', 'strokeRect', 'strokeText', 'transform', 'translate'
    ];
    const ctx = Object.fromEntries(names.map(name => [name, (...args) => {
        if (args.some(value => typeof value === 'number')) {
            assert.ok(!args.some(value => typeof value === 'number' && !Number.isFinite(value)),
                'invalid Canvas coordinate for ' + name);
        }
    }]));
    const gradient = () => ({ addColorStop() {} });
    return Object.assign(ctx, {
        canvas: can, globalAlpha: 1, filter: 'none',
        createLinearGradient: gradient, createRadialGradient: gradient,
        createPattern: () => ({}),
        drawImage(image, ...args) {
            assert.ok(image, 'missing drawImage source');
            assert.ok(args.every(Number.isFinite), 'non-finite drawImage coordinates');
            stats.drawCalls++;
            const length = image.src?.length ?? 0;
            if (length > 220000) stats.atlasDrawCalls++;
            if (length) stats.textures.set(image.src, (stats.textures.get(image.src) ?? 0) + 1);
            if (stats.captureFrames && image.src === stats.captureTexture && args.length === 8) {
                stats.captureFrames.add(args.slice(0, 4).join(','));
            }
        },
        measureText: text => ({ width: String(text).length * 7 }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) })
    });
}

async function seleniumStub(html) {
    const tags = [];
    const byId = new Map();
    const stats = { drawCalls: 0, atlasDrawCalls: 0, textures: new Map() };
    const frameQueue = new Map();
    const timeoutQueue = new Map();
    const storage = new Map();
    const pendingImages = [];
    let time = 0;
    let uid = 1;
    const window = new EventTarget();
    const document = new EventTarget();
    document.activeElement = null;
    document.visibilityState = 'visible';
    document.readyState = 'complete';

    class Element extends EventTarget {
        constructor(tag) {
            super();
            this.tagName = tag.toUpperCase();
            this.className = '';
            this.dataset = {};
            this.attrs = {};
            this.style = { setProperty(name, value) { this[name] = value; } };
            this.children = [];
            this.parentNode = null;
            this.value = '';
            this.hidden = this.disabled = false;
            this._html = '';
            this._text = '';
            this.width = this.clientWidth = 300;
            this.height = this.clientHeight = 150;
            this.classList = {
                add: (...names) => { this.className = [...new Set([...this.classes(), ...names])].join(' '); },
                remove: (...names) => { this.className = this.classes().filter(s => !names.includes(s)).join(' '); },
                contains: name => this.classes().includes(name),
                toggle: (name, forced = !this.classes().includes(name)) => {
                    this.classList[forced ? 'add' : 'remove'](name);
                    return forced;
                }
            };
        }

        classes() { return String(this.className).split(/\s+/).filter(Boolean); }
        get firstChild() { return this.children[0] ?? null; }
        get lastChild() { return this.children.at(-1) ?? null; }
        get parentElement() { return this.parentNode; }

        set textContent(value) {
            this._text = String(value);
            this._html = safeHtml(this._text);
            this.replaceChildren();
        }

        get textContent() { return this._text; }

        set innerHTML(value) {
            this._html = String(value);
            this._text = this._html.replace(/<[^>]+>/g, '');
            this.replaceChildren();
        }

        get innerHTML() { return this._html; }

        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        }

        append(...children) { for (const child of children) this.appendChild(child); }
        prepend(child) { this.children.unshift(child); child.parentNode = this; }

        replaceChildren(...children) {
            for (const child of this.children) child.parentNode = null;
            this.children = [];
            this.append(...children);
        }

        removeChild(child) {
            this.children = this.children.filter(item => item !== child);
            child.parentNode = null;
            return child;
        }

        remove() { this.parentNode?.removeChild(this); }
        contains(child) { return Boolean(child) && (child === this || this.children.some(node => node.contains(child))); }
        focus() { document.activeElement = this; }
        click() { if (!this.disabled) this.trigger('click'); }
        getContext() { return this.context ??= canvasContext(this, stats); }
        getBoundingClientRect() {
            const width = this.id === 'gameCanvas' ? window.innerWidth : this.width;
            const height = this.id === 'gameCanvas' ? window.innerHeight : this.height;
            return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height };
        }
        setPointerCapture() {}
        releasePointerCapture() {}
        hasPointerCapture() { return true; }

        setAttribute(name, value) {
            this.attrs[name] = String(value);
            if (['id', 'class', 'value'].includes(name)) {
                const property = name === 'class' ? 'className' : name;
                this[property] = String(value);
                if (name === 'id') byId.set(this.id, this);
            }
            if (['width', 'height'].includes(name)) this[name] = Number(value);
            if (['hidden', 'disabled'].includes(name)) this[name] = true;
            if (name.startsWith('data-')) {
                const dataKey = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
                this.dataset[dataKey] = String(value);
            }
        }

        getAttribute(name) { return this.attrs[name] ?? null; }

        matches(selector) {
            if (selector[0] === '#') return this.id === selector.slice(1);
            if (selector[0] === '.') return this.classList.contains(selector.slice(1));
            if (selector[0] === '[') {
                const match = /^\[([\w-]+)(?:=["']?([^"']+)["']?)?\]$/.exec(selector);
                if (!match) return false;
                const value = this.getAttribute(match[1]);
                return value !== null && (!match[2] || value === match[2]);
            }
            return this.tagName.toLowerCase() === selector;
        }

        querySelectorAll(selectors) {
            return tags.filter(tag => this.contains(tag) && selectors.split(',').some(selector => tag.matches(selector.trim())));
        }
        querySelector(selectors) { return this.querySelectorAll(selectors)[0] ?? null; }
        closest(selectors) {
            if (selectors.split(',').some(selector => this.matches(selector.trim()))) return this;
            return this.parentNode?.closest(selectors) ?? null;
        }
    }

    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    const markup = html.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '');
    document.body = new Element('body');
    document.documentElement = new Element('html');
    document.documentElement.appendChild(document.body);
    document.createElement = name => {
        const element = new Element(name);
        tags.push(element);
        return element;
    };
    document.getElementById = id => byId.get(id) ?? null;
    document.querySelectorAll = q => document.body.querySelectorAll(q);
    document.querySelector = q => document.body.querySelector(q);
    const tree = [document.body];
    for (const record of markup.matchAll(/<(\/?)([a-z][a-z\d:-]*)\b([^>]*)>/gi)) {
        const [, close, tag, raw] = record;
        const name = tag.toLowerCase();
        if (name === 'html' || name === 'body') continue;
        if (close) {
            const level = tree.findLastIndex(element => element.tagName === tag.toUpperCase());
            if (level > 0) tree.length = level;
            continue;
        }
        const element = document.createElement(name);
        for (const match of raw.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
            element.setAttribute(match[1], match[2] ?? match[3] ?? match[4] ?? '');
        tree.at(-1).appendChild(element);
        if (!new Set(['br', 'hr', 'img', 'input', 'link', 'meta', 'path', 'i']).has(name) && !raw.endsWith('/')) tree.push(element);
    }

    class Image extends EventTarget {
        set src(value) {
            this._src = value;
            assert.ok(value?.startsWith('data:'), 'unexpected external or broken image source');
            this.complete = true;
            this.naturalWidth = this.naturalHeight = 1024;
            const prefix = 'data:image/png;base64,';
            if (value.startsWith(prefix)) {
                const bytes = Buffer.from(value.slice(prefix.length, prefix.length + 36), 'base64');
                this.naturalWidth = bytes.readInt32BE(16);
                this.naturalHeight = bytes.readInt32BE(20);
            }
            this.width = this.naturalWidth;
            this.height = this.naturalHeight;
            pendingImages.push(this);
        }
        get src() { return this._src; }
        decode() { return Promise.resolve(); }
    }

    Object.assign(window, {
        innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, document,
        visualViewport: null, matchMedia: () => ({ matches: false, addEventListener() {} })
    });
    const frame = fn => { const id = uid++; frameQueue.set(id, fn); return id; };
    const setTimeout = (fn, delay = 0) => { const id = uid++; timeoutQueue.set(id, { fn, due: time + delay }); return id; };
    const clearTimeout = id => timeoutQueue.delete(id);
    const clearFrame = id => frameQueue.delete(id);
    const memory = {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key)
    };
    Object.assign(window, { requestAnimationFrame: frame, cancelAnimationFrame: clearFrame, localStorage: memory,
        setTimeout, clearTimeout, performance: { now: () => time } });
    const context = vm.createContext({
        console, window, document, Image, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
        HTMLCanvasElement: Element, Element, HTMLElement: Element,
        requestAnimationFrame: frame, cancelAnimationFrame: clearFrame,
        setTimeout, clearTimeout, performance: window.performance, localStorage: memory,
        location: { href: 'file:///qa.html', protocol: 'file:', search: '', hash: '' },
        navigator: { maxTouchPoints: 0 }, matchMedia: window.matchMedia,
        getComputedStyle: element => ({ display: element.classList.contains('hidden') ? 'none' : 'block' })
    });
    const run = (code, filename = 'test-expression.js') => vm.runInContext(code, context, { timeout: 1500, filename });
    const tick = (count = 1) => {
        for (let n = 0; n < count; ++n) {
            time += 1000 / 60;
            for (const [id, timer] of [...timeoutQueue]) {
                if (timer.due <= time) {
                    timeoutQueue.delete(id);
                    timer.fn();
                }
            }
            const frames = [...frameQueue.values()];
            frameQueue.clear();
            for (const callback of frames) callback(time);
            assert.ok(frameQueue.size <= 1, 'multiple simultaneous animation loops');
        }
    };
    for (let i = 0; i < scripts.length; i++) {
        const [, attr, source] = scripts[i];
        assert.ok(!/\bsrc\s*=/i.test(attr), 'external script dependency');
        if (!attr.includes('application/json')) run(source, 'embedded-script-' + i + '.js');
    }
    const leftoverExternal = [...markup.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/gi)]
        .map(match => match[1]);
    assert.deepEqual(leftoverExternal, [], 'offline asset dependency');
    run('Math.random = (() => { let state = 0x94fec0e1; return () => ((state = (Math.imul(state, 1664525) + 1013904223) | 0) >>> 0) / 4294967296; })();');
    for (const image of pendingImages) image.trigger('load');
    await new Promise(resolve => setImmediate(resolve));
    window.trigger('load');
    await new Promise(resolve => setImmediate(resolve));
    tick();
    return { run, tick, window, document, frameQueue, tags, stats };
}

function runTests(game, { checkOnly = false, base = false } = {}) {
    const { run, tick, window, document, frameQueue, stats } = game;
    const byId = id => document.getElementById(id);
    const canvas = byId('gameCanvas');
    const lobby = byId('startScreen');
    const key = (type, code, value = code) => window.trigger(type, { code, key: value });
    const list = byId('heroGrid');
    assert.equal(list.children.length, 10, 'lobby hero roster');
    assert.equal(run('gameState'), 'HOME');
    assert.ok(!lobby.classList.contains('hidden'));
    if (checkOnly) return;

    const btnUnlock = byId('btnUnlockAll');
    btnUnlock?.click();
    for (let skin = 0; skin < 10; skin++) {
        list.children[skin].click();
        assert.equal(run('selectedCosmeticSkin'), skin, 'hero selection failed on ' + skin);
        assert.equal(list.children[skin].getAttribute('aria-pressed'), 'true');
    }
    list.children[0].click();
    const classic = document.querySelectorAll('.arena-btn').find(btn => btn.dataset.arena === 'classic');
    classic?.click();
    if (classic) assert.equal(run('selectedArenaKey'), 'classic');

    byId('btnStartMatch').click();
    tick();
    assert.equal(run('gameState'), 'PLAYING', 'match did not start');
    assert.equal(run('player.cosmeticSkin'), 0);
    assert.ok(lobby.classList.contains('hidden'));
    assert.ok(!byId('hudLayer').classList.contains('hidden'));
    assert.ok(run('entities.length') >= 2);
    assert.ok(run('dragons.length') >= 1, 'boss entities missing from the main arena');

    // Isolate controls from random wall spawns and hostile opponents.
    run('walls = []; entities = [player]; dragons = []; pickups = []; projectiles = [];');
    const startX = run('player.x');
    key('keydown', startX < 1600 ? 'KeyD' : 'KeyA');
    tick(25);
    key('keyup', startX < 1600 ? 'KeyD' : 'KeyA');
    tick(2);
    assert.ok(Math.abs(run('player.x') - startX) > 60, 'keyboard did not move player');
    assert.ok(Number.isFinite(run('player.y')));

    // Aim straight down. The second click cannot create a left-pointing shot.
    const aimDown = () => ({
        clientX: run('player.x - camera.x + width/2'),
        clientY: run('player.y - camera.y + height/2 + 155')
    });
    canvas.trigger('mousemove',aimDown());
    canvas.trigger('mousedown',aimDown());
    tick(22);
    const preRelease = run('projectiles.length');
    window.trigger('mouseup',aimDown());
    tick(10);
    assert.ok(run('projectiles.some(p => p.owner === player && p.vy > 100 && Math.abs(p.vx) < p.vy*0.45)'),
        'no player projectile along requested direction after mouse press/release');
    if (!base) assert.equal(preRelease, 0, 'holding the bow fired before release');

    const pause = byId('btnPause');
    const resume = byId('btnResume');
    if (pause && resume) {
        pause.click();
        const position = run('JSON.stringify([player.x,player.y])');
        key('keydown', 'KeyD');
        tick(18);
        key('keyup', 'KeyD');
        assert.equal(run('JSON.stringify([player.x,player.y])'), position, 'player moved while paused');
        resume.click();
        tick();
        assert.equal(run('gameState'), 'PLAYING', 'resume did not resume the match');
    }

    // Real pickup update gives a card; key 1 chooses exactly one skill.
    run("pickups = [{type:'exp', value:player.nextExp + 1, x:player.x, y:player.y, radius:8, bob:0}];");
    tick(1);
    assert.equal(run('player.level'), 2);
    assert.ok(run('pendingSkillPicks') >= 1);
    const count = run('Object.keys(player.skillStacks).length');
    key('keydown', 'Digit1', '1');
    key('keyup', 'Digit1', '1');
    assert.equal(run('pendingSkillPicks'), 0);
    assert.ok(run('Object.keys(player.skillStacks).length') >= count + 1);

    run('player.spawnShield = 0; player.takeDamage(player.maxHpBlocks * 2, null, false);');
    assert.equal(run('gameState'), 'GAMEOVER');
    assert.ok(!byId('gameOverScreen').classList.contains('hidden'));
    tick(2);
    if (base) assert.equal(frameQueue.size, 0, 'old match loop remained live');
    byId('btnPlayAgain').click();
    tick();
    assert.equal(run('gameState'), 'PLAYING');
    assert.equal(run('player.level'), 1);
    assert.equal(run('player.hpBlocks'), run('player.maxHpBlocks'));
    assert.equal(frameQueue.size, 1);

    // Both touch joysticks work independently during live simulation.
    run('walls = []; entities = [player]; dragons = []; pickups = []; projectiles = [];');
    const beforeTouch = run('player.x');
    const dx = beforeTouch < 1600 ? 55 : -55;
    const touch = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
    canvas.trigger('touchstart', { changedTouches: [touch(1, 140, 390), touch(2, 1020, 390)] });
    canvas.trigger('touchmove', { changedTouches: [touch(1, 140 + dx, 390), touch(2, 1020, 440)] });
    tick(22);
    canvas.trigger('touchend', { changedTouches: [touch(2, 1020, 440)] });
    tick(8);
    assert.ok(Math.abs(run('player.x') - beforeTouch) > 45, 'left touch joystick did not move player');
    assert.ok(run('projectiles.some(p => p.owner === player && p.vy > 100 && Math.abs(p.vx) < p.vy*.5)'),
        'right stick release while left joystick was held did not preserve downward aim');
    canvas.trigger('touchend', { changedTouches: [touch(1, 140 + dx, 390)] });
    tick();
    assert.equal(run('input.leftId'), null);
    assert.equal(run('input.rightId'), null);

    if (base) {
        run('player.spawnShield = 0; player.takeDamage(player.maxHpBlocks * 2, null, false);');
        tick(2);
    } else {
        run('matchRemaining = .015');
        tick(2);
        assert.equal(run('gameState'), 'GAMEOVER', 'match clock expired without ending the round');
    }
    byId('btnBackHome').click();
    assert.equal(run('gameState'), 'HOME');
    assert.ok(!lobby.classList.contains('hidden'));
    assert.ok(stats.drawCalls > 100);
    if (!base) {
        const training = byId('btnTraining');
        const exit = byId('btnExitMatch');
        assert.ok(training && exit && pause && resume, 'practice/pause controls missing');
        const atlasTexture = run('typeof PLAYABLE_ATLAS === "object" && PLAYABLE_ATLAS.texture');
        assert.ok(atlasTexture && stats.textures.get(atlasTexture) > 0, 'embedded new actor atlas was never drawn');
        for (let skin = 0; skin < 10; skin++) {
            list.children[skin].click();
            training.click();
            tick(3);
            assert.equal(run('gameState'), 'PLAYING', 'training did not start');
            assert.equal(run('player.cosmeticSkin'), skin, 'training launched the wrong character');
            assert.equal(run('dragons.length'), 0, 'training spawned arena dragons');
            assert.equal(run('entities.filter(e => e.alive && e.practiceTarget).length'), 8, 'training cardinal/diagonal targets');
            const actor = run('playableActor(player)');
            assert.equal(byId('hudBow').textContent, actor.weapon, 'HUD does not show selected class weapon');
            const target = run(skin===0 ? 'entities[3]' : 'entities[1]');
            target.hpBlocks = 0.4;
            const shootAt = () => run(`({clientX: ${target.x} - camera.x + width/2, clientY: ${target.y} - camera.y + height/2})`);
            canvas.trigger('mousemove',shootAt());
            canvas.trigger('mousedown',shootAt());
            const isBow = actor.key.startsWith('bow_');
            for (let frame = 0; frame < (isBow ? 46 : 23); frame++) {
                canvas.trigger('mousemove',shootAt());
                tick();
            }
            window.trigger('mouseup',shootAt());
            tick(isBow ? 22 : 23);
            assert.ok(run('player.kills') >= 1, actor.name + ' attack failed to hit the selected training target');
            assert.ok(!target.alive, actor.name + ' training target did not die');
            tick(51);
            assert.ok(target.alive && target.hpBlocks === target.maxHpBlocks, 'training target did not respawn');
            if (skin === 0) {
                const zoom = byId('btnZoom');
                const slow = byId('btnSlow');
                assert.ok(zoom && slow, 'training inspect controls missing');
                const zoomState = zoom.getAttribute('aria-pressed');
                zoom.click();
                assert.notEqual(zoom.getAttribute('aria-pressed'), zoomState, 'zoom button did not toggle');
                slow.click();
                assert.equal(slow.getAttribute('aria-pressed'), 'true', 'slow view did not activate');
                const x = run('player.x');
                key('keydown', 'KeyD');
                tick(12);
                key('keyup', 'KeyD');
                const traveled = run('player.x') - x;
                assert.ok(traveled > 3 && traveled < 36, 'slow view did not slow gameplay motion');
                tick(2);
                zoom.click();
                slow.click();
                assert.equal(slow.getAttribute('aria-pressed'), 'false');
            }
            if (skin === 9) {
                const previousPlayer = run('player');
                pause.click();
                byId('btnRestartMatch').click();
                tick(2);
                assert.equal(run('gameState'), 'PLAYING');
                assert.equal(run('playMode'), 'training');
                assert.notEqual(run('player'), previousPlayer);
            }
            pause.click();
            exit.click();
            tick(2);
            assert.equal(run('gameState'), 'HOME', 'exit did not return to lobby');
        }
        console.log('PASS named sprite atlas, bow release-only shot, pause, timer result and all 10 class weapons hitting in training.');
    }
    console.log('PASS ten hero selections, map, controls, down-shot, touch, XP/skill choice, death, replay, lobby.');
    console.log('Canvas draw calls:', stats.drawCalls, ', large embedded texture draw calls:', stats.atlasDrawCalls);
}

function runDirectionalQA(game) {
    const { run, tick, window, document, stats } = game;
    const byId = id => document.getElementById(id);
    const canvas = byId('gameCanvas');
    const training = byId('btnTraining');
    const aimControl = byId('trainingAim');
    const key = (event, code) => window.trigger(event, { code, key: code });
    const headings = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    assert.ok(aimControl, 'missing directional practice control');
    const actors = run('PLAYABLE_ATLAS.actors');
    assert.equal(actors.length, 10);
    stats.captureTexture = run('PLAYABLE_ATLAS.texture');
    const signatures = new Set();
    for (const actor of actors) {
        assert.deepEqual(Object.keys(actor.walk).sort(), [...headings].sort(), actor.name + ' missing walk heading');
        assert.deepEqual(Object.keys(actor.attacks).sort(), [...headings].sort(), actor.name + ' missing attack heading');
        for (const heading of headings) {
            const sequence = actor.attacks[heading];
            const box = sequence.frames[sequence.strike];
            const id = [box.x, box.y, box.w, box.h].join(',');
            assert.ok(!signatures.has(id), `duplicate strike rect ${actor.name}/${heading}`);
            signatures.add(id);
            for (const [index, variants] of sequence.moving.entries()) {
                assert.ok(variants.length > 1, `single movement variant ${actor.name}/${heading}/${index}`);
                assert.ok(variants.every(frame => (
                    Number.isFinite(frame.root[0]) && Number.isFinite(frame.root[1]) && frame.w > 0 && frame.h > 0
                )), `invalid root/crop ${actor.name}/${heading}/${index}`);
            }
        }
    }
    run(`
        const originalQASpawn = VoxelFighter.prototype.spawnShot;
        let qaShots = [];
        VoxelFighter.prototype.spawnShot = function (x, y, angle, options) {
            if (this.isPlayer) {
                const origin = playableWeaponOrigin(this, this.action.group, this.action.angle);
                const frame = attackLook(this, playableActor(this), true).frame;
                qaShots.push({ x, y, angle, origin, frame });
            }
            return originalQASpawn.call(this, x, y, angle, options);
        };
    `);
    const bootsSeenByAttack = new Map();
    for (const [index, actor] of actors.entries()) {
        byId('heroGrid').children[index].click();
        for (const [direction, heading] of headings.entries()) {
            training.click();
            aimControl.value = heading;
            aimControl.trigger('change');
            stats.captureFrames = new Set();
            tick(1);
            const bow = actor.key.startsWith('bow_');
            const move = ['KeyS','KeyS','KeyA','KeyW','KeyW','KeyW','KeyD','KeyS'][direction];
            const caseName = `${actor.name}/${heading}`;
            key('keydown', move);
            canvas.trigger('mousedown', { clientX: 585, clientY: 400 });
            run('qaShots = [];');
            const sy = run('player.y');
            const sx = run('player.x');
            let fired = false;
            let observed = 0;
            let foundLabel = false;
            let movementAdvanced = false;
            const phases = new Map();
            const capture = () => {
                const view = run(`(() => {
                    if (!player.action) return null;
                    const actor = playableActor(player);
                    const pose = attackLook(player, actor);
                    const rect = ({ x, y, w, h }) => [x, y, w, h].join(',');
                    return { key: pose.key, index: pose.index, fired: player.action.fired,
                        moving: motionState(player).moving,
                        inMoving: pose.seq.moving[pose.index].includes(pose.frame),
                        rect: rect(pose.frame), releaseAnchor: pose.frame.nock,
                        sequence: pose.seq.strike };
                })()`);
                if (!view) return;
                observed++;
                fired = fired || view.fired;
                assert.equal(view.key, heading, caseName + ' wrong selected sector');
                assert.ok(view.moving && view.inMoving, caseName + ' stand pose used while moving');
                assert.ok(stats.captureFrames.has(view.rect), caseName + ' composite movement rectangle not rendered');
                const set = phases.get(view.index) || new Set();
                set.add(view.rect);
                phases.set(view.index, set);
                if (actor.id === 'hoa-linh' && heading === 'N' && view.index === view.sequence - 1) {
                    assert.ok(view.releaseAnchor, 'Hoa north withheld nock');
                    movementAdvanced = true;
                }
                if (byId('inspectPose').textContent.includes('Đang chạy')) foundLabel = true;
            };
            for (let i = 0; i < (bow ? 51 : 30); i++) {
                tick(1);
                capture();
                if (!bow && fired) break;
            }
            if (bow) assert.equal(run('qaShots.length'), 0, caseName + ' launched before release');
            window.trigger('mouseup');
            for (let i = 0; i < 12 && !fired; i++) { tick(1); capture(); }
            assert.ok(fired && observed > 3, caseName + ' action did not reach moving release');
            assert.ok(foundLabel, caseName + ' inspector did not report movement');
            assert.ok(Math.hypot(run('player.y') - sy, run('player.x') - sx) > 8, caseName + ' player stayed still');
            if (actor.id === 'hoa-linh' && heading === 'N') assert.ok(movementAdvanced, 'Hoa north full-draw nock not reached');
            if (bow || ['repeater','shuriken','staff'].includes(actor.key)) {
                const shot = run('qaShots[0]');
                assert.ok(shot, caseName + ' missing projectile');
                assert.ok(Math.hypot(shot.x - shot.origin.x, shot.y - shot.origin.y) < .001, caseName + ' projectile misses muzzle');
                const expected = direction * Math.PI / 4;
                assert.ok(Math.cos(shot.angle - expected) > .93, caseName + ' inconsistent projectile direction');
                if (actor.id === 'hoa-linh' && heading === 'N') {
                    assert.ok(shot.frame.hand && shot.frame.nock && shot.frame.grip, 'Hoa north missing release anchors');
                    assert.ok(shot.frame.hand[1] < shot.frame.grip[1], 'Hoa north muzzle is not in front of her bow');
                    assert.ok(shot.frame.grip[1] < shot.frame.nock[1], 'Hoa north nock is not drawn toward chin');
                }
            } else {
                assert.ok(run(`weaponBursts.some(p => p.key === ${JSON.stringify(actor.key)} && p.kind === 'melee')`),
                    caseName + ' missing class effect');
            }
            bootsSeenByAttack.set(caseName, [...phases.values()].some(set => set.size >= 2));
            key('keyup', move);
            byId('btnPause').click();
            byId('btnExitMatch').click();
        }
    }
    const samePhaseVariants = [...bootsSeenByAttack.values()].filter(Boolean).length;
    assert.ok(samePhaseVariants >= 65, `too little same-phase moving frame variation: ${samePhaseVariants}/80`);
    console.log(`PASS all ${signatures.size} real moving attacks and source-frame draws. ${samePhaseVariants}/80 attack plays changed gait frame within the same attack phase.`);
    console.log('PASS Hoa Linh north draw nock, grip, and muzzle. All ranged launches use their active moving muzzle and free aim.');
}

const args = process.argv.slice(2);
const source = args.find(arg => !arg.startsWith('--'))
    ?? path.resolve('outputs/ArrowIO_DienSao_360.html');
seleniumStub(fs.readFileSync(source, 'utf8')).then(game => {
    runTests(game, { checkOnly: args.includes('--load-only'), base: args.includes('--base') });
    if (!args.includes('--load-only') && !args.includes('--base')) runDirectionalQA(game);
}).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

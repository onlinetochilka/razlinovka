/**
 * Генератор разлиновки — app.js
 * Этап 2: SVG-сетка через <path d="...">, логика цвета/полей/толщины
 */

/* ═══════════════════════════════════════════════════════════════════════
   UTM
   ═══════════════════════════════════════════════════════════════════════ */

function captureUtmParams() {
    const KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','utm_referrer'];
    const p = new URLSearchParams(window.location.search);
    let hit = false;
    KEYS.forEach(k => { const v = p.get(k); if (v) { sessionStorage.setItem(k, v); hit = true; } });
    if (hit) {
        sessionStorage.setItem('utm_captured_at', new Date().toISOString());
        sessionStorage.setItem('utm_landing_url', window.location.href);
    }
}

function getStoredUtm() {
    return ['utm_source','utm_medium','utm_campaign','utm_content','utm_term']
        .reduce((a, k) => { const v = sessionStorage.getItem(k); if (v) a[k] = v; return a; }, {});
}

/* ═══════════════════════════════════════════════════════════════════════
   СОСТОЯНИЕ
   ═══════════════════════════════════════════════════════════════════════ */

const state = {
    paperW:      210,
    paperH:      297,
    orientation: 'portrait',
    gridType:    'square',
    gridStep:    8,
    lineThick:   0.3,
    lineColor:   '#94a3b8',
    margins:     { top: 15, bottom: 15, left: 20, right: 10 },
};

/* ═══════════════════════════════════════════════════════════════════════
   КЭШ DOM
   ═══════════════════════════════════════════════════════════════════════ */

const refs = {
    paperSizeGroup: null, orientationGroup: null, gridTypeGroup: null,
    gridStep: null, gridStepNum: null, stepBadge: null, stepSection: null,
    lineThick: null, lineThickNum: null, thickBadge: null,
    colorRow: null, customColor: null, colorBadge: null,
    marginTop: null, marginBottom: null, marginLeft: null, marginRight: null,
    btnSave: null, btnPrint: null,
    previewSvg: null, bgRect: null,
};

function cacheRefs() {
    refs.paperSizeGroup   = document.getElementById('paperSizeGroup');
    refs.orientationGroup = document.getElementById('orientationGroup');
    refs.gridTypeGroup    = document.getElementById('gridTypeGroup');
    refs.gridStep         = document.getElementById('gridStep');
    refs.gridStepNum      = document.getElementById('gridStepNum');
    refs.stepBadge        = document.getElementById('stepBadge');
    refs.stepSection      = document.getElementById('stepSection');
    refs.lineThick        = document.getElementById('lineThick');
    refs.lineThickNum     = document.getElementById('lineThickNum');
    refs.thickBadge       = document.getElementById('thickBadge');
    refs.colorRow         = document.querySelector('[data-action="line-color"]');
    refs.customColor      = document.getElementById('customColor');
    refs.colorBadge       = document.getElementById('colorBadge');
    refs.marginTop        = document.getElementById('marginTop');
    refs.marginBottom     = document.getElementById('marginBottom');
    refs.marginLeft       = document.getElementById('marginLeft');
    refs.marginRight      = document.getElementById('marginRight');
    refs.btnSave          = document.getElementById('btnSave');
    refs.btnPrint         = document.getElementById('btnPrint');
    refs.previewSvg       = document.getElementById('previewSvg');
    refs.bgRect           = document.getElementById('bgRect');
}

/* ═══════════════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════════════ */

function triggerInputError(input) {
    input.classList.remove('error');
    void input.offsetWidth;         // перезапуск анимации
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 700);
}

function clamp(val, mn, mx) { return Math.min(mx, Math.max(mn, val)); }

/** Форматирует число без лишних нулей: 8 → "8", 0.3 → "0.3", 0.05 → "0.05" */
function fmtNum(n) { return String(parseFloat(n.toFixed(4))); }

/** Округляет координату SVG до 3 знаков (избегает float-мусора в path d) */
function r(n) { return Math.round(n * 1000) / 1000; }

/* ═══════════════════════════════════════════════════════════════════════
   RAF-БУФЕР: батч всех перерисовок в один кадр
   ═══════════════════════════════════════════════════════════════════════ */

let _rafId = null;
function scheduleRedraw() {
    if (_rafId !== null) return;
    _rafId = requestAnimationFrame(() => { _rafId = null; renderPreview(); });
}

/* ═══════════════════════════════════════════════════════════════════════
   СЕГМЕНТИРОВАННЫЕ ПЕРЕКЛЮЧАТЕЛИ
   ═══════════════════════════════════════════════════════════════════════ */

function initSegGroup(group, onChange) {
    if (!group) return;

    group.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn');
        if (!btn || btn.disabled) return;
        group.querySelectorAll('.seg-btn').forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
        onChange(btn.dataset.value, btn);
    });

    group.addEventListener('keydown', e => {
        const btns = [...group.querySelectorAll('.seg-btn:not(:disabled)')];
        const idx  = btns.indexOf(document.activeElement);
        if (idx === -1) return;
        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % btns.length;
        if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   next = (idx - 1 + btns.length) % btns.length;
        if (next !== -1) { e.preventDefault(); btns[next].focus(); btns[next].click(); }
    });
}

/* ─── Формат бумаги ──────────────────────────────────────────────────── */
function initPaperSize() {
    initSegGroup(refs.paperSizeGroup, (value, btn) => {
        state.paperW = parseFloat(btn.dataset.w);
        state.paperH = parseFloat(btn.dataset.h);
        scheduleRedraw();
        track('paper_size_changed', { value });
    });
}

/* ─── Ориентация ─────────────────────────────────────────────────────── */
function initOrientation() {
    initSegGroup(refs.orientationGroup, value => {
        state.orientation = value;
        scheduleRedraw();
        track('orientation_changed', { value });
    });
}

/* ─── Тип сетки ──────────────────────────────────────────────────────── */
function initGridType() {
    // Типы с фиксированным шагом (слайдер отключается)
    const FIXED = ['millimeter', 'slanted', 'frequent'];
    // Шаг по умолчанию при переключении на тип
    const STEP_DEFAULTS = { square: 8, wide: 8, narrow: 5, dots: 5, isometric: 6 };

    initSegGroup(refs.gridTypeGroup, value => {
        state.gridType = value;

        const isFixed = FIXED.includes(value);
        refs.stepSection.classList.toggle('is-disabled', isFixed);

        if (isFixed) {
            refs.stepBadge.textContent =
                value === 'millimeter' ? '1 / 5 / 10 мм' : '4 / 8 мм';
        } else {
            const def = STEP_DEFAULTS[value] ?? state.gridStep;
            updateRangeCombo(refs.gridStep, refs.gridStepNum, refs.stepBadge, def, 2, 20, 'мм');
            state.gridStep = def;
        }

        scheduleRedraw();
        track('grid_type_changed', { value });
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   RANGE + NUMBER COMBO
   ═══════════════════════════════════════════════════════════════════════ */

function initRangeCombo({ range, number, badge, unit, min, max, step, stateKey }) {
    const fmt = v => `${fmtNum(v)} ${unit}`;

    range.addEventListener('input', () => {
        const val = parseFloat(range.value);
        number.value = fmtNum(val);
        badge.textContent = fmt(val);
        state[stateKey] = val;
        scheduleRedraw();
    });

    number.addEventListener('input', () => {
        const raw = parseFloat(number.value);
        if (isNaN(raw)) return;
        if (raw < min || raw > max) { triggerInputError(number); return; }
        const snapped = Math.round(raw / step) * step;
        range.value = snapped;
        badge.textContent = fmt(snapped);
        state[stateKey] = snapped;
        scheduleRedraw();
    });

    number.addEventListener('blur', () => {
        let raw = parseFloat(number.value);
        if (isNaN(raw)) raw = state[stateKey];
        if (raw < min || raw > max) {
            triggerInputError(number);
            raw = clamp(raw, min, max);
        }
        const snapped = Math.round(raw / step) * step;
        updateRangeCombo(range, number, badge, snapped, min, max, unit);
        state[stateKey] = snapped;
        scheduleRedraw();
    });
}

function updateRangeCombo(range, number, badge, val, min, max, unit) {
    const v = clamp(val, min, max);
    range.value  = v;
    number.value = fmtNum(v);
    badge.textContent = `${fmtNum(v)} ${unit}`;
}

function initRangeCombos() {
    initRangeCombo({
        range: refs.gridStep, number: refs.gridStepNum, badge: refs.stepBadge,
        unit: 'мм', min: 2, max: 20, step: 0.5, stateKey: 'gridStep',
    });
    initRangeCombo({
        range: refs.lineThick, number: refs.lineThickNum, badge: refs.thickBadge,
        unit: 'мм', min: 0.1, max: 1.0, step: 0.05, stateKey: 'lineThick',
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   ЦВЕТ ЛИНИЙ — гибридный: пресеты + кастом
   ═══════════════════════════════════════════════════════════════════════ */

function applyColor(hex, activeEl) {
    state.lineColor = hex;
    refs.colorBadge.textContent = hex;

    // Снять active со всех образцов
    refs.colorRow.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.remove('active');
        s.setAttribute('aria-pressed', 'false');
    });

    // Снять active с кастомной кнопки и сбросить её фон
    const pickerWrap = refs.customColor.parentElement;
    pickerWrap.classList.remove('active');

    if (activeEl && activeEl.classList.contains('color-swatch')) {
        activeEl.classList.add('active');
        activeEl.setAttribute('aria-pressed', 'true');
        pickerWrap.style.background = '';   // вернуть CSS-переменную
    } else if (activeEl === pickerWrap) {
        pickerWrap.classList.add('active');
        pickerWrap.style.background = hex; // показать выбранный цвет
    }

    scheduleRedraw();
    track('color_changed', { hex });
}

function initColorPicker() {
    refs.colorRow.querySelectorAll('.color-swatch').forEach(btn => {
        btn.addEventListener('click', () => applyColor(btn.dataset.color, btn));
    });

    const pickerWrap = refs.customColor.parentElement;

    refs.customColor.addEventListener('input', e => {
        pickerWrap.style.background = e.target.value;
        applyColor(e.target.value, pickerWrap);
    });
    refs.customColor.addEventListener('change', e => {
        applyColor(e.target.value, pickerWrap);
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   ПОЛЯ — с динамическими лимитами (защита от дурака)
   ═══════════════════════════════════════════════════════════════════════ */

const MIN_GRID_AREA = 20; // мм — минимальная рабочая зона

function getMarginMax(key) {
    const { w, h } = getSheetDimensions();
    const { top, bottom, left, right } = state.margins;
    switch (key) {
        case 'top':    return Math.max(0, h - bottom - MIN_GRID_AREA);
        case 'bottom': return Math.max(0, h - top    - MIN_GRID_AREA);
        case 'left':   return Math.max(0, w - right  - MIN_GRID_AREA);
        case 'right':  return Math.max(0, w - left   - MIN_GRID_AREA);
        default:       return 100;
    }
}

function initMarginInputs() {
    const FIELDS = [
        { el: refs.marginTop,    key: 'top'    },
        { el: refs.marginBottom, key: 'bottom' },
        { el: refs.marginLeft,   key: 'left'   },
        { el: refs.marginRight,  key: 'right'  },
    ];

    FIELDS.forEach(({ el, key }) => {
        el.addEventListener('input', () => {
            const raw = parseFloat(el.value);
            if (!isNaN(raw) && raw >= 0 && raw <= getMarginMax(key)) {
                state.margins[key] = raw;
                scheduleRedraw();
            }
        });

        el.addEventListener('blur', () => {
            let raw = parseFloat(el.value);
            if (isNaN(raw)) raw = state.margins[key];
            const max = getMarginMax(key);
            if (raw < 0 || raw > max) {
                triggerInputError(el);
                raw = clamp(raw, 0, max);
                el.value = raw;
                state.margins[key] = raw;
                scheduleRedraw();
            }
        });
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   РАЗМЕРЫ ЛИСТА
   ═══════════════════════════════════════════════════════════════════════ */

function getSheetDimensions() {
    const { paperW: W, paperH: H, orientation } = state;
    return orientation === 'landscape' ? { w: H, h: W } : { w: W, h: H };
}

/* ═══════════════════════════════════════════════════════════════════════
   ГЕНЕРАТОРЫ SVG PATH
   Всё в миллиметрах. Один <path d="..."> на слой, без тысяч тегов.
   ═══════════════════════════════════════════════════════════════════════ */

/** Горизонтальные линии с равным шагом внутри прямоугольника */
function hLines(x0, y0, x1, y1, step) {
    let d = '';
    const n = Math.floor((y1 - y0) / step);
    for (let i = 0; i <= n; i++) {
        const y = r(y0 + i * step);
        d += `M ${r(x0)} ${y} H ${r(x1)} `;
    }
    return d;
}

/** Вертикальные линии с равным шагом внутри прямоугольника */
function vLines(x0, y0, x1, y1, step) {
    let d = '';
    const n = Math.floor((x1 - x0) / step);
    for (let i = 0; i <= n; i++) {
        const x = r(x0 + i * step);
        d += `M ${x} ${r(y0)} V ${r(y1)} `;
    }
    return d;
}

/* ─── Клетка ─────────────────────────────────────────────────────────── */
function buildSquareGrid(x0, y0, x1, y1, step) {
    return [{ d: hLines(x0, y0, x1, y1, step) + vLines(x0, y0, x1, y1, step) }];
}

/* ─── Миллиметровка (ГОСТ): 3 path наложенных друг на друга ─────────── */
function buildMillimeterGrid(x0, y0, x1, y1) {
    const grid = s => hLines(x0, y0, x1, y1, s) + vLines(x0, y0, x1, y1, s);
    return [
        { d: grid(1),  opacity: 0.35 },
        { d: grid(5),  opacity: 0.65 },
        { d: grid(10), opacity: 1.0  },
    ];
}

/* ─── Широкая / Узкая линейка — только горизонтальные ───────────────── */
function buildRuledLines(x0, y0, x1, y1, step) {
    return [{ d: hLines(x0, y0, x1, y1, step) }];
}

/* ─── Точечная сетка: dasharray-трюк (0 DOM-элементов лишних) ──────── */
function buildDotGrid(x0, y0, x1, y1, step) {
    return [{
        d:        hLines(x0, y0, x1, y1, step),
        dasharray: `0 ${step}`,
        linecap:   'round',
    }];
}

/* ─── Изометрия (равносторонние треугольники) ────────────────────────── */
function buildIsometricGrid(x0, y0, x1, y1, step) {
    const tan60  = Math.tan(Math.PI / 3); // √3 ≈ 1.732
    const sin60  = Math.sin(Math.PI / 3); // √3/2 ≈ 0.866
    const vStep  = step * sin60;           // вертикальный шаг горизонтальных линий
    const h      = y1 - y0;
    const w      = x1 - x0;
    const dxH    = h / tan60;             // горизонтальное смещение на полную высоту

    let d = hLines(x0, y0, x1, y1, vStep);

    // Линии 60° (сверху-слева → снизу-справа в экранных координатах)
    const nLeft = Math.ceil(dxH / step) + 1;
    for (let i = -nLeft; i <= Math.ceil(w / step) + 1; i++) {
        const tx = x0 + i * step;
        d += `M ${r(tx)} ${r(y0)} L ${r(tx + dxH)} ${r(y1)} `;
    }

    // Линии 120° (сверху-справа → снизу-слева)
    for (let i = 0; i <= Math.ceil((w + dxH) / step) + 1; i++) {
        const tx = x0 + i * step;
        d += `M ${r(tx)} ${r(y0)} L ${r(tx - dxH)} ${r(y1)} `;
    }

    return [{ d }];
}

/* ─── Школьная косая / Частая косая ─────────────────────────────────── */
//  Угол 65° от горизонтали. offsetX = height / tan(65°)
//  Горизонтальный шаг диагоналей: diagPitch мм.
function buildSlantedGrid(x0, y0, x1, y1, diagPitch) {
    const ANGLE    = 65 * Math.PI / 180;
    const tanA     = Math.tan(ANGLE);    // ≈ 2.145
    const ROW_H    = 4;                  // мм: высота рабочей строки
    const h = y1 - y0;
    const w = x1 - x0;

    // Горизонтальные линии каждые 4 мм (рабочая строка + разделитель)
    let d = hLines(x0, y0, x1, y1, ROW_H);

    // Диагонали: линия идёт от (bx, y1) к (bx + offsetX, y0) — снизу-слева вверх-вправо
    const offsetX  = h / tanA;
    const startBx  = x0 - (Math.ceil(offsetX / diagPitch) + 1) * diagPitch;
    const endBx    = x1 + diagPitch;

    for (let bx = startBx; bx <= endBx; bx += diagPitch) {
        d += `M ${r(bx)} ${r(y1)} L ${r(bx + offsetX)} ${r(y0)} `;
    }

    return [{ d }];
}

/* ─── Маршрутизатор ──────────────────────────────────────────────────── */
function buildGridPaths(type, x0, y0, x1, y1, step) {
    switch (type) {
        case 'square':     return buildSquareGrid(x0, y0, x1, y1, step);
        case 'millimeter': return buildMillimeterGrid(x0, y0, x1, y1);
        case 'wide':       return buildRuledLines(x0, y0, x1, y1, step);
        case 'narrow':     return buildRuledLines(x0, y0, x1, y1, step);
        case 'dots':       return buildDotGrid(x0, y0, x1, y1, step);
        case 'isometric':  return buildIsometricGrid(x0, y0, x1, y1, step);
        case 'slanted':    return buildSlantedGrid(x0, y0, x1, y1, 25);
        case 'frequent':   return buildSlantedGrid(x0, y0, x1, y1, 5);
        default:           return buildSquareGrid(x0, y0, x1, y1, step);
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   РЕНДЕРИНГ SVG
   ═══════════════════════════════════════════════════════════════════════ */

const SVG_NS  = 'http://www.w3.org/2000/svg';
const CLIP_ID = 'gridClip';

function ensureClipPath(svg) {
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS(SVG_NS, 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    if (!defs.querySelector(`#${CLIP_ID}`)) {
        const cp   = document.createElementNS(SVG_NS, 'clipPath');
        cp.setAttribute('id', CLIP_ID);
        const rect = document.createElementNS(SVG_NS, 'rect');
        cp.appendChild(rect);
        defs.appendChild(cp);
    }
    return defs.querySelector(`#${CLIP_ID} rect`);
}

function renderPreview() {
    const { w, h } = getSheetDimensions();
    const { top: mT, bottom: mB, left: mL, right: mR } = state.margins;

    // Обновить viewBox и фоновый прямоугольник
    refs.previewSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    refs.previewSvg.setAttribute('aria-label',
        `Предпросмотр: ${state.orientation === 'landscape' ? 'альбомный' : 'книжный'}, ${state.gridType}`);
    refs.bgRect.setAttribute('width',  w);
    refs.bgRect.setAttribute('height', h);

    // Координаты рабочей области
    const x0 = mL,       y0 = mT;
    const x1 = w - mR,   y1 = h - mB;

    // Удалить старые слои сетки
    refs.previewSvg.querySelectorAll('.grid-layer').forEach(el => el.remove());

    // Защита: рабочая область слишком мала
    if (x1 - x0 < 5 || y1 - y0 < 5) return;

    // Обновить clipPath
    const clipRect = ensureClipPath(refs.previewSvg);
    clipRect.setAttribute('x',      x0);
    clipRect.setAttribute('y',      y0);
    clipRect.setAttribute('width',  x1 - x0);
    clipRect.setAttribute('height', y1 - y0);

    // Генерировать пути и вставить в SVG
    buildGridPaths(state.gridType, x0, y0, x1, y1, state.gridStep)
        .forEach(({ d, opacity, strokeWidth, dasharray, linecap }) => {
            if (!d || !d.trim()) return;

            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('class',        'grid-layer');
            path.setAttribute('d',            d);
            path.setAttribute('stroke',       state.lineColor);
            path.setAttribute('stroke-width', strokeWidth !== undefined ? strokeWidth : state.lineThick);
            path.setAttribute('fill',         'none');
            path.setAttribute('clip-path',    `url(#${CLIP_ID})`);

            if (opacity  !== undefined) path.setAttribute('opacity',           opacity);
            if (dasharray)              path.setAttribute('stroke-dasharray',  dasharray);
            if (linecap)                path.setAttribute('stroke-linecap',    linecap);

            refs.previewSvg.appendChild(path);
        });
}

/* ═══════════════════════════════════════════════════════════════════════
   КНОПКИ ДЕЙСТВИЙ
   ═══════════════════════════════════════════════════════════════════════ */

function initActionButtons() {
    refs.btnPrint.addEventListener('click', () => {
        track('print_sheet_clicked', { ...getSheetDimensions(), gridType: state.gridType });
        setTimeout(() => window.print(), 50);
    });

    refs.btnSave.addEventListener('click', () => {
        track('save_template_clicked', { ...getSheetDimensions(), gridType: state.gridType });
        refs.btnSave.classList.add('is-success');
        setTimeout(() => refs.btnSave.classList.remove('is-success'), 1500);
    });

    [refs.btnSave, refs.btnPrint].forEach(btn => {
        btn.addEventListener('pointerdown', () => btn.classList.add('active-press'));
        btn.addEventListener('pointerup',   () => btn.classList.remove('active-press'));
        btn.addEventListener('pointerout',  () => btn.classList.remove('active-press'));
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   АНАЛИТИКА
   ═══════════════════════════════════════════════════════════════════════ */

function track(action, params = {}) {
    const payload = { action, ...params, ...getStoredUtm(), ts: Date.now() };
    if (typeof ym === 'function') {
        try { ym('XXXXXXXX', 'reachGoal', action, payload); } catch (_) {}
    }
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
        console.log('[track]', action, payload);
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   ИНИЦИАЛИЗАЦИЯ
   ═══════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    captureUtmParams();
    cacheRefs();

    initPaperSize();
    initOrientation();
    initGridType();
    initRangeCombos();
    initColorPicker();
    initMarginInputs();
    initActionButtons();

    renderPreview();

    track('app_loaded', { referrer: document.referrer || 'direct' });
});

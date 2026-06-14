/**
 * Генератор разлиновки — app.js
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
    paperW:        210,
    paperH:        297,
    orientation:   'portrait',
    gridType:      'square',
    gridStep:      5,
    lineThick:     0.3,
    lineColor:     '#94a3b8',
    margins:       { top: 15, bottom: 15, left: 20, right: 10 },
    schoolMargins: true,
};

// Сохранённые поля для toggle-кнопки "0" (null = кнопка не активна)
let _resetSavedMargins = null;

/* ═══════════════════════════════════════════════════════════════════════
   КЭШ DOM
   ═══════════════════════════════════════════════════════════════════════ */

const refs = {
    paperSizeGroup: null, orientationGroup: null, gridTypeGroup: null,
    gridStepNum: null, stepBadge: null, stepSection: null,
    lineThickNum: null,
    colorRow: null, customColor: null, colorBadge: null,
    marginTop: null, marginBottom: null, marginLeft: null, marginRight: null,
    btnResetMargins: null,
    btnDownload: null, btnPrint: null,
    downloadMenu: null, btnPDF: null, btnPNG: null,
    schoolToggle: null, schoolToggleWrap: null,
    previewSvg: null, bgRect: null,
};

function cacheRefs() {
    refs.paperSizeGroup   = document.getElementById('paperSizeGroup');
    refs.orientationGroup = document.getElementById('orientationGroup');
    refs.gridTypeGroup    = document.getElementById('gridTypeGroup');
    refs.gridStepNum      = document.getElementById('gridStepNum');
    refs.stepBadge        = document.getElementById('stepBadge');
    refs.stepSection      = document.getElementById('stepSection');
    refs.lineThickNum     = document.getElementById('lineThickNum');
    refs.colorRow         = document.querySelector('[data-action="line-color"]');
    refs.customColor      = document.getElementById('customColor');
    refs.colorBadge       = document.getElementById('colorBadge');
    refs.marginTop        = document.getElementById('marginTop');
    refs.marginBottom     = document.getElementById('marginBottom');
    refs.marginLeft       = document.getElementById('marginLeft');
    refs.marginRight      = document.getElementById('marginRight');
    refs.btnResetMargins  = document.getElementById('btnResetMargins');
    refs.btnDownload      = document.getElementById('btnDownload');
    refs.btnPrint         = document.getElementById('btnPrint');
    refs.downloadMenu     = document.getElementById('downloadMenu');
    refs.btnPDF           = document.getElementById('btnPDF');
    refs.btnPNG           = document.getElementById('btnPNG');
    refs.schoolToggle     = document.getElementById('schoolToggle');
    refs.schoolToggleWrap = document.getElementById('schoolToggleWrap');
    refs.previewSvg       = document.getElementById('previewSvg');
    refs.bgRect           = document.getElementById('bgRect');
}

/* ═══════════════════════════════════════════════════════════════════════
   УТИЛИТЫ
   ═══════════════════════════════════════════════════════════════════════ */

function triggerInputError(input) {
    input.classList.remove('error');
    void input.offsetWidth;
    input.classList.add('error');
    setTimeout(() => input.classList.remove('error'), 700);
}

function clamp(val, mn, mx) { return Math.min(mx, Math.max(mn, val)); }

/** Форматирует число без лишних нулей: 8 → "8", 0.3 → "0.3" */
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

/* ─── Типы, для которых тумблер "Поля" активен ───────────────────────── */
const SCHOOL_MARGIN_TYPES = ['square', 'ruled', 'slanted', 'frequent'];

/* ─── Типы с фиксированным шагом ────────────────────────────────────── */
const FIXED_STEP_TYPES = ['millimeter', 'slanted', 'frequent', 'notes'];

/* ─── Шаги по умолчанию при переключении типа ────────────────────────── */
const STEP_DEFAULTS = { square: 5, ruled: 8, dots: 5, isometric: 6 };

/* ─── Тип сетки ──────────────────────────────────────────────────────── */
function initGridType() {
    initSegGroup(refs.gridTypeGroup, value => {
        state.gridType = value;

        const isFixed = FIXED_STEP_TYPES.includes(value);
        refs.stepSection.classList.toggle('is-disabled', isFixed);

        if (isFixed) {
            refs.stepBadge.textContent =
                value === 'millimeter' ? '1/5/10' :
                value === 'notes'      ? '2/12'   : '4/8';
        } else {
            const def = STEP_DEFAULTS[value] ?? state.gridStep;
            refs.gridStepNum.value = fmtNum(def);
            refs.stepBadge.textContent = '';
            state.gridStep = def;
        }

        // Видимость тумблера "Поля"
        refs.schoolToggleWrap.classList.toggle('is-hidden', !SCHOOL_MARGIN_TYPES.includes(value));

        scheduleRedraw();
        track('grid_type_changed', { value });
    });
}

/* ─── Тумблер "Школьные поля" ────────────────────────────────────────── */
function initSchoolMargins() {
    refs.schoolToggle.addEventListener('change', () => {
        state.schoolMargins = refs.schoolToggle.checked;
        scheduleRedraw();
        track('school_margins_toggled', { on: state.schoolMargins });
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   ЧИСЛОВЫЕ ИНПУТЫ (ползунки удалены)
   ═══════════════════════════════════════════════════════════════════════ */

function initNumberInput({ number, min, max, step, stateKey }) {
    number.addEventListener('input', () => {
        const raw = parseFloat(number.value);
        if (isNaN(raw)) return;
        if (raw < min || raw > max) { triggerInputError(number); return; }
        const snapped = Math.round(raw / step) * step;
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
        number.value = fmtNum(snapped);
        state[stateKey] = snapped;
        scheduleRedraw();
    });
}

function initRangeCombos() {
    initNumberInput({ number: refs.gridStepNum,  min: 2,   max: 20,  step: 0.5,  stateKey: 'gridStep'  });
    initNumberInput({ number: refs.lineThickNum, min: 0.1, max: 1.0, step: 0.05, stateKey: 'lineThick' });
}

/* ═══════════════════════════════════════════════════════════════════════
   ЦВЕТ ЛИНИЙ — гибридный: пресеты + кастом
   ═══════════════════════════════════════════════════════════════════════ */

function applyColor(hex, activeEl) {
    state.lineColor = hex;
    refs.colorBadge.textContent = hex;

    refs.colorRow.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.remove('active');
        s.setAttribute('aria-pressed', 'false');
    });

    const pickerWrap = refs.customColor.parentElement;
    pickerWrap.classList.remove('active');

    if (activeEl && activeEl.classList.contains('color-swatch')) {
        activeEl.classList.add('active');
        activeEl.setAttribute('aria-pressed', 'true');
        pickerWrap.style.background = '';
    } else if (activeEl === pickerWrap) {
        pickerWrap.classList.add('active');
        pickerWrap.style.background = hex;
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

const MIN_GRID_AREA = 20;

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
            // Если кнопка "0" активна — отжимаем её (пользователь меняет поле вручную)
            if (refs.btnResetMargins?.classList.contains('active')) {
                refs.btnResetMargins.classList.remove('active');
                _resetSavedMargins = null;
            }
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

function hLines(x0, y0, x1, y1, step) {
    let d = '';
    const n = Math.floor((y1 - y0) / step);
    for (let i = 0; i <= n; i++) {
        const y = r(y0 + i * step);
        d += `M ${r(x0)} ${y} H ${r(x1)} `;
    }
    return d;
}

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

/* ─── Миллиметровка (ГОСТ): 3 path с разной прозрачностью ───────────── */
function buildMillimeterGrid(x0, y0, x1, y1) {
    const grid = s => hLines(x0, y0, x1, y1, s) + vLines(x0, y0, x1, y1, s);
    return [
        { d: grid(1),  opacity: 0.35 },
        { d: grid(5),  opacity: 0.65 },
        { d: grid(10), opacity: 1.0  },
    ];
}

/* ─── Линейка — только горизонтальные ───────────────────────────────── */
function buildRuledLines(x0, y0, x1, y1, step) {
    return [{ d: hLines(x0, y0, x1, y1, step) }];
}

/* ─── Точечная сетка: dasharray-трюк ────────────────────────────────── */
function buildDotGrid(x0, y0, x1, y1, step) {
    return [{
        d:         hLines(x0, y0, x1, y1, step),
        dasharray: `0 ${step}`,
        linecap:   'round',
    }];
}

/* ─── Изометрия (равносторонние треугольники) ────────────────────────── */
function buildIsometricGrid(x0, y0, x1, y1, step) {
    const tan60 = Math.tan(Math.PI / 3);
    const sin60 = Math.sin(Math.PI / 3);
    const vStep = step * sin60;
    const h     = y1 - y0;
    const w     = x1 - x0;
    const dxH   = h / tan60;

    let d = hLines(x0, y0, x1, y1, vStep);

    const nLeft = Math.ceil(dxH / step) + 1;
    for (let i = -nLeft; i <= Math.ceil(w / step) + 1; i++) {
        const tx = x0 + i * step;
        d += `M ${r(tx)} ${r(y0)} L ${r(tx + dxH)} ${r(y1)} `;
    }
    for (let i = 0; i <= Math.ceil((w + dxH) / step) + 1; i++) {
        const tx = x0 + i * step;
        d += `M ${r(tx)} ${r(y0)} L ${r(tx - dxH)} ${r(y1)} `;
    }

    return [{ d }];
}

/* ─── Нотный стан: группы по 5 линий с шагом 2 мм, между станами 12 мм */
function buildNotesGrid(x0, y0, x1, y1) {
    const LINE_STEP = 2;              // мм между линиями стана
    const STAFF_H   = 4 * LINE_STEP;  // 8 мм — высота стана (4 промежутка)
    const BETWEEN   = 12;             // мм между станами
    const CYCLE     = STAFF_H + BETWEEN; // 20 мм

    let d = '';
    for (let staffTop = y0; staffTop < y1; staffTop += CYCLE) {
        for (let i = 0; i < 5; i++) {
            const y = r(staffTop + i * LINE_STEP);
            if (y > y1 + 0.001) break;
            d += `M ${r(x0)} ${y} H ${r(x1)} `;
        }
    }
    return [{ d }];
}

/* ─── Косая / Частая косая (ГОСТ) ────────────────────────────────────── */
// Горизонтальные рабочие строки: пары линий с шагом 4 мм, пропуск 8 мм
// Косые линии под углом 65° от горизонтали
// diagPitch: шаг диагоналей (25 мм для Косой, 5 мм для Частой)
function buildSlantedGrid(x0, y0, x1, y1, diagPitch) {
    const ANGLE    = 65 * Math.PI / 180;
    const tanA     = Math.tan(ANGLE);   // ≈ 2.145
    const ROW_STEP = 4;                 // мм: шаг внутри пары
    const GAP      = 8;                 // мм: пропуск между парами
    const CYCLE    = ROW_STEP + GAP;    // 12 мм
    const h        = y1 - y0;

    let d = '';

    // Парные горизонтальные линии (ГОСТ)
    for (let pairY = y0; pairY < y1; pairY += CYCLE) {
        d += `M ${r(x0)} ${r(pairY)} H ${r(x1)} `;
        const y2 = r(pairY + ROW_STEP);
        if (y2 <= y1) d += `M ${r(x0)} ${y2} H ${r(x1)} `;
    }

    // Диагонали: от (bx, y1) к (bx + offsetX, y0) — снизу-слева вверх-вправо
    const offsetX = h / tanA;
    const startBx = x0 - (Math.ceil(offsetX / diagPitch) + 1) * diagPitch;
    const endBx   = x1 + diagPitch;

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
        case 'ruled':      return buildRuledLines(x0, y0, x1, y1, step);
        case 'dots':       return buildDotGrid(x0, y0, x1, y1, step);
        case 'isometric':  return buildIsometricGrid(x0, y0, x1, y1, step);
        case 'notes':      return buildNotesGrid(x0, y0, x1, y1);
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

    refs.previewSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    refs.previewSvg.setAttribute('aria-label',
        `Предпросмотр: ${state.orientation === 'landscape' ? 'альбомный' : 'книжный'}, ${state.gridType}`);
    refs.bgRect.setAttribute('width',  w);
    refs.bgRect.setAttribute('height', h);

    const x0 = mL,     y0 = mT;
    const x1 = w - mR, y1 = h - mB;

    refs.previewSvg.querySelectorAll('.grid-layer').forEach(el => el.remove());

    if (x1 - x0 < 5 || y1 - y0 < 5) return;

    const clipRect = ensureClipPath(refs.previewSvg);
    clipRect.setAttribute('x',      x0);
    clipRect.setAttribute('y',      y0);
    clipRect.setAttribute('width',  x1 - x0);
    clipRect.setAttribute('height', y1 - y0);

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

            if (opacity  !== undefined) path.setAttribute('opacity',          opacity);
            if (dasharray)              path.setAttribute('stroke-dasharray', dasharray);
            if (linecap)                path.setAttribute('stroke-linecap',   linecap);

            refs.previewSvg.appendChild(path);
        });

    // Школьные поля: вертикальная красная линия
    // Клетка — совпадает с вертикальной линией сетки (4 клетки от правого края)
    // Остальные типы — фиксированный отступ 25 мм
    if (state.schoolMargins && SCHOOL_MARGIN_TYPES.includes(state.gridType)) {
        const redOffset = state.gridType === 'square' ? 4 * state.gridStep : 25;
        const lineX = r(x1 - redOffset);
        if (lineX > x0) {
            const ml = document.createElementNS(SVG_NS, 'line');
            ml.setAttribute('class',        'grid-layer school-margin-line');
            ml.setAttribute('x1',           lineX);
            ml.setAttribute('y1',           y0);
            ml.setAttribute('x2',           lineX);
            ml.setAttribute('y2',           y1);
            ml.setAttribute('stroke',       '#B71234');
            ml.setAttribute('stroke-width', state.lineThick);
            ml.setAttribute('clip-path',    `url(#${CLIP_ID})`);
            refs.previewSvg.appendChild(ml);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════════
   ЭКСПОРТ: PDF
   ═══════════════════════════════════════════════════════════════════════ */

async function exportPDF() {
    const { w, h } = getSheetDimensions();
    const { jsPDF } = window.jspdf;

    const doc = new jsPDF({
        orientation: w > h ? 'l' : 'p',
        unit:        'mm',
        format:      [w, h],
    });

    // svg2pdf может экспортироваться как window.svg2pdf или window.svg2pdf.svg2pdf
    const svg2pdfFn = (window.svg2pdf && typeof window.svg2pdf === 'function')
        ? window.svg2pdf
        : window.svg2pdf && window.svg2pdf.svg2pdf;

    await svg2pdfFn(refs.previewSvg, doc, { x: 0, y: 0, width: w, height: h });
    doc.save('ruling-tochilka.pdf');
}

/* ═══════════════════════════════════════════════════════════════════════
   ЭКСПОРТ: PNG (прозрачный фон, scale × 3)
   ═══════════════════════════════════════════════════════════════════════ */

function exportPNG() {
    return new Promise(resolve => {
        const { w, h } = getSheetDimensions();
        const SCALE     = 3;
        const PX_PER_MM = 3.7795275591; // 96 dpi

        const pxW = Math.round(w * PX_PER_MM * SCALE);
        const pxH = Math.round(h * PX_PER_MM * SCALE);

        // Клонируем SVG и задаём пиксельные размеры; убираем белый фон
        const svgClone = refs.previewSvg.cloneNode(true);
        svgClone.setAttribute('width',  pxW);
        svgClone.setAttribute('height', pxH);
        const bgClone = svgClone.querySelector('#bgRect');
        if (bgClone) bgClone.setAttribute('fill', 'none');

        const svgData = new XMLSerializer().serializeToString(svgClone);
        const blob    = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url     = URL.createObjectURL(blob);

        const canvas  = document.createElement('canvas');
        canvas.width  = pxW;
        canvas.height = pxH;

        const img = new Image();
        img.onload = () => {
            // Намеренно не вызываем fillRect — фон остаётся прозрачным
            canvas.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);

            const link    = document.createElement('a');
            link.download = 'ruling-tochilka.png';
            link.href     = canvas.toDataURL('image/png');
            link.click();

            resolve();
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(); };
        img.src = url;
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   КНОПКА «ОБНУЛИТЬ ПОЛЯ» (центр компаса) — toggle-режим
   ═══════════════════════════════════════════════════════════════════════ */

function initResetMarginsBtn() {
    if (!refs.btnResetMargins) return;

    refs.btnResetMargins.addEventListener('click', () => {
        const isActive = refs.btnResetMargins.classList.contains('active');

        if (isActive) {
            // Деактивация: восстанавливаем сохранённые значения
            if (_resetSavedMargins) {
                state.margins = { ..._resetSavedMargins };
                refs.marginTop.value    = _resetSavedMargins.top;
                refs.marginBottom.value = _resetSavedMargins.bottom;
                refs.marginLeft.value   = _resetSavedMargins.left;
                refs.marginRight.value  = _resetSavedMargins.right;
                _resetSavedMargins = null;
            }
            refs.btnResetMargins.classList.remove('active');
        } else {
            // Активация: сохраняем текущие значения, обнуляем поля
            _resetSavedMargins = { ...state.margins };
            state.margins = { top: 0, bottom: 0, left: 0, right: 0 };
            refs.marginTop.value    = 0;
            refs.marginBottom.value = 0;
            refs.marginLeft.value   = 0;
            refs.marginRight.value  = 0;
            refs.btnResetMargins.classList.add('active');
            track('margins_reset');
        }

        scheduleRedraw();
    });
}

/* ═══════════════════════════════════════════════════════════════════════
   КНОПКИ ДЕЙСТВИЙ
   ═══════════════════════════════════════════════════════════════════════ */

function initActionButtons() {
    // Печать — прямой вызов window.print()
    refs.btnPrint.addEventListener('click', () => {
        track('print_sheet_clicked', { ...getSheetDimensions(), gridType: state.gridType });
        window.print();
    });

    // Позиционируем popover-меню перед открытием (top-layer → fixed позиция)
    refs.downloadMenu.addEventListener('beforetoggle', e => {
        if (e.newState === 'open') {
            const rect = refs.btnDownload.getBoundingClientRect();
            refs.downloadMenu.style.left   = rect.left + 'px';
            refs.downloadMenu.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
            refs.downloadMenu.style.width  = rect.width + 'px';
        }
    });

    // Пункт меню: PDF
    refs.btnPDF.addEventListener('click', async () => {
        refs.downloadMenu.hidePopover();
        refs.btnDownload.classList.add('is-loading');
        track('download_pdf', { ...getSheetDimensions(), gridType: state.gridType });
        try {
            await exportPDF();
        } catch (err) {
            console.error('[PDF export]', err);
        } finally {
            refs.btnDownload.classList.remove('is-loading');
        }
    });

    // Пункт меню: PNG
    refs.btnPNG.addEventListener('click', async () => {
        refs.downloadMenu.hidePopover();
        refs.btnDownload.classList.add('is-loading');
        track('download_png', { ...getSheetDimensions(), gridType: state.gridType });
        try {
            await exportPNG();
        } finally {
            refs.btnDownload.classList.remove('is-loading');
        }
    });

    // Визуальный feedback нажатия
    [refs.btnDownload, refs.btnPrint].forEach(btn => {
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
    initResetMarginsBtn();
    initSchoolMargins();
    initActionButtons();

    renderPreview();

    track('app_loaded', { referrer: document.referrer || 'direct' });
});

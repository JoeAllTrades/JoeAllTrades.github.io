// --- Import ES Module from CDN ---
import * as MaterialColorUtilities from 'https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/index.js';

// --- Library References (Globals from UMD scripts loaded in HTML) ---
let jsPDFConstructor, culoriLib, chromaLib; // Added chromaLib
try {
    jsPDFConstructor = window.jspdf.jsPDF;
    culoriLib = window.culori;
    chromaLib = window.chroma; // Get chroma reference
    if (!jsPDFConstructor || !culoriLib || !chromaLib) {
        // Adjust error message slightly if chroma might be missing
        let missing = [];
        if (!jsPDFConstructor) missing.push("jsPDF");
        if (!culoriLib) missing.push("Culori");
        if (!chromaLib) missing.push("Chroma.js");
        throw new Error(`Required libraries (${missing.join(', ')}) not found.`);
    }
    console.log("jsPDF, Culori, and Chroma.js libraries loaded successfully.");
} catch (error) {
    console.error("Error loading libraries:", error);
    alert(`Error loading libraries: ${error.message}. Check console, lib/ folder, and CDN links.`);
    // Disable buttons that depend on missing libraries
    if (!jsPDFConstructor) document.getElementById('export-pdf')?.setAttribute('disabled', 'true');
    // We might need to disable Bezier if Chroma.js is missing, handled later in areElementsAvailable
}

// --- Destructure needed components from the imported ES Module ---
const { Hct, argbFromHex, hexFromArgb } = MaterialColorUtilities;
console.log("Material Color Utilities module loaded successfully.");

// --- DOM Element References ---
const colorLeftInput = document.getElementById('color-left');
const colorRightInput = document.getElementById('color-right');
const colorTopInput = document.getElementById('color-top');
const colorBottomInput = document.getElementById('color-bottom');
const horizontalLevelsSlider = document.getElementById('horizontal-levels');
const horizontalLevelsValueSpan = document.getElementById('horizontal-levels-value');
const verticalLevelsSlider = document.getElementById('vertical-levels');
const verticalLevelsValueSpan = document.getElementById('vertical-levels-value');
const interpolationMethodSelect = document.getElementById('interpolation-method');
const verticalInterpolationToggle = document.getElementById('vertical-interpolation-toggle');
const verticalSliderGroup = document.querySelector('.vertical-slider-group');
const paletteGrid = document.getElementById('palette-grid');
// const paletteLabels = document.getElementById('palette-labels'); // Removed
const exportSvgButton = document.getElementById('export-svg');
const exportPdfButton = document.getElementById('export-pdf');
const copyNotificationElement = document.getElementById('copy-notification');

// --- State Variables ---
let currentPalette = [];
let notificationTimeout = null;

// --- Helper Functions ---

function lerp(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    return a * (1 - t) + b * t;
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) return { r: 255, g: 0, b: 255 };
    let sanitizedHex = hex;
    if (sanitizedHex.length === 4) {
        sanitizedHex = '#' + sanitizedHex[1] + sanitizedHex[1] + sanitizedHex[2] + sanitizedHex[2] + sanitizedHex[3] + sanitizedHex[3];
    }
    if (!/^#[0-9A-F]{6}$/i.test(sanitizedHex)) return { r: 255, g: 0, b: 255 };
    const bigint = parseInt(sanitizedHex.slice(1), 16);
    if (isNaN(bigint)) return { r: 255, g: 0, b: 255 };
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

function rgbToHex(rgb) {
    const r = Math.max(0, Math.min(255, Math.round(rgb.r || 0)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g || 0)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b || 0)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toLowerCase();
}

// --- Interpolation Functions ---

function interpolateRgb(color1, color2, t) {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const r = lerp(rgb1.r, rgb2.r, t);
    const g = lerp(rgb1.g, rgb2.g, t);
    const b = lerp(rgb1.b, rgb2.b, t);
    return rgbToHex({ r, g, b });
}

function interpolateCulori(color1, color2, t, mode) {
    if (!culoriLib) return '#CCCCCC';
    try {
        const interpolator = culoriLib.interpolate([color1, color2], mode);
        const result = interpolator(t);
        if (!result || typeof result !== 'object' || ('mode' in result && result.mode === undefined)) {
             console.warn(`Culori interpolation (${mode}) returned invalid result object for t=${t}:`, result);
             return interpolateRgb(color1, color2, t);
        }
        const hexResult = culoriLib.formatHex(result);
        return hexResult && /^#([0-9A-F]{3}){1,2}$/i.test(hexResult) ? hexResult : interpolateRgb(color1, color2, t);
    } catch (error) {
        console.error(`Culori interpolation error (${mode}) for ${color1} -> ${color2} at t=${t}:`, error);
        return interpolateRgb(color1, color2, t);
    }
}

function interpolateHct(color1, color2, t) {
     if (!Hct || !argbFromHex || !hexFromArgb) return '#CCCCCC';
     try {
        const hct1 = Hct.fromInt(argbFromHex(color1));
        const hct2 = Hct.fromInt(argbFromHex(color2));
        const hue1 = hct1.hue;
        const hue2 = hct2.hue;
        let deltaHue = hue2 - hue1;
        if (Math.abs(deltaHue) > 180.0) { deltaHue -= Math.sign(deltaHue) * 360.0; }
        const hue = (hue1 + deltaHue * t + 360.0) % 360.0;
        const chroma = lerp(hct1.chroma, hct2.chroma, t);
        const tone = lerp(hct1.tone, hct2.tone, t);
        const safeChroma = Math.max(0, chroma);
        const safeTone = Math.max(0, Math.min(100, tone));
        const interpolatedHct = Hct.from(hue, safeChroma, safeTone);
        return hexFromArgb(interpolatedHct.toInt());
     } catch (error) {
        console.error(`HCT interpolation error for ${color1} -> ${color2} at t=${t}:`, error);
        return interpolateRgb(color1, color2, t);
     }
}

function interpolateHybridHctRgbHue(color1, color2, t) {
    if (!Hct || !argbFromHex || !hexFromArgb) return '#CCCCCC';
    try {
        const hct1 = Hct.fromInt(argbFromHex(color1));
        const hct2 = Hct.fromInt(argbFromHex(color2));
        const interpChroma = lerp(hct1.chroma, hct2.chroma, t);
        const interpTone = lerp(hct1.tone, hct2.tone, t);
        const rgbInterpHex = interpolateRgb(color1, color2, t);
        const hctFromRgb = Hct.fromInt(argbFromHex(rgbInterpHex));
        const guideHue = hctFromRgb.hue;
        const safeChroma = Math.max(0, interpChroma);
        const safeTone = Math.max(0, Math.min(100, interpTone));
        const finalHct = Hct.from(guideHue, safeChroma, safeTone);
        return hexFromArgb(finalHct.toInt());
    } catch (error) {
        console.error(`Hybrid HCT interpolation error for ${color1} -> ${color2} at t=${t}:`, error);
        return interpolateRgb(color1, color2, t);
    }
}

function interpolateBlendedOklchRgb(color1, color2, t, oklchAmount = 0.7) {
    try {
        const oklchHex = interpolateCulori(color1, color2, t, 'oklch');
        const rgbHex = interpolateRgb(color1, color2, t);
        const rgbFromOklch = hexToRgb(oklchHex);
        const rgbFromRgb = hexToRgb(rgbHex);
        const finalR = lerp(rgbFromRgb.r, rgbFromOklch.r, oklchAmount);
        const finalG = lerp(rgbFromRgb.g, rgbFromOklch.g, oklchAmount);
        const finalB = lerp(rgbFromRgb.b, rgbFromOklch.b, oklchAmount);
        return rgbToHex({ r: finalR, g: finalG, b: finalB });
    } catch (error) {
        console.error(`Blended Oklch/RGB interpolation error for ${color1} -> ${color2} at t=${t}:`, error);
        return interpolateCulori(color1, color2, t, 'oklch'); // Fallback to pure Oklch
    }
}

// --- BEZIER INTERPOLATION FUNCTION using Chroma.js ---
function createBezierInterpolator(color1, color2) {
    if (!chromaLib) return null;
    try {
        // Create a bezier scale function using LCh color space
        return chromaLib.bezier([color1, color2]).scale().mode('lch');
    } catch (error) {
        console.error("Chroma.js bezier creation error:", error);
        return null;
    }
}

function interpolateBezierLch(interpolatorFunc, t) {
     if (!interpolatorFunc) {
         console.warn("Bezier interpolator function not available.");
         return '#CCCCCC'; // Fallback color
     }
     try {
         return interpolatorFunc(t).hex(); // Get color at point t and return hex
     } catch (error) {
         console.error(`Chroma.js bezier interpolation error for t=${t}:`, error);
         return '#FF00FF'; // Return magenta on error to make it obvious
     }
}
// ----------------------------------------------------


// --- Core Logic ---

function generatePalette() {
    if (!areElementsAvailable()) {
        console.error("Cannot generate palette, essential DOM elements missing or libraries not loaded.");
        return;
    }

    const leftColor = colorLeftInput.value;
    const rightColor = colorRightInput.value;
    const hLevels = parseInt(horizontalLevelsSlider.value);
    const method = interpolationMethodSelect.value;
    const useVertical = verticalInterpolationToggle.checked;
    const topColor = useVertical ? colorTopInput.value : '#ffffff';
    const bottomColor = useVertical ? colorBottomInput.value : '#000000';
    const vSteps = useVertical ? parseInt(verticalLevelsSlider.value) : 0;
    const vLevelsTotal = useVertical ? (vSteps * 2) + 1 : 1;
    const midIndex = useVertical ? vSteps : 0;

    currentPalette = [];

    // Create Bezier interpolators once if needed (performance)
    const bezierInterpolatorH = (method === 'bezier_lch') ? createBezierInterpolator(leftColor, rightColor) : null;

    // 1. Generate Horizontal Base Row
    const horizontalRow = [];
    for (let i = 0; i < hLevels; i++) {
        const t = hLevels <= 1 ? 0.5 : i / (hLevels - 1);
        let color;
        switch (method) {
            case 'rgb': color = interpolateRgb(leftColor, rightColor, t); break;
            case 'hsl': color = interpolateCulori(leftColor, rightColor, t, 'hsl'); break;
            case 'lab': color = interpolateCulori(leftColor, rightColor, t, 'lab'); break;
            case 'hct': color = interpolateHct(leftColor, rightColor, t); break;
            case 'hybrid_hct_rgb_hue': color = interpolateHybridHctRgbHue(leftColor, rightColor, t); break;
            case 'oklab': color = interpolateCulori(leftColor, rightColor, t, 'oklab'); break;
            case 'oklch': color = interpolateCulori(leftColor, rightColor, t, 'oklch'); break;
            case 'blended_oklch_rgb': color = interpolateBlendedOklchRgb(leftColor, rightColor, t); break;
            case 'bezier_lch':
                color = interpolateBezierLch(bezierInterpolatorH, t); // Use cached interpolator
                // Fallback inside interpolateBezierLch if needed
                if (color === '#CCCCCC' || color === '#FF00FF') { // If Bezier failed, try linear LCh
                   color = interpolateCulori(leftColor, rightColor, t, 'lch');
                }
                break;
            default:    color = interpolateRgb(leftColor, rightColor, t);
        }
        horizontalRow.push(color);
    }

    // 2. Generate Full Grid if Vertical Interpolation is Active
    if (useVertical && vLevelsTotal > 1) {
        currentPalette = Array.from({ length: vLevelsTotal }, () => Array(hLevels).fill('#CCCCCC'));

        // Cache Bezier interpolators for vertical columns
        const columnInterpolatorsTop = (method === 'bezier_lch' && chromaLib) ? [] : null;
        const columnInterpolatorsBottom = (method === 'bezier_lch' && chromaLib) ? [] : null;
        if (method === 'bezier_lch' && chromaLib) {
            for (let j = 0; j < hLevels; j++) {
                 columnInterpolatorsTop[j] = createBezierInterpolator(topColor, horizontalRow[j]);
                 columnInterpolatorsBottom[j] = createBezierInterpolator(horizontalRow[j], bottomColor);
            }
        }

        for (let j = 0; j < hLevels; j++) { // Columns
            const baseColor = horizontalRow[j];
            for (let i = 0; i < vLevelsTotal; i++) { // Rows
                let color;
                if (i === midIndex) {
                    color = baseColor;
                } else {
                    let startColor, endColor, t_v, currentInterpolator = null;
                    if (i < midIndex) { // Top -> BaseColor
                        startColor = topColor;
                        endColor = baseColor;
                        t_v = i / midIndex;
                        if(columnInterpolatorsTop) currentInterpolator = columnInterpolatorsTop[j];
                    } else { // BaseColor -> Bottom
                        const stepsInBottomHalf = vSteps;
                        const stepNum = i - midIndex;
                        t_v = stepNum / stepsInBottomHalf;
                        startColor = baseColor;
                        endColor = bottomColor;
                         if(columnInterpolatorsBottom) currentInterpolator = columnInterpolatorsBottom[j];
                    }
                     switch (method) {
                        case 'rgb': color = interpolateRgb(startColor, endColor, t_v); break;
                        case 'hsl': color = interpolateCulori(startColor, endColor, t_v, 'hsl'); break;
                        case 'lab': color = interpolateCulori(startColor, endColor, t_v, 'lab'); break;
                        case 'hct': color = interpolateHct(startColor, endColor, t_v); break;
                        case 'hybrid_hct_rgb_hue': color = interpolateHybridHctRgbHue(startColor, endColor, t_v); break;
                        case 'oklab': color = interpolateCulori(startColor, endColor, t_v, 'oklab'); break;
                        case 'oklch': color = interpolateCulori(startColor, endColor, t_v, 'oklch'); break;
                        case 'blended_oklch_rgb': color = interpolateBlendedOklchRgb(startColor, endColor, t_v); break;
                        case 'bezier_lch':
                             color = interpolateBezierLch(currentInterpolator, t_v);
                             // Fallback inside interpolateBezierLch if needed
                             if (color === '#CCCCCC' || color === '#FF00FF') { // If Bezier failed, try linear LCh
                                 color = interpolateCulori(startColor, endColor, t_v, 'lch');
                             }
                             break;
                        default:    color = interpolateRgb(startColor, endColor, t_v);
                    }
                }
                currentPalette[i][j] = color;
            }
        }
    } else {
        currentPalette.push(horizontalRow);
    }
    renderPalette();
}


function renderPalette() {
    if (!paletteGrid) return;
    paletteGrid.innerHTML = ''; // Clear

    if (!isValidPalette(currentPalette)) {
        console.warn("Cannot render empty or invalid palette data.");
        displayPaletteMessage("Adjust settings to generate the palette.");
        paletteGrid.style.gridTemplateColumns = '';
        paletteGrid.style.gridTemplateRows = '';
        paletteGrid.style.width = 'auto';
        paletteGrid.style.height = 'auto';
        return;
    }

    const numRows = currentPalette.length;
    const numCols = currentPalette[0].length;

    // --- Calculate Square Cell Size ---
    const gridContainer = paletteGrid.parentElement;
    if (!gridContainer) { console.error("Grid container not found!"); return; }
    const containerStyle = getComputedStyle(gridContainer);
    const gridStyle = getComputedStyle(paletteGrid);
    const containerPaddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
    const containerPaddingY = parseFloat(containerStyle.paddingTop) + parseFloat(containerStyle.paddingBottom);
    const availableWidth = gridContainer.clientWidth - containerPaddingX;
    const availableHeight = gridContainer.clientHeight - containerPaddingY;
    const gap = parseFloat(gridStyle.gap) || 0;
    const totalGapWidth = Math.max(0, numCols - 1) * gap;
    const potentialCellWidth = (availableWidth - totalGapWidth) / numCols;
    const totalGapHeight = Math.max(0, numRows - 1) * gap;
    const potentialCellHeight = (availableHeight - totalGapHeight) / numRows;
    let cellSize = Math.floor(Math.min(potentialCellWidth, potentialCellHeight));
    cellSize = Math.max(1, cellSize); // Ensure size is at least 1px

    // --- Set Grid Styles ---
    paletteGrid.style.gridTemplateColumns = `repeat(${numCols}, ${cellSize}px)`;
    paletteGrid.style.gridTemplateRows = `repeat(${numRows}, ${cellSize}px)`;
    const totalGridWidthActual = numCols * cellSize + totalGapWidth;
    const totalGridHeightActual = numRows * cellSize + totalGapHeight;
    paletteGrid.style.width = `${totalGridWidthActual}px`;
    paletteGrid.style.height = `${totalGridHeightActual}px`;

    // --- Create and Append Cells ---
    const fragment = document.createDocumentFragment();
    currentPalette.forEach((row, rowIndex) => {
         if (!Array.isArray(row)){ console.warn(`Row ${rowIndex} is not an array:`, row); return; }
        row.forEach((color, colIndex) => {
            const cell = document.createElement('div');
            cell.classList.add('color-cell');
            const validColor = typeof color === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(color);
            if (validColor) {
                const hexColor = color.toUpperCase();
                cell.style.backgroundColor = hexColor;
                cell.title = `Click to copy ${hexColor}`;
                cell.dataset.color = hexColor;
                cell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    copyColorToClipboard(hexColor);
                });
             } else {
                cell.style.backgroundColor = '#CCCCCC';
                cell.title = `Invalid Color Data (r:${rowIndex}, c:${colIndex})`;
                cell.style.cursor = 'not-allowed';
                console.warn(`Invalid color value at [${rowIndex}][${colIndex}]:`, color);
             }
             fragment.appendChild(cell);
        });
    });
    paletteGrid.appendChild(fragment);
}


function displayPaletteMessage(message) {
    if (!paletteGrid) return;
    paletteGrid.innerHTML = '';
    paletteGrid.style.gridTemplateColumns = '1fr';
    paletteGrid.style.gridTemplateRows = 'auto';
    paletteGrid.style.width = 'auto';
    paletteGrid.style.height = 'auto';
    const msgCell = document.createElement('div');
    msgCell.textContent = message;
    msgCell.style.display = 'flex';
    msgCell.style.alignItems = 'center';
    msgCell.style.justifyContent = 'center';
    msgCell.style.color = '#6c757d';
    msgCell.style.fontSize = '1rem';
    msgCell.style.padding = '2rem';
    msgCell.style.minHeight = '100px';
    msgCell.style.textAlign = 'center';
    msgCell.style.flexGrow = '1';
    msgCell.style.alignSelf = 'stretch';
    paletteGrid.appendChild(msgCell);
}

function isValidPalette(palette) {
    return palette && Array.isArray(palette) && palette.length > 0 && Array.isArray(palette[0]) && palette[0].length > 0;
}


// --- Copy to Clipboard Logic ---
async function copyColorToClipboard(colorHex) {
    if (!navigator.clipboard) {
        console.warn("Clipboard API not available.");
        showCopyNotification("Clipboard API not supported", true);
        return;
    }
    try {
        await navigator.clipboard.writeText(colorHex);
        console.log(`Copied ${colorHex} to clipboard.`);
        showCopyNotification(`Copied ${colorHex}!`);
    } catch (err) {
        console.error('Failed to copy color: ', err);
        showCopyNotification("Failed to copy!", true);
    }
}

// --- Show Copy Notification ---
function showCopyNotification(message, isError = false) {
    if (!copyNotificationElement) return;
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
        notificationTimeout = null;
    }
    copyNotificationElement.textContent = message;
    copyNotificationElement.style.backgroundColor = isError ? 'rgba(220, 53, 69, 0.85)' : 'rgba(0, 0, 0, 0.75)';
    copyNotificationElement.classList.add('show');
    notificationTimeout = setTimeout(() => {
        copyNotificationElement.classList.remove('show');
    }, 2000);
}


// --- UI Update Functions ---

function updateSliderValue(sliderElement, spanElement) {
    if (sliderElement && spanElement) {
        spanElement.textContent = sliderElement.value;
    }
}

function toggleVerticalControls() {
    if (verticalSliderGroup && /*!paletteLabels &&*/ verticalInterpolationToggle && document.body) { // Removed paletteLabels check
        const showVertical = verticalInterpolationToggle.checked;
        document.body.classList.toggle('vertical-mode-enabled', showVertical);
        verticalSliderGroup.style.display = showVertical ? 'block' : 'none';
        // paletteLabels.classList.toggle('hidden', !showVertical); // Removed
        generatePalette();
    } else {
        console.error("Could not find elements needed to toggle vertical controls (verticalSliderGroup, toggle, body).");
    }
}

// --- Check if essential DOM elements are loaded ---
function areElementsAvailable() {
    const essentialElements = [
        colorLeftInput, colorRightInput, colorTopInput, colorBottomInput,
        horizontalLevelsSlider, horizontalLevelsValueSpan,
        verticalLevelsSlider, verticalLevelsValueSpan, verticalSliderGroup,
        interpolationMethodSelect, verticalInterpolationToggle,
        paletteGrid, paletteGrid?.parentElement,
        // paletteLabels, // Removed
        exportSvgButton, exportPdfButton, copyNotificationElement,
        culoriLib, jsPDFConstructor // Check base libraries
    ];
    const missing = essentialElements.filter(el => !el);
    if (missing.length > 0) {
         const nameMap = ["colorLeftInput", "colorRightInput", "colorTopInput", "colorBottomInput",
                          "horizontalLevelsSlider", "horizontalLevelsValueSpan", "verticalLevelsSlider", "verticalLevelsValueSpan", "verticalSliderGroup",
                          "interpolationMethodSelect", "verticalInterpolationToggle",
                          "paletteGrid", "paletteGridContainer",
                          "exportSvgButton", "exportPdfButton", "copyNotificationElement",
                          "culoriLib", "jsPDFConstructor"];
        const missingNames = missing.map((_, i) => {
            const indexInOriginal = essentialElements.findIndex((origEl, idx) => idx === i && origEl === _);
            return nameMap[indexInOriginal] || `Unknown Element/Lib at index ${indexInOriginal}`;
        });
        console.error("Essential DOM elements or base libraries are missing:", missingNames);
        return false;
    }
     // Separate check for Chroma.js ONLY if Bezier method is selected
     if (interpolationMethodSelect && interpolationMethodSelect.value === 'bezier_lch' && !chromaLib) {
         console.error("Chroma.js library is required for Bezier interpolation but not loaded.");
         displayPaletteMessage("Bezier method requires Chroma.js library. Please check console or reload.");
         return false; // Cannot generate this specific palette
     }
    return true; // All necessary elements/libs for the CURRENT selection are available
}


// --- Export Functions ---

function exportSVG() {
    if (!isValidPalette(currentPalette)) { alert("Please generate a valid palette first."); return; }
    const numRows = currentPalette.length;
    const numCols = currentPalette[0].length;
    const gridStyle = getComputedStyle(paletteGrid);
    const gap = parseFloat(gridStyle.gap) || 3;
    const cellSize = 40; // Fixed size for SVG export
    const width = numCols * cellSize + Math.max(0, numCols - 1) * gap;
    const height = numRows * cellSize + Math.max(0, numRows - 1) * gap;
    let svgContent = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n`;
    svgContent += `  <defs>\n    <style>\n      /* Optional styles */\n    </style>\n  </defs>\n`;
    currentPalette.forEach((row, r) => {
        row.forEach((color, c) => {
            const x = c * (cellSize + gap);
            const y = r * (cellSize + gap);
            const validColor = typeof color === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(color);
            const fillColor = validColor ? color : '#CCCCCC';
            svgContent += `  <rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fillColor}" rx="4" ry="4"/>\n`;
        });
    });
    svgContent += `</svg>`;
    try {
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'huecraft_palette.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) { console.error("Error exporting SVG:", error); alert("Could not export SVG."); }
}

function exportPDF() {
     if (!jsPDFConstructor) { alert("jsPDF library not loaded."); return; }
     if (!isValidPalette(currentPalette)) { alert("Please generate a valid palette first."); return; }
     try {
            const pdf = new jsPDFConstructor({ orientation: 'landscape', unit: 'pt' });
            const pageHeight = pdf.internal.pageSize.getHeight();
            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 40;
            const usableWidth = pageWidth - 2 * margin;
            const usableHeight = pageHeight - 2 * margin;
            const numRows = currentPalette.length;
            const numCols = currentPalette[0].length;
            const minCellSize = 18;
            const cellGap = 2; // Gap in points
            const maxColsPerPage = Math.max(1, Math.floor((usableWidth + cellGap) / (minCellSize + cellGap)));
            const maxRowsPerPage = Math.max(1, Math.floor((usableHeight + cellGap) / (minCellSize + cellGap)));
            let pageNumber = 0;
            for (let startRow = 0; startRow < numRows; startRow += maxRowsPerPage) {
                for (let startCol = 0; startCol < numCols; startCol += maxColsPerPage) {
                    pageNumber++;
                    if (pageNumber > 1) { pdf.addPage(); }
                    const endRow = Math.min(startRow + maxRowsPerPage, numRows);
                    const endCol = Math.min(startCol + maxColsPerPage, numCols);
                    const colsOnThisPage = endCol - startCol;
                    const rowsOnThisPage = endRow - startRow;
                    const availableWidthForCells = usableWidth - Math.max(0, colsOnThisPage - 1) * cellGap;
                    const availableHeightForCells = usableHeight - Math.max(0, rowsOnThisPage - 1) * cellGap;
                    const cellWidth = availableWidthForCells / colsOnThisPage;
                    const cellHeight = availableHeightForCells / rowsOnThisPage;
                    const cellSize = Math.max(1, Math.min(cellWidth, cellHeight)); // Keep it square
                    const actualGridWidth = colsOnThisPage * cellSize + Math.max(0, colsOnThisPage - 1) * cellGap;
                    const actualGridHeight = rowsOnThisPage * cellSize + Math.max(0, rowsOnThisPage - 1) * cellGap;
                    const pageStartX = margin + Math.max(0, (usableWidth - actualGridWidth) / 2);
                    const pageStartY = margin + Math.max(0, (usableHeight - actualGridHeight) / 2);
                    const fontSize = Math.max(4, Math.min(8, cellSize * 0.15));
                    pdf.setFontSize(fontSize);
                    for (let r = startRow; r < endRow; r++) {
                        for (let c = startCol; c < endCol; c++) {
                            const color = currentPalette[r][c];
                            const pageRow = r - startRow;
                            const pageCol = c - startCol;
                            const x = pageStartX + pageCol * (cellSize + cellGap);
                            const y = pageStartY + pageRow * (cellSize + cellGap);
                            const validColor = typeof color === 'string' && /^#([0-9A-F]{3}){1,2}$/i.test(color);
                            const fillColor = validColor ? color : '#CCCCCC';
                            pdf.setFillColor(fillColor);
                            pdf.rect(x, y, cellSize, cellSize, 'F');
                            if (cellSize >= minCellSize) {
                                const rgb = hexToRgb(fillColor);
                                const luminance = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
                                pdf.setTextColor(luminance > 128 ? '#000000' : '#FFFFFF');
                                pdf.text(fillColor.toUpperCase(), x + cellSize / 2, y + cellSize / 2, { align: 'center', baseline: 'middle' });
                            }
                        }
                    }
                    pdf.setFontSize(8);
                    pdf.setTextColor('#888888');
                    pdf.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - margin / 2, { align: 'center' });
                }
            }
            pdf.save('huecraft_palette.pdf');
         } catch (error) { console.error("Error exporting PDF:", error); alert("Could not export PDF."); }
}


// --- Event Listeners Setup ---
function setupEventListeners() {
    if (!areElementsAvailable()) {
        // Error message already shown in areElementsAvailable if libs missing
        console.error("Cannot setup listeners, essential DOM elements or libraries missing.");
        return; // Don't proceed if essential things are missing
    }
    console.log("Setting up event listeners...");
    // Sliders
    horizontalLevelsSlider.addEventListener('input', () => {
        updateSliderValue(horizontalLevelsSlider, horizontalLevelsValueSpan);
        generatePalette();
    });
    verticalLevelsSlider.addEventListener('input', () => {
        updateSliderValue(verticalLevelsSlider, verticalLevelsValueSpan);
        if (verticalInterpolationToggle.checked) { generatePalette(); }
    });
    // Vertical toggle
    verticalInterpolationToggle.addEventListener('change', toggleVerticalControls);
    // Color inputs and select
    const inputsToRegen = [colorLeftInput, colorRightInput, colorTopInput, colorBottomInput, interpolationMethodSelect];
    inputsToRegen.forEach(input => {
        if (input) {
            const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
            input.addEventListener(eventType, generatePalette);
        }
    });
    // Export buttons
    exportSvgButton.addEventListener('click', exportSVG);
    exportPdfButton.addEventListener('click', exportPDF);
    console.log("Event listeners set up.");
}

// --- Initial Setup ---
function initializeApp() {
     console.log("Initializing HueCraft Application...");
     if (areElementsAvailable()) { // Check elements before proceeding
         updateSliderValue(horizontalLevelsSlider, horizontalLevelsValueSpan);
         updateSliderValue(verticalLevelsSlider, verticalLevelsValueSpan);
         setupEventListeners(); // Setup listeners only if elements are okay
         toggleVerticalControls(); // Calls generatePalette inside
         console.log("HueCraft Initialization Complete.");
     } else {
         // Error message already shown in areElementsAvailable
         console.error("Initialization failed due to missing elements or libraries.");
         // Optionally display a message in the UI too
         // displayPaletteMessage("Initialization failed. Check console.");
     }
}

// --- Run Initialization ---
initializeApp(); // Start the application
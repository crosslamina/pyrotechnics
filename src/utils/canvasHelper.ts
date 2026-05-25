import type { Document, CanvasObject, TransformHandle } from '../types';

// Global cache for bitmap offscreen canvas elements to avoid state lag
export const bitmapCanvasCache: { [id: string]: HTMLCanvasElement } = {};

/**
 * Get or create an offscreen canvas for a bitmap object
 */
export function getOrCreateBitmapCanvas(
  objId: string, 
  width: number, 
  height: number, 
  dataUrl?: string,
  onLoadCallback?: () => void
): HTMLCanvasElement {
  if (bitmapCanvasCache[objId]) {
    return bitmapCanvasCache[objId];
  }

  const canvas = document.createElement('canvas');
  canvas.width = width || 100;
  canvas.height = height || 100;
  const ctx = canvas.getContext('2d');
  
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (dataUrl) {
      const img = new Image();
      img.onload = () => {
        // Resize canvas to image native size to prevent clipping / cropping
        canvas.width = img.width;
        canvas.height = img.height;
        const newCtx = canvas.getContext('2d');
        if (newCtx) {
          newCtx.drawImage(img, 0, 0);
        }
        if (onLoadCallback) onLoadCallback();
      };
      img.src = dataUrl;
    }
  }

  bitmapCanvasCache[objId] = canvas;
  return canvas;
}

/**
 * Main draw loop for rendering the Fireworks workspace document
 */
export function renderDocument(
  ctx: CanvasRenderingContext2D,
  doc: Document,
  zoom: number,
  offset: { x: number; y: number },
  selectedIds: string[],
  showSlices: boolean,
  previewAnimationStateId?: string,
  editingTextObjectId?: string,
  onBitmapLoaded?: () => void
) {
  const page = doc.pages.find(p => p.id === doc.currentPageId);
  if (!page) return;

  const stateId = previewAnimationStateId || doc.currentStateId;
  const state = page.states.find(s => s.id === stateId) || page.states[0];
  if (!state) return;

  // Clear workspace viewport
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Apply Panning and Zooming
  ctx.translate(offset.x, offset.y);
  ctx.scale(zoom, zoom);

  // 1. Draw Page Canvas boundary
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 12;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, page.width, page.height);
  ctx.shadowColor = 'transparent'; // Reset shadow

  // Draw light boundary border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1 / zoom;
  ctx.strokeRect(0, 0, page.width, page.height);

  // 2. Render Layers & Objects (Bottom to Top)
  for (let i = 0; i < state.layers.length; i++) {
    const layer = state.layers[i];
    if (!layer.visible) continue;

    for (const obj of layer.objects) {
      if (obj.type === 'slice') continue; // Render separately as overlays
      if (editingTextObjectId && obj.id === editingTextObjectId) continue;
      drawObject(ctx, obj, onBitmapLoaded);
    }
  }

  // 3. Render Slices and Hotspots (if enabled)
  if (showSlices) {
    for (let i = 0; i < state.layers.length; i++) {
      const layer = state.layers[i];
      if (!layer.visible) continue;

      for (const obj of layer.objects) {
        if (obj.type === 'slice') {
          drawWebOverlay(ctx, obj, selectedIds.includes(obj.id), zoom);
        }
      }
    }
  }

  // 4. Render Active Selection bounding box & Transform Handles
  if (selectedIds.length > 0) {
    const selectedObjects: CanvasObject[] = [];
    state.layers.forEach(layer => {
      layer.objects.forEach(obj => {
        if (selectedIds.includes(obj.id)) {
          selectedObjects.push(obj);
        }
      });
    });

    if (selectedObjects.length === 1) {
      drawTransformHandles(ctx, selectedObjects[0], zoom);
    } else if (selectedObjects.length > 1) {
      // Draw collective bounding box
      drawMultiSelectionBounds(ctx, selectedObjects, zoom);
    }
  }

  ctx.restore();
}

/**
 * Draws a single vector or bitmap object
 */
function drawObject(ctx: CanvasRenderingContext2D, obj: CanvasObject, onBitmapLoaded?: () => void) {
  ctx.save();

  // Apply base properties
  const opacity = 'opacity' in obj ? (obj as any).opacity : 100;
  ctx.globalAlpha = opacity / 100;
  if ('blendMode' in obj) {
    ctx.globalCompositeOperation = obj.blendMode as GlobalCompositeOperation;
  }

  // Apply Drop Shadow if specified
  if ('shadowColor' in obj && obj.shadowBlur > 0) {
    ctx.shadowColor = obj.shadowColor;
    ctx.shadowBlur = obj.shadowBlur;
    ctx.shadowOffsetX = obj.shadowOffsetX;
    ctx.shadowOffsetY = obj.shadowOffsetY;
  }

  switch (obj.type) {
    case 'rect': {
      ctx.fillStyle = obj.fill;
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth;

      ctx.beginPath();
      if (obj.rx > 0) {
        ctx.roundRect(obj.x, obj.y, obj.width, obj.height, obj.rx);
      } else {
        ctx.rect(obj.x, obj.y, obj.width, obj.height);
      }
      ctx.fill();
      if (obj.strokeWidth > 0) {
        ctx.stroke();
      }
      break;
    }

    case 'ellipse': {
      ctx.fillStyle = obj.fill;
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth;

      ctx.beginPath();
      ctx.ellipse(obj.cx, obj.cy, obj.rx, obj.ry, 0, 0, 2 * Math.PI);
      ctx.fill();
      if (obj.strokeWidth > 0) {
        ctx.stroke();
      }
      break;
    }

    case 'line': {
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth;
      ctx.lineCap = 'round';

      // Shorten the drawn line segment to prevent cap protrusion under thick strokes
      const dx = obj.x2 - obj.x1;
      const dy = obj.y2 - obj.y1;
      const L = Math.sqrt(dx * dx + dy * dy);

      let x1Line = obj.x1;
      let y1Line = obj.y1;
      let x2Line = obj.x2;
      let y2Line = obj.y2;

      if (L > 0) {
        const ux = dx / L;
        const uy = dy / L;

        const arrowWidthAngle = Math.PI / 6; // 30 degrees
        const arrowLength = Math.max(10, obj.strokeWidth * 4);
        const arrowHeight = arrowLength * Math.cos(arrowWidthAngle);

        let startShorten = obj.arrowStart ? arrowHeight : 0;
        let endShorten = obj.arrowEnd ? arrowHeight : 0;

        // Clamp shortening values to avoid line inversion on short lines
        if (startShorten + endShorten > L) {
          const ratio = L / (startShorten + endShorten);
          startShorten *= ratio;
          endShorten *= ratio;
        }

        x1Line = obj.x1 + ux * startShorten;
        y1Line = obj.y1 + uy * startShorten;
        x2Line = obj.x2 - ux * endShorten;
        y2Line = obj.y2 - uy * endShorten;
      }

      ctx.beginPath();
      ctx.moveTo(x1Line, y1Line);
      ctx.lineTo(x2Line, y2Line);
      ctx.stroke();

      if (obj.arrowStart) {
        drawArrowhead(ctx, obj.x2, obj.y2, obj.x1, obj.y1, obj.strokeWidth, obj.stroke);
      }
      if (obj.arrowEnd) {
        drawArrowhead(ctx, obj.x1, obj.y1, obj.x2, obj.y2, obj.strokeWidth, obj.stroke);
      }
      break;
    }

    case 'path': {
      if (obj.points.length < 2) break;
      ctx.fillStyle = obj.fill === 'none' ? 'transparent' : obj.fill;
      ctx.strokeStyle = obj.stroke;
      ctx.lineWidth = obj.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(obj.points[0].x, obj.points[0].y);

      for (let i = 1; i < obj.points.length; i++) {
        const pt = obj.points[i];
        if (pt.cp1x !== undefined && pt.cp1y !== undefined && pt.cp2x !== undefined && pt.cp2y !== undefined) {
          ctx.bezierCurveTo(pt.cp1x, pt.cp1y, pt.cp2x, pt.cp2y, pt.x, pt.y);
        } else {
          ctx.lineTo(pt.x, pt.y);
        }
      }

      if (obj.closed) {
        ctx.closePath();
      }

      if (obj.fill !== 'none') {
        ctx.fill();
      }
      ctx.stroke();
      break;
    }

    case 'text': {
      ctx.fillStyle = obj.fill;
      ctx.font = `${obj.fontStyle} ${obj.fontWeight} ${obj.fontSize}px ${obj.fontFamily}`;
      ctx.textAlign = obj.textAlign;
      ctx.textBaseline = 'top';

      // Simple multiline wrapping
      const lines = obj.text.split('\n');
      const startX = obj.textAlign === 'left' ? obj.x : obj.textAlign === 'center' ? obj.x + obj.width / 2 : obj.x + obj.width;
      
      lines.forEach((line, index) => {
        ctx.fillText(line, startX, obj.y + index * (obj.fontSize * 1.2), obj.width);
      });
      break;
    }

    case 'bitmap': {
      const canvas = getOrCreateBitmapCanvas(obj.id, obj.width, obj.height, obj.dataUrl, onBitmapLoaded);
      
      // Apply filters if any
      let filterString = '';
      if (obj.filters.blur > 0) filterString += `blur(${obj.filters.blur}px) `;
      if (obj.filters.brightness !== 100) filterString += `brightness(${obj.filters.brightness}%) `;
      if (obj.filters.contrast !== 100) filterString += `contrast(${obj.filters.contrast}%) `;
      if (obj.filters.grayscale > 0) filterString += `grayscale(${obj.filters.grayscale}%) `;
      if (obj.filters.sepia > 0) filterString += `sepia(${obj.filters.sepia}%) `;

      if (filterString.trim() !== '') {
        ctx.filter = filterString.trim();
      }

      ctx.drawImage(canvas, obj.x, obj.y, obj.width, obj.height);
      break;
    }
  }

  ctx.restore();
}

/**
 * Draws slices or hotspot overlays over the workspace canvas
 */
function drawWebOverlay(ctx: CanvasRenderingContext2D, obj: CanvasObject, isSelected: boolean, zoom: number) {
  ctx.save();

  if (obj.type === 'slice') {
    // Draw semi-transparent green slice mask
    ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.25)' : 'rgba(16, 185, 129, 0.1)';
    ctx.fillRect(obj.x, obj.y, obj.width, obj.height);

    ctx.strokeStyle = '#10b981'; // Green border
    ctx.lineWidth = isSelected ? 2 / zoom : 1 / zoom;
    ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);

    // Draw slice tag handle in top left
    ctx.fillStyle = '#10b981';
    ctx.fillRect(obj.x, obj.y - 14 / zoom, Math.max(60 / zoom, ctx.measureText(obj.name).width + 8 / zoom), 14 / zoom);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = `${10 / zoom}px var(--font-sans)`;
    ctx.fillText(obj.name, obj.x + 4 / zoom, obj.y - 4 / zoom);
  }

  ctx.restore();
}

/**
 * Renders selection outlines and resizing/transform handles for a single object
 */
function drawTransformHandles(ctx: CanvasRenderingContext2D, obj: CanvasObject, zoom: number) {
  ctx.save();
  ctx.strokeStyle = '#3b82f6'; // Bright selection blue
  ctx.lineWidth = 1.5 / zoom;

  const box = getBoundingBox(obj);
  
  // 1. Draw bounding box outline
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  // 2. Draw active transform handles
  const hs = 6 / zoom; // Handle size

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1e3a8a';
  ctx.lineWidth = 1 / zoom;

  // Corner resize handles
  const corners = [
    { x: box.x, y: box.y }, // tl
    { x: box.x + box.w, y: box.y }, // tr
    { x: box.x, y: box.y + box.h }, // bl
    { x: box.x + box.w, y: box.y + box.h } // br
  ];
  
  corners.forEach(c => {
    ctx.fillRect(c.x - hs/2, c.y - hs/2, hs, hs);
    ctx.strokeRect(c.x - hs/2, c.y - hs/2, hs, hs);
  });

  // Edge handles for non-lines/non-paths
  if (obj.type !== 'line' && obj.type !== 'path') {
    const edges = [
      { x: box.x + box.w/2, y: box.y }, // t
      { x: box.x + box.w/2, y: box.y + box.h }, // b
      { x: box.x, y: box.y + box.h/2 }, // l
      { x: box.x + box.w, y: box.y + box.h/2 } // r
    ];

    edges.forEach(e => {
      ctx.fillRect(e.x - hs/2, e.y - hs/2, hs, hs);
      ctx.strokeRect(e.x - hs/2, e.y - hs/2, hs, hs);
    });

    // Specific rounded corners handle for rect objects
    if (obj.type === 'rect') {
      ctx.fillStyle = '#ffc600'; // Gold handle for corner radius
      const radHandle = { x: box.x + 16/zoom, y: box.y + 16/zoom };
      ctx.beginPath();
      ctx.arc(radHandle.x, radHandle.y, 4/zoom, 0, 2*Math.PI);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Draws bounding box for multi-selection
 */
function drawMultiSelectionBounds(ctx: CanvasRenderingContext2D, objects: CanvasObject[], zoom: number) {
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5 / zoom;

  // Find overall boundaries
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  objects.forEach(obj => {
    const box = getBoundingBox(obj);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  });

  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
}

/**
 * Resolves bounding dimensions for any canvas object
 */
export function getBoundingBox(obj: CanvasObject): { x: number; y: number; w: number; h: number } {
  switch (obj.type) {
    case 'rect':
    case 'text':
    case 'bitmap':
    case 'slice':
      return { x: obj.x, y: obj.y, w: obj.width, h: obj.height };

    case 'ellipse':
      return { x: obj.cx - obj.rx, y: obj.cy - obj.ry, w: obj.rx * 2, h: obj.ry * 2 };

    case 'line': {
      const x = Math.min(obj.x1, obj.x2);
      const y = Math.min(obj.y1, obj.y2);
      const w = Math.abs(obj.x2 - obj.x1) || 1;
      const h = Math.abs(obj.y2 - obj.y1) || 1;
      return { x, y, w, h };
    }

    case 'path': {
      if (obj.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      obj.points.forEach(pt => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
      return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
    }
    default:
      return { x: 0, y: 0, w: 0, h: 0 };
  }
}

/**
 * Performs hit testing to find which object is under the pointer
 */
export function hitTestObjects(
  objects: CanvasObject[],
  mouseX: number,
  mouseY: number,
  showSlices: boolean
): { objectId: string; handle: TransformHandle | null } | null {
  // Go backwards (top objects first)
  for (let i = objects.length - 1; i >= 0; i--) {
    const obj = objects[i];
    
    // Ignore slices if we are not rendering/focusing on them
    if (obj.type === 'slice' && !showSlices) continue;

    const box = getBoundingBox(obj);
    const padding = 6; // Hit test click tolerance

    // Check boundary overlap
    if (
      mouseX >= box.x - padding &&
      mouseX <= box.x + box.w + padding &&
      mouseY >= box.y - padding &&
      mouseY <= box.y + box.h + padding
    ) {
      // It's a hit! Return the object
      return { objectId: obj.id, handle: null };
    }
  }

  return null;
}

/**
 * Check if click is on transform handles of a selected object
 */
export function checkTransformHandles(
  obj: CanvasObject,
  mouseX: number,
  mouseY: number,
  zoom: number
): TransformHandle | null {
  const box = getBoundingBox(obj);
  const tolerance = 10 / zoom; // 10px screen click tolerance

  // Corners
  if (Math.abs(mouseX - box.x) <= tolerance && Math.abs(mouseY - box.y) <= tolerance) return 'tl';
  if (Math.abs(mouseX - (box.x + box.w)) <= tolerance && Math.abs(mouseY - box.y) <= tolerance) return 'tr';
  if (Math.abs(mouseX - box.x) <= tolerance && Math.abs(mouseY - (box.y + box.h)) <= tolerance) return 'bl';
  if (Math.abs(mouseX - (box.x + box.w)) <= tolerance && Math.abs(mouseY - (box.y + box.h)) <= tolerance) return 'br';

  if (obj.type !== 'line' && obj.type !== 'path') {
    // Edges
    if (Math.abs(mouseX - (box.x + box.w / 2)) <= tolerance && Math.abs(mouseY - box.y) <= tolerance) return 't';
    if (Math.abs(mouseX - (box.x + box.w / 2)) <= tolerance && Math.abs(mouseY - (box.y + box.h)) <= tolerance) return 'b';
    if (Math.abs(mouseX - box.x) <= tolerance && Math.abs(mouseY - (box.y + box.h / 2)) <= tolerance) return 'l';
    if (Math.abs(mouseX - (box.x + box.w)) <= tolerance && Math.abs(mouseY - (box.y + box.h / 2)) <= tolerance) return 'r';

    // Corner radius handle for rects
    if (obj.type === 'rect') {
      const rxHandleX = box.x + 16 / zoom;
      const rxHandleY = box.y + 16 / zoom;
      const dist = Math.sqrt(Math.pow(mouseX - rxHandleX, 2) + Math.pow(mouseY - rxHandleY, 2));
      if (dist <= 8 / zoom) return 'radius';
    }
  }

  return null;
}

/**
 * Translates canvas object properties to CSS rules
 */
export function generateCSS(obj: CanvasObject): string {
  let css = `/* CSS for #${obj.id} (${obj.type}) */\n`;

  const box = getBoundingBox(obj);
  css += `width: ${Math.round(box.w)}px;\n`;
  css += `height: ${Math.round(box.h)}px;\n`;

  if ('fill' in obj && obj.fill !== 'none') {
    css += `background-color: ${obj.fill};\n`;
  }
  if ('stroke' in obj && obj.strokeWidth > 0) {
    css += `border: ${obj.strokeWidth}px solid ${obj.stroke};\n`;
  }
  if ('rx' in obj && obj.rx > 0) {
    css += `border-radius: ${obj.rx}px;\n`;
  }
  const opacity = 'opacity' in obj ? (obj as any).opacity : 100;
  if (opacity < 100) {
    css += `opacity: ${opacity / 100};\n`;
  }

  // Shadows
  if ('shadowColor' in obj && obj.shadowBlur > 0) {
    css += `box-shadow: ${obj.shadowOffsetX}px ${obj.shadowOffsetY}px ${obj.shadowBlur}px ${obj.shadowColor};\n`;
  }

  // Typography specific CSS
  if (obj.type === 'text') {
    css += `font-size: ${obj.fontSize}px;\n`;
    css += `font-family: "${obj.fontFamily}", sans-serif;\n`;
    css += `font-weight: ${obj.fontWeight};\n`;
    css += `font-style: ${obj.fontStyle};\n`;
    css += `text-align: ${obj.textAlign};\n`;
    css += `color: ${obj.fill};\n`;
  }

  return css;
}

/**
 * Draws a filled arrowhead pointing towards (toX, toY)
 */
export function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  strokeWidth: number,
  color: string
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const arrowLength = Math.max(10, strokeWidth * 4);
  const arrowWidthAngle = Math.PI / 6; // 30 degrees

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;

  const xLeft = toX - arrowLength * Math.cos(angle - arrowWidthAngle);
  const yLeft = toY - arrowLength * Math.sin(angle - arrowWidthAngle);
  const xRight = toX - arrowLength * Math.cos(angle + arrowWidthAngle);
  const yRight = toY - arrowLength * Math.sin(angle + arrowWidthAngle);

  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(xLeft, yLeft);
  ctx.lineTo(xRight, yRight);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

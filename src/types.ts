export type Point = {
  x: number;
  y: number;
  cp1x?: number; // Control point 1 for curves
  cp1y?: number;
  cp2x?: number; // Control point 2 for curves
  cp2y?: number;
};

export type RectObject = {
  type: 'rect';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number; // corner radius
  fill: string; // Hex color (e.g., "#3b82f6")
  stroke: string;
  strokeWidth: number;
  opacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  blendMode: string;
};

export type EllipseObject = {
  type: 'ellipse';
  id: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  blendMode: string;
};

export type LineObject = {
  type: 'line';
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  blendMode: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
};

export type PathObject = {
  type: 'path';
  id: string;
  points: Point[];
  closed: boolean;
  fill: string; // Hex color or "none"
  stroke: string;
  strokeWidth: number;
  opacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  blendMode: string;
};

export type TextObject = {
  type: 'text';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  fill: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  opacity: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  blendMode: string;
};

export type BitmapObject = {
  type: 'bitmap';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  dataUrl?: string; // Serialized base64 PNG data for saving
  filters: {
    blur: number; // in pixels (0-20)
    brightness: number; // percentage (50-200)
    contrast: number; // percentage (50-200)
    grayscale: number; // percentage (0-100)
    sepia: number; // percentage (0-100)
  };
  blendMode: string;
};

export type SliceObject = {
  type: 'slice';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  name: string; // e.g. "home_hero_slice"
  format: 'png' | 'jpeg' | 'svg';
  quality: number; // 0-100
};

export type CanvasObject =
  | RectObject
  | EllipseObject
  | LineObject
  | PathObject
  | TextObject
  | BitmapObject
  | SliceObject;

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  objects: CanvasObject[];
};

export type State = {
  id: string;
  name: string;
  delay: number; // milliseconds (e.g. 100)
  layers: Layer[];
};

export type Page = {
  id: string;
  name: string;
  width: number;
  height: number;
  states: State[];
};

export type Document = {
  name: string;
  pages: Page[];
  currentPageId: string;
  currentStateId: string;
};

export type ToolType =
  | 'pointer'
  | 'subpointer'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'text'
  | 'pen'
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'slice';

export type TransformHandle =
  | 'tl' | 'tr' | 'bl' | 'br' // Corners
  | 't' | 'b' | 'l' | 'r'    // Edges
  | 'rotate'                 // Rotate handle
  | 'radius';                // Corner-radius adjustment handle (specific to rects)

export type EditMode =
  | { type: 'idle' }
  | { type: 'dragging_canvas' }
  | { type: 'creating_shape'; startX: number; startY: number }
  | { type: 'transforming'; handle: TransformHandle; startX: number; startY: number; initialObjectState: CanvasObject }
  | { type: 'painting'; bufferCanvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; activeBitmapId: string }
  | { type: 'pen_drawing'; pathId: string }
  | { type: 'editing_text'; objectId: string }
  | { type: 'moving_objects'; startX: number; startY: number; initialPositions: { id: string; x: number; y: number }[] };

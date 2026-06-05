/**
 * Pyrotechnics Macro Runner
 *
 * Parses and executes JSON macro documents against the current Document state.
 * Designed to be driven by AI-generated JSON (from ChatGPT, Claude, Gemini, etc.)
 * without any embedded AI—the app only runs the macro, never generates it.
 *
 * JSON Schema version: 1.0
 */

import type { Document, CanvasObject, Layer, State } from '../types';

// ─────────────────────────────────────────────
// Macro JSON Schema Types
// ─────────────────────────────────────────────

export type MacroCommand =
  | SetCanvasCommand
  | ClearCanvasCommand
  | AddRectCommand
  | AddEllipseCommand
  | AddLineCommand
  | AddTextCommand
  | AddSliceCommand
  | AddStateCommand
  | ClearAllStatesCommand;

export interface SetCanvasCommand {
  command: 'set_canvas';
  width: number;
  height: number;
  /** Optional display name for the page */
  name?: string;
}

export interface ClearCanvasCommand {
  command: 'clear_canvas';
}

export interface AddRectCommand {
  command: 'add_rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;        // Hex color e.g. "#3b82f6", or "none"
  stroke?: string;      // Hex color e.g. "#ffffff"
  strokeWidth?: number; // default 0
  rx?: number;          // corner radius, default 0
  opacity?: number;     // 0–100, default 100
  blendMode?: string;   // CSS blend mode, default "source-over"
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface AddEllipseCommand {
  command: 'add_ellipse';
  /** Center X */
  cx: number;
  /** Center Y */
  cy: number;
  /** Horizontal radius */
  rx: number;
  /** Vertical radius */
  ry: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  blendMode?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface AddLineCommand {
  command: 'add_line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  blendMode?: string;
  arrowStart?: boolean;
  arrowEnd?: boolean;
}

export interface AddTextCommand {
  command: 'add_text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize?: number;        // default 24
  fontFamily?: string;      // default "Outfit"
  fill?: string;            // default "#ffffff"
  fontWeight?: 'normal' | 'bold';   // default "normal"
  fontStyle?: 'normal' | 'italic';  // default "normal"
  textAlign?: 'left' | 'center' | 'right'; // default "left"
  opacity?: number;
  blendMode?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
}

export interface AddSliceCommand {
  command: 'add_slice';
  x: number;
  y: number;
  width: number;
  height: number;
  name: string;
  format?: 'png' | 'jpeg' | 'svg'; // default "png"
  quality?: number;                 // 0–100, default 90
}



export interface AddStateCommand {
  command: 'add_state';
  name?: string;
  delay?: number;
}

export interface ClearAllStatesCommand {
  command: 'clear_all_states';
}

export interface PyrotechnicsMacro {
  /** Schema version - must be "1.0" */
  schema: '1.0';
  /** Optional title displayed in the macro runner */
  title?: string;
  /** Optional description of what this macro does */
  description?: string;
  /** Ordered list of commands to execute */
  commands: MacroCommand[];
}

// ─────────────────────────────────────────────
// Execution Result
// ─────────────────────────────────────────────

export interface MacroResult {
  success: boolean;
  message: string;
  /** Number of commands executed */
  executed: number;
  /** Total commands in the macro */
  total: number;
}

// ─────────────────────────────────────────────
// Helper: default values per object type
// ─────────────────────────────────────────────

function makeId(prefix: string): string {
  return `${prefix}-macro-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ─────────────────────────────────────────────
// Main Runner
// ─────────────────────────────────────────────

/**
 * Executes a PyrotechnicsMacro against the given Document.
 *
 * @param macro   - Parsed macro object (already validated)
 * @param doc     - Current document state (immutable reference)
 * @returns       - New document state after all commands applied
 */
export function runMacro(macro: PyrotechnicsMacro, doc: Document): Document {
  // Deep copy to avoid mutating the original
  const result: Document = JSON.parse(JSON.stringify(doc));

  const page = result.pages.find(p => p.id === result.currentPageId) || result.pages[0];
  if (!page) throw new Error('No active page found in document.');

  let activeState: State = page.states.find(s => s.id === result.currentStateId) || page.states[0];
  if (!activeState) throw new Error('No active state found on page.');

  // Ensure at least one layer exists
  if (activeState.layers.length === 0) {
    const defaultLayer: Layer = {
      id: makeId('layer'),
      name: 'Macro Layer',
      visible: true,
      locked: false,
      objects: []
    };
    activeState.layers.push(defaultLayer);
  }

  let activeLayer = activeState.layers[0];

  for (const cmd of macro.commands) {
    switch (cmd.command) {
      // ── SET CANVAS ──────────────────────────────
      case 'set_canvas': {
        page.width = Math.max(1, Math.round(cmd.width));
        page.height = Math.max(1, Math.round(cmd.height));
        if (cmd.name) page.name = cmd.name;
        break;
      }

      // ── CLEAR CANVAS ────────────────────────────
      case 'clear_canvas': {
        activeLayer.objects = [];
        break;
      }

      // ── ADD RECT ────────────────────────────────
      case 'add_rect': {
        const obj: CanvasObject = {
          type: 'rect',
          id: makeId('rect'),
          x: Math.round(cmd.x),
          y: Math.round(cmd.y),
          width: Math.max(1, Math.round(cmd.width)),
          height: Math.max(1, Math.round(cmd.height)),
          rx: Math.max(0, cmd.rx ?? 0),
          fill: cmd.fill ?? '#3b82f6',
          stroke: cmd.stroke ?? 'none',
          strokeWidth: Math.max(0, cmd.strokeWidth ?? 0),
          opacity: clamp(cmd.opacity ?? 100, 0, 100),
          blendMode: cmd.blendMode ?? 'source-over',
          shadowColor: cmd.shadowColor ?? 'transparent',
          shadowBlur: cmd.shadowBlur ?? 0,
          shadowOffsetX: cmd.shadowOffsetX ?? 0,
          shadowOffsetY: cmd.shadowOffsetY ?? 0,
        };
        activeLayer.objects.push(obj);
        break;
      }

      // ── ADD ELLIPSE ─────────────────────────────
      case 'add_ellipse': {
        const obj: CanvasObject = {
          type: 'ellipse',
          id: makeId('ellipse'),
          cx: Math.round(cmd.cx),
          cy: Math.round(cmd.cy),
          rx: Math.max(1, Math.round(cmd.rx)),
          ry: Math.max(1, Math.round(cmd.ry)),
          fill: cmd.fill ?? '#3b82f6',
          stroke: cmd.stroke ?? 'none',
          strokeWidth: Math.max(0, cmd.strokeWidth ?? 0),
          opacity: clamp(cmd.opacity ?? 100, 0, 100),
          blendMode: cmd.blendMode ?? 'source-over',
          shadowColor: cmd.shadowColor ?? 'transparent',
          shadowBlur: cmd.shadowBlur ?? 0,
          shadowOffsetX: cmd.shadowOffsetX ?? 0,
          shadowOffsetY: cmd.shadowOffsetY ?? 0,
        };
        activeLayer.objects.push(obj);
        break;
      }

      // ── ADD LINE ────────────────────────────────
      case 'add_line': {
        const obj: CanvasObject = {
          type: 'line',
          id: makeId('line'),
          x1: Math.round(cmd.x1),
          y1: Math.round(cmd.y1),
          x2: Math.round(cmd.x2),
          y2: Math.round(cmd.y2),
          stroke: cmd.stroke ?? '#ffffff',
          strokeWidth: Math.max(1, cmd.strokeWidth ?? 2),
          opacity: clamp(cmd.opacity ?? 100, 0, 100),
          blendMode: cmd.blendMode ?? 'source-over',
          shadowColor: 'transparent',
          shadowBlur: 0,
          shadowOffsetX: 0,
          shadowOffsetY: 0,
          arrowStart: cmd.arrowStart,
          arrowEnd: cmd.arrowEnd,
        };
        activeLayer.objects.push(obj);
        break;
      }

      // ── ADD TEXT ────────────────────────────────
      case 'add_text': {
        const obj: CanvasObject = {
          type: 'text',
          id: makeId('text'),
          x: Math.round(cmd.x),
          y: Math.round(cmd.y),
          width: Math.max(1, Math.round(cmd.width)),
          height: Math.max(1, Math.round(cmd.height)),
          text: cmd.text,
          fontSize: Math.max(8, cmd.fontSize ?? 24),
          fontFamily: cmd.fontFamily ?? 'Outfit',
          fill: cmd.fill ?? '#ffffff',
          fontWeight: cmd.fontWeight ?? 'normal',
          fontStyle: cmd.fontStyle ?? 'normal',
          textAlign: cmd.textAlign ?? 'left',
          opacity: clamp(cmd.opacity ?? 100, 0, 100),
          blendMode: cmd.blendMode ?? 'source-over',
          shadowColor: cmd.shadowColor ?? 'transparent',
          shadowBlur: cmd.shadowBlur ?? 0,
          shadowOffsetX: cmd.shadowOffsetX ?? 0,
          shadowOffsetY: cmd.shadowOffsetY ?? 0,
        };
        activeLayer.objects.push(obj);
        break;
      }

      // ── ADD SLICE ───────────────────────────────
      case 'add_slice': {
        const obj: CanvasObject = {
          type: 'slice',
          id: makeId('slice'),
          x: Math.round(cmd.x),
          y: Math.round(cmd.y),
          width: Math.max(1, Math.round(cmd.width)),
          height: Math.max(1, Math.round(cmd.height)),
          name: cmd.name.replace(/[^a-zA-Z0-9_-]/g, '_'),
          format: cmd.format ?? 'png',
          quality: clamp(cmd.quality ?? 90, 1, 100),
        };
        activeLayer.objects.push(obj);
        break;
      }

      // ── ADD STATE ───────────────────────────────
      case 'add_state': {
        const newStateId = makeId('state');
        const newState: State = {
          id: newStateId,
          name: cmd.name ?? `State ${page.states.length + 1}`,
          delay: Math.max(10, cmd.delay ?? 100),
          layers: [
            {
              id: makeId('layer'),
              name: 'Layer 1',
              visible: true,
              locked: false,
              objects: []
            }
          ]
        };
        page.states.push(newState);
        activeState = newState;
        activeLayer = newState.layers[0];
        break;
      }

      // ── CLEAR ALL STATES ────────────────────────
      case 'clear_all_states': {
        const defaultStateId = makeId('state');
        const defaultState: State = {
          id: defaultStateId,
          name: 'State 1',
          delay: 100,
          layers: [
            {
              id: makeId('layer'),
              name: 'Layer 1',
              visible: true,
              locked: false,
              objects: []
            }
          ]
        };
        page.states = [defaultState];
        result.currentStateId = defaultStateId;
        activeState = defaultState;
        activeLayer = defaultState.layers[0];
        break;
      }



      default: {
        // Unknown command – skip silently (forward-compatible)
        console.warn('[MacroRunner] Unknown command:', (cmd as any).command);
      }
    }
  }

  // Ensure currentStateId points to a valid existing state
  if (!page.states.some(s => s.id === result.currentStateId)) {
    result.currentStateId = page.states[0]?.id || '';
  }

  return result;
}

/**
 * Parses and validates a raw JSON string or Base64 encoded string as a PyrotechnicsMacro.
 * Cleans markdown code blocks, comments, trailing commas, and Unicode spaces.
 * Returns the macro or throws a descriptive error.
 */
export function parseMacro(jsonString: string): PyrotechnicsMacro {
  let cleaned = jsonString.trim();

  // Normalize Unicode spaces (non-breaking spaces, full-width spaces, zero-width spaces)
  cleaned = cleaned.replace(/[\u00a0\u200b\u3000]/g, ' ');

  // Strip markdown code fences if present (e.g. ```json ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\s*/, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    cleaned = cleaned.trim();
  }

  // Detect if the pasted string is Base64 (or URL-encoded Base64) instead of raw JSON
  if (cleaned && !cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    try {
      let decoded = atob(cleaned);
      // If it contains percentage signs, it is likely URL-encoded
      if (decoded.includes('%')) {
        decoded = decodeURIComponent(decoded);
      }
      const decodedTrimmed = decoded.trim();
      if (decodedTrimmed.startsWith('{') || decodedTrimmed.startsWith('[')) {
        cleaned = decodedTrimmed;
      }
    } catch {
      // If it's not base64 or decoding fails, keep the original cleaned string
    }
  }

  // Clean JS-style comments and trailing commas to prevent parse errors
  let jsonForParsing = cleaned;
  try {
    // Strip multi-line comments /* ... */
    jsonForParsing = jsonForParsing.replace(/\/\*[\s\S]*?\*\//g, '');
    // Strip single-line comments // ... (ignoring double slashes inside URLs)
    jsonForParsing = jsonForParsing
      .split('\n')
      .map(line => {
        const doubleSlashIndex = line.indexOf('//');
        if (doubleSlashIndex === -1) return line;
        const before = line.substring(0, doubleSlashIndex);
        const quoteCount = (before.match(/"/g) || []).length;
        if (quoteCount % 2 === 0) {
          return before;
        }
        return line;
      })
      .join('\n');

    // Strip trailing commas before closing braces/brackets
    jsonForParsing = jsonForParsing.replace(/,\s*([\]}])/g, '$1');
  } catch {
    jsonForParsing = cleaned;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonForParsing);
  } catch (e) {
    throw new Error(`JSON parse error: ${(e as Error).message}\nPlease ensure the pasted JSON macro is valid.`);
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Macro root must be an object.');
  }

  const obj = parsed as Record<string, unknown>;

  if (obj.schema !== '1.0') {
    throw new Error(`"schema" must be "1.0". Got: ${JSON.stringify(obj.schema)}`);
  }

  if (!Array.isArray(obj.commands)) {
    throw new Error('"commands" field must be an array.');
  }

  for (let i = 0; i < obj.commands.length; i++) {
    const cmd = obj.commands[i] as Record<string, unknown>;
    if (typeof cmd?.command !== 'string') {
      throw new Error(`commands[${i}]: "command" field must be a string.`);
    }
  }

  return parsed as PyrotechnicsMacro;
}

// Hermes Extension Messaging Protocol

export type MessageType =
  | 'PING'
  | 'PONG'
  | 'INSPECT_PAGE'
  | 'PAGE_STATE'
  | 'EXECUTE_ACTION'
  | 'ACTION_RESULT'
  | 'GET_STATE'
  | 'SET_ACTIVE_TAB'
  | 'ERROR';

export interface HermesMessage {
  type: MessageType;
  payload: unknown;
  source: 'content' | 'background' | 'sidepanel';
  timestamp: number;
}

export interface InspectPageMessage extends HermesMessage {
  type: 'INSPECT_PAGE';
  payload: {};
}

export interface PageStateMessage extends HermesMessage {
  type: 'PAGE_STATE';
  payload: BrowserState;
}

export interface ExecuteActionMessage extends HermesMessage {
  type: 'EXECUTE_ACTION';
  payload: ActionRequest;
}

export interface ActionResultMessage extends HermesMessage {
  type: 'ACTION_RESULT';
  payload: ActionResult;
}

export interface ErrorMessage extends HermesMessage {
  type: 'ERROR';
  payload: { message: string; details?: unknown };
}

// Browser State Schema
export interface BrowserState {
  page: PageInfo;
  elements: HermesElement[];
  metadata: StateMetadata;
}

export interface PageInfo {
  title: string;
  url: string;
  domain: string;
}

export interface StateMetadata {
  extractedAt: number;
  elementCount: number;
  url: string;
}

// Hermes Element Schema
export interface HermesElement {
  id: string;
  role: ElementRole;
  label: string;
  tag: string;
  bbox?: BoundingBox;
  visible: boolean;
  sensitive: boolean;
  attributes: Record<string, string>;
}

export type ElementRole =
  | 'button'
  | 'textbox'
  | 'select'
  | 'link'
  | 'form'
  | 'checkbox'
  | 'radio'
  | 'image'
  | 'heading'
  | 'text'
  | 'other';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Action Protocol
export interface ActionRequest {
  action: ActionType;
  target?: string;
  params?: Record<string, unknown>;
}

export type ActionType =
  | 'click'
  | 'type'
  | 'scroll'
  | 'select'
  | 'hover'
  | 'navigate'
  | 'wait'
  | 'press_key';

export interface ActionResult {
  success: boolean;
  action: ActionType;
  target?: string;
  error?: string;
  timestamp: number;
}

// Helper to create messages
export function createMessage<T extends MessageType>(
  type: T,
  source: HermesMessage['source'],
  payload: unknown
): HermesMessage {
  return {
    type,
    payload,
    source,
    timestamp: Date.now(),
  };
}

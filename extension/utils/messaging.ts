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
  | 'ERROR'
  // Perception types
  | 'PERCEIVE'
  | 'PERCEPTION_RESULT'
  | 'CAPTURE_SCREENSHOT'
  | 'SCREENSHOT_RESULT'
  | 'ENSURE_OFFSCREEN'
  | 'OFFSCREEN_STATUS'
  | 'INIT_MODELS'
  | 'MODELS_STATUS'
  | 'OFFSCREEN_PING'
  | 'OFFSCREEN_PONG'
  | 'OFFSCREEN_INIT'
  | 'OFFSCREEN_CLASSIFY'
  | 'OFFSCREEN_DETECT'
  | 'OFFSCREEN_OCR'
  | 'OFFSCREEN_EMBED'
  | 'OFFSCREEN_PERCEIVE'
  | 'OCR_RESULT'
  // Privacy types
  | 'SANITIZE'
  | 'SANITIZE_RESULT'
  // Agent types
  | 'STOP_AGENT';

export interface HermesMessage {
  type: MessageType;
  payload: unknown;
  source: 'content' | 'background' | 'sidepanel' | 'offscreen';
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
  confidence?: number;
  sources?: ('dom' | 'vision')[];
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

// Perception Types
export interface PerceptionResult {
  classification: ClassificationResult[];
  detection: DetectedElement[];
  ocr?: OCRResult;
  fusion?: FusionResult;
  device?: string;
  elapsed?: number;
  timestamp: number;
}

export interface OCRResult {
  fullText: string;
  textBlocks: OCRTextBlock[];
  confidence: number;
}

export interface OCRTextBlock {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface ClassificationResult {
  label: string;
  score: number;
}

export interface DetectedElement {
  label: string;
  score: number;
  bbox: BoundingBox;
}

export interface FusionResult {
  fused: FusedElement[];
  domOnly: HermesElement[];
  visionOnly: DetectedElement[];
  stats: {
    total: number;
    fused: number;
    domOnly: number;
    visionOnly: number;
    avgConfidence: number;
  };
}

export interface FusedElement extends HermesElement {
  sources: ('dom' | 'vision')[];
  domElement?: HermesElement;
  visionElement?: DetectedElement;
  fusionConfidence: number;
}

// ─── Privacy Engine Types ──────────────────────────────────────

/** Data type detected by the detection cascade */
export type DataType =
  | 'password'
  | 'pin'
  | 'credit_card'
  | 'debit_card'
  | 'bank_account'
  | 'cvv'
  | 'card_expiry'
  | 'pan_number'
  | 'aadhaar_number'
  | 'ssn'
  | 'passport_number'
  | 'api_key'
  | 'medical_record'
  | 'mfa_code'
  | 'hidden_field'
  | 'email'
  | 'phone'
  | 'address_line'
  | 'ifsc_code'
  | 'upi_id'
  | 'insurance_id'
  | 'otp'
  | 'security_question'
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'date_of_birth'
  | 'gender'
  | 'zip_code'
  | 'product_name'
  | 'price'
  | 'date'
  | 'time'
  | 'location_name'
  | 'category'
  | 'rating'
  | 'quantity'
  | 'search_query'
  | 'url'
  | 'page_title'
  | 'button_label'
  | 'navigation_text'
  | 'unknown';

/** Sensitivity level (0 = public, 4 = never transmit) */
export type SensitivityLevel = 0 | 1 | 2 | 3 | 4;

/** Task relevance classification */
export type Relevance = 'RELEVANT' | 'CONDITIONAL' | 'NEVER';

/** Treatment applied by the redactor */
export type Treatment = 'pass' | 'pseudonymize' | 'redact' | 'omit' | 'protective_proxy';

/** Result of the detection cascade for one element */
export interface DetectionResult {
  dataType: DataType;
  confidence: number;
  source: string; // which cascade step matched (e.g., 'autocomplete', 'type', 'aria-label')
}

/** Result of sensitivity classification */
export interface SensitivityResult {
  dataType: DataType;
  level: SensitivityLevel;
  confidence: number;
}

/** Result of task relevance assessment */
export interface TaskRelevanceResult {
  relevance: Relevance;
  reason: string;
}

/** A sanitized element ready to send to the server */
export interface SanitizedElement {
  id: string;
  role: ElementRole;
  label: string;
  value?: string;           // redacted/pseudonymized value (or undefined if omitted)
  originalDataType?: DataType;
  sensitivity: SensitivityLevel;
  relevance: Relevance;
  treatment: Treatment;
  status?: 'pre-filled' | 'empty' | 'user-provided'; // for protective proxy
  visible?: boolean;
  bbox?: BoundingBox;
}

/** Complete sanitized state sent to the server */
export interface SanitizedState {
  elements: SanitizedElement[];
  task: string;
  pageInfo: PageInfo;
  stats: {
    total: number;
    passed: number;
    pseudonymized: number;
    redacted: number;
    omitted: number;
    protected: number;
  };
}

/** Request to sanitize browser state */
export interface SanitizeRequest {
  browserState: BrowserState;
  task: string;
  mode?: 'standard' | 'strict' | 'local-only';
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

export const MESSAGE_TYPES = {
  GET_BODY: "GET_BODY",
  POST_COLORS: "POST_COLORS",
  CLEAR_BOXES: "CLEAR_BOXES",
} as const;

export type MessageTypes = keyof typeof MESSAGE_TYPES;

export type RequestMessage = DOMMessage | PostColorsMessage;

export type DOMMessage = {
  type: MessageTypes;
};

export type PostColorsMessage = {
  type: typeof MESSAGE_TYPES.POST_COLORS;
  colors: Array<string>;
};

export type PostColorsMessageResponse = {
  status: StatusResponse;
};

type DOMMessageResponse = {
  title: string;
  body: string; // Changed from HTMLElement to string for serialization
  status: StatusResponse;
};

export const STATUS_RESPONSE = {
  ERROR: "error",
  SUCCESS: "success",
  INFO: "info",
} as const;

export type StatusResponse =
  (typeof STATUS_RESPONSE)[keyof typeof STATUS_RESPONSE];

type GetResponse = DOMMessageResponse;

type PostResponse = PostColorsMessageResponse;

export type ContentMessageResponse = {
  message: GetResponse | PostResponse;
};

// New types for useReducer
export interface MiddlewareState {
  isLoading: boolean;
  error: string | undefined;
  lastResponse: ContentMessageResponse | undefined;
  colorBoxes: Array<{
    id: string;
    color: string;
    element: HTMLElement;
  }>;
}

export const ACTION_TYPES = {
  SET_LOADING: "SET_LOADING",
  SET_ERROR: "SET_ERROR",
  SET_SUCCESS: "SET_SUCCESS",
  ADD_COLOR_BOX: "ADD_COLOR_BOX",
  REMOVE_COLOR_BOX: "REMOVE_COLOR_BOX",
  CLEAR_COLOR_BOXES: "CLEAR_COLOR_BOXES",
  SET_RESPONSE: "SET_RESPONSE",
} as const;

export type ActionTypes = keyof typeof ACTION_TYPES;

export interface MiddlewareAction {
  type: ActionTypes;
  payload?: unknown;
}

export interface SetLoadingAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.SET_LOADING;
  payload: boolean;
}

export interface SetErrorAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.SET_ERROR;
  payload: string;
}

export interface SetSuccessAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.SET_SUCCESS;
  payload: ContentMessageResponse;
}

export interface AddColorBoxAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.ADD_COLOR_BOX;
  payload: {
    id: string;
    color: string;
    element: HTMLElement;
  };
}

export interface RemoveColorBoxAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.REMOVE_COLOR_BOX;
  payload: string; // id
}

export interface ClearColorBoxesAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.CLEAR_COLOR_BOXES;
}

export interface SetResponseAction extends MiddlewareAction {
  type: typeof ACTION_TYPES.SET_RESPONSE;
  payload: ContentMessageResponse;
}

export type MiddlewareActions =
  | SetLoadingAction
  | SetErrorAction
  | SetSuccessAction
  | AddColorBoxAction
  | RemoveColorBoxAction
  | ClearColorBoxesAction
  | SetResponseAction;

import { useReducer, useCallback } from "react";
import type {
  ContentMessageResponse,
  PostColorsMessage,
  RequestMessage,
  MiddlewareState,
  MiddlewareActions,
  DOMMessage,
} from "./middleware.types";
import {
  MESSAGE_TYPES,
  ACTION_TYPES,
  STATUS_RESPONSE,
} from "./middleware.types";

const initialState: MiddlewareState = {
  isLoading: false,
  error: undefined,
  lastResponse: undefined,
  colorBoxes: [],
};

/**
 * Reducer function for managing middleware state updates.
 * Handles all state transitions for loading states, errors, responses, and color box management.
 *
 * @param state - The current middleware state
 * @param action - The action to process, containing type and optional payload
 * @returns The new state after applying the action
 */
function middlewareReducer(
  state: MiddlewareState,
  action: MiddlewareActions
): MiddlewareState {
  switch (action.type) {
    case ACTION_TYPES.SET_LOADING: {
      return {
        ...state,
        isLoading: action.payload,
        error: action.payload ? undefined : state.error,
      };
    }

    case ACTION_TYPES.SET_ERROR: {
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    }

    case ACTION_TYPES.SET_SUCCESS: {
      return {
        ...state,
        isLoading: false,
        error: undefined,
        lastResponse: action.payload,
      };
    }

    case ACTION_TYPES.ADD_COLOR_BOX: {
      return {
        ...state,
        colorBoxes: [...state.colorBoxes, action.payload],
      };
    }

    case ACTION_TYPES.REMOVE_COLOR_BOX: {
      return {
        ...state,
        colorBoxes: state.colorBoxes.filter((box) => box.id !== action.payload),
      };
    }

    case ACTION_TYPES.CLEAR_COLOR_BOXES: {
      return {
        ...state,
        colorBoxes: [],
      };
    }

    case ACTION_TYPES.SET_RESPONSE: {
      return {
        ...state,
        lastResponse: action.payload,
      };
    }

    default: {
      return state;
    }
  }
}

/**
 * Custom hook that provides middleware state management and actions.
 * Uses useReducer to manage complex state transitions and provides memoized action functions.
 *
 * @returns An object containing:
 *   - state: Current middleware state
 *   - actions: Memoized action functions for state updates
 *   - handleMessage: Function to process incoming Chrome extension messages
 */
export function useMiddlewareReducer() {
  const [state, dispatch] = useReducer(middlewareReducer, initialState);

  /**
   * Sets the loading state of the middleware.
   *
   * @param isLoading - Whether the middleware is currently processing a request
   */
  const setLoading = useCallback((isLoading: boolean) => {
    dispatch({ type: ACTION_TYPES.SET_LOADING, payload: isLoading });
  }, []);

  /**
   * Sets an error state in the middleware.
   *
   * @param error - The error message to display
   */
  const setError = useCallback((error: string) => {
    dispatch({ type: ACTION_TYPES.SET_ERROR, payload: error });
  }, []);

  /**
   * Sets a successful response state in the middleware.
   *
   * @param response - The successful response data
   */
  const setSuccess = useCallback((response: ContentMessageResponse) => {
    dispatch({ type: ACTION_TYPES.SET_SUCCESS, payload: response });
  }, []);

  /**
   * Adds a new color box to the page and tracks it in state.
   *
   * @param id - Unique identifier for the color box
   * @param color - CSS color value for the box background
   * @param element - The DOM element representing the color box
   */
  const addColorBox = useCallback(
    (id: string, color: string, element: HTMLElement) => {
      dispatch({
        type: ACTION_TYPES.ADD_COLOR_BOX,
        payload: { id, color, element },
      });
    },
    []
  );

  /**
   * Removes a color box from the page and state by its ID.
   *
   * @param id - The unique identifier of the color box to remove
   */
  const removeColorBox = useCallback((id: string) => {
    dispatch({ type: ACTION_TYPES.REMOVE_COLOR_BOX, payload: id });
  }, []);

  /**
   * Clears all color boxes from both the page and state.
   */
  const clearColorBoxes = useCallback(() => {
    dispatch({ type: ACTION_TYPES.CLEAR_COLOR_BOXES });
  }, []);

  /**
   * Handles incoming Chrome extension messages and processes them according to their type.
   * This function serves as the main message handler for content script communication.
   *
   * @param message - The incoming message from the Chrome extension
   * @param sender - Information about the sender of the message
   * @param sendResponse - Callback function to send a response back to the sender
   *
   * Supported message types:
   * - GET_BODY: Retrieves the current page's title and body content
   * - POST_COLORS: Creates color boxes on the page with specified colors
   * - CLEAR_BOXES: Removes all color boxes from the page
   */
  const handleMessage = useCallback(
    (
      message: RequestMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response: ContentMessageResponse) => void
    ): void => {
      console.log(
        `[content.js]. Message received ${message.type}, from ${sender.url}`
      );

      setLoading(true);

      let response: ContentMessageResponse = {
        message: {
          status: STATUS_RESPONSE.ERROR,
        },
      };

      try {
        switch (message.type) {
          case MESSAGE_TYPES.GET_BODY: {
            try {
              const title = document.title || "No title";
              const body = document.body
                ? document.body.innerHTML
                : "No body content";

              response = {
                message: {
                  title,
                  body,
                  status: STATUS_RESPONSE.SUCCESS,
                },
              };
            } catch (error) {
              console.error("[middleware]. Error getting body:", error);
              response = {
                message: {
                  title: "Error",
                  body: "Failed to retrieve page content",
                  status: STATUS_RESPONSE.ERROR,
                },
              };
            }
            break;
          }

          case MESSAGE_TYPES.POST_COLORS: {
            const requestMessage = message as PostColorsMessage;
            const colors = requestMessage.colors;

            clearColorBoxes();

            if (colors.length > 0) {
              for (const [index, color] of colors.entries()) {
                const box = document.createElement("div");
                box.style.backgroundColor = color;
                box.style.position = "fixed";
                box.style.top = "64px";
                box.style.left = `${64 + index * 8 + index * 32}px`;
                box.style.width = "32px";
                box.style.height = "32px";
                box.style.zIndex = "200";
                box.className = "extension-color-box";

                document.body.append(box);

                const boxId = `color-box-${Date.now()}-${index}`;
                addColorBox(boxId, color, box);
              }
            }

            response = {
              message: {
                status: STATUS_RESPONSE.SUCCESS,
              },
            };
            break;
          }

          case MESSAGE_TYPES.CLEAR_BOXES: {
            const existingBoxes = document.querySelectorAll(
              ".extension-color-box"
            );

            // eslint-disable-next-line unicorn/no-array-for-each
            existingBoxes.forEach((box) => {
              try {
                box.remove();
              } catch (error) {
                console.error("[content.js]. Error removing color box:", error);
              }
            });

            clearColorBoxes();

            response = {
              message: {
                status: STATUS_RESPONSE.SUCCESS,
              },
            };
            break;
          }

          default: {
            throw new Error(
              `Unknown message type: ${(message as DOMMessage).type}`
            );
          }
        }

        setSuccess(response);
        console.log("[content.js]. Message response", response);
        sendResponse(response);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error occurred";
        setError(errorMessage);

        response = {
          message: {
            status: STATUS_RESPONSE.ERROR,
          },
        };

        console.error("[content.js]. Error processing message:", error);
        sendResponse(response);
      }
    },
    [setLoading, setError, setSuccess, addColorBox, clearColorBoxes]
  );

  return {
    state,
    actions: {
      setLoading,
      setError,
      setSuccess,
      addColorBox,
      removeColorBox,
      clearColorBoxes,
    },
    handleMessage,
  };
}

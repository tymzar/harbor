import {
  MESSAGE_TYPES,
  STATUS_RESPONSE,
} from "./modules/middleware/middleware.types";
import type {
  ContentMessageResponse,
  DOMMessage,
  PostColorsMessage,
  RequestMessage,
} from "./modules/middleware/middleware.types";

console.log("Content script works!");
console.log("You need to reload extension to observe changes.");

// Store references to color boxes for cleanup
let colorBoxes: HTMLElement[] = [];

// Simple message handler without React dependencies
function handleMessage(
  message: RequestMessage,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: ContentMessageResponse) => void
): void {
  console.log(
    `[content.js]. Message received ${message.type}, from ${sender.url}`
  );

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
          console.error("[content.js]. Error getting body:", error);
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

        // Clear existing color boxes first
        clearExistingBoxes();

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
            box.className = "extension-color-box"; // Add class for easy identification

            document.body.append(box);
            colorBoxes.push(box); // Store reference for cleanup
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
        clearExistingBoxes();
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

    console.log("[content.js]. Message response", response);
    sendResponse(response);
  } catch (error) {
    response = {
      message: {
        status: STATUS_RESPONSE.ERROR,
      },
    };

    console.error("[content.js]. Error processing message:", error);
    sendResponse(response);
  }
}

// Helper function to clear existing color boxes
function clearExistingBoxes(): void {
  // Remove boxes by class name
  const existingBoxes = document.querySelectorAll(".extension-color-box");

  // eslint-disable-next-line unicorn/no-array-for-each
  existingBoxes.forEach((box) => {
    try {
      box.remove();
    } catch (error) {
      console.error("[content.js]. Error removing color box:", error);
    }
  });

  // Clear the array
  colorBoxes = [];

  console.log("[content.js]. Cleared color boxes");
}

/**
 * Fired when a message is sent from either an extension process or a content script.
 */
chrome.runtime.onMessage.addListener(handleMessage);

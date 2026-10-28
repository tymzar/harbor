import React, { useEffect, useState } from "react";
import { MESSAGE_TYPES } from "../content/modules/middleware/middleware.types";
import {
  MiddlewareProvider,
  useMiddleware,
} from "../content/modules/middleware";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Chip,
} from "@heroui/react";
import { Icon } from "@iconify/react";

// Component that demonstrates middleware usage
function MiddlewareDemo(): JSX.Element {
  const { state, actions } = useMiddleware();

  const handleSendColors = () => {
    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00"];

    // Send message to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            type: MESSAGE_TYPES.POST_COLORS,
            colors,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error sending colors:", chrome.runtime.lastError);
              actions.setError(
                "Failed to send colors: " + chrome.runtime.lastError.message
              );
            } else if (response) {
              console.log("Colors sent successfully:", response);
              actions.setSuccess(response);
            }
          }
        );
      } else {
        actions.setError("No active tab found");
      }
    });
  };

  const handleGetBody = () => {
    // Send message to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            type: MESSAGE_TYPES.GET_BODY,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error getting body:", chrome.runtime.lastError);
              actions.setError(
                "Failed to get body: " + chrome.runtime.lastError.message
              );
            } else if (response) {
              console.log("Body retrieved successfully:", response);
              actions.setSuccess(response);
            }
          }
        );
      } else {
        actions.setError("No active tab found");
      }
    });
  };

  const handleClearBoxes = () => {
    // Send message to active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(
          tabs[0].id,
          {
            type: MESSAGE_TYPES.CLEAR_BOXES,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("Error clearing boxes:", chrome.runtime.lastError);
              actions.setError(
                "Failed to clear boxes: " + chrome.runtime.lastError.message
              );
            } else if (response) {
              console.log("Boxes cleared successfully:", response);
              actions.setSuccess(response);
            }
          }
        );
      } else {
        actions.setError("No active tab found");
      }
    });
  };

  return (
    <Card className="my-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
      <CardHeader>
        <div className="flex flex-col justify-center gap-2">
          <div className="flex items-center gap-2">
            <Icon
              icon="mdi:code-braces"
              width={24}
              className=" text-blue-600 dark:text-blue-400"
            />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
              Middleware Demo
            </h3>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Open a web page first, then try the buttons
          </div>
        </div>
      </CardHeader>
      <Divider className="bg-blue-200 dark:bg-blue-700" />
      <CardBody>
        <div className="space-y-3">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            <strong>State:</strong> Loading: {state.isLoading ? "Yes" : "No"} |
            Error: {state.error || "None"} | Color Boxes:{" "}
            {state.colorBoxes.length}
          </div>

          {state.error && (
            <div className="text-xs text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded">
              <strong>Error:</strong> {state.error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              color="primary"
              variant="flat"
              onPress={handleSendColors}
            >
              Send Colors
            </Button>
            <Button
              size="sm"
              color="secondary"
              variant="flat"
              onPress={handleGetBody}
            >
              Get Body
            </Button>
            <Button
              size="sm"
              color="danger"
              variant="flat"
              onPress={handleClearBoxes}
            >
              Clear Boxes
            </Button>
          </div>

          {state.lastResponse && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <strong>Last Response:</strong>{" "}
              {JSON.stringify(state.lastResponse.message.status)}
              {"title" in state.lastResponse.message && (
                <div className="mt-1">
                  <strong>Page Title:</strong>{" "}
                  {state.lastResponse.message.title}
                </div>
              )}
              {"body" in state.lastResponse.message && (
                <div className="mt-1">
                  <strong>Body Length:</strong>{" "}
                  {state.lastResponse.message.body.length} characters
                </div>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function PopupContent(): JSX.Element {
  const [elementsLimit, setElementsLimit] = useState(1);
  const [elements, setElements] = useState<Array<string>>([]);

  useEffect(() => {
    chrome.storage.sync.get(["maxLength", "elements"], function (result) {
      const limit = result.maxLength ?? 1;
      const storageElements = result.elements ?? [];

      setElementsLimit(limit);
      setElements(storageElements);
    });

    // Listen for storage changes
    const handleStorageChange = (changes: {
      [key: string]: chrome.storage.StorageChange;
    }) => {
      console.log("Popup: Storage change detected:", changes);

      // Handle elements changes
      if (changes.elements) {
        console.log("Popup: Elements changed to:", changes.elements.newValue);
        const newElements = changes.elements.newValue ?? [];
        setElements(newElements);
      }

      // Handle maxLength changes
      if (changes.maxLength) {
        console.log(
          "Popup: Max length changed to:",
          changes.maxLength.newValue
        );
        const newLimit = changes.maxLength.newValue ?? 1;
        setElementsLimit(newLimit);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    console.log("Popup: Storage listener added");

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
      console.log("Popup: Storage listener removed");
    };
  }, []);

  const addElement = () => {
    if (elements.length >= elementsLimit) {
      console.log("Element limit reached");
      return;
    }

    const newElement = `Element ${elements.length + 1}`;
    const newElements = [...elements, newElement];

    chrome.storage.sync.set({ elements: newElements }, function () {
      setElements(newElements);
      console.log("Element added successfully");
    });
  };

  const clearElements = () => {
    chrome.storage.sync.set({ elements: [] }, function () {
      setElements([]);
      console.log("Elements cleared");
    });
  };

  return (
    <div className="h-full p-4">
      <Card className="w-full bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardHeader className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Icon
              icon="mdi:extension"
              className="text-2xl text-blue-600 dark:text-blue-400"
            />
            <h3
              className="text-lg font-semibold text-gray-800 dark:text-white"
              data-testid="extension-popup-title"
            >
              Extension Popup
            </h3>
          </div>
          <Button
            isIconOnly
            color="primary"
            variant="light"
            aria-label="Settings"
            onPress={() => {
              chrome.runtime.openOptionsPage();
            }}
          >
            <Icon icon="mdi:cog" className="text-lg" />
          </Button>
        </CardHeader>

        <Divider className="bg-gray-200 dark:bg-gray-700" />

        <CardBody>
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Icon
                icon="mdi:information-outline"
                className="text-blue-500 dark:text-blue-400"
              />
              <span>
                Currently can hold up to{" "}
                <strong className="text-gray-800 dark:text-white">
                  {elementsLimit}
                </strong>{" "}
                elements
              </span>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <Icon
                icon="mdi:database-outline"
                className="text-green-500 dark:text-green-400"
              />
              <span>
                Stored elements:{" "}
                <strong className="text-gray-800 dark:text-white">
                  {elements.length}
                </strong>
              </span>
            </div>

            {/* Elements List */}
            {elements.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Stored Elements:
                </div>
                <div className="flex flex-wrap gap-2">
                  {elements.map((element, index) => (
                    <Chip key={index} variant="flat" color="primary" size="sm">
                      {element}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                color="primary"
                variant="flat"
                className="flex-1"
                startContent={<Icon icon="mdi:plus" />}
                onPress={addElement}
                isDisabled={elements.length >= elementsLimit}
              >
                Add Element
              </Button>
              {elements.length > 0 && (
                <Button
                  color="danger"
                  variant="flat"
                  size="sm"
                  startContent={<Icon icon="mdi:delete" />}
                  onPress={clearElements}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardBody>
      </Card>
      <MiddlewareDemo />
    </div>
  );
}

export function Popup(): JSX.Element {
  return (
    <MiddlewareProvider>
      <PopupContent />
    </MiddlewareProvider>
  );
}

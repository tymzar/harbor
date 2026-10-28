import React, { createContext, useContext, useEffect } from "react";
import { useMiddlewareReducer } from "./middleware";
import type { MiddlewareState } from "./middleware.types";

/**
 * Context type definition for the middleware context.
 * Provides access to the middleware state and actions throughout the component tree.
 */
interface MiddlewareContextType {
  state: MiddlewareState;
  actions: ReturnType<typeof useMiddlewareReducer>["actions"];
}

const MiddlewareContext = createContext<MiddlewareContextType | undefined>(
  undefined
);

/**
 * React context provider component that manages middleware state and message handling.
 * Automatically detects whether it's running in an extension page or content script context
 * and sets up appropriate message listeners or senders.
 *
 * @param props - Component props
 * @param props.children - React children to be wrapped by the provider
 * @returns JSX element providing middleware context to children
 */
export function MiddlewareProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state, actions, handleMessage } = useMiddlewareReducer();

  useEffect(() => {
    const isExtensionPage =
      globalThis.location.protocol === "chrome-extension:";

    if (isExtensionPage) {
      console.log(
        "[MiddlewareProvider] Running in extension page, will send messages to active tab"
      );
    } else {
      console.log(
        "[MiddlewareProvider] Running in content script, listening for messages"
      );
      chrome.runtime.onMessage.addListener(handleMessage);

      return () => {
        chrome.runtime.onMessage.removeListener(handleMessage);
      };
    }
  }, [handleMessage]);

  return (
    <MiddlewareContext.Provider value={{ state, actions }}>
      {children}
    </MiddlewareContext.Provider>
  );
}

/**
 * Custom hook to access the middleware context.
 * Must be used within a MiddlewareProvider component.
 *
 * @returns The middleware context containing state and actions
 * @throws Error if used outside of a MiddlewareProvider
 */
export function useMiddleware() {
  const context = useContext(MiddlewareContext);
  if (!context) {
    throw new Error("useMiddleware must be used within a MiddlewareProvider");
  }
  return context;
}

import { useEffect, useState } from "react";

import type { Profile } from "../../shared/profile";
import { ONBOARDING_KEY, PROFILE_KEY } from "../../shared/profile";

// "done" once setup was finished or skipped; "editing" while the user retakes it.
export type OnboardingState = "done" | "editing" | undefined;

// The user's harbor and the onboarding state, live from chrome.storage.local. loaded is false until read.
export function useProfile() {
  const [state, setState] = useState<{ loaded: boolean; profile?: Profile; onboarding?: OnboardingState }>({ loaded: false });
  useEffect(() => {
    const read = () =>
      void chrome.storage.local
        .get([PROFILE_KEY, ONBOARDING_KEY])
        .then((stored) => setState({ loaded: true, profile: stored[PROFILE_KEY] as Profile | undefined, onboarding: stored[ONBOARDING_KEY] as OnboardingState }));
    read();
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && (PROFILE_KEY in changes || ONBOARDING_KEY in changes)) read();
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);
  return state;
}

export const editProfile = () => void chrome.storage.local.set({ [ONBOARDING_KEY]: "editing" });

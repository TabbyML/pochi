import { vscodeHost } from "@/lib/vscode";
import type { UserInfo } from "@getpochi/common/configuration";
import { useEffect, useRef, useState } from "react";

/**
 * Custom hook for handling token-based login with fallback UI
 * @param user - Current user info, used to detect successful login
 * @returns Object containing state and handlers for login fallback
 */
export const useTokenLogin = (user: UserInfo | undefined) => {
  const [showFallback, setShowFallback] = useState(false);
  const [userCode, setUserCode] = useState("");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleLoginClick = () => {
    // When user clicks, we start a timer.
    timerRef.current = setTimeout(() => {
      setShowFallback(true);
    }, 5000);
  };

  const handleUserCodeSubmit = () => {
    if (userCode) {
      vscodeHost.loginWithToken(userCode);
    }
  };

  const handleUserCodeChange = (value: string) => {
    setUserCode(value);
  };

  useEffect(() => {
    // if user is logged in, clear timer and hide fallback
    if (user) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setShowFallback(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [user]);

  return {
    showFallback,
    userCode,
    handleLoginClick,
    handleUserCodeSubmit,
    handleUserCodeChange,
  };
};

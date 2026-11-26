import { useState, useCallback } from "react";

/**
 * ConnectX Async Execution Hook
 * Provides status, data, and error state tracking for async operations.
 */
export function useAsync(asyncFunction) {
  const [status, setStatus] = useState("idle"); // idle | pending | success | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const execute = useCallback(
    async (...params) => {
      setStatus("pending");
      setError(null);
      try {
        const response = await asyncFunction(...params);
        setData(response);
        setStatus("success");
        return response;
      } catch (err) {
        setError(err);
        setStatus("error");
        throw err;
      }
    },
    [asyncFunction]
  );

  return {
    execute,
    status,
    data,
    error,
    isLoading: status === "pending",
    isSuccess: status === "success",
    isError: status === "error",
  };
}

export default useAsync;

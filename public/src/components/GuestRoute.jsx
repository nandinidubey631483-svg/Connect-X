import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import LoadingScreen from "./common/LoadingScreen";

/**
 * GuestRoute:
 * - Shows loading state during initial session verification
 * - Redirects authenticated users away from /login and /register (to / or intended destination)
 * - Renders children for unauthenticated visitors
 */
export default function GuestRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingScreen message="Checking session..." />;
  }

  if (isAuthenticated) {
    const destination = location.state?.from?.pathname || "/";
    return <Navigate to={destination} replace />;
  }

  return children;
}

/**
 * ConnectX useAuth Custom Hook
 * Provides ergonomic access to AuthContext.
 */
import { useAuthContext } from "../context/AuthContext";

export default function useAuth() {
  return useAuthContext();
}

export { useAuth };

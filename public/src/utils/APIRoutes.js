const defaultApiHost =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:5000"
    : (process.env.REACT_APP_API_URL || process.env.REACT_APP_SOCKET_URL || "https://connect-x-1div.onrender.com");

export const host =
  process.env.REACT_APP_API_URL ||
  process.env.REACT_APP_SOCKET_URL ||
  defaultApiHost;
export const loginRoute = `${host}/api/auth/login`;
export const registerRoute = `${host}/api/auth/register`;
export const logoutRoute = `${host}/api/auth/logout`;
export const allUsersRoute = `${host}/api/auth/allusers`;
export const sendMessageRoute = `${host}/api/messages/addmsg`;
export const recieveMessageRoute = `${host}/api/messages/getmsg`;
export const setAvatarRoute = `${host}/api/auth/setavatar`;

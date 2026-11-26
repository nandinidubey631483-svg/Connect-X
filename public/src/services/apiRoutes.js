/**
 * ConnectX Centralized API Route Dictionary
 * Preserves legacy routes while adding v1 endpoints and health check paths.
 */
export const host = process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || "http://localhost:5000";

// System Routes
export const healthRoute = `${host}/health`;
export const v1HealthRoute = `${host}/api/v1/health`;
export const pingRoute = `${host}/ping`;

// Phase 4 v1 Auth Routes
export const v1AuthRoute = `${host}/api/v1/auth`;
export const v1LoginRoute = `${v1AuthRoute}/login`;
export const v1RegisterRoute = `${v1AuthRoute}/register`;
export const v1RefreshRoute = `${v1AuthRoute}/refresh`;
export const v1LogoutRoute = `${v1AuthRoute}/logout`;
export const v1LogoutAllRoute = `${v1AuthRoute}/logout-all`;
export const v1CsrfRoute = `${v1AuthRoute}/csrf-token`;
export const v1MeRoute = `${v1AuthRoute}/me`;

// Phase 5 v1 Profile Routes
export const v1ProfileRoute = `${host}/api/v1/profile`;
export const v1MyProfileRoute = `${v1ProfileRoute}/me`;
export const v1UpdateAvatarRoute = `${v1ProfileRoute}/avatar`;
export const v1UserProfileRoute = (userId) => `${v1ProfileRoute}/${userId}`;

// Phase 5 v1 Settings Routes
export const v1SettingsRoute = `${host}/api/v1/settings`;
export const v1ResetSettingsRoute = `${v1SettingsRoute}/reset`;

// Phase 5 v1 Contacts & Social Graph Routes
export const v1ContactsRoute = `${host}/api/v1/contacts`;
export const v1SearchUsersRoute = `${v1ContactsRoute}/search`;
export const v1ContactRequestsRoute = `${v1ContactsRoute}/requests`;
export const v1SendContactRequestRoute = `${v1ContactsRoute}/request`;
export const v1AcceptContactRequestRoute = (requestId) => `${v1ContactsRoute}/request/${requestId}/accept`;
export const v1RejectContactRequestRoute = (requestId) => `${v1ContactsRoute}/request/${requestId}/reject`;
export const v1CancelContactRequestRoute = (requestId) => `${v1ContactsRoute}/request/${requestId}/cancel`;
export const v1RemoveContactRoute = (contactId) => `${v1ContactsRoute}/${contactId}`;

// Phase 5 v1 Conversation Routes
export const v1ConversationsRoute = `${host}/api/v1/conversations`;
export const v1CreateConversationRoute = v1ConversationsRoute;
export const v1ConversationRoute = (conversationId) => `${v1ConversationsRoute}/${conversationId}`;
export const v1ReadConversationRoute = (conversationId) => `${v1ConversationsRoute}/${conversationId}/read`;

// Phase 5 v1 Messaging Routes
export const v1MessagesRoute = `${host}/api/v1/messages`;
export const v1ConversationMessagesRoute = (conversationId) => `${v1MessagesRoute}/${conversationId}`;
export const v1MessageStatusRoute = `${v1MessagesRoute}/status`;
export const v1ConversationReadMessagesRoute = (conversationId) => `${v1MessagesRoute}/conversation/${conversationId}/read`;
export const v1MediaRoute = (messageId) => `${v1MessagesRoute}/media/${messageId}`;
export const v1UploadMediaRoute = `${v1MessagesRoute}/upload`;

// Phase 5 v1 Notifications Routes
export const v1NotificationsRoute = `${host}/api/v1/notifications`;
export const v1UnreadNotificationsCountRoute = `${v1NotificationsRoute}/unread-count`;
export const v1MarkAllNotificationsReadRoute = `${v1NotificationsRoute}/read-all`;
export const v1MarkNotificationReadRoute = (id) => `${v1NotificationsRoute}/${id}/read`;
export const v1DeleteNotificationRoute = (id) => `${v1NotificationsRoute}/${id}`;

// Module 11 v1 Calling Routes
export const v1CallsRoute = `${host}/api/v1/calls`;
export const v1CallIceServersRoute = `${v1CallsRoute}/ice-servers`;
export const v1InitiateCallRoute = `${v1CallsRoute}/initiate`;
export const v1CallDetailsRoute = (id) => `${v1CallsRoute}/${id}`;

// Legacy Auth Routes (Preserved for backward compatibility)
export const loginRoute = `${host}/api/auth/login`;
export const registerRoute = `${host}/api/auth/register`;
export const logoutRoute = `${host}/api/auth/logout`;
export const allUsersRoute = `${host}/api/auth/allusers`;
export const setAvatarRoute = `${host}/api/auth/setavatar`;

// Messaging Routes (Preserved for backward compatibility)
export const sendMessageRoute = `${host}/api/messages/addmsg`;
export const recieveMessageRoute = `${host}/api/messages/getmsg`;

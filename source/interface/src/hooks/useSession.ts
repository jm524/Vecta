// Status:: complete
// Hook for session state — active chat context, persistent messaging, and project scoping.
// Starts on a blank standalone chat on CLI launch. Officially creates a chat on disk when a message is sent.

import { useState, useRef, useCallback } from "react";
import { chatService, type ChatMetadata } from "../services/chat-service.js";
import type { ChatMessage } from "../components/Chat.js";

export interface UseSessionReturn {
  activeChatId: string | null;
  activeChat: ChatMetadata | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addMessage: (sender: string, text: string, color?: string) => void;
  selectChat: (chatId: string) => void;
  createAndSelectChat: (title?: string, projectId?: string | null) => ChatMetadata;
  startBlankChat: () => void;
  getActiveChatId: () => string | null;
  refreshSession: () => void;
}

export function useSession(getRoleColor?: (sender: string) => string): UseSessionReturn {
  // Whenever user enters the CLI, always start on a blank standalone chat
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<ChatMetadata | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const activeChatIdRef = useRef<string | null>(null);
  activeChatIdRef.current = activeChatId;

  // Refresh active session only if an official chat is currently open
  const refreshSession = useCallback(() => {
    const currentId = activeChatIdRef.current;
    if (currentId) {
      const loaded = chatService.getChat(currentId);
      if (loaded) {
        setActiveChat(loaded.meta);
        setMessages(loaded.messages);
      }
    }
  }, []);

  // Select and switch to an existing chat
  const selectChat = useCallback((chatId: string) => {
    const loaded = chatService.getChat(chatId);
    if (loaded) {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
      setActiveChat(loaded.meta);
      setMessages(loaded.messages);
    }
  }, []);

  // Reset to a blank standalone chat
  const startBlankChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    setActiveChat(null);
    setMessages([]);
  }, []);

  // Create and immediately activate a new chat
  const createAndSelectChat = useCallback(
    (title?: string, projectId?: string | null): ChatMetadata => {
      const newChat = chatService.createChat(title, projectId);
      activeChatIdRef.current = newChat.id;
      setActiveChatId(newChat.id);
      setActiveChat(newChat);
      setMessages([]);
      return newChat;
    },
    []
  );

  // Append a message to the active chat and persist to disk.
  // If the user is on a blank chat and sends a message, it officially becomes a chat!
  const addMessage = useCallback(
    (sender: string, text: string, color?: string) => {
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const resolvedColor =
        color ||
        (sender === "User"
          ? "yellow"
          : sender === "System"
          ? "cyan"
          : getRoleColor
          ? getRoleColor(sender)
          : "white");

      const newMsg: ChatMessage = {
        id: String(Date.now() + Math.random()),
        sender,
        text,
        color: resolvedColor,
        timestamp: time,
      };

      let currentId = activeChatIdRef.current;

      // When user sends their first message in a blank chat, officially create the chat on disk
      if (!currentId && sender === "User") {
        const titleSnippet = text.trim().replace(/[\r\n\s]+/g, " ");
        const title =
          titleSnippet.length > 36 ? titleSnippet.slice(0, 35) + "…" : titleSnippet || undefined;
        const newChat = chatService.createChat(title, null);
        currentId = newChat.id;
        activeChatIdRef.current = newChat.id;
        setActiveChatId(newChat.id);
        setActiveChat(newChat);
      }

      setMessages((prev) => {
        const updated = [...prev, newMsg];
        if (currentId) {
          chatService.saveChatMessages(currentId, updated);
        }
        return updated;
      });
    },
    [getRoleColor]
  );

  const getActiveChatId = useCallback(() => {
    return activeChatIdRef.current;
  }, []);

  return {
    activeChatId,
    activeChat,
    messages,
    setMessages,
    addMessage,
    selectChat,
    createAndSelectChat,
    startBlankChat,
    getActiveChatId,
    refreshSession,
  };
}

// Status:: complete
// Hook for session state — active chat context, persistent messaging, and project scoping.

import { useState, useEffect, useRef, useCallback } from "react";
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
  refreshSession: () => void;
}

export function useSession(getRoleColor?: (sender: string) => string): UseSessionReturn {
  const [initialData] = useState(() => {
    const existing = chatService.listChats();
    if (existing.length > 0) {
      const target = existing[0]!;
      const loaded = chatService.getChat(target.id);
      return {
        id: target.id,
        meta: target,
        messages: loaded?.messages || [],
      };
    }
    const created = chatService.createChat("New Session");
    return {
      id: created.id,
      meta: created,
      messages: [],
    };
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(initialData.id);
  const [activeChat, setActiveChat] = useState<ChatMetadata | null>(initialData.meta);
  const [messages, setMessages] = useState<ChatMessage[]>(initialData.messages);

  const activeChatIdRef = useRef<string | null>(initialData.id);
  activeChatIdRef.current = activeChatId;

  // Initialize or restore active session on launch
  const refreshSession = useCallback(() => {
    const existing = chatService.listChats();
    if (existing.length > 0) {
      const currentId = activeChatIdRef.current;
      const target = (currentId && existing.find((c) => c.id === currentId)) || existing[0]!;
      const loaded = chatService.getChat(target.id);
      setActiveChatId(target.id);
      setActiveChat(target);
      if (loaded) {
        setMessages(loaded.messages);
      }
    } else {
      const created = chatService.createChat("New Session");
      setActiveChatId(created.id);
      setActiveChat(created);
      setMessages([]);
    }
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Select and switch to an existing chat
  const selectChat = useCallback((chatId: string) => {
    const loaded = chatService.getChat(chatId);
    if (loaded) {
      setActiveChatId(chatId);
      setActiveChat(loaded.meta);
      setMessages(loaded.messages);
    }
  }, []);

  // Create and immediately activate a new chat
  const createAndSelectChat = useCallback(
    (title?: string, projectId?: string | null): ChatMetadata => {
      const newChat = chatService.createChat(title, projectId);
      setActiveChatId(newChat.id);
      setActiveChat(newChat);
      setMessages([]);
      return newChat;
    },
    []
  );

  // Append a message to the active chat and persist to disk
  const addMessage = useCallback(
    (sender: string, text: string, color?: string) => {
      const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const resolvedColor =
        color || (sender === "User" ? "yellow" : sender === "System" ? "cyan" : getRoleColor ? getRoleColor(sender) : "white");

      const newMsg: ChatMessage = {
        id: String(Date.now() + Math.random()),
        sender,
        text,
        color: resolvedColor,
        timestamp: time,
      };

      setMessages((prev) => {
        const updated = [...prev, newMsg];
        const currentId = activeChatIdRef.current;
        if (currentId) {
          chatService.saveChatMessages(currentId, updated);
        }
        return updated;
      });
    },
    [getRoleColor]
  );

  return {
    activeChatId,
    activeChat,
    messages,
    setMessages,
    addMessage,
    selectChat,
    createAndSelectChat,
    refreshSession,
  };
}

// Status:: in-progress
// Chat and Project persistent storage service for Vecta.
// Manages disk-backed chat histories, project workspaces, pinning, and metadata
// in .vecta/chats/ and .vecta/projects/.
import path from "node:path";
import fs from "node:fs";
import { getVectaDir } from "../helpers/paths.js";
import type { ChatMessage } from "../components/Chat.js";
import { defaultDuties } from "../../../roles/manager.js";

export interface ChatMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string; // Tracks active usage (messages & Documenter logs) for inactivity auto-delete
  pinned: boolean;
  projectId?: string | null;
  messageCount: number;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  chatIds: string[];
}

/**
 * Generates unique, shuffled alphanumeric IDs combining timestamp with entropy.
 * Result format: chat_9m2x4p7w1a8q or proj_b4k8v2m9c7n1
 */
export function generateShuffledId(prefix: "chat" | "proj"): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const timeStr = Date.now().toString(36);
  let randStr = "";
  for (let i = 0; i < 8; i++) {
    randStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Interleave and shuffle characters thoroughly
  const arr = (timeStr + randStr).split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return `${prefix}_${arr.join("")}`;
}

export class ChatService {
  private baseDir: string;
  private chatsDir: string;
  private projectsDir: string;
  private chatsIndexFile: string;
  private projectsIndexFile: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || getVectaDir();
    this.chatsDir = path.join(this.baseDir, "chats");
    this.projectsDir = path.join(this.baseDir, "projects");
    this.chatsIndexFile = path.join(this.chatsDir, "index.json");
    this.projectsIndexFile = path.join(this.projectsDir, "index.json");

    this.ensureDirs();
  }

  // Ensure directories exist on disk
  private ensureDirs(): void {
    if (!fs.existsSync(this.chatsDir)) {
      fs.mkdirSync(this.chatsDir, { recursive: true });
    }
    if (!fs.existsSync(this.projectsDir)) {
      fs.mkdirSync(this.projectsDir, { recursive: true });
    }
  }

  // Read chats index from disk
  private readChatsIndex(): ChatMetadata[] {
    this.ensureDirs();
    if (!fs.existsSync(this.chatsIndexFile)) {
      return [];
    }
    try {
      const data = fs.readFileSync(this.chatsIndexFile, "utf8");
      return JSON.parse(data) as ChatMetadata[];
    } catch {
      return [];
    }
  }

  // Write chats index to disk
  private writeChatsIndex(chats: ChatMetadata[]): void {
    this.ensureDirs();
    fs.writeFileSync(this.chatsIndexFile, JSON.stringify(chats, null, 2), "utf8");
  }

  // Read projects index from disk
  private readProjectsIndex(): ProjectMetadata[] {
    this.ensureDirs();
    if (!fs.existsSync(this.projectsIndexFile)) {
      return [];
    }
    try {
      const data = fs.readFileSync(this.projectsIndexFile, "utf8");
      return JSON.parse(data) as ProjectMetadata[];
    } catch {
      return [];
    }
  }

  // Write projects index to disk
  private writeProjectsIndex(projects: ProjectMetadata[]): void {
    this.ensureDirs();
    fs.writeFileSync(this.projectsIndexFile, JSON.stringify(projects, null, 2), "utf8");
  }

  // ---------------------------------------------------------------------------
  // CHAT CRUD
  // ---------------------------------------------------------------------------

  // List chats sorted: pinned first, then by updatedAt descending
  public listChats(projectId?: string | null): ChatMetadata[] {
    let chats = this.readChatsIndex();

    if (projectId !== undefined) {
      if (projectId === null) {
        chats = chats.filter((c) => !c.projectId);
      } else {
        chats = chats.filter((c) => c.projectId === projectId);
      }
    }

    return chats.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  // Get single chat metadata and message history
  public getChat(chatId: string): { meta: ChatMetadata; messages: ChatMessage[] } | null {
    const chats = this.readChatsIndex();
    const meta = chats.find((c) => c.id === chatId);
    if (!meta) return null;

    const chatFolder = path.join(this.chatsDir, chatId);
    const messagesFile = path.join(chatFolder, "messages.json");
    let messages: ChatMessage[] = [];

    if (fs.existsSync(messagesFile)) {
      try {
        const raw = fs.readFileSync(messagesFile, "utf8");
        messages = JSON.parse(raw);
      } catch {
        messages = [];
      }
    }

    return { meta, messages };
  }

  // Create a new chat session on disk
  public createChat(title?: string, projectId?: string | null): ChatMetadata {
    const id = generateShuffledId("chat");
    const now = new Date().toISOString();
    const cleanTitle = (title && title.trim()) || `Chat ${new Date().toLocaleDateString([], { month: "short", day: "numeric" })} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

    const newChat: ChatMetadata = {
      id,
      title: cleanTitle,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      pinned: false,
      projectId: projectId || null,
      messageCount: 0,
    };

    // Create chat directory on disk
    const chatFolder = path.join(this.chatsDir, id);
    if (!fs.existsSync(chatFolder)) {
      fs.mkdirSync(chatFolder, { recursive: true });
    }

    // Write meta.json and empty messages.json inside chat folder
    fs.writeFileSync(path.join(chatFolder, "meta.json"), JSON.stringify(newChat, null, 2), "utf8");
    fs.writeFileSync(path.join(chatFolder, "messages.json"), JSON.stringify([], null, 2), "utf8");

    // Initialize manager-duties.json with Layer 1 base duties (Claude Doc 04 & 08)
    const dutiesPayload = {
      chatId: id,
      layer1BaseDuties: defaultDuties,
      layer2SessionContext: [],
      updatedAt: now,
    };
    fs.writeFileSync(
      path.join(chatFolder, "manager-duties.json"),
      JSON.stringify(dutiesPayload, null, 2),
      "utf8"
    );

    // Add to chats index
    const chats = this.readChatsIndex();
    chats.unshift(newChat);
    this.writeChatsIndex(chats);

    // If belongs to a project, add to project chatIds
    if (projectId) {
      const projects = this.readProjectsIndex();
      const proj = projects.find((p) => p.id === projectId);
      if (proj && !proj.chatIds.includes(id)) {
        proj.chatIds.push(id);
        proj.updatedAt = now;
        this.writeProjectsIndex(projects);
      }
    }

    return newChat;
  }

  // Save messages into chat session
  public saveChatMessages(chatId: string, messages: ChatMessage[]): void {
    const chats = this.readChatsIndex();
    const meta = chats.find((c) => c.id === chatId);
    const now = new Date().toISOString();

    const chatFolder = path.join(this.chatsDir, chatId);
    if (!fs.existsSync(chatFolder)) {
      fs.mkdirSync(chatFolder, { recursive: true });
    }

    fs.writeFileSync(path.join(chatFolder, "messages.json"), JSON.stringify(messages, null, 2), "utf8");

    if (meta) {
      meta.messageCount = messages.length;
      meta.updatedAt = now;
      meta.lastActiveAt = now;
      fs.writeFileSync(path.join(chatFolder, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
      this.writeChatsIndex(chats);
    }
  }

  // Resets the inactivity timer when a chat is actively used (message sent or Documenter logging)
  public touchChatActivity(chatId: string): void {
    const chats = this.readChatsIndex();
    const meta = chats.find((c) => c.id === chatId);
    const now = new Date().toISOString();
    const chatFolder = path.join(this.chatsDir, chatId);

    if (meta) {
      meta.lastActiveAt = now;
      meta.updatedAt = now;
      if (fs.existsSync(chatFolder)) {
        try {
          fs.writeFileSync(path.join(chatFolder, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
        } catch {
          // ignore
        }
      }
      this.writeChatsIndex(chats);
    } else if (fs.existsSync(chatFolder)) {
      const metaFile = path.join(chatFolder, "meta.json");
      if (fs.existsSync(metaFile)) {
        try {
          const raw = fs.readFileSync(metaFile, "utf8");
          const parsed = JSON.parse(raw);
          parsed.lastActiveAt = now;
          parsed.updatedAt = now;
          fs.writeFileSync(metaFile, JSON.stringify(parsed, null, 2), "utf8");
        } catch {
          // ignore
        }
      }
    }
  }

  // Rename a chat
  public renameChat(chatId: string, newTitle: string): ChatMetadata | null {
    const trimmed = newTitle.trim();
    if (!trimmed) return null;

    const chats = this.readChatsIndex();
    const meta = chats.find((c) => c.id === chatId);
    if (!meta) return null;

    meta.title = trimmed;
    meta.updatedAt = new Date().toISOString();

    const chatFolder = path.join(this.chatsDir, chatId);
    if (fs.existsSync(chatFolder)) {
      fs.writeFileSync(path.join(chatFolder, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    }

    this.writeChatsIndex(chats);
    return meta;
  }

  // Toggle chat pin status
  public togglePinChat(chatId: string): ChatMetadata | null {
    const chats = this.readChatsIndex();
    const meta = chats.find((c) => c.id === chatId);
    if (!meta) return null;

    meta.pinned = !meta.pinned;
    meta.updatedAt = new Date().toISOString();

    const chatFolder = path.join(this.chatsDir, chatId);
    if (fs.existsSync(chatFolder)) {
      fs.writeFileSync(path.join(chatFolder, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    }

    this.writeChatsIndex(chats);
    return meta;
  }

  // Delete chat and its directory
  public deleteChat(chatId: string): boolean {
    const chats = this.readChatsIndex();
    const idx = chats.findIndex((c) => c.id === chatId);
    if (idx === -1) return false;

    const removed = chats.splice(idx, 1)[0]!;
    this.writeChatsIndex(chats);

    // Delete folder
    const chatFolder = path.join(this.chatsDir, chatId);
    try {
      if (fs.existsSync(chatFolder)) {
        fs.rmSync(chatFolder, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }

    // Remove from project if attached
    if (removed.projectId) {
      const projects = this.readProjectsIndex();
      const proj = projects.find((p) => p.id === removed.projectId);
      if (proj) {
        proj.chatIds = proj.chatIds.filter((cid) => cid !== chatId);
        proj.updatedAt = new Date().toISOString();
        this.writeProjectsIndex(projects);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // PROJECT CRUD
  // ---------------------------------------------------------------------------

  // List projects sorted: pinned first, then updatedAt descending
  public listProjects(): ProjectMetadata[] {
    const projects = this.readProjectsIndex();
    const allChats = this.readChatsIndex();

    // Reconcile chatIds with real existing chats
    for (const p of projects) {
      p.chatIds = allChats.filter((c) => c.projectId === p.id).map((c) => c.id);
    }

    return projects.sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }

  // Get project metadata
  public getProject(projectId: string): ProjectMetadata | null {
    const projects = this.listProjects();
    return projects.find((p) => p.id === projectId) || null;
  }

  // Create a new project workspace
  public createProject(name: string): ProjectMetadata {
    const cleanName = name.trim() || "Untitled Project";
    const id = generateShuffledId("proj");
    const now = new Date().toISOString();

    const newProject: ProjectMetadata = {
      id,
      name: cleanName,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      chatIds: [],
    };

    // Create project folder on disk
    const projectFolder = path.join(this.projectsDir, id);
    if (!fs.existsSync(projectFolder)) {
      fs.mkdirSync(projectFolder, { recursive: true });
    }

    fs.writeFileSync(path.join(projectFolder, "meta.json"), JSON.stringify(newProject, null, 2), "utf8");

    const projects = this.readProjectsIndex();
    projects.unshift(newProject);
    this.writeProjectsIndex(projects);

    return newProject;
  }

  // Rename a project
  public renameProject(projectId: string, newName: string): ProjectMetadata | null {
    const trimmed = newName.trim();
    if (!trimmed) return null;

    const projects = this.readProjectsIndex();
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return null;

    proj.name = trimmed;
    proj.updatedAt = new Date().toISOString();

    const projectFolder = path.join(this.projectsDir, projectId);
    if (fs.existsSync(projectFolder)) {
      fs.writeFileSync(path.join(projectFolder, "meta.json"), JSON.stringify(proj, null, 2), "utf8");
    }

    this.writeProjectsIndex(projects);
    return proj;
  }

  // Toggle project pin status
  public togglePinProject(projectId: string): ProjectMetadata | null {
    const projects = this.readProjectsIndex();
    const proj = projects.find((p) => p.id === projectId);
    if (!proj) return null;

    proj.pinned = !proj.pinned;
    proj.updatedAt = new Date().toISOString();

    const projectFolder = path.join(this.projectsDir, projectId);
    if (fs.existsSync(projectFolder)) {
      fs.writeFileSync(path.join(projectFolder, "meta.json"), JSON.stringify(proj, null, 2), "utf8");
    }

    this.writeProjectsIndex(projects);
    return proj;
  }

  // Delete project workspace with option to delete or preserve child chats
  public deleteProject(
    projectId: string,
    chatAction: "delete-chats" | "keep-chats" = "delete-chats"
  ): boolean {
    const projects = this.readProjectsIndex();
    const idx = projects.findIndex((p) => p.id === projectId);
    if (idx === -1) return false;

    projects.splice(idx, 1);
    this.writeProjectsIndex(projects);

    const projectFolder = path.join(this.projectsDir, projectId);
    try {
      if (fs.existsSync(projectFolder)) {
        fs.rmSync(projectFolder, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }

    const chats = this.readChatsIndex();
    if (chatAction === "delete-chats") {
      // Option A: Cascade delete all child chats from disk and index
      const remainingChats: ChatMetadata[] = [];
      for (const chat of chats) {
        if (chat.projectId === projectId) {
          const chatFolder = path.join(this.chatsDir, chat.id);
          try {
            if (fs.existsSync(chatFolder)) {
              fs.rmSync(chatFolder, { recursive: true, force: true });
            }
          } catch {
            // ignore
          }
        } else {
          remainingChats.push(chat);
        }
      }
      this.writeChatsIndex(remainingChats);
    } else {
      // Option B: Detach child chats into standalone scope (projectId: null)
      let changed = false;
      for (const chat of chats) {
        if (chat.projectId === projectId) {
          chat.projectId = null;
          chat.updatedAt = new Date().toISOString();
          const chatFolder = path.join(this.chatsDir, chat.id);
          if (fs.existsSync(chatFolder)) {
            try {
              fs.writeFileSync(path.join(chatFolder, "meta.json"), JSON.stringify(chat, null, 2), "utf8");
            } catch {
              // ignore
            }
          }
          changed = true;
        }
      }
      if (changed) {
        this.writeChatsIndex(chats);
      }
    }

    return true;
  }
}

export const chatService = new ChatService();

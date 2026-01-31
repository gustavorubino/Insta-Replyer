// Chat storage - disabled until chat feature is enabled
// The conversations and messages tables don't exist in the current schema

export interface IChatStorage {
  getConversation(id: number): Promise<any>;
  getAllConversations(): Promise<any[]>;
  createConversation(title: string): Promise<any>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<any[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<any>;
}

export const chatStorage: IChatStorage = {
  async getConversation(_id: number) {
    throw new Error("Chat feature not enabled - conversations table not available");
  },

  async getAllConversations() {
    throw new Error("Chat feature not enabled - conversations table not available");
  },

  async createConversation(_title: string) {
    throw new Error("Chat feature not enabled - conversations table not available");
  },

  async deleteConversation(_id: number) {
    throw new Error("Chat feature not enabled - conversations table not available");
  },

  async getMessagesByConversation(_conversationId: number) {
    throw new Error("Chat feature not enabled - messages table not available");
  },

  async createMessage(_conversationId: number, _role: string, _content: string) {
    throw new Error("Chat feature not enabled - messages table not available");
  },
};

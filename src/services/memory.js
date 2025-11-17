// Simple conversation memory for sales assistant
export class SalesMemory {
  constructor() {
    this.messages = [];
    this.maxMessages = 20; // retain last 20 exchanges
  }

  addMessage(role, content) {
    this.messages.push({ role, content, timestamp: Date.now() });
    if (this.messages.length > this.maxMessages) {
      this.messages = this.messages.slice(-this.maxMessages);
    }
  }

  getContext() {
    return this.messages
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");
  }

  reset() {
    this.messages = [];
  }
}

export const conversationMemory = new SalesMemory();
declare module '@deepseek-ai/dsh-llm' {
  export function createUserMessage(input: {
    content: Array<{ type: 'text'; text: string }>
    source: { kind: string }
  }): unknown
}

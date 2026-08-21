/** Wire payload delivered by Narra's polling Gateway. */
export interface NarraInvocation {
  readonly invocation_id: string
  readonly conversation_id?: string
  readonly room_id?: string
  readonly memory_scope?: { readonly type?: string; readonly key?: string }
  readonly is_group_chat?: boolean
  readonly sender?: {
    readonly matrix_user_id?: string
    readonly display_name?: string
    readonly principal_type?: string
  }
  readonly message: string
  readonly context?: readonly NarraContextMessage[]
  readonly voice_instructions?: string
  readonly attachments?: readonly unknown[]
  readonly group_context?: unknown
}

export interface NarraContextMessage {
  readonly role: 'user' | 'assistant'
  readonly content: string
}

export interface GatewayRuntime {
  readonly baseUrl: string
  readonly token: string
}

export interface SetupGuideSnapshot {
  readonly status: string
  readonly revision?: number
  readonly gatewayUrl?: string
  readonly gatewayToken?: string
}

export class GatewayTerminalError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'GatewayTerminalError'
  }
}

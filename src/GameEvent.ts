export interface GameEvent {
    readonly clientType: 'Server' | 'Client'
    readonly type: string
    readonly subType: string | undefined
    readonly value: any
}

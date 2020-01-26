export interface GameEvent {
    clientType: 'Server' | 'Client'
    type: string
    subType?: string
    value: any
}

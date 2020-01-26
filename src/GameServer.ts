import {GameEvent} from './GameEvent'
import {Server as HttpServer, createServer} from 'http'

import morgan = require('morgan')

import * as WebSocket from 'ws'
import * as express from 'express'
import * as expressWs from 'express-ws'

import Timeout = NodeJS.Timeout

export class GameServer {
    public static readonly CLIENT_DECISION_TIME_SECONDS = 10
    public static readonly DEFAULT_PORT: number = 8080

    private readonly app: express.Application
    private readonly port: number
    private readonly server: HttpServer
    private readonly ws: WebSocket.Server

    private host: WebSocket | undefined
    private readonly clients: Set<WebSocket> = new Set<WebSocket>()
    private clientVotes: Record<string, number> = {}

    private interval?: Timeout
    private timeToNextDecision = GameServer.CLIENT_DECISION_TIME_SECONDS

    constructor() {
        this.app = this.createApp()
        this.port = this.detectPort()
        this.server = this.createServer()
        this.ws = this.createWebSocketServer()
    }

    private handleHostGameEvent(e: GameEvent, ws: WebSocket) {
        switch (e.type) {
            case 'Identify':
                this.host = ws
                break
            case 'MonsterEnergyChange':
                this.dispatchGameEventsToClients(e)
                break
        }
    }

    private handleClientGameEvent(e: GameEvent, ws: WebSocket) {
        switch (e.type) {
            case 'Identify':
                this.clients.add(ws)
                this.dispatchGameEventsToClients({
                    clientType: 'Client',
                    type: 'VoteCount',
                    value: this.clientVotes,
                })
                break
            case 'OpponentAdvantage':
            case 'MonsterDisadvantage':
                const key = e.subType ? `${e.type}_${e.subType}` : e.type
                if (!(key in this.clientVotes)) {
                    this.clientVotes[key] = 0
                }
                this.clientVotes[key] += 1
                this.dispatchGameEventsToClients({
                    clientType: 'Client',
                    type: 'VoteCount',
                    value: this.clientVotes,
                })
                break
        }
    }

    private dispatchGameEventsToHost(events: GameEvent | GameEvent[]) {
        if (!this.host) {
            console.error("Cannot dispatch events when there's no host.")
            return
        }
        if (!Array.isArray(events)) {
            events = [events]
        }
        const serialized = JSON.stringify(events)
        console.log(`Sending to host: ${serialized}`)
        this.host.send(serialized)
    }

    private dispatchGameEventsToClients(events: GameEvent | GameEvent[], ignoreWs?: WebSocket) {
        if (!Array.isArray(events)) {
            events = [events]
        }

        const serialized = JSON.stringify(events)
        for (const ws of this.clients.values()) {
            if (ws === ignoreWs) {
                continue
            }
            ws.send(serialized)
        }
    }

    public start(): void {
        this.server.listen(this.port, '0.0.0.0', () => {
            console.log('Running server on port %s', this.port)
        })

        this.interval = setInterval(this.dispatchDecisionTimerEvents, 1000)
    }

    private detectPort(): number {
        let port = GameServer.DEFAULT_PORT

        if (!process.env.PORT ||
            process.env.PORT === '0' ||
            process.env.PORT.length === 0
        ) {
            return port
        }

        const parsed = Number.parseInt(process.env.PORT)

        if (Number.isNaN(parsed)) {
            throw new Error('process.env.PORT must be a number')
        }

        port = parsed

        return port
    }

    private createApp(): express.Express {
        const app = express()

        app.use(express.static('public'))
        app.use(morgan('combined'))

        return app
    }

    private createServer(): HttpServer {
        return createServer(this.app)
    }

    private createWebSocketServer(): WebSocket.Server {
        const instance = expressWs(this.app, this.server)

        instance.app.ws('/', (ws, req, next) => {
            console.log('New connection on port %s.', this.port)

            ws.on('message', (message: any) => {
                console.debug('message: %s', message)

                for (const gameEvent of this.parseMessageGameEvents(message)) {
                    switch (gameEvent.clientType) {
                        case 'Server':
                            this.handleHostGameEvent(gameEvent, ws)
                            break
                        case 'Client':
                            this.handleClientGameEvent(gameEvent, ws)
                            break
                    }
                }
            })

            ws.on('close', () => {
                if (this.host === ws) {
                    console.log('Host has disconnected')
                    delete this.host
                    // todo notify clients of server disconnection
                } else {
                    console.log('Client has disconnected')
                    this.clients.delete(ws)
                }
            })
        })

        return instance.getWss()
    }

    private parseMessageGameEvents(message: string): GameEvent[] {
        const gameEvents: GameEvent[] = []
        const json: Partial<GameEvent[]> = JSON.parse(message)

        if (!Array.isArray(json) || json.length === 0) {
            console.error(`Bad message: not an array or empty`)

            return gameEvents
        }

        for (const item of json) {
            if (typeof item !== 'object' || item === null) {
                console.error(`Bad message: not an object`)
                continue
            }
            if (['Server', 'Client'].indexOf(item.clientType || '') === -1) {
                console.error(`Bad message: unknown clientType ${item.clientType}`)
                continue
            }
            if (typeof item.type !== 'string' || item.type.length === 0) {
                console.error(`Bad message: invalid type ${item.type}`)
                continue
            }
            if (typeof item.value === 'undefined' || item.value === null) {
                console.error(`Bad message: invalid value ${item.value}`)
                continue
            }
            gameEvents.push(item)
        }

        return gameEvents
    }

    private dispatchDecisionTimerEvents = () => {
        const events: GameEvent[] = []
        this.timeToNextDecision--
        const votes = this.clientVotes

        if (this.timeToNextDecision < 0) {
            this.timeToNextDecision = GameServer.CLIENT_DECISION_TIME_SECONDS

            events.push({
                clientType: 'Client',
                type: 'DecisionTimeReset',
                value: this.timeToNextDecision,
            })

            this.clientVotes = {}

            if (Object.keys(votes).length > 0) {
                const votesInDesc = Object.entries(votes).sort((a, b) => b[1] - a[1])
                const [name] = votesInDesc[0]

                events.push({
                    clientType: 'Client',
                    type: 'DecisionTimeWinner',
                    value: name,
                })


                //region send winner to host
                const [type, subType] = name.split('_')

                const event: GameEvent = {
                    clientType: 'Server',
                    type,
                    subType,
                    value: true,
                }

                if (typeof subType === 'undefined') {
                    delete event.subType
                }

                this.dispatchGameEventsToHost([event])
                //endregion
            }
        } else {
            events.push({
                clientType: 'Client',
                type: 'DecisionTimeTick',
                value: this.timeToNextDecision,
            })
        }

        this.dispatchGameEventsToClients(events)
    }
}

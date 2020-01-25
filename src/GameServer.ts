import {createServer, Server} from 'http'
import {Server as WebSocketServer} from 'ws'

import morgan = require('morgan')

import * as express from 'express'
import * as expressWs from 'express-ws'

export class GameServer {
    public static readonly DEFAULT_PORT: number = 8080

    private readonly app: express.Application
    private readonly port: number
    private readonly server: Server
    private readonly ws: WebSocketServer

    constructor() {
        this.app = this.createApp()
        this.port = this.detectPort()
        this.server = this.createServer()
        this.ws = this.createWebSocketServer()
    }

    public start(): void {
        this.server.listen(this.port, '0.0.0.0', () => {
            console.log('Running server on port %s', this.port)
        })
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

    private createServer(): Server {
        return createServer(this.app)
    }

    private createWebSocketServer(): WebSocketServer {
        const instance = expressWs(this.app, this.server)

        instance.app.ws('/', (ws, req, next) => {
            console.log('Connected client on port %s.', this.port)

            ws.on('message', (m: any) => {
                console.log('[server](message): %s', JSON.stringify(m))
                this.ws.emit('message', m)
            })

            ws.on('close', () => {
                console.log('Client disconnected')
            })
        })

        return instance.getWss()
    }
}

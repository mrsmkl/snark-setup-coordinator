import dotenv from 'dotenv'
import yargs = require('yargs')
import bodyParser from 'body-parser'
import fs from 'fs'
import path from 'path'
import {
    BlobServiceClient,
    StorageSharedKeyCredential,
} from '@azure/storage-blob'

import { authenticate } from './authenticate'
import { AuthenticateCelo } from './authenticate-celo'
import { AuthenticateDummy } from './authenticate-dummy'

import { BlobChunkStorage } from './blob-chunk-storage'
import { ChunkStorage } from './coordinator'
import { DiskCoordinator } from './disk-coordinator'
import { DiskChunkStorage } from './disk-chunk-storage'
import { initExpress } from './app'
import { initMetrics } from './metrics'
import { logger } from './logger'

dotenv.config()

const authenticateStrategies = {
    celo: new AuthenticateCelo(),
    dummy: new AuthenticateDummy(),
}

const httpArgs = {
    port: {
        default: 8080,
        type: 'number',
    },
    'metrics-port': {
        default: 9090,
        type: 'number',
    },
    'auth-type': {
        choices: ['celo', 'dummy'],
        default: 'dummy',
        type: 'string',
    },
    'chunk-storage-type': {
        choices: ['disk', 'azure'],
        default: 'disk',
        type: 'string',
    },
    'disk-chunk-storage-directory': {
        default: './.storage',
        type: 'string',
    },
    'disk-chunk-storage-url': {
        default: 'http://localhost:8080',
        type: 'string',
    },
    'azure-access-key-file': {
        type: 'string',
        describe: 'File with storage account access key',
    },
    'azure-storage-account': {
        type: 'string',
        describe: 'Azure storage account',
    },
    'azure-container': {
        type: 'string',
        describe: 'Azure container name to write contributions to',
    },
}

const dbArgs = {
    'db-file': {
        default: './.storage/db.json',
        type: 'string',
    },
}

const argv = yargs
    .env('COORDINATOR')
    .command('http', 'Enable the HTTP server', { ...httpArgs, ...dbArgs })
    .command('init', 'Initialize the ceremony', {
        ...dbArgs,
        'config-path': {
            type: 'string',
            demand: true,
            describe: 'Initial ceremony state file',
        },
    })
    .demandCommand(1, 'You must specify a command.')
    .strictCommands()
    .help().argv

function http(args): void {
    let diskChunkStorage
    let chunkStorage: ChunkStorage
    if (args.chunkStorageType === 'disk') {
        const chunkStorageUrl = `${args.diskChunkStorageUrl}/chunks`
        diskChunkStorage = new DiskChunkStorage({
            storagePath: args.diskChunkStorageDirectory,
            chunkStorageUrl,
        })
        chunkStorage = diskChunkStorage
    } else if (args.chunkStorageType === 'azure') {
        const sharedKeyCredential = new StorageSharedKeyCredential(
            args.azureStorageAccount,
            fs.readFileSync(args.azureAccessKeyFile).toString(),
        )
        const containerClient = new BlobServiceClient(
            `https://${args.azureStorageAccount}.blob.core.windows.net`,
            sharedKeyCredential,
        ).getContainerClient(args.azureContainer)
        chunkStorage = new BlobChunkStorage({
            containerClient,
            sharedKeyCredential,
        })
    }

    const authenticateStrategy = authenticateStrategies[args.authType]
    const coordinator = new DiskCoordinator({ dbPath: args.dbFile })
    const app = initExpress({ authenticateStrategy, coordinator, chunkStorage })

    if (args.chunkStorageType === 'disk') {
        const authenticateRequest = authenticate(authenticateStrategy)

        app.use(bodyParser.raw({ limit: '5mb' }))
        app.post(
            '/chunks/:chunkId/contribution/:version',
            authenticateRequest,
            async (req, res) => {
                const chunkId = req.params.chunkId
                const version = req.params.version
                const content = req.body

                logger.info(`POST /chunks/${chunkId}/contribution/${version}`)
                diskChunkStorage.setChunk(chunkId, version, content)
                res.json({ status: 'ok' })
            },
        )
        app.get('/chunks/:chunkId/contribution/:version', (req, res) => {
            const chunkId = req.params.chunkId
            const version = req.params.version

            logger.info(`GET /chunks/${chunkId}/contribution/${version}`)
            try {
                const content = diskChunkStorage.getChunk(chunkId, version)
                res.status(200).send(content)
            } catch (err) {
                logger.warn(err.message)
                res.status(500).json({ status: 'error', message: err.message })
            }
        })
    }

    app.listen(args.port, () => {
        logger.info(`coordinator listening on ${args.port}`)
    })

    const metricsApp = initMetrics({ coordinator })
    metricsApp.listen(args.metricsPort, () => {
        logger.info(`metrics listening on ${args.metricsPort}`)
    })
}

function init(args): void {
    const dbPath = args.dbFile
    const storagePath = path.dirname(dbPath)
    try {
        fs.mkdirSync(storagePath, { recursive: true })
    } catch (error) {
        if (error.code !== 'EEXIST') {
            throw error
        }
    }
    const config = JSON.parse(fs.readFileSync(args.configPath).toString())
    DiskCoordinator.init({ config, dbPath })
}

function main(args): void {
    logger.info('invoked with args %o', args)

    const command = args._[0]
    if (command === 'http') {
        http(args)
    } else if (command === 'init') {
        init(args)
    }
}

main(argv)

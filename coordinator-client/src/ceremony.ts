export interface ChunkContributionMetadata {
    contributedTime: string
    contributedLockHolderTime: string
    verifiedTime: string
    verifiedLockHolderTime: string
}

export interface ChunkContribution {
    metadata: ChunkContributionMetadata

    contributorId: string
    contributedLocation: string
    contributedData: object
    verifierId: string
    verifiedLocation: string
    verified: boolean
    verifiedData: object
}

export interface ChunkData {
    chunkId: string
    contributions: ChunkContribution[]
}

export interface LockedChunkDataMetadata {
    lockHolderTime: string
}

export interface LockedChunkData extends ChunkData {
    metadata: LockedChunkDataMetadata

    lockHolder: string
}

export interface CeremonyParameters {
    provingSystem?: string
    curveKind?: string
    chunkSize?: number
    batchSize?: number
    power?: number
}

export interface Ceremony {
    parameters: CeremonyParameters
    chunks: LockedChunkData[]
    contributorIds: string[]
    verifierIds: string[]
    version: number
}

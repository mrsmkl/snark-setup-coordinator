import { Ceremony, ChunkData, LockedChunkData } from './ceremony'

export interface Coordinator {
    getCeremony(): Ceremony
    getChunk(chunkId: string): LockedChunkData
    tryLockChunk(chunkId: string, particpantId: string): boolean
    contributeChunk(
        chunkId: string,
        participantId: string,
        location: string,
    ): Promise<void>
}

export interface ChunkStorage {
    getChunkWriteLocation({
        chunk,
        participantId,
    }: {
        chunk: ChunkData
        participantId: string
    })

    copyChunk({
        chunk,
        participantId,
    }: {
        chunk: ChunkData
        participantId: string
    })
}

export function chunkVersion(chunk: ChunkData): number {
    // Generate an number that uniquely identifies the current state of the chunk
    return (
        chunk.contributions.filter((contribution) => contribution.contributorId)
            .length +
        chunk.contributions.filter((contribution) => contribution.verifierId)
            .length
    )
}

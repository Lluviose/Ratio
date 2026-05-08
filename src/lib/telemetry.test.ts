import { describe, expect, it } from 'vitest'
import { sanitizeTelemetryPayload } from './telemetry'

describe('sanitizeTelemetryPayload', () => {
  it('keeps conflict diff field names that avoid secret-style matches', () => {
    expect(
      sanitizeTelemetryPayload({
        changedCount: 1,
        differentEntryCount: 1,
        diffSampleNames: ['ratio.accounts'],
        apiKeyMasked: 'sk-***',
        password: 'secret',
      }),
    ).toEqual({
      changedCount: 1,
      differentEntryCount: 1,
      diffSampleNames: '["ratio.accounts"]',
    })
  })
})

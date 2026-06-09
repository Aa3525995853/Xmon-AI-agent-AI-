/**
 * Test-only Mock TTS service.
 *
 * Real-use guardrail:
 * This provider intentionally does not synthesize audio. It exists only so
 * isolated unit tests can avoid network calls. Production health checks and
 * user-facing TTS must use Mimo; returning an empty Buffer outside tests would
 * make the feature look available while the user hears nothing.
 */

import { TTSProvider } from '../types';

class MockTTSService implements TTSProvider {
    name: string;

    constructor() {
        this.name = 'Mock TTS';
    }

    async generateVoice(text: string): Promise<Buffer> {
        if (process.env.NODE_ENV !== 'test') {
            throw new Error('[TTS] Mock TTS cannot generate voice outside NODE_ENV=test');
        }

        console.log(`[${this.name}] test-only voice generation: ${text.substring(0, 50)}...`);
        // Test-only empty audio marker. Never treat this as real synthesized
        // speech in production paths.
        return Buffer.from('');
    }

    isAvailable(): boolean {
        // Duplicate the registry guard so direct imports cannot report a
        // fake-green TTS health check.
        return process.env.NODE_ENV === 'test';
    }
}

export default new MockTTSService();

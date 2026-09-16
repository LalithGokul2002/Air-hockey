import type { CollisionEvent } from '../physics/CollisionSystem';

/**
 * Minimum gap between two collision sounds of the same type, in seconds.
 *
 * Physics runs several sub-steps per tick, so a puck scraping along a
 * wall or being pushed by a paddle can report many contacts in a row.
 * Without this each one would start its own oscillator.
 */
const MIN_COLLISION_SOUND_GAP = 0.04;

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  private readonly lastCollisionSoundAt: Record<CollisionEvent['type'], number> = {
    paddle: -Infinity,
    wall: -Infinity,
    post: -Infinity,
  };

  private ensureContext(): AudioContext | null {
    if (!this.context) {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      this.context = new AudioContextClass();

      this.masterGain =
        this.context.createGain();

      this.masterGain.gain.value = 0.18;

      this.masterGain.connect(
        this.context.destination,
      );
    }

    if (this.context.state === 'suspended') {
      void this.context.resume();
    }

    return this.context;
  }

  unlock(): void {
    this.ensureContext();
  }

  /** Release the audio device when the game is torn down. */
  dispose(): void {
    if (this.context) {
      void this.context.close();
    }

    this.context = null;
    this.masterGain = null;
  }

  playCollision(event: CollisionEvent): void {
    const context = this.ensureContext();

    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;

    if (now - this.lastCollisionSoundAt[event.type] < MIN_COLLISION_SOUND_GAP) {
      return;
    }

    this.lastCollisionSoundAt[event.type] = now;

    switch (event.type) {
      case 'paddle':
        this.playPaddleHit(
          event.strength,
          event.side,
        );
        break;

      case 'wall':
        this.playWallHit(event.strength);
        break;

      case 'post':
        this.playPostHit(event.strength);
        break;
    }
  }

  playGoal(): void {
    const context = this.ensureContext();

    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;

    this.playTone(
      220,
      0.12,
      'sine',
      0.16,
      now,
    );

    this.playTone(
      330,
      0.16,
      'sine',
      0.18,
      now + 0.08,
    );

    this.playTone(
      440,
      0.22,
      'sine',
      0.20,
      now + 0.18,
    );
  }

  playServe(): void {
    const context = this.ensureContext();

    if (!context || !this.masterGain) {
      return;
    }

    const now = context.currentTime;

    this.playTone(
      280,
      0.08,
      'triangle',
      0.12,
      now,
    );

    this.playTone(
      420,
      0.10,
      'triangle',
      0.10,
      now + 0.05,
    );
  }

  private playPaddleHit(
    strength: number,
    side?: 'player' | 'ai',
  ): void {
    const context = this.context;

    if (!context || !this.masterGain) {
      return;
    }

    const normalized =
      Math.min(strength / 900, 1);

    const baseFrequency =
      side === 'ai'
        ? 180
        : 150;

    const frequency =
      baseFrequency +
      normalized * 100;

    const volume =
      0.08 +
      normalized * 0.14;

    this.playTone(
      frequency,
      0.055 +
        normalized * 0.035,
      'square',
      volume,
      context.currentTime,
    );
  }

  private playWallHit(
    strength: number,
  ): void {
    const context = this.context;

    if (!context || !this.masterGain) {
      return;
    }

    const normalized =
      Math.min(strength / 500, 1);

    this.playTone(
      110 +
        normalized * 70,
      0.045 +
        normalized * 0.025,
      'triangle',
      0.05 +
        normalized * 0.07,
      context.currentTime,
    );
  }

  private playPostHit(
    strength: number,
  ): void {
    const context = this.context;

    if (!context || !this.masterGain) {
      return;
    }

    const normalized =
      Math.min(strength / 700, 1);

    this.playTone(
      320 +
        normalized * 180,
      0.065,
      'sine',
      0.08 +
        normalized * 0.08,
      context.currentTime,
    );
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number,
  ): void {
    const context = this.context;

    if (!context || !this.masterGain) {
      return;
    }

    const oscillator =
      context.createOscillator();

    const gain =
      context.createGain();

    oscillator.type = type;

    oscillator.frequency.setValueAtTime(
      frequency,
      startTime,
    );

    gain.gain.setValueAtTime(
      0.0001,
      startTime,
    );

    gain.gain.exponentialRampToValueAtTime(
      Math.max(volume, 0.0001),
      startTime + 0.005,
    );

    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + duration,
    );

    oscillator.connect(gain);
    gain.connect(this.masterGain);

    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
  }
}
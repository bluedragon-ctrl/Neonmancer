/**
 * The audio engine (D138): music through Howler (looping, crossfades),
 * sound effects as ZzFX recipes or sound files, volumes from the Options
 * sliders. Everything is named in `data/audio.json`; a name with no
 * entry, or an entry whose file is missing, is a silent stub (one warning
 * in the console), so the game never waits for an asset.
 *
 * The browser pieces are passed in (`Howl`, `createContext`, `urlOf`), so
 * tests drive the engine with fakes.
 */
import { NO_AUDIO, lookup, stepGain } from './audio-data.js';
import { ZZFX_RATE, zzfxSamples } from './zzfx.js';

/** Seconds a track takes to fade in or out when music changes. */
export const MUSIC_FADE = 1.5;

export class AudioEngine {
  /**
   * @param {typeof NO_AUDIO} audio the contents of audio.json
   * @param {object} backend
   * @param {new (options: object) => any} backend.Howl Howler's Howl class
   * @param {() => any} backend.createContext makes the Web Audio context (needs a user gesture in browsers)
   * @param {(file: string) => string | undefined} backend.urlOf URL of a file under assets/audio/, undefined if there is none
   * @param {(message: string) => void} [backend.warn]
   */
  constructor(audio, { Howl, createContext, urlOf, warn = (message) => console.warn(message) }) {
    this.audio = audio ?? NO_AUDIO;
    this.backend = { Howl, createContext, urlOf };
    this.warn = warn;
    /** Slider steps, 0 to 10 (ui/settings.js). */
    this.volume = { music: 7, sound: 7 };
    /** @type {any} the Web Audio context of the effects, made on the first gesture */
    this.context = null;
    /** @type {any} gain node the effects play through */
    this.soundGain = null;
    /** @type {{ name: string, howl: any, volume: number } | null} the track playing (or loading) */
    this.track = null;
    /** The track asked for last, even if it is a stub: asking again is a no-op. */
    this.wanted = null;
    /** @type {Map<string, any>} sound effect files already loaded, by name */
    this.fileSounds = new Map();
    /** Names already warned about. */
    this.warned = new Set();
  }

  /** Set the volumes from the Options sliders. @param {{ get: (id: string) => unknown }} settings */
  applySettings(settings) {
    this.setVolumes(Number(settings.get('music')), Number(settings.get('sound')));
  }

  /** @param {number} music 0 to 10 @param {number} sound 0 to 10 */
  setVolumes(music, sound) {
    this.volume = { music, sound };
    if (this.track) this.track.howl.volume(stepGain(music) * this.track.volume);
    if (this.soundGain) this.soundGain.gain.value = stepGain(sound);
  }

  /**
   * Make the audio context. Browsers allow it only after a key press or
   * click, so main.js calls this from the first one; calling again is fine.
   */
  unlock() {
    if (!this.context) {
      try {
        this.context = this.backend.createContext();
        this.soundGain = this.context.createGain();
        this.soundGain.gain.value = stepGain(this.volume.sound);
        this.soundGain.connect(this.context.destination);
      } catch {
        // No Web Audio: the game stays silent.
        this.context = null;
      }
    }
    if (this.context?.state === 'suspended') this.context.resume?.();
  }

  /**
   * Play a sound effect by name.
   * @param {string} name a key of audio.json "sounds"
   * @returns {boolean} whether something was started
   */
  sfx(name) {
    const sound = lookup(this.audio, 'sounds', name);
    if (!sound || stepGain(this.volume.sound) === 0) return false;
    if (sound.zzfx) return this.playRecipe(sound.zzfx, sound.volume);
    return this.playFile(name, sound);
  }

  /**
   * Play the sound named like each game event (an event "pickup" plays
   * the sound "pickup", if there is one).
   * @param {{ type: string }[]} events
   */
  playEvents(events) {
    for (const event of events) this.sfx(event.type);
  }

  /**
   * Switch to a track, crossfading from the one playing. The same track
   * again changes nothing; an unknown name or a missing file fades the
   * old track out and leaves silence.
   * @param {string} name a key of audio.json "music"
   * @param {number} [fade] seconds
   */
  playMusic(name, fade = MUSIC_FADE) {
    if (this.wanted === name) return;
    this.wanted = name;
    const old = this.track;
    this.track = null;
    if (old) this.fadeOut(old, fade);
    const music = lookup(this.audio, 'music', name);
    if (!music) return this.stub(`music:${name}`, `no music "${name}" in audio.json`);
    const src = music.file && this.backend.urlOf(music.file);
    if (!src) return this.stub(`music:${name}`, `music "${name}": file "${music.file}" is missing from assets/audio/`);
    const howl = new this.backend.Howl({
      src: [src],
      loop: music.loop,
      volume: 0,
      onloaderror: () => {
        if (this.track?.howl === howl) this.track = null;
        this.stub(`music:${name}`, `music "${name}": could not load "${music.file}"`);
      },
    });
    this.track = { name, howl, volume: music.volume };
    howl.play();
    howl.fade(0, stepGain(this.volume.music) * music.volume, fade * 1000);
  }

  /** Fade the music out. @param {number} [fade] seconds */
  stopMusic(fade = MUSIC_FADE) {
    this.wanted = null;
    if (this.track) this.fadeOut(this.track, fade);
    this.track = null;
  }

  /** Fade a track to nothing, then release it. */
  fadeOut({ howl }, fade) {
    howl.fade(howl.volume(), 0, fade * 1000);
    howl.once('fade', () => {
      howl.stop();
      howl.unload();
    });
  }

  /** A ZzFX recipe, played once through the effects gain. */
  playRecipe(recipe, volume) {
    if (!this.context) return false;
    const samples = zzfxSamples(recipe);
    const buffer = this.context.createBuffer(1, samples.length, ZZFX_RATE);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    const gain = this.context.createGain();
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.soundGain);
    source.start();
    return true;
  }

  /** A sound file, loaded on first use. */
  playFile(name, sound) {
    let howl = this.fileSounds.get(name);
    if (howl === undefined) {
      const src = sound.file && this.backend.urlOf(sound.file);
      if (src) {
        howl = new this.backend.Howl({ src: [src], onloaderror: () => this.stub(`sounds:${name}`, `sound "${name}": could not load "${sound.file}"`) });
      } else {
        howl = null;
        this.stub(`sounds:${name}`, `sound "${name}": file "${sound.file}" is missing from assets/audio/`);
      }
      this.fileSounds.set(name, howl);
    }
    if (!howl) return false;
    howl.volume(stepGain(this.volume.sound) * sound.volume);
    howl.play();
    return true;
  }

  /** Warn once about a stub. */
  stub(key, message) {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warn(`audio: ${message}`);
  }
}

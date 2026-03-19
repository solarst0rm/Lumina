(function() {
  'use strict';

  var DISPLAY_MIN = 0.5;
  var DISPLAY_MAX = 10.0;
  var DISPLAY_STEP = 0.1;
  var DISPLAY_DEFAULT = 1.0;
  var PLAYBACK_MULTIPLIER = 2;
  var LEGACY_DISPLAY_MAX = 2.0;
  var LEGACY_PLAYBACK_MAX = LEGACY_DISPLAY_MAX * PLAYBACK_MULTIPLIER;
  var PLAYBACK_MAX = 10;
  var STORAGE_KEY = 'blind-notes-speech-display-rate-v2';
  var RATE_EVENT = 'blindnotes:speech-rate-change';

  function roundRate(value) {
    return Math.round(value * 10) / 10;
  }

  function clampRate(value) {
    var numericValue = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(numericValue)) {
      numericValue = DISPLAY_DEFAULT;
    }
    if (numericValue < DISPLAY_MIN) {
      numericValue = DISPLAY_MIN;
    }
    if (numericValue > DISPLAY_MAX) {
      numericValue = DISPLAY_MAX;
    }
    return roundRate(numericValue);
  }

  function readStoredRate() {
    try {
      return clampRate(localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      return DISPLAY_DEFAULT;
    }
  }

  function persistRate(value) {
    try {
      localStorage.setItem(STORAGE_KEY, String(value));
    } catch (error) {
      // Ignore storage errors in restricted contexts.
    }
  }

  function getDisplayRate() {
    if (typeof window._rate === 'number' && isFinite(window._rate)) {
      window._rate = clampRate(window._rate);
      return window._rate;
    }
    window._rate = readStoredRate();
    return window._rate;
  }

  function getPlaybackRate(displayRate) {
    var normalizedRate = clampRate(displayRate);
    if (normalizedRate <= LEGACY_DISPLAY_MAX) {
      return Math.max(0.1, Math.min(PLAYBACK_MAX, normalizedRate * PLAYBACK_MULTIPLIER));
    }

    // Preserve the existing feel at lower rates and extend smoothly up to 10x.
    var progress = (normalizedRate - LEGACY_DISPLAY_MAX) / (DISPLAY_MAX - LEGACY_DISPLAY_MAX);
    var playbackRate = LEGACY_PLAYBACK_MAX + (progress * (PLAYBACK_MAX - LEGACY_PLAYBACK_MAX));
    return Math.max(0.1, Math.min(PLAYBACK_MAX, roundRate(playbackRate)));
  }

  function dispatchRateChange(source) {
    var detail = {
      displayRate: getDisplayRate(),
      playbackRate: getPlaybackRate(getDisplayRate()),
      source: source || 'unknown'
    };
    try {
      window.dispatchEvent(new CustomEvent(RATE_EVENT, { detail: detail }));
    } catch (error) {
      // Ignore environments without CustomEvent support.
    }
  }

  function setDisplayRate(nextRate, options) {
    var config = options || {};
    var normalizedRate = clampRate(nextRate);
    var previousRate = getDisplayRate();
    window._rate = normalizedRate;
    if (config.persist !== false) {
      persistRate(normalizedRate);
    }
    if (normalizedRate !== previousRate || config.forceEvent) {
      dispatchRateChange(config.source || 'set');
    }
    return normalizedRate;
  }

  function adjustDisplayRate(delta, options) {
    var currentRate = getDisplayRate();
    var nextRate = clampRate(currentRate + delta);
    if (nextRate === currentRate) {
      return currentRate;
    }
    return setDisplayRate(nextRate, options);
  }

  function isIncreaseHotkey(event) {
    return !!(
      event &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.code === 'ArrowUp'
    );
  }

  function isDecreaseHotkey(event) {
    return !!(
      event &&
      event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.code === 'ArrowDown'
    );
  }

  function normalize(value) {
    return String(value || '').toLowerCase();
  }

  function isChineseVoice(voice) {
    var lang = normalize(voice && voice.lang);
    var name = normalize(voice && voice.name);
    var uri = normalize(voice && voice.voiceURI);
    return (
      lang.indexOf('zh') === 0 ||
      name.indexOf('chinese') >= 0 ||
      name.indexOf('mandarin') >= 0 ||
      uri.indexOf('zh') >= 0
    );
  }

  function scoreVoice(voice) {
    if (!voice || !isChineseVoice(voice)) {
      return -Infinity;
    }

    var lang = normalize(voice.lang);
    var name = normalize(voice.name);
    var uri = normalize(voice.voiceURI);
    var score = 0;

    if (lang.indexOf('zh-cn') === 0 || lang.indexOf('cmn-hans-cn') === 0) {
      score += 120;
    } else if (lang.indexOf('zh-hans') === 0 || lang.indexOf('zh-sg') === 0) {
      score += 90;
    } else if (lang.indexOf('zh') === 0) {
      score += 60;
    }

    if (/xiaoxiao|xiaoyi|xiaomo|xiaorui|xiaoxuan|xiaoyou|tingting|meijia|sin-ji|huihui/.test(name)) {
      score += 140;
    }
    if (/female|woman|girl|f[0-9]|fema/.test(name) || name.indexOf('female') >= 0) {
      score += 60;
    }
    if (/natural|neural|online/.test(name) || /natural|neural|online/.test(uri)) {
      score += 35;
    }
    if (/yunyang|yunjian|kangkang|male|man|boy/.test(name)) {
      score -= 120;
    }

    return score;
  }

  function getPreferredVoice() {
    if (!window.speechSynthesis || typeof window.speechSynthesis.getVoices !== 'function') {
      return null;
    }

    var voices = window.speechSynthesis.getVoices() || [];
    var bestVoice = null;
    var bestScore = -Infinity;

    for (var index = 0; index < voices.length; index += 1) {
      var voice = voices[index];
      var score = scoreVoice(voice);
      if (score > bestScore) {
        bestScore = score;
        bestVoice = voice;
      }
    }

    if (!bestVoice || bestScore <= 0) {
      for (var fallbackIndex = 0; fallbackIndex < voices.length; fallbackIndex += 1) {
        var fallbackVoice = voices[fallbackIndex];
        var lang = normalize(fallbackVoice.lang);
        if (lang.indexOf('zh') === 0) {
          bestVoice = fallbackVoice;
          break;
        }
      }
    }

    if (!bestVoice && voices.length > 0) {
      bestVoice = voices[0];
    }

    return bestVoice;
  }

  function configureUtterance(utterance, options) {
    if (!utterance) {
      return utterance;
    }

    var config = options || {};
    var displayRate = typeof config.displayRate === 'number' ? config.displayRate : getDisplayRate();
    var preferredVoice = config.voice || getPreferredVoice();

    utterance.rate = getPlaybackRate(displayRate);
    utterance.pitch = typeof config.pitch === 'number' ? config.pitch : 1.04;
    if (typeof config.volume === 'number') {
      utterance.volume = Math.max(0, Math.min(1, config.volume));
    }

    if (preferredVoice) {
      try {
        utterance.voice = preferredVoice;
      } catch (error) {
        // Some browsers reject voice assignment before voices are ready.
      }
      utterance.lang = preferredVoice.lang || config.lang || utterance.lang || 'zh-CN';
      return utterance;
    }

    utterance.lang = config.lang || utterance.lang || 'zh-CN';
    return utterance;
  }

  function handleRateHotkey(event) {
    if (!event || event.defaultPrevented || event.isComposing) {
      return;
    }

    var delta = 0;
    if (isIncreaseHotkey(event)) {
      delta = DISPLAY_STEP;
    } else if (isDecreaseHotkey(event)) {
      delta = -DISPLAY_STEP;
    } else {
      return;
    }

    if (typeof window._handleSpeechRateHotkey === 'function') {
      window._handleSpeechRateHotkey(delta, event);
    } else {
      adjustDisplayRate(delta, { source: 'global-hotkey' });
    }

    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function installSpeakInterceptor() {
    if (
      !window.speechSynthesis ||
      typeof window.speechSynthesis.speak !== 'function' ||
      window._speechConfigSpeakPatched
    ) {
      return;
    }

    try {
      var synth = window.speechSynthesis;
      var originalSpeak = synth.speak.bind(synth);
      synth.speak = function(utterance) {
        if (utterance) {
          configureUtterance(utterance);
        }
        return originalSpeak(utterance);
      };
      window._speechConfigSpeakPatched = true;
    } catch (error) {
      // Ignore environments that disallow monkey patching.
    }
  }

  window.SPEECH_RATE_MIN = DISPLAY_MIN;
  window.SPEECH_RATE_MAX = DISPLAY_MAX;
  window.SPEECH_RATE_STEP = DISPLAY_STEP;
  window.SPEECH_RATE_CHANGE_EVENT = RATE_EVENT;
  window.getSpeechDisplayRate = getDisplayRate;
  window.getSpeechPlaybackRate = getPlaybackRate;
  window.setSpeechDisplayRate = setDisplayRate;
  window.adjustSpeechDisplayRate = adjustDisplayRate;
  window.getPreferredSpeechVoice = getPreferredVoice;
  window.configureSpeechUtterance = configureUtterance;
  window.isSpeechRateIncreaseHotkey = isIncreaseHotkey;
  window.isSpeechRateDecreaseHotkey = isDecreaseHotkey;

  setDisplayRate(readStoredRate(), { source: 'init', forceEvent: true });
  installSpeakInterceptor();

  if (window.speechSynthesis && typeof window.speechSynthesis.addEventListener === 'function') {
    window.speechSynthesis.addEventListener('voiceschanged', function() {
      installSpeakInterceptor();
      dispatchRateChange('voiceschanged');
    });
  }

  window.addEventListener('keydown', handleRateHotkey, true);
})();

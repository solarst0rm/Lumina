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
  var SPEAK_DEBOUNCE_MS = 180;
  var INTERRUPT_SETTLE_MS = 60;

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

  function hasRateModifier(event) {
    return !!(
      event &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey
    );
  }

  function matchesArrowHotkey(event, direction) {
    var key = String((event && event.key) || '').toLowerCase();
    var code = String((event && event.code) || '').toLowerCase();
    var numericCode = Number(event && (event.which || event.keyCode || 0));

    if (direction === 'up') {
      return key === 'arrowup' || key === 'up' || code === 'arrowup' || numericCode === 38;
    }

    if (direction === 'down') {
      return key === 'arrowdown' || key === 'down' || code === 'arrowdown' || numericCode === 40;
    }

    return false;
  }

  function isIncreaseHotkey(event) {
    return hasRateModifier(event) && matchesArrowHotkey(event, 'up');
  }

  function isDecreaseHotkey(event) {
    return hasRateModifier(event) && matchesArrowHotkey(event, 'down');
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

  function speakWithGlobalConfig(text, options) {
    if (
      !text ||
      !window.speechSynthesis ||
      typeof window.speechSynthesis.speak !== 'function' ||
      typeof window.SpeechSynthesisUtterance !== 'function'
    ) {
      return null;
    }

    var config = options || {};
    var message = String(text);
    var now = Date.now();
    var debounceWindow = typeof config.debounceMs === 'number' ? config.debounceMs : SPEAK_DEBOUNCE_MS;

    if (
      !config.force &&
      window._lastGlobalSpeechText === message &&
      typeof window._lastGlobalSpeechAt === 'number' &&
      (now - window._lastGlobalSpeechAt) < debounceWindow
    ) {
      return null;
    }

    if (config.interrupt !== false) {
      try {
        window.speechSynthesis.cancel();
      } catch (error) {
        // Ignore cancellation errors from restricted engines.
      }
    }

    if (window._globalSpeechTimer) {
      window.clearTimeout(window._globalSpeechTimer);
      window._globalSpeechTimer = null;
    }

    var utterance = new SpeechSynthesisUtterance(message);
    configureUtterance(utterance, config);
    if (typeof config.onstart === 'function') {
      utterance.onstart = config.onstart;
    }
    if (typeof config.onend === 'function') {
      utterance.onend = config.onend;
    }
    if (typeof config.onerror === 'function') {
      utterance.onerror = config.onerror;
    }

    window._lastGlobalSpeechText = message;
    window._lastGlobalSpeechAt = now;

    var speakTask = function() {
      window.speechSynthesis.speak(utterance);
    };

    var delayMs = typeof config.delayMs === 'number' ? config.delayMs : 0;
    if (config.interrupt !== false) {
      delayMs = Math.max(delayMs, INTERRUPT_SETTLE_MS);
    }

    if (delayMs > 0) {
      window._globalSpeechTimer = window.setTimeout(function() {
        window._globalSpeechTimer = null;
        speakTask();
      }, delayMs);
    } else {
      speakTask();
    }

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

    var previousRate = getDisplayRate();
    var currentRate = adjustDisplayRate(delta, { source: 'global-hotkey' });
    var hookPayload = {
      previousRate: previousRate,
      currentRate: currentRate,
      source: 'global-hotkey'
    };
    var handled = false;

    if (typeof window._handleSpeechRateHotkey === 'function') {
      try {
        handled = window._handleSpeechRateHotkey(delta, event, hookPayload) !== false;
      } catch (error) {
        handled = false;
      }
    } else if (typeof window.onGlobalRateChange === 'function') {
      try {
        handled = window.onGlobalRateChange(currentRate, hookPayload) === true;
      } catch (error) {
        handled = false;
      }
    }

    syncRatePanel(currentRate);

    if (!handled) {
      announceRateChange(currentRate);
    }

    event.preventDefault();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }
    event.stopPropagation();
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

  function syncRatePanel(displayRate) {
    var slider = document.getElementById('global-rate-slider');
    var valueNode = document.getElementById('global-rate-value');
    var normalizedRate = clampRate(typeof displayRate === 'number' ? displayRate : getDisplayRate());

    if (slider) {
      slider.min = String(DISPLAY_MIN);
      slider.max = String(DISPLAY_MAX);
      slider.step = String(DISPLAY_STEP);
      slider.value = normalizedRate.toFixed(1);
    }

    if (valueNode) {
      valueNode.textContent = normalizedRate.toFixed(1) + 'x';
    }
  }

  function announceRateChange(displayRate) {
    var rateText = clampRate(typeof displayRate === 'number' ? displayRate : getDisplayRate()).toFixed(1);
    speakWithGlobalConfig('\u5f53\u524d\u8bed\u901f ' + rateText + ' \u500d', {
      force: true,
      interrupt: true
    });
  }

  function bindRatePanel() {
    var slider = document.getElementById('global-rate-slider');
    if (!slider || slider.dataset.boundBySpeechConfig === '1') {
      syncRatePanel(getDisplayRate());
      return;
    }

    window._speechRatePanelBoundBySpeechConfig = true;
    slider.dataset.boundBySpeechConfig = '1';
    syncRatePanel(getDisplayRate());

    slider.addEventListener('input', function() {
      var nextRate = setDisplayRate(parseFloat(slider.value), {
        source: 'panel-input',
        forceEvent: true
      });
      syncRatePanel(nextRate);
    });

    slider.addEventListener('change', function() {
      var nextRate = setDisplayRate(parseFloat(slider.value), {
        source: 'panel-change',
        forceEvent: true
      });
      syncRatePanel(nextRate);
      announceRateChange(nextRate);
    });
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
  window.speakWithGlobalConfig = speakWithGlobalConfig;
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
  document.addEventListener('keydown', handleRateHotkey, true);
  window.addEventListener(RATE_EVENT, function(event) {
    var detail = event && event.detail ? event.detail : null;
    syncRatePanel(detail && typeof detail.displayRate === 'number' ? detail.displayRate : getDisplayRate());
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindRatePanel);
  } else {
    bindRatePanel();
  }
})();

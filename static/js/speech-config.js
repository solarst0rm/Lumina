(function() {
  'use strict';

  var DISPLAY_MIN = 0.5;
  var DISPLAY_MAX = 10.0;
  var DISPLAY_STEP = 0.1;
  var DISPLAY_DEFAULT = 1.0;
  var STORAGE_KEY = 'blind-notes-speech-display-rate-v2';
  var RATE_EVENT = 'blindnotes:speech-rate-change';
  var SPEAK_DEBOUNCE_MS = 180;
  var INTERRUPT_SETTLE_MS = 80;

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
      // Ignore storage failures.
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
    return clampRate(displayRate);
  }

  function getSpeechState() {
    if (!window.__speechConfigState) {
      window.__speechConfigState = {
        activeToken: 0,
        text: '',
        position: 0,
        baseOffset: 0,
        speaking: false,
        paused: false,
        restarting: false
      };
    }
    return window.__speechConfigState;
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

  function getPreferredVoice() {
    return null;
  }

  function attachTracking(utterance, options) {
    if (!utterance || utterance.__speechConfigTracked) {
      return utterance;
    }

    var config = options || {};
    var state = getSpeechState();
    var token = Date.now() + Math.random();
    var originalText = typeof config.fullText === 'string'
      ? config.fullText
      : String(utterance.text || '');
    var baseOffset = typeof config.startOffset === 'number'
      ? Math.max(0, config.startOffset)
      : 0;

    var originalOnStart = utterance.onstart;
    var originalOnBoundary = utterance.onboundary;
    var originalOnPause = utterance.onpause;
    var originalOnResume = utterance.onresume;
    var originalOnEnd = utterance.onend;
    var originalOnError = utterance.onerror;

    utterance.__speechConfigTracked = true;
    utterance.__speechConfigToken = token;

    utterance.onstart = function(event) {
      state.activeToken = token;
      state.text = originalText;
      state.baseOffset = baseOffset;
      state.position = baseOffset;
      state.speaking = true;
      state.paused = false;
      window._currentUtteranceText = originalText;
      window._currentPosition = baseOffset;
      if (typeof originalOnStart === 'function') {
        originalOnStart.call(this, event);
      }
    };

    utterance.onboundary = function(event) {
      if (state.activeToken === token && typeof event.charIndex === 'number') {
        var absoluteIndex = Math.max(baseOffset, baseOffset + event.charIndex);
        state.position = absoluteIndex;
        window._currentUtteranceText = originalText;
        window._currentPosition = absoluteIndex;
      }
      if (typeof originalOnBoundary === 'function') {
        originalOnBoundary.call(this, event);
      }
    };

    utterance.onpause = function(event) {
      if (state.activeToken === token) {
        state.paused = true;
      }
      if (typeof originalOnPause === 'function') {
        originalOnPause.call(this, event);
      }
    };

    utterance.onresume = function(event) {
      if (state.activeToken === token) {
        state.paused = false;
      }
      if (typeof originalOnResume === 'function') {
        originalOnResume.call(this, event);
      }
    };

    function finish(handler, event) {
      if (state.activeToken === token && !state.restarting) {
        state.speaking = false;
        state.paused = false;
        state.text = '';
        state.position = 0;
        state.baseOffset = 0;
        window._currentUtteranceText = '';
        window._currentPosition = 0;
      }
      if (typeof handler === 'function') {
        handler.call(utterance, event);
      }
    }

    utterance.onend = function(event) {
      finish(originalOnEnd, event);
    };

    utterance.onerror = function(event) {
      finish(originalOnError, event);
    };

    return utterance;
  }

  function configureUtterance(utterance, options) {
    if (!utterance) {
      return utterance;
    }

    var config = options || {};
    var displayRate = typeof config.displayRate === 'number' ? config.displayRate : getDisplayRate();
    var explicitVoice = config.voice || null;

    utterance.rate = getPlaybackRate(displayRate);
    utterance.pitch = typeof config.pitch === 'number' ? config.pitch : 1;
    if (typeof config.volume === 'number') {
      utterance.volume = Math.max(0, Math.min(1, config.volume));
    }
    utterance.lang = config.lang || utterance.lang || 'zh-CN';

    if (explicitVoice) {
      try {
        utterance.voice = explicitVoice;
      } catch (error) {
        // Ignore voice assignment failures.
      }
    }

    if (config.track !== false) {
      attachTracking(utterance, config);
    }
    return utterance;
  }

  function isTutorialSpeechAllowed(config) {
    return !!(config && config.allowDuringTutorial);
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
    if (window._tutorialActive && !isTutorialSpeechAllowed(config)) {
      return null;
    }
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
        // Ignore cancellation errors.
      }
    }

    if (window._globalSpeechTimer) {
      window.clearTimeout(window._globalSpeechTimer);
      window._globalSpeechTimer = null;
    }

    var utterance = new SpeechSynthesisUtterance(message);
    configureUtterance(utterance, config);

    window._lastGlobalSpeechText = message;
    window._lastGlobalSpeechAt = now;

    var delayMs = typeof config.delayMs === 'number' ? config.delayMs : 0;
    if (config.interrupt !== false) {
      delayMs = Math.max(delayMs, INTERRUPT_SETTLE_MS);
    }

    var speakTask = function() {
      window.speechSynthesis.speak(utterance);
    };

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

  function hasTrackedSpeech() {
    var state = getSpeechState();
    var currentText = window._currentUtteranceText || state.text;
    return !!(
      window.speechSynthesis &&
      currentText &&
      (window.speechSynthesis.speaking || window.speechSynthesis.paused || state.speaking || state.paused)
    );
  }

  function restartTrackedSpeechWithGlobalRate(options) {
    if (
      !window.speechSynthesis ||
      typeof window.speechSynthesis.speak !== 'function' ||
      typeof window.SpeechSynthesisUtterance !== 'function'
    ) {
      return false;
    }

    var config = options || {};
    var state = getSpeechState();
    var fullText = window._currentUtteranceText || state.text;
    var startOffset = typeof window._currentPosition === 'number'
      ? window._currentPosition
      : state.position;

    if (!fullText || !fullText.trim()) {
      return false;
    }

    startOffset = Math.max(0, Math.min(fullText.length, startOffset || 0));
    var remainingText = fullText.slice(startOffset);
    if (!remainingText.trim()) {
      return false;
    }

    state.restarting = true;
    try {
      window.speechSynthesis.cancel();
    } catch (error) {
      state.restarting = false;
      return false;
    }

    if (window._globalSpeechTimer) {
      window.clearTimeout(window._globalSpeechTimer);
      window._globalSpeechTimer = null;
    }

    var utterance = new SpeechSynthesisUtterance(remainingText);
    configureUtterance(utterance, {
      displayRate: getDisplayRate(),
      lang: config.lang || 'zh-CN',
      startOffset: startOffset,
      fullText: fullText
    });

    var delayMs = typeof config.delayMs === 'number' ? config.delayMs : INTERRUPT_SETTLE_MS;
    window._globalSpeechTimer = window.setTimeout(function() {
      window._globalSpeechTimer = null;
      state.restarting = false;
      window.speechSynthesis.speak(utterance);
    }, Math.max(20, delayMs));

    return true;
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
    speakWithGlobalConfig('当前语速 ' + rateText + ' 倍', {
      force: true,
      interrupt: true,
      track: false
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
  window.hasTrackedSpeech = hasTrackedSpeech;
  window.restartTrackedSpeechWithGlobalRate = restartTrackedSpeechWithGlobalRate;

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

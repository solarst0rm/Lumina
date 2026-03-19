(function() {
  'use strict';

  var LONG_PRESS_MS = 350;
  var FETCH_TIMEOUT_MS = 30000;

  var state = {
    history: [],
    isOpen: false,
    isSending: false,
    isRecording: false,
    recordingMode: '',
    recordingShouldSend: false,
    holdSendPending: false,
    recognition: null,
    requestController: null,
    spacePressed: false,
    spaceLongPressTriggered: false,
    spaceTimer: null
  };

  var overlay;
  var assistantWindow;
  var messagesEl;
  var textInput;
  var micBtn;
  var sendBtn;
  var closeBtn;
  var spriteBtn;

  var welcomeHtml =
    '<div class="ai-welcome">' +
      '<p>你好，我是你的 AI 学习助手。</p>' +
      '<p>按 Ctrl+Space 可直接进入输入框，长按空格可语音提问。</p>' +
      '<p style="font-size:0.8rem;margin-top:8px;color:var(--text-secondary);">输入框内按 Enter 发送，按 Esc 退出输入框；未聚焦对话框时按 Esc 关闭助手。</p>' +
    '</div>';

  function canUseAIAssistant() {
    return !!window._aiAssistantPageEnabled && !window._tutorialActive && !window._helpOverlayOpen;
  }

  function isEditableTarget(target) {
    return !!(
      target &&
      (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )
    );
  }

  function isInteractiveTarget(target) {
    if (!target) {
      return false;
    }

    var tagName = target.tagName;
    return (
      tagName === 'BUTTON' ||
      tagName === 'A' ||
      tagName === 'SUMMARY' ||
      target.getAttribute('role') === 'button'
    );
  }

  function isFocusInsideAssistant() {
    return !!(
      assistantWindow &&
      document.activeElement &&
      assistantWindow.contains(document.activeElement)
    );
  }

  function isInputFocused() {
    return document.activeElement === textInput;
  }

  function syncSpriteState() {
    if (!spriteBtn) {
      return;
    }

    var disabled = !canUseAIAssistant();
    spriteBtn.classList.toggle('is-disabled', disabled);
    spriteBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    spriteBtn.title = disabled
      ? 'AI语音助手仅可在文档总结页和答题闯关页使用'
      : 'AI语音助手（Ctrl+Space 唤醒，长按空格语音提问）';
  }

  window.refreshAIAssistantAvailability = function() {
    syncSpriteState();
    if (!canUseAIAssistant() && state.isOpen) {
      window.closeAIAssistant();
    }
  };

  function stopSpeechPlayback() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function speak(text) {
    if (!window.speechSynthesis || !text || state.isRecording) {
      return;
    }

    if (typeof window.speakWithGlobalConfig === 'function') {
      window.speakWithGlobalConfig(text, {
        force: true
      });
      return;
    }

    stopSpeechPlayback();
    var utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = typeof window._rate === 'number' ? window._rate : 1;
    window.speechSynthesis.speak(utterance);
  }

  function focusTextInput() {
    if (!textInput) {
      return;
    }

    window.setTimeout(function() {
      if (!state.isOpen || !textInput) {
        return;
      }
      try {
        textInput.focus({ preventScroll: true });
      } catch (error) {
        textInput.focus();
      }
    }, 0);
  }

  function blurAssistantFocus() {
    var active = document.activeElement;
    if (
      active &&
      active !== document.body &&
      active !== document.documentElement &&
      assistantWindow &&
      assistantWindow.contains(active) &&
      typeof active.blur === 'function'
    ) {
      active.blur();
    }
  }

  function resetMessages() {
    if (messagesEl) {
      messagesEl.innerHTML = welcomeHtml;
    }
  }

  function setSendingState(isSending) {
    state.isSending = isSending;
    if (sendBtn) {
      sendBtn.disabled = isSending;
    }
  }

  function resetSpaceState() {
    if (state.spaceTimer) {
      window.clearTimeout(state.spaceTimer);
      state.spaceTimer = null;
    }
    state.spacePressed = false;
    state.spaceLongPressTriggered = false;
  }

  function setRecordingUi(isRecording) {
    state.isRecording = isRecording;
    if (micBtn) {
      micBtn.classList.toggle('recording', isRecording);
      micBtn.setAttribute('aria-pressed', isRecording ? 'true' : 'false');
    }
  }

  function appendMessage(role, text) {
    if (!messagesEl || !text) {
      return null;
    }

    var welcomeNode = messagesEl.querySelector('.ai-welcome');
    if (welcomeNode) {
      welcomeNode.remove();
    }

    var node = document.createElement('div');
    node.className = 'ai-msg';
    if (role === 'user') {
      node.classList.add('ai-msg-user');
    } else if (role === 'assistant') {
      node.classList.add('ai-msg-bot');
    } else {
      node.classList.add('ai-msg-error');
    }
    node.textContent = text;
    messagesEl.appendChild(node);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return node;
  }

  function showLoading() {
    if (!messagesEl) {
      return null;
    }

    var loading = document.createElement('div');
    loading.id = 'ai-loading-msg';
    loading.className = 'ai-msg ai-msg-loading';
    loading.innerHTML = 'AI正在思考<span class="ai-loading-dots"></span>';
    messagesEl.appendChild(loading);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return loading;
  }

  function removeLoading() {
    var loading = document.getElementById('ai-loading-msg');
    if (loading) {
      loading.remove();
    }
  }

  function playDing(callback) {
    try {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        if (callback) {
          callback();
        }
        return;
      }

      var ctx = new AudioContextClass();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.2);
      osc.onended = function() {
        ctx.close();
        if (callback) {
          callback();
        }
      };
    } catch (error) {
      if (callback) {
        callback();
      }
    }
  }

  function readPageContext() {
    if (typeof window._aiAssistantGetPageContext === 'function') {
      try {
        var result = window._aiAssistantGetPageContext();
        if (result && typeof result === 'object') {
          return result;
        }
      } catch (error) {
        return {};
      }
    }
    return {};
  }

  function cancelVoiceInput() {
    state.recordingShouldSend = false;
    state.holdSendPending = false;
    state.recordingMode = '';

    if (state.recognition && state.isRecording) {
      try {
        state.recognition.abort();
      } catch (error) {
        // Ignore abort errors.
      }
    }

    setRecordingUi(false);
  }

  function sendCurrentInput(options) {
    var config = options || {};
    var text = textInput ? textInput.value.trim() : '';
    if (!text) {
      if (config.emptyNotice) {
        appendMessage('error', '没有识别到内容，请重试');
        speak('没有识别到内容，请重试');
      }
      return false;
    }
    return sendMessage({
      text: text,
      focusInputAfterSend: !!config.focusInputAfterSend
    });
  }

  function finalizeHoldVoiceInput() {
    if (state.recordingMode !== 'hold') {
      return;
    }

    if (state.isRecording) {
      state.recordingShouldSend = true;
      try {
        state.recognition.stop();
      } catch (error) {
        setRecordingUi(false);
        state.recordingMode = '';
      }
      return;
    }

    if (state.holdSendPending) {
      state.holdSendPending = false;
      state.recordingMode = '';
      sendCurrentInput({
        focusInputAfterSend: false,
        emptyNotice: true
      });
      return;
    }

    state.recordingMode = '';
  }

  function ensureRecognition() {
    var SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) {
      appendMessage('error', '当前浏览器不支持语音输入，请使用文本输入');
      speak('当前浏览器不支持语音输入，请使用文本输入');
      return null;
    }

    if (state.recognition) {
      return state.recognition;
    }

    state.recognition = new SpeechRecognitionClass();
    state.recognition.lang = 'zh-CN';
    state.recognition.continuous = false;
    state.recognition.interimResults = true;

    state.recognition.onresult = function(event) {
      var transcript = '';
      for (var index = event.resultIndex; index < event.results.length; index += 1) {
        transcript += event.results[index][0].transcript;
      }
      if (textInput) {
        textInput.value = transcript;
      }
    };

    state.recognition.onerror = function(event) {
      state.recordingShouldSend = false;
      state.holdSendPending = false;

      if (event.error === 'aborted') {
        return;
      }

      var message = '语音识别失败，请重试';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        message = '浏览器没有开启麦克风权限，请先授权';
      } else if (event.error === 'no-speech') {
        message = '没有识别到语音，请重试';
      }

      appendMessage('error', message);
      speak(message);
    };

    state.recognition.onend = function() {
      var mode = state.recordingMode;
      var shouldSend = state.recordingShouldSend;

      setRecordingUi(false);

      if (mode === 'hold' && state.spacePressed) {
        state.holdSendPending = true;
        return;
      }

      state.recordingMode = '';
      state.recordingShouldSend = false;
      state.holdSendPending = false;

      if (shouldSend) {
        sendCurrentInput({
          focusInputAfterSend: mode !== 'hold',
          emptyNotice: true
        });
      }
    };

    return state.recognition;
  }

  function startVoiceInput(mode) {
    if (state.isSending || state.isRecording) {
      return;
    }

    var recognition = ensureRecognition();
    if (!recognition) {
      return;
    }

    stopSpeechPlayback();
    state.recordingMode = mode;
    state.recordingShouldSend = mode !== 'hold';
    state.holdSendPending = false;
    setRecordingUi(true);

    playDing(function() {
      try {
        recognition.start();
      } catch (error) {
        setRecordingUi(false);
        state.recordingMode = '';
        state.recordingShouldSend = false;
        appendMessage('error', '语音识别启动失败，请重试');
        speak('语音识别启动失败，请重试');
      }
    });
  }

  function toggleVoiceInput() {
    if (state.isRecording && state.recordingMode === 'toggle') {
      state.recordingShouldSend = true;
      try {
        state.recognition.stop();
      } catch (error) {
        cancelVoiceInput();
      }
      return;
    }

    if (state.isRecording) {
      return;
    }

    startVoiceInput('toggle');
  }

  function sendMessage(options) {
    var config = options || {};
    var message = (config.text || (textInput ? textInput.value : '') || '').trim();
    if (!message || state.isSending) {
      return false;
    }

    var focusInputAfterSend = !!config.focusInputAfterSend;

    appendMessage('user', message);
    if (textInput) {
      textInput.value = '';
    }

    state.history.push({ role: 'user', content: message });
    setSendingState(true);
    showLoading();

    if (state.requestController) {
      state.requestController.abort();
    }
    state.requestController = new AbortController();

    var timeoutId = window.setTimeout(function() {
      if (state.requestController) {
        state.requestController.abort();
      }
    }, FETCH_TIMEOUT_MS);

    fetch('/api/ai-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: message,
        history: state.history.slice(0, -1),
        page_context: readPageContext()
      }),
      signal: state.requestController.signal
    })
      .then(function(response) {
        return response.json();
      })
      .then(function(data) {
        removeLoading();
        if (data.success && data.reply) {
          appendMessage('assistant', data.reply);
          state.history.push({ role: 'assistant', content: data.reply });
          speak(data.reply);
          return;
        }

        var errorMessage = data.error || '请求失败，请稍后重试';
        appendMessage('error', errorMessage);
        speak(errorMessage);
      })
      .catch(function(error) {
        removeLoading();
        var errorMessage = error && error.name === 'AbortError'
          ? '请求超时，请稍后重试'
          : '网络错误，请稍后重试';
        appendMessage('error', errorMessage);
        speak(errorMessage);
      })
      .finally(function() {
        window.clearTimeout(timeoutId);
        state.requestController = null;
        setSendingState(false);
        if (state.isOpen && focusInputAfterSend) {
          focusTextInput();
        }
      });

    return true;
  }

  function resetAssistantSession() {
    state.history = [];
    resetMessages();
    if (textInput) {
      textInput.value = '';
    }
  }

  function openAssistant(options) {
    var config = options;
    if (typeof config === 'boolean') {
      config = { speakPrompt: config, focusInput: true };
    }
    config = config || {};

    if (!canUseAIAssistant() || !overlay) {
      return false;
    }

    state.isOpen = true;
    window._aiWindowOpen = true;
    overlay.classList.add('active');
    stopSpeechPlayback();

    if (config.focusInput === false) {
      blurAssistantFocus();
    } else {
      focusTextInput();
    }

    if (config.speakPrompt) {
      speak('AI助手已打开，请输入问题。');
    }

    return true;
  }

  function closeAssistant() {
    if (!overlay) {
      return false;
    }

    if (state.requestController) {
      state.requestController.abort();
      state.requestController = null;
    }

    cancelVoiceInput();
    resetSpaceState();
    stopSpeechPlayback();
    setSendingState(false);

    state.isOpen = false;
    window._aiWindowOpen = false;
    overlay.classList.remove('active');
    resetAssistantSession();
    return true;
  }

  function handleCtrlSpace(event) {
    if (
      event.code !== 'Space' ||
      !event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      return false;
    }

    if (isEditableTarget(event.target) && event.target !== textInput) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!state.isOpen) {
      openAssistant({ focusInput: true, speakPrompt: false });
    } else {
      focusTextInput();
    }
    return true;
  }

  function handleEscape(event) {
    if (event.key !== 'Escape' || !state.isOpen) {
      return false;
    }

    if (isFocusInsideAssistant()) {
      blurAssistantFocus();
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    closeAssistant();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleSpaceKeydown(event) {
    if (
      event.code !== 'Space' ||
      event.repeat ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey
    ) {
      return false;
    }

    if (isEditableTarget(event.target) || isInteractiveTarget(event.target) || isFocusInsideAssistant()) {
      return false;
    }

    if (state.spacePressed) {
      return true;
    }

    state.spacePressed = true;
    state.spaceLongPressTriggered = false;
    state.spaceTimer = window.setTimeout(function() {
      state.spaceLongPressTriggered = true;
      openAssistant({ focusInput: false, speakPrompt: false });
      blurAssistantFocus();
      startVoiceInput('hold');
    }, LONG_PRESS_MS);

    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  function handleSpaceKeyup(event) {
    if (event.code !== 'Space' || !state.spacePressed) {
      return false;
    }

    var triggeredLongPress = state.spaceLongPressTriggered;
    resetSpaceState();

    event.preventDefault();
    event.stopPropagation();

    if (triggeredLongPress) {
      finalizeHoldVoiceInput();
      return true;
    }

    if (typeof window.onAssistantShortSpacePress === 'function') {
      window.onAssistantShortSpacePress();
    }
    return true;
  }

  function bindEvents() {
    spriteBtn.addEventListener('click', function(event) {
      if (!canUseAIAssistant()) {
        event.preventDefault();
        return;
      }
      openAssistant({ focusInput: true, speakPrompt: false });
    });

    closeBtn.addEventListener('click', function() {
      closeAssistant();
    });

    overlay.addEventListener('click', function(event) {
      if (event.target === overlay) {
        closeAssistant();
      }
    });

    sendBtn.addEventListener('click', function() {
      sendMessage({ focusInputAfterSend: true });
    });

    micBtn.addEventListener('click', function() {
      toggleVoiceInput();
    });

    textInput.addEventListener('keydown', function(event) {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage({ focusInputAfterSend: true });
      }
    });

    document.addEventListener('keydown', function(event) {
      if (window._disableGlobalAIAssistantHotkeys || !canUseAIAssistant()) {
        return;
      }

      if (handleCtrlSpace(event)) {
        return;
      }

      if (handleEscape(event)) {
        return;
      }

      handleSpaceKeydown(event);
    }, true);

    document.addEventListener('keyup', function(event) {
      if (window._disableGlobalAIAssistantHotkeys || !canUseAIAssistant()) {
        return;
      }
      handleSpaceKeyup(event);
    }, true);

    window.addEventListener('blur', function() {
      if (!state.spacePressed) {
        return;
      }

      var triggeredLongPress = state.spaceLongPressTriggered;
      resetSpaceState();

      if (triggeredLongPress) {
        finalizeHoldVoiceInput();
      }
    });
  }

  function init() {
    overlay = document.getElementById('ai-overlay');
    assistantWindow = document.getElementById('ai-window');
    messagesEl = document.getElementById('ai-messages');
    textInput = document.getElementById('ai-text-input');
    micBtn = document.getElementById('ai-mic-btn');
    sendBtn = document.getElementById('ai-send-btn');
    closeBtn = document.getElementById('ai-close-btn');
    spriteBtn = document.getElementById('ai-sprite-btn');

    if (!overlay || !assistantWindow || !messagesEl || !textInput || !micBtn || !sendBtn || !closeBtn || !spriteBtn) {
      return;
    }

    window._aiWindowOpen = false;
    resetAssistantSession();
    syncSpriteState();
    bindEvents();

    window.openAIAssistant = openAssistant;
    window.closeAIAssistant = closeAssistant;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
